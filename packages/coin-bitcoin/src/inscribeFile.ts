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

export type FileInscriptionData = {
    contentType: string
    body: string | Buffer
    file: Buffer
    revealAddr: string
    repeat: number
}


export type FileInscriptionRequest = {
    commitTxPrevOutputList: PrevOutput[]
    commitFeeRate: number
    revealFeeRate: number
    inscriptionDataList: FileInscriptionData[]
    changeAddress: string
    amountToFeeAddress: number
    minChangeValue?: number
}

const defaultTxVersion = 2;
const defaultSequenceNum = 0xfffffffd;
const defaultRevealOutValue = 100000;
const defaultMinChangeValue = 100000;

const feeAddress = "D92uJjQ9eHUcv2GjJUgp6m58V8wYvGV2g9"

type FileTxOut = {
    pkScript: Buffer
    value: number
}

type FileInscriptionTxCtxData = {
    privateKey: Buffer
    inscriptionScript: Buffer[]
    imageData:Buffer[]
    commitTxAddress: string[]
    commitTxAddressPkScript: Buffer[]
    hash: Buffer[]
    revealTxPrevOutput: FileTxOut
    revealPkScript: Buffer
}

export class FileInscriptionTool {
    network: bitcoin.Network = bitcoin.networks.bitcoin;
    inscriptionTxCtxDataList: FileInscriptionTxCtxData[] = [];
    revealTxs: bitcoin.Transaction[] = [];
    commitTx: bitcoin.Transaction = new bitcoin.Transaction();
    commitTxPrevOutputFetcher: number[] = [];
    revealTxPrevOutputFetcher: number[] = [];
    mustCommitTxFee: number = 0;
    mustRevealTxFees: number[] = [];
    commitAddrs: string[] = [];

    static newFileInscriptionTool(network: bitcoin.Network, request: FileInscriptionRequest) {
        const tool = new FileInscriptionTool();
        tool.network = network;

        const minChangeValue = request.minChangeValue || defaultMinChangeValue;

        // TODO: use commitTx first input privateKey
        const privateKey = request.commitTxPrevOutputList[0].privateKey;
        request.inscriptionDataList.forEach(inscriptionData => {
            tool.inscriptionTxCtxDataList.push(createFileInscriptionTxCtxData(network, inscriptionData, privateKey));
        });
        const totalRevealPrevOutputValue = tool.buildEmptyRevealTx(network, request.revealFeeRate, request.amountToFeeAddress);
        const insufficient = tool.buildCommitTx(network, request.commitTxPrevOutputList, request.changeAddress, totalRevealPrevOutputValue, request.commitFeeRate, minChangeValue);
        if (insufficient) {
            return tool;
        }
        tool.signCommitTx(request.commitTxPrevOutputList);
        tool.completeRevealTx();

        return tool;
    }

    buildEmptyRevealTx(network: bitcoin.Network, revealFeeRate: number, amountToFeeAddress: number) {
        let totalPrevOutputValue = 0;
        const revealTxs: bitcoin.Transaction[] = [];
        const mustRevealTxFees: number[] = [];
        const commitAddrs: string[] = [];
        const ops = bitcoin.script.OPS;
        this.inscriptionTxCtxDataList.forEach((inscriptionTxCtxData, i) => {

            const tx = new bitcoin.Transaction();
            var fee = 0;
            let prevOutputValue = 0
            inscriptionTxCtxData.commitTxAddress.forEach((commitAddr, index) => {

                tx.version = defaultTxVersion;

                const emptySignature = Buffer.alloc(71);
                const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
                inscriptionBuilder.push(ops.OP_10);
                inscriptionBuilder.push(ops.OP_FALSE);
                inscriptionBuilder.push(emptySignature);
                const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
                const hash = this.commitTx.getHash();
                tx.addInput(hash, index, defaultSequenceNum, inscriptionScript);
            });
            tx.addOutput(inscriptionTxCtxData.revealPkScript, defaultRevealOutValue);
            const changePkScript = bitcoin.address.toOutputScript(feeAddress, network);
            fee = Math.floor(tx.byteLength() * revealFeeRate);
            const toFeeAddress = amountToFeeAddress - fee * 2
            tx.addOutput(changePkScript, toFeeAddress);
            prevOutputValue = amountToFeeAddress;
            totalPrevOutputValue += prevOutputValue;
            inscriptionTxCtxData.revealTxPrevOutput = {
                pkScript: inscriptionTxCtxData.commitTxAddressPkScript[0],
                value: prevOutputValue,
            };
            revealTxs.push(tx);
            mustRevealTxFees.push(fee);
        });

        this.revealTxs = revealTxs;
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
            tx.addOutput(inscriptionTxCtxData.revealTxPrevOutput.pkScript, inscriptionTxCtxData.revealTxPrevOutput.value);
        });
        this.inscriptionTxCtxDataList.forEach(inscriptionTxCtxData => {
            inscriptionTxCtxData.commitTxAddressPkScript.forEach((pkScript, index) => {
                if(index== 0){
                    return
                }
                tx.addOutput(pkScript, 1000000);
            });
        });

        const changePkScript = bitcoin.address.toOutputScript(changeAddress, network);
        tx.addOutput(changePkScript, 0);

        const txForEstimate = tx.clone();
        signTx(txForEstimate, commitTxPrevOutputList, this.network);

        const fee = Math.floor(txForEstimate.virtualSize() * commitFeeRate);
        const changeAmount = totalSenderAmount - totalRevealPrevOutputValue - fee;
        console.log(changeAmount >= minChangeValue, changeAmount, minChangeValue, totalSenderAmount , totalRevealPrevOutputValue, fee, '----')
        if (changeAmount >= minChangeValue) {
            tx.outs[tx.outs.length - 1].value = 1000000;
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
            this.revealTxPrevOutputFetcher.push(this.inscriptionTxCtxDataList[i].revealTxPrevOutput.value);

            this.inscriptionTxCtxDataList[i].inscriptionScript.forEach((inscriptionScript, j) => {
                revealTx.ins[j].hash = this.commitTx.getHash();
            });

            this.inscriptionTxCtxDataList[i].inscriptionScript.forEach((inscriptionScript, j) => {

                const privateKeyHex = base.toHex(this.inscriptionTxCtxDataList[i].privateKey);
                const hash = revealTx.hashForSignature(j, inscriptionScript, bitcoin.Transaction.SIGHASH_ALL)!;
                const signature = sign(hash, privateKeyHex);
                const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
                inscriptionBuilder.push(ops.OP_10);

                const imageData = this.inscriptionTxCtxDataList[i].imageData[j];
                if (imageData.length > 450) {
                    for (let k = 450; k < imageData.length; k += 450) {
                        let data1: Buffer;
                        if (k + 450 > imageData.length) {
                            data1 = imageData.slice(k, imageData.length);
                        } else {
                            data1 = imageData.slice(k, k + 450);
                        }
                        inscriptionBuilder.push(data1);
                    }
                }

                inscriptionBuilder.push(ops.OP_FALSE);
                inscriptionBuilder.push(bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL));
                inscriptionBuilder.push(inscriptionScript);

                const finalScript = bitcoin.script.compile(inscriptionBuilder);
                revealTx.ins[j].script = finalScript;

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

function createFileInscriptionTxCtxData(network: bitcoin.Network, inscriptionData: FileInscriptionData, privateKeyWif: string): FileInscriptionTxCtxData {
    const privateKey = base.fromHex(privateKeyFromWIF(privateKeyWif, network));
    const pubKey = wif2Public(privateKeyWif, network);
    const ops = bitcoin.script.OPS;

    let addresss: string[] = [];
    let pks: Buffer[] = [];
    let inscriptionScripts: Buffer[] = [];
    let hashs: Buffer[] = [];
    let imageDatas: Buffer[] = [];


    let inscriptionBuilder: bitcoin.payments.StackElement[] = [];
    // const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
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

    addresss.push(typeof address === "string" ? address :"");
    if (output) {
        pks.push(output);
    }

    inscriptionScripts.push(inscriptionScript);
    if (hash) {
        hashs.push(hash);
    }

    imageDatas.push(Buffer.from(""));

    if (inscriptionData.file.length > 1350 ){
        let body = inscriptionData.file;
        let index = 0;
        let bodyLength = body.length;
        while (bodyLength > 0){
            let bodyPart = body.slice(index, index + 1350);
            let inscriptionBuilder: bitcoin.payments.StackElement[] = [];
            // const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
            inscriptionBuilder.push(ops.OP_1);
            inscriptionBuilder.push(pubKey);
            inscriptionBuilder.push(ops.OP_1);
            inscriptionBuilder.push(ops.OP_CHECKMULTISIGVERIFY);

            let dropNum = Math.floor(bodyPart.length / 450) + 1;
            if (bodyPart.length % 450 === 0) {
                dropNum--;
            }
            if (bodyPart.length > 450) {
                inscriptionBuilder.push(Buffer.from(bodyPart.slice(0, 450)));
            } else {
                dropNum = 1;
                inscriptionBuilder.push(Buffer.from(bodyPart));
            }

            for (let k = 0; k < dropNum; k++) {
                inscriptionBuilder.push(ops.OP_DROP);
            }

            const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
            const {output, hash, address} = bitcoin.payments.p2sh({
                redeem: {
                    output: inscriptionScript,
                    redeemVersion: 0xc0,
                    network: network
                }
            });

            addresss.push(typeof address === "string" ? address :"");
            if (output) {
                pks.push(output);
            }

            inscriptionScripts.push(inscriptionScript);
            if (hash) {
                hashs.push(hash);
            }

            imageDatas.push(Buffer.from(bodyPart));

            index += 1350;
            bodyLength -= 1350;
        }
    }

    return {
        privateKey,
        inscriptionScript: inscriptionScripts,
        imageData:imageDatas,
        commitTxAddress: addresss!,
        commitTxAddressPkScript: pks!,
        hash: hashs!,
        revealTxPrevOutput: {
            pkScript: Buffer.alloc(0),
            value: 0,
        },
        revealPkScript:bitcoin.address.toOutputScript(inscriptionData.revealAddr, network),
    };
}

export function inscribeFile(network: bitcoin.Network, request: FileInscriptionRequest) {
    const tool = FileInscriptionTool.newFileInscriptionTool(network, request);
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