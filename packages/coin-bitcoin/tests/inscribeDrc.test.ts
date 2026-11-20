// Offline regression coverage for DRC payments and Pump router inscriptions.
import * as crypto from 'crypto';
import { address, dogeCoin, inscribeDrc, inscribeRouter, payments, private2Wif, script, Transaction, wif2Public } from '../src';

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

const WDOGE = 'WDOGE(WRAPPED-DOGE)';
const PAIR_ID = 'ab'.repeat(32);
const TOKEN_ID = 'cd'.repeat(32);

// Uses the ephemeral test key above and a nonexistent UTXO; never broadcasts.
function inscriptionBody(body: string): string {
    const request = {
        commitTxPrevOutputList: [{ txId: '00'.repeat(32), vOut: 0, amount: 1000e8, address: account, privateKey }],
        commitFeeRate: 1000,
        revealFeeRate: 1000,
        inscriptionDataList: [{ contentType: 'text/plain;charset=utf-8', body, revealAddr: account }],
        changeAddress: account,
    };
    const txs = inscribeRouter(dogeCoin, request);
    expect(txs.commitTx).not.toBe('');
    expect(txs.revealTxs).toHaveLength(1);
    expect(request.inscriptionDataList[0].body).toBe(body);

    const reveal = Transaction.fromHex(txs.revealTxs[0]);
    const unlock = script.decompile(reveal.ins[0].script);
    if (!unlock) throw new Error('Missing reveal input script');
    const redeem = unlock[unlock.length - 1];
    if (!Buffer.isBuffer(redeem)) throw new Error('Missing inscription redeem script');
    const inscription = script.decompile(redeem);
    if (!inscription) throw new Error('Invalid inscription script');
    expect(inscription[4]).toEqual(Buffer.from('ord'));
    expect(inscription[5]).toEqual(Buffer.from('text/plain;charset=utf-8'));
    const payload = inscription[6];
    if (!Buffer.isBuffer(payload)) throw new Error('Missing inscription body');
    return payload.toString('utf8');
}

describe.each([
    ['buy', 0, WDOGE],
    ['buy', 1, WDOGE],
    ['sell', 0, TOKEN_ID],
    ['sell', 1, TOKEN_ID],
])('Pump %s with doge=%i', (_side, doge, tick0Id) => {
    test.each(['1', '9007199254740993', '0', undefined])(
        'preserves amt1_min=%s in the serialized reveal', (minimumOut) => {
            const payload = {
                p: 'pump', op: 'trade', pair_id: PAIR_ID, tick0_id: tick0Id,
                amt0: '100000000', doge,
                ...(minimumOut === undefined ? {} : { amt1_min: minimumOut }),
            };
            // Whitespace is intentional: verify byte-for-byte passthrough, including large integer strings.
            const body = JSON.stringify(payload, null, 2);
            const embedded = inscriptionBody(body);
            expect(embedded).toBe(body);
            const decoded = JSON.parse(embedded);
            expect(decoded).toEqual(payload);
            if (minimumOut === undefined) {
                expect(decoded).not.toHaveProperty('amt1_min');
            } else {
                expect(decoded.amt1_min).toBe(minimumOut);
                expect(typeof decoded.amt1_min).toBe('string');
            }
        },
    );
});
