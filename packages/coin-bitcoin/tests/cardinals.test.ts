import {
    dogeCoin,
    DrcInscriptionData,
    inscribeDrc,
    inscribeFile,
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

    test("inscribeFile", async () => {
        let privateKey = "QQsjj9qokqMrzdFqQUy5Z9mbUpvcxCDZC26z9uDkF8buZys5noxY"
        const commitTxPrevOutputList: PrevOutput[] = [];
        commitTxPrevOutputList.push({
            txId: "15c37a5acd7e2670148047e43a47816b4bc6f814bcf62706195705e4a22675f8",
            vOut: 0,
            amount: 100000000,
            address: "DH5RX8yrAS38VCKQyVuicmmf8VvvztZvJM",
            privateKey: privateKey,
        });

        const inscriptionDataList: NftInscriptionData[] = [];
        inscriptionDataList.push({
            contentType: 'text/plain;charset=utf-8',
            body: base.fromHex(base.toHex(Buffer.from('{"p":"nft","op":"deploy"}'))),
            image: "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",
            revealAddr: 'DH5RX8yrAS38VCKQyVuicmmf8VvvztZvJM',
            repeat: 1
        });

        const request = {
            commitTxPrevOutputList,
            commitFeeRate: 50000,
            revealFeeRate: 50000,
            inscriptionDataList,
            changeAddress: 'DH5RX8yrAS38VCKQyVuicmmf8VvvztZvJM',
        };
        const txs: InscribeTxs = inscribeFile(dogeCoin, request);
        console.log(txs);
    });

})
