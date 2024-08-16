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

export type SwapInscriptionData = {
    contentType: string
    body: string | Buffer
    revealAddr: string
    receiveAddr?: string
}

export type SwapInscriptionRequest = {
    commitTxPrevOutputList: PrevOutput[]
    commitFeeRate: number
    revealFeeRate: number
    inscriptionDataList: SwapInscriptionData[]
    changeAddress: string
    minChangeValue?: number
}

const defaultTxVersion = 2;
const defaultSequenceNum = 0xfffffffd;
const defaultRevealOutValue = 100000;
const defaultMinChangeValue = 100000;

const opSwap= "swap"

const feeAddress = "DEMZQAJjdNMM9M3Sk7LAmtPdk8me6SZUm1"

type SwapTxOut = {
    pkScript: Buffer
    value: number
}

type SwapInscriptionTxCtxData = {
    privateKey: Buffer
    inscriptionScript: Buffer
    commitTxAddress: string
    commitTxAddressPkScript: Buffer
    hash: Buffer
    revealTxPrevOutput: SwapTxOut
    revealPkScript: Buffer
}

export class SwapInscriptionTool {
    network: bitcoin.Network = bitcoin.networks.bitcoin;
    inscriptionTxCtxDataList: SwapInscriptionTxCtxData[] = [];
    revealTxs: bitcoin.Transaction[] = [];
    commitTx: bitcoin.Transaction = new bitcoin.Transaction();
    commitTxPrevOutputFetcher: number[] = [];
    revealTxPrevOutputFetcher: number[] = [];
    mustCommitTxFee: number = 0;
    mustRevealTxFees: number[] = [];
    commitAddrs: string[] = [];

    static newSwapInscriptionTool(network: bitcoin.Network, request: SwapInscriptionRequest) {
        const tool = new SwapInscriptionTool();
        tool.network = network;

        const minChangeValue = request.minChangeValue || defaultMinChangeValue;

        // TODO: use commitTx first input privateKey
        const privateKey = request.commitTxPrevOutputList[0].privateKey;
        request.inscriptionDataList.forEach(inscriptionData => {
            tool.inscriptionTxCtxDataList.push(createSwapInscriptionTxCtxData(network, inscriptionData, privateKey));
        });
        const totalRevealPrevOutputValue = tool.buildEmptyRevealTx(network, request.revealFeeRate, request.inscriptionDataList);
        const insufficient = tool.buildCommitTx(network, request.commitTxPrevOutputList, request.changeAddress, totalRevealPrevOutputValue, request.commitFeeRate, minChangeValue);
        if (insufficient) {
            return tool;
        }
        tool.signCommitTx(request.commitTxPrevOutputList);
        tool.completeRevealTx();

        return tool;
    }

    buildEmptyRevealTx(network: bitcoin.Network, revealFeeRate: number, inscriptionDataList: SwapInscriptionData[]) {
        let totalPrevOutputValue = 0;
        const revealTxs: bitcoin.Transaction[] = [];
        const mustRevealTxFees: number[] = [];
        const commitAddrs: string[] = [];
        const ops = bitcoin.script.OPS;
        const tx = new bitcoin.Transaction();
        let prevOutputValue = defaultRevealOutValue

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
            const fee = Math.floor(tx.byteLength() * revealFeeRate);
            prevOutputValue += fee;
            inscriptionTxCtxData.revealTxPrevOutput = {
                pkScript: inscriptionTxCtxData.commitTxAddressPkScript,
                value: prevOutputValue,
            };

            totalPrevOutputValue += prevOutputValue;
            mustRevealTxFees.push(fee);
            commitAddrs.push(inscriptionTxCtxData.commitTxAddress);

        });
            
        tx.addOutput(this.inscriptionTxCtxDataList[0].revealPkScript, defaultRevealOutValue);

        const baseFee = 50000000
        const changePkScript = bitcoin.address.toOutputScript(feeAddress, network);
        tx.addOutput(changePkScript, baseFee);
        prevOutputValue += baseFee

        this.revealTxs[0] = tx;
        this.mustRevealTxFees = mustRevealTxFees;
        this.commitAddrs = commitAddrs;

        return totalPrevOutputValue;
    }


    buildCommitTx(network: bitcoin.Network, commitTxPrevOutputList: PrevOutput[], changeAddress: string, totalRevealPrevOutputValue: number, commitFeeRate: number, minChangeValue: number): boolean {
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
            console.log(inscriptionTxCtxData.revealTxPrevOutput, '----revealTxPrevOutput----')
            tx.addOutput(inscriptionTxCtxData.revealTxPrevOutput.pkScript, inscriptionTxCtxData.revealTxPrevOutput.value);
        });
        console.log(tx, '----tx----')
        const changePkScript = bitcoin.address.toOutputScript(changeAddress, network);
        tx.addOutput(changePkScript, 0);

        const txForEstimate = tx.clone();
        signTx(txForEstimate, commitTxPrevOutputList, this.network);

        const fee = Math.floor(txForEstimate.virtualSize() * commitFeeRate);
        const changeAmount = totalSenderAmount - totalRevealPrevOutputValue - fee;
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

function createSwapInscriptionTxCtxData(network: bitcoin.Network, inscriptionData: SwapInscriptionData, privateKeyWif: string): SwapInscriptionTxCtxData {
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

export function inscribeSwap(network: bitcoin.Network, request: SwapInscriptionRequest) {
    const tool = SwapInscriptionTool.newSwapInscriptionTool(network, request);
    if (tool.mustCommitTxFee > 0) {
        return {
            commitTx: "",
            revealTxs: [],
            commitTxFee: tool.mustCommitTxFee,
            revealTxFees: tool.mustRevealTxFees,
            commitAddrs: tool.commitAddrs,
        };
    }

    return {
        commitTx: tool.commitTx.toHex(),
        revealTxs: tool.revealTxs.map(revealTx => revealTx.toHex()),
        ...tool.calculateFee(),
        commitAddrs: tool.commitAddrs,
    };
}
