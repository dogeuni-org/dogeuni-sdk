// Offline regression coverage for P1 fixes:
// 1. inscribeDrc batch inscriptions (revealTx.hashForSignature index 0)
// 2. inscribeBinaryData chunk OP_DROP count on 450-byte multiples (900, 1350, 2700 bytes)
// 3. inscribeFile multi-chunk commit UTXO conservation and insufficient-funds check
// 4. computeRoutePath reveal funding for baseFee and batch signing index 0
import * as crypto from 'crypto';
import { signUtil } from '@dogeuni-org/crypto-lib';
import {
    address,
    computeRoutePath,
    dogeCoin,
    inscribeBinaryData,
    inscribeDrc,
    inscribeFile,
    payments,
    private2Wif,
    script,
    Transaction,
    wif2Public,
} from '../src';

const FEE_ADDRESS = 'DEMZQAJjdNMM9M3Sk7LAmtPdk8me6SZUm1';

const privateKey = private2Wif(crypto.randomBytes(32), dogeCoin);
const pubKey = wif2Public(privateKey, dogeCoin);
const account = payments.p2pkh({ pubkey: pubKey, network: dogeCoin }).address!;

function verifyP2shRevealSignature(revealTxHex: string) {
    const reveal = Transaction.fromHex(revealTxHex);
    const unlock = script.decompile(reveal.ins[0].script)!;
    expect(unlock).toBeTruthy();
    const derSig = unlock[2] as Buffer;
    const redeemScript = unlock[3] as Buffer;
    const decodedSig = script.signature.decode(derSig);
    const sighash = reveal.hashForSignature(0, redeemScript, decodedSig.hashType);
    expect(signUtil.secp256k1.verifyWithNoRecovery(sighash, decodedSig.signature, pubKey)).toBe(true);
}

describe('P1: inscribeDrc batch reveal signing', () => {
    test('multiple inscriptions in one request produce valid signatures for every revealTx', () => {
        const txs = inscribeDrc(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '11'.repeat(32),
                vOut: 0,
                amount: 1000e8,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [
                {
                    contentType: 'text/plain;charset=utf-8',
                    body: JSON.stringify({ p: 'drc-20', op: 'mint', tick: 'UNIX', amt: '100' }),
                    revealAddr: account,
                    repeat: 1,
                },
                {
                    contentType: 'text/plain;charset=utf-8',
                    body: JSON.stringify({ p: 'drc-20', op: 'transfer', tick: 'UNIX', amt: '50' }),
                    revealAddr: account,
                    repeat: 1,
                },
            ],
            changeAddress: account,
        });

        expect(txs.commitTx).not.toBe('');
        expect(txs.revealTxs).toHaveLength(2);
        verifyP2shRevealSignature(txs.revealTxs[0]);
        verifyP2shRevealSignature(txs.revealTxs[1]);
    });
});

describe('P1: inscribeBinaryData OP_DROP stack balance on 450-byte boundaries', () => {
    test.each([450, 451, 900, 901, 1350, 2700])(
        'payload of %i bytes balances data pushes and OP_DROP count for every chunk',
        (byteLength) => {
            const payload = Buffer.alloc(byteLength, 0x42);
            const txs = inscribeBinaryData(dogeCoin, {
                commitTxPrevOutputList: [{
                    txId: '22'.repeat(32),
                    vOut: 0,
                    amount: 1000e8,
                    address: account,
                    privateKey,
                }],
                commitFeeRate: 1000,
                revealFeeRate: 1000,
                inscriptionDataList: [{
                    contentType: 'application/octet-stream',
                    body: Buffer.from('{"p":"file","op":"deploy"}'),
                    carc_b64: payload.toString('base64'),
                    revealAddr: account,
                }],
                changeAddress: account,
                transactionFee: 5_000_000,
            });

            expect(txs.insufficient).toBe(false);
            expect(txs.commitTx).not.toBe('');
            expect(txs.revealTxs).toHaveLength(1);

            const reveal = Transaction.fromHex(txs.revealTxs[0]);
            expect(reveal.ins.length).toBeGreaterThanOrEqual(2);

            reveal.ins.forEach((input) => {
                const unlock = script.decompile(input.script)!;
                expect(unlock[0]).toBe(script.OPS.OP_10);
                // Structure: [OP_10, ...extraDataChunks, OP_FALSE, sig, redeemScript]
                const extraDataChunksCount = unlock.length - 4;
                const redeemScript = unlock[unlock.length - 1] as Buffer;
                const redeemChunks = script.decompile(redeemScript)!;
                // Structure: [OP_1, pubKey, OP_1, OP_CHECKMULTISIGVERIFY, firstDataChunk, ...OP_DROP]
                const tailOps = redeemChunks.slice(5);
                expect(tailOps.every((op) => op === script.OPS.OP_DROP)).toBe(true);
                // Total data pushes = 1 (in redeemScript) + extraDataChunksCount (in scriptSig)
                expect(tailOps.length).toBe(1 + extraDataChunksCount);
            });
        },
    );
});

describe('P1: inscribeFile multi-chunk commit UTXO conservation', () => {
    test('multi-chunk commit outputs + fee equal input amount (no negative miner fee)', () => {
        const inputAmount = 100e8;
        const fileData = Buffer.alloc(2000, 0x61); // 1 header + 2 file chunks => 2 extra outputs of 1_000_000 each
        const txs = inscribeFile(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '33'.repeat(32),
                vOut: 0,
                amount: inputAmount,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [{
                contentType: 'application/octet-stream',
                body: '{"p":"file","op":"deploy"}',
                file: fileData,
                revealAddr: account,
                repeat: 1,
            }],
            changeAddress: account,
            amountToFeeAddress: 50_000_000,
            needServiceFee: true,
        });

        expect(txs.commitTx).not.toBe('');
        const commit = Transaction.fromHex(txs.commitTx);
        const totalCommitOut = commit.outs.reduce((sum, o) => sum + o.value, 0);
        expect(totalCommitOut).toBeLessThan(inputAmount);
        expect(inputAmount - totalCommitOut).toBe(txs.commitTxFee);
        expect(txs.commitTxFee).toBeGreaterThan(0);
    });

    test('multi-chunk file reports insufficient funds when extra chunk outputs exceed available balance', () => {
        const fileData = Buffer.alloc(2000, 0x61); // requires 50_000_000 + 2 * 1_000_000 + commitFee
        const txs = inscribeFile(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '44'.repeat(32),
                vOut: 0,
                amount: 51_000_000, // covers amountToFeeAddress + commitFee, but NOT the 2_000_000 extra chunk outputs
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [{
                contentType: 'application/octet-stream',
                body: '{"p":"file","op":"deploy"}',
                file: fileData,
                revealAddr: account,
                repeat: 1,
            }],
            changeAddress: account,
            amountToFeeAddress: 50_000_000,
            needServiceFee: true,
        });

        expect(txs.commitTx).toBe('');
        expect(txs.revealTxs).toEqual([]);
        expect(txs.commitTxFee).toBeGreaterThan(0);
    });
});

describe('P1: computeRoutePath reveal baseFee funding & batch signing', () => {
    test('commit P2SH outputs cover 0.5 DOGE baseFee + reveal dust + reveal fee and all reveals sign validly', () => {
        const txs = computeRoutePath(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '55'.repeat(32),
                vOut: 0,
                amount: 1000e8,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [
                {
                    contentType: 'text/plain;charset=utf-8',
                    body: JSON.stringify({ p: 'pair-v1', op: 'swap', tick0: 'UNIX', tick1: 'DOGE', amt0: '100' }),
                    revealAddr: account,
                    repeat: 1,
                },
                {
                    contentType: 'text/plain;charset=utf-8',
                    body: JSON.stringify({ p: 'pair-v1', op: 'swap', tick0: 'DOGE', tick1: 'UNIX', amt0: '200' }),
                    revealAddr: account,
                    repeat: 1,
                },
            ],
            changeAddress: account,
        });

        expect(txs.commitTx).not.toBe('');
        expect(txs.revealTxs).toHaveLength(2);

        const commit = Transaction.fromHex(txs.commitTx);
        txs.revealTxs.forEach((revealHex, i) => {
            const reveal = Transaction.fromHex(revealHex);
            const outs = reveal.outs.map((o) => [address.fromOutputScript(o.script, dogeCoin), o.value]);
            expect(outs).toEqual([
                [account, 100_000],
                [FEE_ADDRESS, 50_000_000],
            ]);
            const totalRevealOut = reveal.outs.reduce((sum, o) => sum + o.value, 0);
            expect(commit.outs[i].value).toBeGreaterThan(totalRevealOut);
            verifyP2shRevealSignature(revealHex);
        });
    });
});
