import {
    dogeCoin,
    DrcInscriptionData,
    inscribeNft,
    InscribeTxs,
    NftInscriptionData,
    PrevOutput,
} from "../src";

import {base} from "@unielon/crypto-lib";

describe("cardinals test", () => {
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
