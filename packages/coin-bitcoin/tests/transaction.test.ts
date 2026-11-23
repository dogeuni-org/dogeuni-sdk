// Offline regression coverage for transaction() and pepecoinTransaction().
import * as crypto from 'crypto';
import {
    address,
    dogeCoin,
    payments,
    pepecoinNetwork,
    pepecoinTransaction,
    private2Wif,
    Transaction,
    transaction,
    ValidSignedTransaction,
    wif2Public,
} from '../src';

function createKeyAndAddress(network = dogeCoin) {
    const privateKey = private2Wif(crypto.randomBytes(32), network);
    const pubkey = wif2Public(privateKey, network);
    const addr = payments.p2pkh({ pubkey, network }).address!;
    return { privateKey, addr };
}

function decodeOutputs(txHex: string, network = dogeCoin): [string, number][] {
    return Transaction.fromHex(txHex).outs.map((o) => [address.fromOutputScript(o.script, network), o.value]);
}

describe('transaction() change & insufficient-funds regressions', () => {
    const sender = createKeyAndAddress(dogeCoin);
    const alice = createKeyAndAddress(dogeCoin);
    const bob = createKeyAndAddress(dogeCoin);

    test('sufficient funds with change >= minChangeValue preserves recipients, change, fee, and valid signature', () => {
        const inputAmount = 10e8;
        const sendAmount = 3e8;
        const fixedFee = 5_000_000;
        const utxo = {
            txId: '11'.repeat(32),
            vOut: 0,
            amount: inputAmount,
            address: sender.addr,
            privateKey: sender.privateKey,
        };

        const res = transaction(dogeCoin, {
            commitTxPrevOutputList: [utxo],
            commitFeeRate: 1000,
            transactionDataList: [{ revealAddr: alice.addr, amount: sendAmount }],
            changeAddress: sender.addr,
            transactionFee: fixedFee,
        });

        expect(res.commitTx).not.toBe('');
        expect(res.commitTxFee).toBe(fixedFee);
        expect(res.changeAmount).toBe(inputAmount - sendAmount - fixedFee);
        expect(decodeOutputs(res.commitTx)).toEqual([
            [alice.addr, sendAmount],
            [sender.addr, inputAmount - sendAmount - fixedFee],
        ]);
        expect(() => ValidSignedTransaction(res.commitTx, [{ ...utxo, value: utxo.amount }] as any, dogeCoin)).not.toThrow();
    });

    test('exact max-send (changeAmount === 0) keeps recipient output and omits change output', () => {
        const sendAmount = 10e8;
        const fixedFee = 5_000_000;
        const res = transaction(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '22'.repeat(32),
                vOut: 0,
                amount: sendAmount + fixedFee,
                address: sender.addr,
                privateKey: sender.privateKey,
            }],
            commitFeeRate: 1000,
            transactionDataList: [{ revealAddr: alice.addr, amount: sendAmount }],
            changeAddress: sender.addr,
            transactionFee: fixedFee,
        });

        expect(res.commitTx).not.toBe('');
        expect(res.changeAmount).toBe(0);
        expect(res.commitTxFee).toBe(fixedFee);
        expect(decodeOutputs(res.commitTx)).toEqual([[alice.addr, sendAmount]]);
    });

    test('dust change (< minChangeValue) is absorbed into fee without creating dust output or dropping recipient', () => {
        const sendAmount = 10e8;
        const fixedFee = 5_000_000;
        const dust = 50_000; // < defaultMinChangeValue (100_000)
        const res = transaction(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '33'.repeat(32),
                vOut: 0,
                amount: sendAmount + fixedFee + dust,
                address: sender.addr,
                privateKey: sender.privateKey,
            }],
            commitFeeRate: 1000,
            transactionDataList: [{ revealAddr: alice.addr, amount: sendAmount }],
            changeAddress: sender.addr,
            transactionFee: fixedFee,
        });

        expect(res.commitTx).not.toBe('');
        expect(res.changeAmount).toBe(0);
        expect(res.commitTxFee).toBe(fixedFee + dust);
        expect(decodeOutputs(res.commitTx)).toEqual([[alice.addr, sendAmount]]);
    });

    test('insufficient funds with single recipient returns empty commitTx instead of burning UTXO in a 0-output tx', () => {
        // Input equals recipient amount, leaving nothing for the fee.
        const res = transaction(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '44'.repeat(32),
                vOut: 0,
                amount: 10e8,
                address: sender.addr,
                privateKey: sender.privateKey,
            }],
            commitFeeRate: 1000,
            transactionDataList: [{ revealAddr: alice.addr, amount: 10e8 }],
            changeAddress: sender.addr,
            transactionFee: 5_000_000,
        });

        expect(res.commitTx).toBe('');
        expect(res.commitTxFee).toBe(5_000_000);
        expect(res.changeAmount).toBe(-5_000_000);
    });

    test('insufficient funds with multiple recipients returns empty commitTx instead of dropping the last recipient', () => {
        const res = transaction(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '55'.repeat(32),
                vOut: 0,
                amount: 10e8,
                address: sender.addr,
                privateKey: sender.privateKey,
            }],
            commitFeeRate: 1000,
            transactionDataList: [
                { revealAddr: alice.addr, amount: 6e8 },
                { revealAddr: bob.addr, amount: 5e8 },
            ],
            changeAddress: sender.addr,
            transactionFee: 5_000_000,
        });

        expect(res.commitTx).toBe('');
        expect(res.changeAmount).toBeLessThan(0);
    });

    test('insufficient funds still returns empty commitTx even when commitFeeRate is 0', () => {
        const res = transaction(dogeCoin, {
            commitTxPrevOutputList: [{
                txId: '66'.repeat(32),
                vOut: 0,
                amount: 5e8,
                address: sender.addr,
                privateKey: sender.privateKey,
            }],
            commitFeeRate: 0,
            transactionDataList: [{ revealAddr: alice.addr, amount: 10e8 }],
            changeAddress: sender.addr,
        });

        expect(res.commitTx).toBe('');
        expect(res.changeAmount).toBe(-5e8);
    });

    test('pepecoinTransaction builds valid P-prefixed outputs and change', () => {
        const pepeSender = createKeyAndAddress(pepecoinNetwork);
        const pepeReceiver = createKeyAndAddress(pepecoinNetwork);
        const res = pepecoinTransaction({
            commitTxPrevOutputList: [{
                txId: '77'.repeat(32),
                vOut: 0,
                amount: 5e8,
                address: pepeSender.addr,
                privateKey: pepeSender.privateKey,
            }],
            commitFeeRate: 1000,
            transactionDataList: [{ revealAddr: pepeReceiver.addr, amount: 2e8 }],
            changeAddress: pepeSender.addr,
            transactionFee: 1_000_000,
        });

        expect(res.commitTx).not.toBe('');
        expect(decodeOutputs(res.commitTx, pepecoinNetwork)).toEqual([
            [pepeReceiver.addr, 2e8],
            [pepeSender.addr, 3e8 - 1_000_000],
        ]);
    });
});
