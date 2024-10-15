import * as bitcoin from "./bitcoinjs-lib";
import { base } from "@unielon/crypto-lib";
import {
    getAddressType,
    private2public,
    privateKeyFromWIF,
    sign,
    wif2Public
} from "./txBuild";
import {PrevOutput} from "./inscribe";

export type DrcInscriptionData = {
    contentType: string
    body: string | Buffer
    revealAddr: string
    receiveAddr?: string
    repeat: number
}


export type DrcInscriptionRequest = {
    commitTxPrevOutputList: PrevOutput[]
    commitFeeRate: number
    revealFeeRate: number
    inscriptionDataList: DrcInscriptionData[]
    changeAddress: string
    minChangeValue?: number
    transactionFee?: number
}

const defaultTxVersion = 2;
const defaultSequenceNum = 0xfffffffd;
const defaultRevealOutValue = 100000;
const defaultMinChangeValue = 100000;

const opMint = "mint"
const opDeploy = "deploy"
const opWithdraw = 'withdraw'
const opTransfer = "transfer"
const opDeposit = "deposit"
const drc20P = "drc-20"
const wdogeP = "wdoge"
const pairV1P = 'pair-v1'
const stakeV1P = 'stake-v1'
const orderV1P = 'order-v1'
const orderV2P = 'order-v2'
const boxV1P = 'box-v1'

const wdogeFeeAddress = "D86Dc4n49LZDiXvB41ds2XaDAP1BFjP1qy"
const wdogeCoolAddress = "DKMyk8cfSTGfnCVXfmo8gXta9F6gziu7Z5"

const feeAddress = "DEMZQAJjdNMM9M3Sk7LAmtPdk8me6SZUm1"

type DrcTxOut = {
    pkScript: Buffer
    value: number
}

type DrcInscriptionTxCtxData = {
    privateKey: Buffer
    inscriptionScript: Buffer
    commitTxAddress: string
    commitTxAddressPkScript: Buffer
    hash: Buffer
    revealTxPrevOutput: DrcTxOut
    revealPkScript: Buffer
}

export class DrcInscriptionTool {
    network: bitcoin.Network = bitcoin.networks.bitcoin;
    inscriptionTxCtxDataList: DrcInscriptionTxCtxData[] = [];
    revealTxs: bitcoin.Transaction[] = [];
    commitTx: bitcoin.Transaction = new bitcoin.Transaction();
    commitTxPrevOutputFetcher: number[] = [];
    revealTxPrevOutputFetcher: number[] = [];
    mustCommitTxFee: number = 0;
    mustRevealTxFees: number[] = [];
    commitAddrs: string[] = [];

    static newDrcInscriptionTool(network: bitcoin.Network, request: DrcInscriptionRequest) {
        const tool = new DrcInscriptionTool();
        tool.network = network;

        const minChangeValue = request.minChangeValue || defaultMinChangeValue;

        // TODO: use commitTx first input privateKey
        const privateKey = request.commitTxPrevOutputList[0].privateKey;
        request.inscriptionDataList.forEach(inscriptionData => {
            tool.inscriptionTxCtxDataList.push(createDrcInscriptionTxCtxData(network, inscriptionData, privateKey));
        });
        const totalRevealPrevOutputValue = tool.buildEmptyRevealTx(network, request.revealFeeRate, request.inscriptionDataList);
        const insufficient = tool.buildCommitTx(network, request.commitTxPrevOutputList, request.changeAddress, totalRevealPrevOutputValue, request.commitFeeRate, minChangeValue, request?.transactionFee);
        if (insufficient) {
            return tool;
        }
        tool.signCommitTx(request.commitTxPrevOutputList);
        tool.completeRevealTx();

        return tool;
    }

    buildEmptyRevealTx(network: bitcoin.Network, revealFeeRate: number, inscriptionDataList: DrcInscriptionData[]) {
        let totalPrevOutputValue = 0;
        const revealTxs: bitcoin.Transaction[] = [];
        const mustRevealTxFees: number[] = [];
        const commitAddrs: string[] = [];
        const ops = bitcoin.script.OPS;
        this.inscriptionTxCtxDataList.forEach((inscriptionTxCtxData, i) => {
            const tx = new bitcoin.Transaction();
            tx.version = defaultTxVersion;
            // @ts-ignore
            let body = JSON.parse(inscriptionDataList[i].body)
            let receiveAddr = inscriptionDataList[i].receiveAddr || ''
            let repeats = 1
            if (body.p == drc20P && opMint == body.op) {
                repeats = inscriptionDataList[i].repeat
            }
            if(receiveAddr) {
                const receiveAddrList = receiveAddr.split(',');
                receiveAddrList.map(item => {
                    const changePkScript = bitcoin.address.toOutputScript(item, network);
                    tx.addOutput(changePkScript, defaultRevealOutValue * repeats);
                })
            } else {
                tx.addOutput(inscriptionTxCtxData.revealPkScript, defaultRevealOutValue * repeats);
            }
            const emptySignature = Buffer.alloc(71);
            const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
            inscriptionBuilder.push(ops.OP_10);
            inscriptionBuilder.push(ops.OP_FALSE);
            inscriptionBuilder.push(emptySignature);
            inscriptionBuilder.push(inscriptionTxCtxData.inscriptionScript);
            const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
            tx.addInput(Buffer.alloc(32), i, defaultSequenceNum, inscriptionScript);
            let prevOutputValue = defaultRevealOutValue * repeats
            const isDrc20Operation = (body: { p: string; }, op: string) => body.p === drc20P && [opDeploy, opTransfer, opMint].includes(op)
            const isSpecialP = (p: string) => [pairV1P, orderV1P, boxV1P, stakeV1P].includes(p)
            if (isDrc20Operation(body, body.op) || opWithdraw === body.op || isSpecialP(body.p)) {
                const baseFee = 50000000
                const changePkScript = bitcoin.address.toOutputScript(feeAddress, network);
                tx.addOutput(changePkScript, baseFee);
                prevOutputValue += baseFee
            } else if (opDeposit == body.op) {
                let amt = parseInt(body.amt)
                prevOutputValue += amt
                const coolPkScript = bitcoin.address.toOutputScript(wdogeCoolAddress, network);
                tx.addOutput(coolPkScript, amt);
                let fee0 = 0
                if (Math.floor(amt * 3 / 1000) < 50000000) {
                    fee0 = 50000000
                } else {
                    fee0 = Math.floor(amt * 3 / 1000)
                }
                prevOutputValue += fee0
                const changePkScript = bitcoin.address.toOutputScript(wdogeFeeAddress, network);
                tx.addOutput(changePkScript, fee0);
            }
            const fee = Math.floor(tx.byteLength() * revealFeeRate);
            prevOutputValue += fee;
            inscriptionTxCtxData.revealTxPrevOutput = {
                pkScript: inscriptionTxCtxData.commitTxAddressPkScript,
                value: prevOutputValue,
            };
            totalPrevOutputValue += prevOutputValue;
            revealTxs.push(tx);
            mustRevealTxFees.push(fee);
            commitAddrs.push(inscriptionTxCtxData.commitTxAddress);
        });

        this.revealTxs = revealTxs;
        this.mustRevealTxFees = mustRevealTxFees;
        this.commitAddrs = commitAddrs;

        return totalPrevOutputValue;
    }

    buildCommitTx(network: bitcoin.Network, commitTxPrevOutputList: PrevOutput[], changeAddress: string, totalRevealPrevOutputValue: number, commitFeeRate: number, minChangeValue: number, transactionFee?: number): boolean {
        let totalSenderAmount = 0;

        const tx = new bitcoin.Transaction();
        tx.version = defaultTxVersion;

        commitTxPrevOutputList.forEach(commitTxPrevOutput => {
            const hash = base.reverseBuffer(base.fromHex(commitTxPrevOutput.txId));
            tx.addInput(hash, commitTxPrevOutput.vOut, defaultSequenceNum);
            this.commitTxPrevOutputFetcher.push(commitTxPrevOutput.amount);
            totalSenderAmount += commitTxPrevOutput.amount;
        });
        this.inscriptionTxCtxDataList.forEach(inscriptionTxCtxData => {
            tx.addOutput(inscriptionTxCtxData.revealTxPrevOutput.pkScript, inscriptionTxCtxData.revealTxPrevOutput.value);
        });

        const changePkScript = bitcoin.address.toOutputScript(changeAddress, network);
        tx.addOutput(changePkScript, 0);

        const txForEstimate = tx.clone();
        signTx(txForEstimate, commitTxPrevOutputList, this.network);

        const fee = transactionFee ? transactionFee : Math.floor(txForEstimate.virtualSize() * commitFeeRate);
        const changeAmount = totalSenderAmount - totalRevealPrevOutputValue - fee;
        console.log(changeAmount, totalSenderAmount, totalRevealPrevOutputValue, fee, 'test===')
        if (changeAmount >= minChangeValue) {
            tx.outs[tx.outs.length - 1].value = changeAmount;
        } else {
            tx.outs = tx.outs.slice(0, tx.outs.length - 1);
            txForEstimate.outs = txForEstimate.outs.slice(0, txForEstimate.outs.length - 1);
            const feeWithoutChange = Math.floor(txForEstimate.virtualSize() * commitFeeRate);
            if (totalSenderAmount - totalRevealPrevOutputValue - feeWithoutChange < 0) {
                this.mustCommitTxFee = fee;
                return true;
            }
        }

        this.commitTx = tx;
        return false;
    }

    signCommitTx(commitTxPrevOutputList: PrevOutput[]) {
        signTx(this.commitTx, commitTxPrevOutputList, this.network);
    }

    completeRevealTx() {
        const ops = bitcoin.script.OPS;
        this.revealTxs.forEach((revealTx, i) => {
            revealTx.ins[0].hash = this.commitTx.getHash();

            this.revealTxPrevOutputFetcher.push(this.inscriptionTxCtxDataList[i].revealTxPrevOutput.value);

            const privateKeyHex = base.toHex(this.inscriptionTxCtxDataList[i].privateKey);
            const hash = revealTx.hashForSignature(i, this.inscriptionTxCtxDataList[i].inscriptionScript, bitcoin.Transaction.SIGHASH_ALL)!;
            const signature = sign(hash, privateKeyHex);
            const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
            inscriptionBuilder.push(ops.OP_10);
            inscriptionBuilder.push(ops.OP_FALSE);
            inscriptionBuilder.push(bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL));
            inscriptionBuilder.push(this.inscriptionTxCtxDataList[i].inscriptionScript);
            const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
            revealTx.ins[0].script = inscriptionScript;
        });
    }

    calculateFee() {
        let commitTxFee = 0;
        this.commitTx.ins.forEach((_, i) => {
            commitTxFee += this.commitTxPrevOutputFetcher[i];
        });
        this.commitTx.outs.forEach(out => {
            commitTxFee -= out.value;
        });
        let revealTxFees: number[] = [];
        this.revealTxs.forEach((revealTx, i) => {
            let revealTxFee = 0;
            revealTxFee += this.revealTxPrevOutputFetcher[i];
            revealTxFee -= revealTx.outs[0].value;
            revealTxFees.push(revealTxFee);
        });

        return {
            commitTxFee,
            revealTxFees,
        };
    }
}

function signTx(tx: bitcoin.Transaction, commitTxPrevOutputList: PrevOutput[], network: bitcoin.Network) {
    tx.ins.forEach((input, i) => {
        const addressType = getAddressType(commitTxPrevOutputList[i].address, network);
        const privateKey = base.fromHex(privateKeyFromWIF(commitTxPrevOutputList[i].privateKey, network));
        const privateKeyHex = base.toHex(privateKey);
        const publicKey = private2public(privateKeyHex);
        if (addressType === 'legacy') {
            const prevScript = bitcoin.address.toOutputScript(commitTxPrevOutputList[i].address, network);
            const hash = tx.hashForSignature(i, prevScript, bitcoin.Transaction.SIGHASH_ALL)!;
            const signature = sign(hash, privateKeyHex);
            const payment = bitcoin.payments.p2pkh({
                signature: bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL),
                pubkey: publicKey,
            });
            input.script = payment.input!;
        } else {
            throw 'unsupport address type'
        }
    });
}

function createDrcInscriptionTxCtxData(network: bitcoin.Network, inscriptionData: DrcInscriptionData, privateKeyWif: string): DrcInscriptionTxCtxData {
    const privateKey = base.fromHex(privateKeyFromWIF(privateKeyWif, network));
    const pubKey = wif2Public(privateKeyWif, network);
    const ops = bitcoin.script.OPS;

    const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
    inscriptionBuilder.push(ops.OP_1);
    inscriptionBuilder.push(pubKey);
    inscriptionBuilder.push(ops.OP_1);
    inscriptionBuilder.push(ops.OP_CHECKMULTISIGVERIFY);
    inscriptionBuilder.push(Buffer.from("ord"));
    inscriptionBuilder.push(Buffer.from(inscriptionData.contentType));
    inscriptionBuilder.push(Buffer.from(inscriptionData.body));
    inscriptionBuilder.push(ops.OP_DROP);
    inscriptionBuilder.push(ops.OP_DROP);
    inscriptionBuilder.push(ops.OP_DROP);
    const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
    const {output, hash, address} = bitcoin.payments.p2sh({
        redeem: {
            output: inscriptionScript,
            redeemVersion: 0xc0,
            network: network
        }
    });

    return {
        privateKey,
        inscriptionScript,
        commitTxAddress: address!,
        commitTxAddressPkScript: output!,
        hash: hash!,
        revealTxPrevOutput: {
            pkScript: Buffer.alloc(0),
            value: 0,
        },
        revealPkScript: bitcoin.address.toOutputScript(inscriptionData.revealAddr, network),
    };
}

export function inscribeDrc(network: bitcoin.Network, request: DrcInscriptionRequest) {
    const tool = DrcInscriptionTool.newDrcInscriptionTool(network, request);
    console.log(tool.mustCommitTxFee, 'tool.mustCommitTxFee');
    if (tool.mustCommitTxFee > 0) {
        return {
            commitTx: "",
            revealTxs: [],
            commitTxFee: tool.mustCommitTxFee,
            revealTxFees: tool.mustRevealTxFees,
            commitAddrs: tool.commitAddrs,
        };
    }
    const hash = tool.revealTxs[0].getHash();
    const hexString = Buffer.from(hash).reverse().toString('hex');
    console.log(hexString, 'hexString1');
    return {
        commitTx: tool.commitTx.toHex(),
        commitTxHash: hexString,
        revealTxs: tool.revealTxs.map(revealTx => revealTx.toHex()),
        ...tool.calculateFee(),
        commitAddrs: tool.commitAddrs,
    };
}
