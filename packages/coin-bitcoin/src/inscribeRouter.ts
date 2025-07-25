import * as bitcoin from "./bitcoinjs-lib";
import { base } from "@dogeuni-org/crypto-lib";
import {
    getAddressType,
    private2public,
    privateKeyFromWIF,
    sign,
    wif2Public
} from "./txBuild";
import {PrevOutput} from "./inscribe";

export type RouterInscriptionData = {
    contentType: string
    body: any
    revealAddr: string
    receiveAddr?: string
}

export type RouterInscriptionRequest = {
    commitTxPrevOutputList: PrevOutput[]
    commitFeeRate: number
    revealFeeRate: number
    inscriptionDataList: RouterInscriptionData[]
    changeAddress: string
    minChangeValue?: number
    transactionFee?: number
}

const defaultTxVersion = 2;
const defaultSequenceNum = 0xfffffffd;
const defaultRevealOutValue = 100000;
const defaultMinChangeValue = 100000;

const feeAddress = "DEMZQAJjdNMM9M3Sk7LAmtPdk8me6SZUm1"
const wdogeFeeAddress = "D86Dc4n49LZDiXvB41ds2XaDAP1BFjP1qy"
const wdogeCoolAddress = "DKMyk8cfSTGfnCVXfmo8gXta9F6gziu7Z5"
const pumpFeeAddress = "DJ9wVHBFnbcZUtfWdHWPEnijdxz1CABPUY"
const pumpTipFeeAddress = "DSPAZ6cZC7ShL63UFKPgs4vBGrbpHBwWQG"
type RouterTxOut = {
    pkScript: Buffer
    value: number
}

type RouterInscriptionTxCtxData = {
    privateKey: Buffer
    inscriptionScript: Buffer
    commitTxAddress: string
    commitTxAddressPkScript: Buffer
    hash: Buffer
    revealTxPrevOutput: RouterTxOut
    revealPkScript: Buffer
}

export class RouterInscriptionTool {
    network: bitcoin.Network = bitcoin.networks.bitcoin;
    inscriptionTxCtxDataList: RouterInscriptionTxCtxData[] = [];
    revealTxs: bitcoin.Transaction[] = [];
    commitTx: bitcoin.Transaction = new bitcoin.Transaction();
    commitTxPrevOutputFetcher: number[] = [];
    revealTxPrevOutputFetcher: number[] = [];
    mustCommitTxFee: number = 0;
    mustRevealTxFees: number[] = [];
    commitAddrs: string[] = [];

    static newRouterInscriptionTool(network: bitcoin.Network, request: RouterInscriptionRequest) {
        const tool = new RouterInscriptionTool();
        tool.network = network;

        const minChangeValue = request.minChangeValue || defaultMinChangeValue;

        // TODO: use commitTx first input privateKey
        const privateKey = request.commitTxPrevOutputList[0].privateKey;
        request.inscriptionDataList.forEach(inscriptionData => {
            tool.inscriptionTxCtxDataList.push(createRouterInscriptionTxCtxData(network, inscriptionData, privateKey));
        });
        const totalRevealPrevOutputValue = tool.buildEmptyRevealTx(network, request.revealFeeRate, request.inscriptionDataList, request?.transactionFee);
        const insufficient = tool.buildCommitTx(network, request.commitTxPrevOutputList, request.changeAddress, totalRevealPrevOutputValue, request.commitFeeRate, minChangeValue, request?.transactionFee);
        if (insufficient) {
            return tool;
        }
        tool.signCommitTx(request.commitTxPrevOutputList);
        tool.completeRevealTx();

        return tool;
    }

    buildEmptyRevealTx(network: bitcoin.Network, revealFeeRate: number, inscriptionDataList: RouterInscriptionData[], transactionFee?: number) {
        let totalPrevOutputValue = 0;
        const revealTxs: bitcoin.Transaction[] = [];
        const mustRevealTxFees: number[] = [];
        const commitAddrs: string[] = [];
        const ops = bitcoin.script.OPS;
        const tx = new bitcoin.Transaction();
        let prevOutputValue = defaultRevealOutValue
        let totalSwapAmt = 0
        let totalFee = 0
        let pumpFee = 0
        let pumpTipFee = 0
        this.inscriptionTxCtxDataList.forEach((inscriptionTxCtxData, i) => {

            tx.version = defaultTxVersion;
            const emptySignature = Buffer.alloc(71);
            const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
            inscriptionBuilder.push(ops.OP_10);
            inscriptionBuilder.push(ops.OP_FALSE);
            inscriptionBuilder.push(emptySignature);
            inscriptionBuilder.push(inscriptionTxCtxData.inscriptionScript);
            const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
            const hash = this.commitTx.getHash();
            tx.addInput(hash, i, defaultSequenceNum, inscriptionScript);
            const body: any = JSON.parse(inscriptionDataList[i].body)
            const { tick0, amt0, amt1, tick1, op, tick0_id, tick, amt, doge, p } = body
            const calculateFee = (amt: number) => Math.max(Math.floor(amt * 3 / 1000), 50000000);
        
            const processWDOGE = (amtStr: string) => {
                const amt = parseInt(amtStr);
                totalSwapAmt += amt;
                if (p === 'pump') {
                    pumpTipFee += 10000000
                    if (op === 'deploy') {
                        pumpFee += 500000000
                    }
                }
                const fee = calculateFee(amt);
                totalFee += fee;
            };
        
            if ((tick0 === "WDOGE(WRAPPED-DOGE)" || tick0_id === "WDOGE(WRAPPED-DOGE)") && doge === 1) {
                const amount = amt0 || 0
                processWDOGE(amount);
            }

            if (tick === "WDOGE(WRAPPED-DOGE)" && doge === 1) {
                const amount = amt || 0
                processWDOGE(amount);
            }
            if (tick1 === "WDOGE(WRAPPED-DOGE)" && op !== 'swap' && op !== 'trade' && doge === 1) {
                const amount = amt1 || 0
                processWDOGE(amount);
            }
            if (p === 'pump' && doge === 0) {
                if (tick === "WDOGE(WRAPPED-DOGE)" || op === 'trade' ) {
                    pumpTipFee += 10000000
                }
            }
            if (p === 'pump') {
                if (doge === 1 && op === 'trade' && tick0_id !== "WDOGE(WRAPPED-DOGE)") {
                    pumpTipFee += 10000000;
                }
            }
            if (p === 'giveaway' && doge === 1) {
                pumpFee += 500000000
                pumpTipFee += 10000000;
            }
            const fee = transactionFee ? transactionFee : Math.floor(tx.byteLength() * revealFeeRate);
            prevOutputValue = +totalSwapAmt + (+totalFee) + Math.floor((Number(fee) + 100000) / inscriptionDataList.length);
            if (p === 'pump') {
                if (op === 'deploy') {
                    prevOutputValue += pumpFee + pumpTipFee
                } else {
                    prevOutputValue += pumpTipFee
                }
            }
            inscriptionTxCtxData.revealTxPrevOutput = {
                pkScript: inscriptionTxCtxData.commitTxAddressPkScript,
                value: prevOutputValue,
            };
            totalPrevOutputValue += prevOutputValue;
            mustRevealTxFees.push(fee);
            commitAddrs.push(inscriptionTxCtxData.commitTxAddress);

        });
        tx.addOutput(this.inscriptionTxCtxDataList[0].revealPkScript, defaultRevealOutValue);
        if(totalSwapAmt){
            const coolPkScript = bitcoin.address.toOutputScript(wdogeCoolAddress, network);
            tx.addOutput(coolPkScript, totalSwapAmt);
        }
        if(totalFee) {
            const feePkScript = bitcoin.address.toOutputScript(wdogeFeeAddress, network);
            tx.addOutput(feePkScript, totalFee);
        }
        if(pumpFee) {
            const pumpFeePkScript = bitcoin.address.toOutputScript(pumpFeeAddress, network);
            tx.addOutput(pumpFeePkScript, pumpFee);
        }
        if(pumpTipFee) {
            const pumpFeePkScript = bitcoin.address.toOutputScript(pumpTipFeeAddress, network);
            tx.addOutput(pumpFeePkScript, pumpTipFee);
        }
        const baseFee = 50000000
        prevOutputValue += baseFee
        this.revealTxs[0] = tx;
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
        console.log(changeAmount, 'changeAmount====',fee)
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

            revealTx.ins.forEach((input, j) => {
                revealTx.ins[j].hash = this.commitTx.getHash();
            });

            revealTx.ins.forEach((input, j) => {

                this.revealTxPrevOutputFetcher.push(this.inscriptionTxCtxDataList[j].revealTxPrevOutput.value);
                const privateKeyHex = base.toHex(this.inscriptionTxCtxDataList[j].privateKey);
                const hash = revealTx.hashForSignature(j, this.inscriptionTxCtxDataList[j].inscriptionScript, bitcoin.Transaction.SIGHASH_ALL)!;
                const signature = sign(hash, privateKeyHex);
                const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
                inscriptionBuilder.push(ops.OP_10);
                inscriptionBuilder.push(ops.OP_FALSE);
                inscriptionBuilder.push(bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL));
                inscriptionBuilder.push(this.inscriptionTxCtxDataList[j].inscriptionScript);
                const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
                input.script = inscriptionScript;
            });
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
function formatterBody(body: any) {
    let { tick0, tick1, ...filteredBody } = body
    return JSON.stringify(filteredBody)
}

function createRouterInscriptionTxCtxData(network: bitcoin.Network, inscriptionData: RouterInscriptionData, privateKeyWif: string): RouterInscriptionTxCtxData {
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
    const body = JSON.parse(inscriptionData.body)
    if (body.p === 'pair-v2') {
        const formatterReasult = formatterBody(body)
        inscriptionBuilder.push(Buffer.from(formatterReasult));
    } else {
        inscriptionBuilder.push(Buffer.from(inscriptionData.body));
    }
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

export function inscribeRouter(network: bitcoin.Network, request: RouterInscriptionRequest) {
    const tool = RouterInscriptionTool.newRouterInscriptionTool(network, request);
    if (tool.mustCommitTxFee > 0) {
        return {
            commitTx: "",
            revealTxs: [],
            commitTxFee: tool.mustCommitTxFee,
            revealTxFees: tool.mustRevealTxFees,
            commitAddrs: tool.commitAddrs,
            commitTxHash: "",
            revealTxHash: "",
        };
    }
    const commitHash = tool.commitTx.getHash()
    const commitString = Buffer.from(commitHash).reverse().toString('hex');
    const hash = tool.revealTxs[0].getHash();
    const hexString = Buffer.from(hash).reverse().toString('hex');
    console.log(hexString, 'revealTxHash');
    return {
        commitTxHash: commitString,
        revealTxHash: hexString,
        commitTx: tool.commitTx.toHex(),
        revealTxs: tool.revealTxs.map(revealTx => revealTx.toHex()),
        ...tool.calculateFee(),
        commitAddrs: tool.commitAddrs,
    };
}
