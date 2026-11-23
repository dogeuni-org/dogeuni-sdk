// Offline regression coverage for inscribeRouter() P0 fixes:
// 1. pair-v2 remove with doge=1 must not send WDOGE deposit/fee outputs.
// 2. Multi-inscription router tx must not double-count protocol payments across inputs.
// 3. UTXO conservation and fixed transactionFee handling in commit/reveal.
import * as crypto from 'crypto';
import {
    address,
    dogeCoin,
    inscribeRouter,
    payments,
    private2Wif,
    script,
    Transaction,
    wif2Public,
} from '../src';

const WDOGE = 'WDOGE(WRAPPED-DOGE)';
const WDOGE_FEE_ADDRESS = 'D86Dc4n49LZDiXvB41ds2XaDAP1BFjP1qy';
const WDOGE_COOL_ADDRESS = 'DKMyk8cfSTGfnCVXfmo8gXta9F6gziu7Z5';
const PUMP_FEE_ADDRESS = 'DJ9wVHBFnbcZUtfWdHWPEnijdxz1CABPUY';
const PUMP_TIP_FEE_ADDRESS = 'DSPAZ6cZC7ShL63UFKPgs4vBGrbpHBwWQG';
const PAIR_ID = 'ab'.repeat(32);

const privateKey = private2Wif(crypto.randomBytes(32), dogeCoin);
const account = payments.p2pkh({ pubkey: wif2Public(privateKey, dogeCoin), network: dogeCoin }).address!;

function decodeOutputs(txHex: string): [string, number][] {
    return Transaction.fromHex(txHex).outs.map((o) => [address.fromOutputScript(o.script, dogeCoin), o.value]);
}

function decodeEmbeddedBodies(revealHex: string): string[] {
    const reveal = Transaction.fromHex(revealHex);
    return reveal.ins.map((input) => {
        const unlock = script.decompile(input.script)!;
        const redeem = unlock[unlock.length - 1] as Buffer;
        const inscription = script.decompile(redeem)!;
        return (inscription[6] as Buffer).toString('utf8');
    });
}

describe('inscribeRouter() pair-v2 remove guard', () => {
    test.each([
        ['tick0 is WDOGE', { tick0: WDOGE, tick1: 'UNIX', amt0: '100000000', amt1: '200000000' }],
        ['tick1 is WDOGE', { tick0: 'UNIX', tick1: WDOGE, amt0: '200000000', amt1: '100000000' }],
    ])('pair-v2 remove with doge=1 (%s) only outputs inscription dust and strips tick0/tick1', (_label, fields) => {
        const body = JSON.stringify({
            p: 'pair-v2',
            op: 'remove',
            pair_id: PAIR_ID,
            liquidity: '50000000',
            amt0_min: '1',
            amt1_min: '1',
            doge: 1,
            ...fields,
        });

        const txs = inscribeRouter(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '10'.repeat(32),
                vOut: 0,
                amount: 1000e8,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [{ contentType: 'text/plain;charset=utf-8', body, revealAddr: account }],
            changeAddress: account,
        });

        expect(txs.commitTx).not.toBe('');
        expect(txs.revealTxs).toHaveLength(1);
        expect(decodeOutputs(txs.revealTxs[0])).toEqual([[account, 100_000]]);

        const embedded = JSON.parse(decodeEmbeddedBodies(txs.revealTxs[0])[0]);
        expect(embedded).not.toHaveProperty('tick0');
        expect(embedded).not.toHaveProperty('tick1');
        expect(embedded.op).toBe('remove');
    });

    test('pair-v2 add with doge=1 still pays WDOGE cool address and fee address', () => {
        const body = JSON.stringify({
            p: 'pair-v2',
            op: 'add',
            pair_id: PAIR_ID,
            tick0: 'UNIX',
            tick1: WDOGE,
            amt0: '200000000',
            amt1: '100000000',
            amt0_min: '1',
            amt1_min: '1',
            doge: 1,
        });

        const txs = inscribeRouter(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '20'.repeat(32),
                vOut: 0,
                amount: 1000e8,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [{ contentType: 'text/plain;charset=utf-8', body, revealAddr: account }],
            changeAddress: account,
            transactionFee: 5_000_000,
        });

        expect(txs.commitTx).not.toBe('');
        expect(decodeOutputs(txs.revealTxs[0])).toEqual([
            [account, 100_000],
            [WDOGE_COOL_ADDRESS, 100_000_000],
            [WDOGE_FEE_ADDRESS, 50_000_000],
        ]);
        expect(txs.revealTxFees).toEqual([5_000_000]);
    });
});

describe('inscribeRouter() multi-inscription accounting & UTXO conservation', () => {
    test('two pair-v2 swaps with doge=1 do not double-count swap amount or WDOGE fee', () => {
        const inputAmount = 1000e8;
        const fixedFee = 5_000_000;
        const swap1 = JSON.stringify({
            p: 'pair-v2',
            op: 'swap',
            pair_id: PAIR_ID,
            tick0_id: WDOGE,
            tick1_id: 'cd'.repeat(32),
            amt0: '100000000',
            amt1: '500000000',
            amt1_min: '400000000',
            doge: 1,
        });
        const swap2 = JSON.stringify({
            p: 'pair-v2',
            op: 'swap',
            pair_id: PAIR_ID,
            tick0_id: WDOGE,
            tick1_id: 'ef'.repeat(32),
            amt0: '200000000',
            amt1: '900000000',
            amt1_min: '800000000',
            doge: 1,
        });

        const txs = inscribeRouter(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '30'.repeat(32),
                vOut: 0,
                amount: inputAmount,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [
                { contentType: 'text/plain;charset=utf-8', body: swap1, revealAddr: account },
                { contentType: 'text/plain;charset=utf-8', body: swap2, revealAddr: account },
            ],
            changeAddress: account,
            transactionFee: fixedFee,
        });

        expect(txs.commitTx).not.toBe('');
        expect(txs.revealTxs).toHaveLength(1);

        const commit = Transaction.fromHex(txs.commitTx);
        const reveal = Transaction.fromHex(txs.revealTxs[0]);
        expect(reveal.ins).toHaveLength(2);

        // Reveal outputs: 100_000 dust + (1e8 + 2e8) cool + (0.5e8 + 0.5e8) wdoge fee
        const revealOuts = decodeOutputs(txs.revealTxs[0]);
        expect(revealOuts).toEqual([
            [account, 100_000],
            [WDOGE_COOL_ADDRESS, 300_000_000],
            [WDOGE_FEE_ADDRESS, 100_000_000],
        ]);

        // Commit P2SH outputs (outs[0] + outs[1]) must equal reveal outputs + fixed reveal fee (no double-counting!)
        const totalP2shFunded = commit.outs[0].value + commit.outs[1].value;
        const totalRevealOut = revealOuts.reduce((sum, [, val]) => sum + val, 0);
        expect(totalP2shFunded - totalRevealOut).toBe(fixedFee);
        expect(txs.revealTxFees).toEqual([fixedFee]);

        // Commit UTXO conservation
        const totalCommitOut = commit.outs.reduce((sum, o) => sum + o.value, 0);
        expect(inputAmount - totalCommitOut).toBe(fixedFee);
        expect(txs.commitTxFee).toBe(fixedFee);
    });

    test('two pump trades with doge=1 do not double-count swap, WDOGE fee, or pump tip', () => {
        const inputAmount = 1000e8;
        const fixedFee = 5_000_000;
        const trade1 = JSON.stringify({
            p: 'pump',
            op: 'trade',
            pair_id: PAIR_ID,
            tick0_id: WDOGE,
            amt0: '100000000',
            amt1_min: '1000',
            doge: 1,
        });
        const trade2 = JSON.stringify({
            p: 'pump',
            op: 'trade',
            pair_id: PAIR_ID,
            tick0_id: WDOGE,
            amt0: '200000000',
            amt1_min: '2000',
            doge: 1,
        });

        const txs = inscribeRouter(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '40'.repeat(32),
                vOut: 0,
                amount: inputAmount,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [
                { contentType: 'text/plain;charset=utf-8', body: trade1, revealAddr: account },
                { contentType: 'text/plain;charset=utf-8', body: trade2, revealAddr: account },
            ],
            changeAddress: account,
            transactionFee: fixedFee,
        });

        expect(txs.commitTx).not.toBe('');
        const commit = Transaction.fromHex(txs.commitTx);
        const revealOuts = decodeOutputs(txs.revealTxs[0]);

        expect(revealOuts).toEqual([
            [account, 100_000],
            [WDOGE_COOL_ADDRESS, 300_000_000],
            [WDOGE_FEE_ADDRESS, 100_000_000],
            [PUMP_TIP_FEE_ADDRESS, 20_000_000],
        ]);

        const totalP2shFunded = commit.outs[0].value + commit.outs[1].value;
        const totalRevealOut = revealOuts.reduce((sum, [, val]) => sum + val, 0);
        expect(totalP2shFunded - totalRevealOut).toBe(fixedFee);
        expect(txs.revealTxFees).toEqual([fixedFee]);
    });

    test('fixed transactionFee is respected in commit no-change fallback branch', () => {
        // Exact funds: 100_000 (reveal dust) + 10_000_000 (pump tip) + 5_000_000 (reveal fee) + 5_000_000 (commit fee)
        const fixedFee = 5_000_000;
        const exactInput = 100_000 + 10_000_000 + fixedFee + fixedFee;
        const body = JSON.stringify({
            p: 'pump',
            op: 'trade',
            pair_id: PAIR_ID,
            tick0_id: 'cd'.repeat(32),
            amt0: '100000000',
            amt1_min: '1000',
            doge: 0,
        });

        // High commitFeeRate would cause false insufficient funds if fallback ignored transactionFee.
        const txs = inscribeRouter(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '50'.repeat(32),
                vOut: 0,
                amount: exactInput,
                address: account,
                privateKey,
            }],
            commitFeeRate: 100_000,
            revealFeeRate: 100_000,
            inscriptionDataList: [{ contentType: 'text/plain;charset=utf-8', body, revealAddr: account }],
            changeAddress: account,
            transactionFee: fixedFee,
        });

        expect(txs.commitTx).not.toBe('');
        expect(txs.changeAmount).toBe(0);
        expect(txs.commitTxFee).toBe(fixedFee);
        expect(txs.revealTxFees).toEqual([fixedFee]);
    });

    test('giveaway with doge=1 funds pumpFee (5 DOGE) and pumpTipFee (0.1 DOGE) in commit P2SH output', () => {
        const inputAmount = 1000e8;
        const fixedFee = 5_000_000;
        const body = JSON.stringify({
            p: 'giveaway',
            op: 'create',
            doge: 1,
        });

        const txs = inscribeRouter(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '60'.repeat(32),
                vOut: 0,
                amount: inputAmount,
                address: account,
                privateKey,
            }],
            commitFeeRate: 1000,
            revealFeeRate: 1000,
            inscriptionDataList: [{ contentType: 'text/plain;charset=utf-8', body, revealAddr: account }],
            changeAddress: account,
            transactionFee: fixedFee,
        });

        expect(txs.commitTx).not.toBe('');
        const commit = Transaction.fromHex(txs.commitTx);
        const revealOuts = decodeOutputs(txs.revealTxs[0]);

        expect(revealOuts).toEqual([
            [account, 100_000],
            [PUMP_FEE_ADDRESS, 500_000_000],
            [PUMP_TIP_FEE_ADDRESS, 10_000_000],
        ]);

        const totalRevealOut = revealOuts.reduce((sum, [, val]) => sum + val, 0);
        expect(commit.outs[0].value - totalRevealOut).toBe(fixedFee);
        expect(txs.revealTxFees).toEqual([fixedFee]);
    });
});
