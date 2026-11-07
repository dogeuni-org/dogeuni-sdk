// Which payments inscribeDrc adds to a reveal beside the inscription's own output, by protocol and op.
import * as crypto from 'crypto';
import { address, dogeCoin, inscribeDrc, payments, private2Wif, Transaction, wif2Public } from '../src';

const FEE_ADDRESS = 'DEMZQAJjdNMM9M3Sk7LAmtPdk8me6SZUm1';
const WDOGE_FEE_ADDRESS = 'D86Dc4n49LZDiXvB41ds2XaDAP1BFjP1qy';
const WDOGE_COOL_ADDRESS = 'DKMyk8cfSTGfnCVXfmo8gXta9F6gziu7Z5';
const POOL_ID = 'ab'.repeat(32);

const privateKey = private2Wif(crypto.randomBytes(32), dogeCoin);
const account = payments.p2pkh({ pubkey: wif2Public(privateKey, dogeCoin), network: dogeCoin }).address!;

// The reveal's outputs as [address, value] for one body, from a 1000 DOGE UTXO.
function revealOutputs(body: object): [string, number][] {
    const txs = inscribeDrc(dogeCoin, {
        commitTxPrevOutputList: [{ txId: crypto.randomBytes(32).toString('hex'), vOut: 0, amount: 1000e8, address: account, privateKey }],
        commitFeeRate: 1000,
        revealFeeRate: 1000,
        inscriptionDataList: [{ contentType: 'text/plain;charset=utf-8', body: JSON.stringify(body), revealAddr: account, repeat: 1 } as any],
        changeAddress: account,
    });
    expect(txs.commitTx).not.toBe('');
    return Transaction.fromHex(txs.revealTxs[0]).outs.map((o) => [address.fromOutputScript(o.script, dogeCoin), o.value]);
}

describe('inscribeDrc reveal payments', () => {
    test('wdoge deposit pays its amount to the cool address and the fee to the wdoge fee address', () => {
        expect(revealOutputs({ p: 'wdoge', op: 'deposit', tick: 'WDOGE(WRAPPED-DOGE)', amt: '100000000' })).toEqual([
            [account, 100000],
            [WDOGE_COOL_ADDRESS, 100000000],
            [WDOGE_FEE_ADDRESS, 50000000],
        ]);
    });

    test('wdoge withdraw pays the 0.5 DOGE fee', () => {
        expect(revealOutputs({ p: 'wdoge', op: 'withdraw', tick: 'WDOGE(WRAPPED-DOGE)', amt: '100000000' })).toEqual([
            [account, 100000],
            [FEE_ADDRESS, 50000000],
        ]);
    });

    test('another protocol\'s deposit and withdraw pay nothing but the inscription (prize-v1)', () => {
        expect(revealOutputs({ p: 'prize-v1', op: 'deposit', pool_id: POOL_ID, amt: '1000000000000' })).toEqual([[account, 100000]]);
        expect(revealOutputs({ p: 'prize-v1', op: 'withdraw', pool_id: POOL_ID })).toEqual([[account, 100000]]);
    });

    test('drc-20 and the router protocols keep their fee', () => {
        expect(revealOutputs({ p: 'drc-20', op: 'transfer', tick: 'UNIX', amt: '1' })).toEqual([[account, 100000], [FEE_ADDRESS, 50000000]]);
        expect(revealOutputs({ p: 'stake-v1', op: 'withdraw', tick: 'UNIX', amt: '1' })).toEqual([[account, 100000], [FEE_ADDRESS, 50000000]]);
    });
});
