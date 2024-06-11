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

export type NftInscriptionData = {
    contentType: string
    body: string | Buffer
    revealAddr: string
    repeat: number
}


export type NftInscriptionRequest = {
    commitTxPrevOutputList: PrevOutput[]
    commitFeeRate: number
    revealFeeRate: number
    inscriptionDataList: NftInscriptionData[]
    changeAddress: string
    minChangeValue?: number
}

const defaultTxVersion = 2;
const defaultSequenceNum = 0xfffffffd;
const defaultRevealOutValue = 100000;
const defaultMinChangeValue = 100000;

const pNftAi = "nft/ai"

const opDeploy = "deploy"
const opMint = "mint"
const opTransfer = "transfer"

const feeAddress = "DEMZQAJjdNMM9M3Sk7LAmtPdk8me6SZUm1"

type NftTxOut = {
    pkScript: Buffer
    value: number
}

type NftInscriptionTxCtxData = {
    privateKey: Buffer
    inscriptionScript: Buffer[]
    commitTxAddress: string[]
    commitTxAddressPkScript: Buffer[]
    hash: Buffer[]
    revealTxPrevOutput: NftTxOut
    revealPkScript: Buffer
}

export class NftInscriptionTool {
    network: bitcoin.Network = bitcoin.networks.bitcoin;
    inscriptionTxCtxDataList: NftInscriptionTxCtxData[] = [];
    revealTxs: bitcoin.Transaction[] = [];
    commitTx: bitcoin.Transaction = new bitcoin.Transaction();
    commitTxPrevOutputFetcher: number[] = [];
    revealTxPrevOutputFetcher: number[] = [];
    mustCommitTxFee: number = 0;
    mustRevealTxFees: number[] = [];
    commitAddrs: string[] = [];

    static newNftInscriptionTool(network: bitcoin.Network, request: NftInscriptionRequest) {
        const tool = new NftInscriptionTool();
        tool.network = network;

        const minChangeValue = request.minChangeValue || defaultMinChangeValue;

        // TODO: use commitTx first input privateKey
        const privateKey = request.commitTxPrevOutputList[0].privateKey;
        request.inscriptionDataList.forEach(inscriptionData => {
            tool.inscriptionTxCtxDataList.push(createNftInscriptionTxCtxData(network, inscriptionData, privateKey));
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

    buildEmptyRevealTx(network: bitcoin.Network, revealFeeRate: number, inscriptionDataList: NftInscriptionData[]) {
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

            tx.addOutput(inscriptionTxCtxData.revealPkScript, defaultRevealOutValue );

            const emptySignature = Buffer.alloc(71);
            const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
            inscriptionBuilder.push(ops.OP_10);
            inscriptionBuilder.push(ops.OP_FALSE);
            inscriptionBuilder.push(emptySignature);
            // inscriptionBuilder.push(inscriptionTxCtxData.inscriptionScript);
            const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);

            tx.addInput(Buffer.alloc(32), i, defaultSequenceNum, inscriptionScript);
            let prevOutputValue = defaultRevealOutValue

            const fee = Math.floor(tx.byteLength() * revealFeeRate);
            prevOutputValue += fee;
            // inscriptionTxCtxData.revealTxPrevOutput = {
            //     pkScript: inscriptionTxCtxData.commitTxAddressPkScript,
            //     value: prevOutputValue,
            // };
            totalPrevOutputValue += prevOutputValue;
            revealTxs.push(tx);
            mustRevealTxFees.push(fee);
            // commitAddrs.push(inscriptionTxCtxData.commitTxAddress);
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
            revealTx.ins[0].hash = this.commitTx.getHash();

            this.revealTxPrevOutputFetcher.push(this.inscriptionTxCtxDataList[i].revealTxPrevOutput.value);

            for (let j = 0; j < this.inscriptionTxCtxDataList[i].inscriptionScript.length; j++) {
                const privateKeyHex = base.toHex(this.inscriptionTxCtxDataList[i].privateKey);
                const hash = revealTx.hashForSignature(i, this.inscriptionTxCtxDataList[i].inscriptionScript[j], bitcoin.Transaction.SIGHASH_ALL)!;
                const signature = sign(hash, privateKeyHex);
                const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
                inscriptionBuilder.push(ops.OP_10);
                inscriptionBuilder.push(ops.OP_FALSE);
                inscriptionBuilder.push(bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL));

                inscriptionBuilder.push(this.inscriptionTxCtxDataList[i].inscriptionScript[j]);
                const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
                revealTx.ins[0].script = inscriptionScript;
            }
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

function createNftInscriptionTxCtxData(network: bitcoin.Network, inscriptionData: NftInscriptionData, privateKeyWif: string): NftInscriptionTxCtxData {
    const privateKey = base.fromHex(privateKeyFromWIF(privateKeyWif, network));
    const pubKey = wif2Public(privateKeyWif, network);
    const ops = bitcoin.script.OPS;


    //
    let addresss: string[] = [];
    let pks: Buffer[] = [];
    let inscriptionScripts: Buffer[] = [];
    let hashs: Buffer[] = [];

    if (inscriptionData.body.length > 1350 ){
        let body = inscriptionData.body;
        let index = 0;
        let bodyLength = body.length;
        while (bodyLength > 0){
            let bodyLength = body.length;
            let bodyPart = body.slice(index, index + 1350);
            let inscriptionBuilder: bitcoin.payments.StackElement[] = [];
            // const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
            inscriptionBuilder.push(ops.OP_1);
            inscriptionBuilder.push(pubKey);
            inscriptionBuilder.push(ops.OP_1);
            inscriptionBuilder.push(ops.OP_CHECKMULTISIGVERIFY);
            inscriptionBuilder.push(Buffer.from("ord"));
            inscriptionBuilder.push(Buffer.from(inscriptionData.contentType));

            inscriptionBuilder.push(Buffer.from(bodyPart));

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

            index += 1350;
            bodyLength -= 1350;
        }
    }
    return {
        privateKey,
        inscriptionScript: inscriptionScripts,
        commitTxAddress: addresss!,
        commitTxAddressPkScript: pks!,
        hash: hashs!,
        revealTxPrevOutput: {
            pkScript: Buffer.alloc(0),
            value: 0,
        },
        revealPkScript: bitcoin.address.toOutputScript(inscriptionData.revealAddr, network),
    };
}

export function inscribeNft(network: bitcoin.Network, request: NftInscriptionRequest) {
    const tool = NftInscriptionTool.newNftInscriptionTool(network, request);
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
