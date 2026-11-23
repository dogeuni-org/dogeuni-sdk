// Offline regression coverage for low-risk P2 fixes:
// 1. inscribeFile and inscribeBinaryData return the real commitTxHash (not revealTxHash).
// 2. inscribeDrc calculateFee() subtracts all reveal outputs (not only outs[0]).
// 3. inscribeDrc buildCommitTx() respects fixed transactionFee in the no-change fallback branch.
import * as crypto from 'crypto';
import {
    dogeCoin,
    inscribeBinaryData,
    inscribeDrc,
    inscribeFile,
    payments,
    private2Wif,
    Transaction,
    wif2Public,
} from '../src';

const privateKey = private2Wif(crypto.randomBytes(32), dogeCoin);
const pubKey = wif2Public(privateKey, dogeCoin);
const account = payments.p2pkh({ pubkey: pubKey, network: dogeCoin }).address!;

describe('P2: commitTxHash accuracy for file & binary inscriptions', () => {
    test('inscribeFile returns distinct commitTxHash and revealTxHash matching serialized transactions', () => {
        const txs = inscribeFile(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: 'a1'.repeat(32),
                vOut: 0,
                amount: 100e8,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [{
                contentType: 'application/octet-stream',
                body: '{"p":"file","op":"deploy"}',
                file: Buffer.from('hello-dogeuni-file'),
                revealAddr: account,
                repeat: 1,
            }],
            changeAddress: account,
            amountToFeeAddress: 50_000_000,
            needServiceFee: true,
        });

        expect(txs.commitTx).not.toBe('');
        const expectedCommitId = Transaction.fromHex(txs.commitTx).getId();
        const expectedRevealId = Transaction.fromHex(txs.revealTxs[0]).getId();
        expect(txs.commitTxHash).toBe(expectedCommitId);
        expect(txs.revealTxHash).toBe(expectedRevealId);
        expect(txs.commitTxHash).not.toBe(txs.revealTxHash);
    });

    test('inscribeBinaryData returns distinct commitTxHash and revealTxHash matching serialized transactions', () => {
        const txs = inscribeBinaryData(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: 'a2'.repeat(32),
                vOut: 0,
                amount: 100e8,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [{
                contentType: 'application/octet-stream',
                body: Buffer.from('{"p":"file","op":"deploy"}'),
                carc_b64: Buffer.from('hello-dogeuni-binary').toString('base64'),
                revealAddr: account,
            }],
            changeAddress: account,
            transactionFee: 5_000_000,
        });

        expect(txs.insufficient).toBe(false);
        expect(txs.commitTx).not.toBe('');
        const expectedCommitId = Transaction.fromHex(txs.commitTx).getId();
        const expectedRevealId = Transaction.fromHex(txs.revealTxs[0]).getId();
        expect(txs.commitTxHash).toBe(expectedCommitId);
        expect(txs.revealTxHash).toBe(expectedRevealId);
        expect(txs.commitTxHash).not.toBe(txs.revealTxHash);
    });
});

describe('P2: inscribeDrc fee accounting & fixed transactionFee fallback', () => {
    test('wdoge deposit revealTxFees reflects only miner fee, excluding cool deposit and wdoge service fee', () => {
        const fixedFee = 5_000_000;
        const txs = inscribeDrc(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: 'b1'.repeat(32),
                vOut: 0,
                amount: 1000e8,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [{
                contentType: 'text/plain;charset=utf-8',
                body: JSON.stringify({
                    p: 'wdoge',
                    op: 'deposit',
                    tick: 'WDOGE(WRAPPED-DOGE)',
                    amt: '100000000',
                }),
                revealAddr: account,
                repeat: 1,
            }],
            changeAddress: account,
            transactionFee: fixedFee,
        });

        expect(txs.commitTx).not.toBe('');
        expect(txs.revealTxFees).toEqual([fixedFee]);
        expect(txs.commitTxFee).toBe(fixedFee);
    });

    test('no-change fallback branch respects fixed transactionFee when dust change < minChangeValue', () => {
        const fixedFee = 5_000_000;
        const dust = 50_000; // 0 < dust < defaultMinChangeValue (100_000)
        // drc-20 transfer reveal needs: 100_000 (dust) + 50_000_000 (service fee) + 5_000_000 (reveal fee) = 55_100_000
        // commit needs: 55_100_000 + 5_000_000 (commit fee) + 50_000 (dust absorbed) = 60_150_000
        const txs = inscribeDrc(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: 'b2'.repeat(32),
                vOut: 0,
                amount: 60_150_000,
                address: account,
                privateKey,
            }],
            // High commitFeeRate would falsely trigger insufficient funds if fallback ignored transactionFee
            commitFeeRate: 100_000,
            revealFeeRate: 100_000,
            inscriptionDataList: [{
                contentType: 'text/plain;charset=utf-8',
                body: JSON.stringify({ p: 'drc-20', op: 'transfer', tick: 'UNIX', amt: '100' }),
                revealAddr: account,
                repeat: 1,
            }],
            changeAddress: account,
            transactionFee: fixedFee,
        });

        expect(txs.commitTx).not.toBe('');
        expect(txs.changeAmount).toBe(0);
        expect(txs.commitTxFee).toBe(fixedFee + dust);
        expect(txs.revealTxFees).toEqual([fixedFee]);
    });
});
