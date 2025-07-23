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

export const PEPECOIN_NETWORK = {
  messagePrefix: '\x18Pepecoin Signed Message:\n',
  bech32: 'pep',
  bip32: {
    public: 0x02facafd,
    private: 0x02fac398,
  },
  pubKeyHash: 56,
  scriptHash: 22,
  wif: 158,
};

export type TransactionRequest = {
    commitTxPrevOutputList: PrevOutput[]
    commitFeeRate: number
    transactionDataList: TransactionData[]
    changeAddress: string
    minChangeValue?: number
    transactionFee?: number
}

const defaultTxVersion = 2;
const defaultSequenceNum = 0xfffffffd;
const defaultMinChangeValue = 100000;

export type TransactionTxOut = {
    pkScript: Buffer
    value: number
}

export type TransactionTxs = {
    commitTx: string
    commitTxFee: number
}
export type TransactionData = {
    revealAddr: string
    receiveAddr?: string
    amount: number
}
export type TransactionTxCtxData = {
    privateKey: Buffer
    inscriptionScript: Buffer
    commitTxAddressPkScript: Buffer
    hash: Buffer
}

function getNetwork(network: bitcoin.Network): bitcoin.Network {
    if (network.pubKeyHash === PEPECOIN_NETWORK.pubKeyHash) {
        return PEPECOIN_NETWORK as bitcoin.Network;
    }
    return network;
}

export class TransactionTool {
    network: bitcoin.Network = bitcoin.networks.bitcoin;
    transactionTxCtxDataList: TransactionTxCtxData[] = [];
    commitTx: bitcoin.Transaction = new bitcoin.Transaction();
    commitTxPrevOutputFetcher: number[] = [];
    mustCommitTxFee: number = 0;
    mustRevealTxFees: number[] = [];

    static newTransactionTool(network: bitcoin.Network, request: TransactionRequest) {
        const tool = new TransactionTool();
        tool.network = getNetwork(network);

        const minChangeValue = request.minChangeValue || defaultMinChangeValue;

        // TODO: use commitTx first input privateKey
        const privateKey = request.commitTxPrevOutputList[0].privateKey;
        request.transactionDataList.forEach(inscriptionData => {
            tool.transactionTxCtxDataList.push(createTransactionTxCtxData(network, inscriptionData, privateKey));
        });
        const insufficient = tool.buildCommitTx(network, request.commitTxPrevOutputList, request.transactionDataList, request.changeAddress, request.commitFeeRate, minChangeValue, request?.transactionFee);
        if (insufficient) {
            return tool;
        }
        tool.signCommitTx(request.commitTxPrevOutputList);
        return tool;
    }

    buildCommitTx(network: bitcoin.Network, commitTxPrevOutputList: PrevOutput[], transactionDataList: TransactionData[],changeAddress: string, commitFeeRate: number, minChangeValue: number, transactionFee?: number): boolean {
        let totalSenderAmount = 0;

        const tx = new bitcoin.Transaction();
        tx.version = defaultTxVersion;
        
        const currentNetwork = getNetwork(network);

        commitTxPrevOutputList.forEach(commitTxPrevOutput => {
            const hash = base.reverseBuffer(base.fromHex(commitTxPrevOutput.txId));
            tx.addInput(hash, commitTxPrevOutput.vOut, defaultSequenceNum);
            this.commitTxPrevOutputFetcher.push(commitTxPrevOutput.amount);
            totalSenderAmount += commitTxPrevOutput.amount;
        });
        let totalRevealPrevOutputValue = 0
        transactionDataList.forEach(item => {
            const changePkScript = bitcoin.address.toOutputScript(item.revealAddr, currentNetwork);
            tx.addOutput(changePkScript, item.amount);
            totalRevealPrevOutputValue += item.amount;
        })
        const txForEstimate = tx.clone();
        signTx(txForEstimate, commitTxPrevOutputList, this.network);
        const fee = transactionFee ? transactionFee : Math.floor(txForEstimate.virtualSize() * commitFeeRate);
        const changeAmount = totalSenderAmount - totalRevealPrevOutputValue - fee;
        const changePkScript = bitcoin.address.toOutputScript(changeAddress, currentNetwork);
        console.log(changeAmount, 'changeAmount====', minChangeValue, changeAmount >= minChangeValue, fee, totalSenderAmount, totalRevealPrevOutputValue)
        if (changeAmount >= 0) {
            if(changeAmount > 0) {
                tx.addOutput(changePkScript, changeAmount);
            }
        } else {
            tx.outs = tx.outs.slice(0, tx.outs.length - 1);
            txForEstimate.outs = txForEstimate.outs.slice(0, txForEstimate.outs.length - 1);
            const feeWithoutChange = Math.floor(txForEstimate.virtualSize() * commitFeeRate);
            if (totalSenderAmount - feeWithoutChange < 0) {
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

    calculateFee() {
        let commitTxFee = 0;
        this.commitTx.ins.forEach((_, i) => {
            commitTxFee += this.commitTxPrevOutputFetcher[i];
        });
        this.commitTx.outs.forEach(out => {
            commitTxFee -= out.value;
        });
        return {
            commitTxFee
        };
    }
}

function signTx(tx: bitcoin.Transaction, commitTxPrevOutputList: PrevOutput[], network: bitcoin.Network) {
    tx.ins.forEach((input, i) => {
        const currentNetwork = getNetwork(network);
        const addressType = getAddressType(commitTxPrevOutputList[i].address, currentNetwork);
        const privateKey = base.fromHex(privateKeyFromWIF(commitTxPrevOutputList[i].privateKey, currentNetwork));
        const privateKeyHex = base.toHex(privateKey);
        const publicKey = private2public(privateKeyHex);
        if (addressType === 'legacy') {
            const prevScript = bitcoin.address.toOutputScript(commitTxPrevOutputList[i].address, currentNetwork);
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

function createTransactionTxCtxData(network: bitcoin.Network, inscriptionData: TransactionData, privateKeyWif: string): TransactionTxCtxData {
    const currentNetwork = getNetwork(network);
    const privateKey = base.fromHex(privateKeyFromWIF(privateKeyWif, currentNetwork));
    const pubKey = wif2Public(privateKeyWif, currentNetwork);
    const ops = bitcoin.script.OPS;

    const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
    inscriptionBuilder.push(ops.OP_1);
    inscriptionBuilder.push(pubKey);
    inscriptionBuilder.push(ops.OP_1);
    inscriptionBuilder.push(ops.OP_CHECKMULTISIGVERIFY);
    inscriptionBuilder.push(Buffer.from("ord"));
    inscriptionBuilder.push(ops.OP_DROP);
    inscriptionBuilder.push(ops.OP_DROP);
    inscriptionBuilder.push(ops.OP_DROP);
    const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
    const {output, hash} = bitcoin.payments.p2sh({
        redeem: {
            output: inscriptionScript,
            redeemVersion: 0xc0,
            network: currentNetwork
        }
    });

    return {
        privateKey,
        inscriptionScript,
        commitTxAddressPkScript: output!,
        hash: hash!
    };
}

export function createPepecoinNetwork(): bitcoin.Network {
    return PEPECOIN_NETWORK as bitcoin.Network;
}

export const pepecoinNetwork = createPepecoinNetwork();

export function pepecoinTransaction(request: TransactionRequest): TransactionTxs {
    return transaction(pepecoinNetwork, request);
}

export function transaction(network: bitcoin.Network, request: TransactionRequest) {
    const detectedNetwork = getNetwork(network);
    const tool = TransactionTool.newTransactionTool(detectedNetwork, request);
    if (tool.mustCommitTxFee > 0) {
        return {
            commitTx: "",
            commitTxFee: tool.mustCommitTxFee
        };
    }

    return {
        commitTx: tool.commitTx.toHex(),
        ...tool.calculateFee()
    };
}
