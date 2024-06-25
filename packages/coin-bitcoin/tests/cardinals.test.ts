import {
    dogeCoin,
    DrcInscriptionData,
    inscribeDrc,
    inscribeNft,
    InscribeTxs,
    NftInscriptionData,
    PrevOutput,
} from "../src";

import { base } from "@unielon/crypto-lib";

describe("cardinals test", () => {
    test("drc20 transfer", async () => {
        let privateKey = "QRJx7uvj55L3oVRADWJfFjJ31H9Beg75xZ2GcmR8rKFNHA4ZacKJ"
        const commitTxPrevOutputList: PrevOutput[] = [];
        commitTxPrevOutputList.push({
            txId: "f11fa125b2ba3aa59e717a127a48d19152c257661f2b2f3d6398f9ea8ebf2d2f",
            vOut: 1,
            amount: 43200000,
            address: "DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ",
            privateKey: privateKey,
        }, {
            txId: "f693ca3d1e08931b265debf245721986c1c8cddd20809ca375286cedbb36491d",
            vOut: 1,
            amount: 43150000,
            address: "DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ",
            privateKey: privateKey,
        });
        const inscriptionDataList: DrcInscriptionData[] = [];
        inscriptionDataList.push({
            contentType: 'text/plain;charset=utf-8',
            body: '{"p":"drc-20","op":"transfer","tick":"WDOGE(WRAPPED-DOGE)","amt":"200000000"}',
            revealAddr: 'DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ',
            receiveAddr: 'DCqdPTDP47dJeuJ4QybXFL7BP5V5H4c2nj,DBQwvSkNeEVKt5vHSsVtAgSRG5WhPMVDSQ',
            repeat: 1
        });
        const request = {
            commitTxPrevOutputList,
            commitFeeRate: 50000,
            revealFeeRate: 50000,
            inscriptionDataList,
            changeAddress: 'DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ',
        };
        const txs: InscribeTxs = inscribeDrc(dogeCoin, request);
        console.log(txs);
    });
    test("inscribeNft", async () => {
        let privateKey = "QRJx7uvj55L3oVRADWJfFjJ31H9Beg75xZ2GcmR8rKFNHA4ZacKJ"
        const commitTxPrevOutputList: PrevOutput[] = [];
        commitTxPrevOutputList.push({
            txId: "3cb1d8da082b2146b8f4c09b06e38eb37f0263ecefb8a52600accc75ccef4c90",
            vOut: 1,
            amount: 793850000,
            address: "DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ",
            privateKey: privateKey,
        });
        const inscriptionDataList: NftInscriptionData[] = [];
        inscriptionDataList.push({
            contentType: 'text/plain;charset=utf-8',
            body: base.fromHex(base.toHex(Buffer.from('{"p":"drc-20","op":"deploy","tick":"isme","max":"210000000","lim":"10000"}'))),
            revealAddr: 'DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ',
            repeat: 1
        });
        const request = {
            commitTxPrevOutputList,
            commitFeeRate: 50000,
            revealFeeRate: 50000,
            inscriptionDataList,
            changeAddress: 'DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ',
        };
        const txs: InscribeTxs = inscribeNft(dogeCoin, request);
        console.log(txs);
    });

})
