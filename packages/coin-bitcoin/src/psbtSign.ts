import {Psbt, PsbtInputExtended, PsbtOutputExtended} from "./bitcoinjs-lib/psbt";
import {base, signUtil} from '@dogeuni-org/crypto-lib';
import {getAddressType, privateKeyFromWIF, sign, signBtc, wif2Public} from './txBuild';
import {Network, networks, payments, Transaction} from './bitcoinjs-lib';
import * as taproot from "./taproot";
import {isTaprootInput, toXOnly} from "./bitcoinjs-lib/psbt/bip371";
import {utxoInput, utxoOutput, utxoTx} from './type';
import {toOutputScript} from './bitcoinjs-lib/address';
import {sha256} from "./bitcoinjs-lib/crypto";

const randomBytes = base.randomBytes;

const schnorr = signUtil.schnorr.secp256k1.schnorr
const defaultMaximumFeeRate = 5000

export function buildPsbt(tx: utxoTx, network?: Network, maximumFeeRate?: number) {
    const psbt = classicToPsbt(tx, network, maximumFeeRate);
    return psbt.toHex();
}

export function classicToPsbt(tx: utxoTx, network?: Network, maximumFeeRate?: number): Psbt {
    const psbt = new Psbt({network, maximumFeeRate: maximumFeeRate ? maximumFeeRate : defaultMaximumFeeRate});
    tx.inputs.forEach((input: utxoInput) => {
        const outputScript = toOutputScript(input.address!, network);
        let inputData: PsbtInputExtended = {
            hash: input.txId,
            index: input.vOut,
            witnessUtxo: {script: outputScript, value: input.amount},
        };

        const addressType = getAddressType(input.address!, network || networks.bitcoin);
        if (input.bip32Derivation) {
            if (addressType === 'segwit_taproot') {
                inputData.tapBip32Derivation = input.bip32Derivation!.map((derivation: any) => {
                    let pubBuf = base.fromHex(derivation.pubkey)
                    if (pubBuf.length != 32) {
                        pubBuf = pubBuf.slice(1)
                    }
                    return {
                        masterFingerprint: base.fromHex(derivation.masterFingerprint),
                        pubkey: pubBuf,
                        path: derivation.path,
                        leafHashes: derivation.leafHashes.map((leaf: any) => {
                            return Buffer.from(leaf, 'hex')
                        }),
                    }
                })
            } else {
                inputData.bip32Derivation = input.bip32Derivation!.map((derivation: any) => {
                    return {
                        masterFingerprint: base.fromHex(derivation.masterFingerprint),
                        pubkey: base.fromHex(derivation.pubkey),
                        path: derivation.path,
                    }
                })
            }
        }

        if (addressType === 'legacy') {
            inputData.nonWitnessUtxo = base.fromHex(input.nonWitnessUtxo!);
        } else if (addressType === 'segwit_taproot') {
            if (input.publicKey) {
                inputData.tapInternalKey = toXOnly(base.fromHex(input.publicKey));
            }
        } else if (addressType === 'segwit_nested') {
            inputData.redeemScript = payments.p2wpkh({
                pubkey: Buffer.from(input.publicKey!, 'hex'),
                network,
            }).output!
        }

        if (input.sighashType) {
            inputData.sighashType = input.sighashType;
        }

        psbt.addInput(inputData);
    });
    tx.outputs.forEach((output: utxoOutput) => {
        if (output.omniScript) {
            psbt.addOutput({script: base.fromHex(output.omniScript), value: 0});
        } else {
            let outputData: PsbtOutputExtended = {address: output.address, value: output.amount};
            if (output.bip32Derivation) {
                outputData.bip32Derivation = output.bip32Derivation!.map((derivation: any) => {
                    return {
                        masterFingerprint: base.fromHex(derivation.masterFingerprint),
                        pubkey: base.fromHex(derivation.pubkey),
                        path: derivation.path,
                    }
                })
            }
            psbt.addOutput(outputData);
        }
    });
    return psbt;
}

export function psbtSign(psbtBase64: string, privateKey: string, network?: Network, maximumFeeRate?: number) {
    const psbt = Psbt.fromBase64(psbtBase64, {
        network,
        maximumFeeRate: maximumFeeRate ? maximumFeeRate : defaultMaximumFeeRate
    });
    psbtSignImpl(psbt, privateKey, network)
    return psbt.toBase64();
}

export function psbtSignImpl(psbt: Psbt, privateKey: string, network?: Network) {
    const signer = {
        psbtIndex: 0,
        needTweak: true,
        tweakHash: Buffer.alloc(0),
        publicKey: Buffer.alloc(0),
        sign(hash: Buffer): Buffer {
            return sign(hash, privateKeyFromWIF(privateKey, network));
        },
        signSchnorr(hash: Buffer): Buffer {
            let tweakedPrivKey = taproot.taprootTweakPrivKey(base.fromHex(privateKeyFromWIF(privateKey, network)));
            if (!this.needTweak) {
                return Buffer.from(schnorr.sign(hash, privateKeyFromWIF(privateKey, network), base.randomBytes(32)));
            }
            if (this.needTweak && this.tweakHash.length > 0) {
                tweakedPrivKey = taproot.taprootTweakPrivKey(base.fromHex(privateKeyFromWIF(privateKey, network)), this.tweakHash);
            }
            return Buffer.from(schnorr.sign(hash, tweakedPrivKey, base.randomBytes(32)));
        },
    };

    let allowedSighashTypes = [
        Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY,
        Transaction.SIGHASH_ALL,
        Transaction.SIGHASH_DEFAULT
    ];

    for (let i = 0; i < psbt.inputCount; i++) {
        signer.psbtIndex = i;
        const input = psbt.data.inputs[i];
        if (isTaprootInput(input)) {
            if (!input.tapInternalKey) {
                input.tapInternalKey = toXOnly(wif2Public(privateKey, network));
            }
            signer.needTweak = true;
            signer.publicKey = Buffer.from(taproot.taprootTweakPubkey(toXOnly(wif2Public(privateKey, network)))[0]);
        } else {
            signer.needTweak = false;
            signer.publicKey = wif2Public(privateKey, network);
        }
        psbt.signInput(i, signer, allowedSighashTypes);
    }
}

export function extractPsbtTransaction(txHex: string, network?: Network, maximumFeeRate?: number) {
    let psbt: Psbt;
    let extractedTransaction
    if (base.isHexString("0x" + txHex)) {
        psbt = Psbt.fromHex(txHex, {network, maximumFeeRate: maximumFeeRate ? maximumFeeRate : defaultMaximumFeeRate});
        extractedTransaction = psbt.finalizeAllInputs().extractTransaction()
    } else {
        psbt = Psbt.fromBase64(txHex, {network, maximumFeeRate: maximumFeeRate ? maximumFeeRate : defaultMaximumFeeRate})
        extractedTransaction = psbt.extractTransaction()
    }
    return extractedTransaction.toHex();
}