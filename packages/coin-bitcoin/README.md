# @unielon/coin-dogecoin
Dogecoin SDK is used to interact with the Dogecoin Mainnet or Testnet, it contains various functions can be used to web3 wallet.

## What Can Dogecoin SDK Do
- Dogecoin Transfer
- Deploy drc-20 
- Mint drc-20
- Deposit WDOGE
- Withdraw WDOGE
- Add or remove the liquidity of pairs
- Swap the liquidity of pairs
- Create drc20-paris
- Create Order
- Cancel Order
- Trade Order
- Mint box
- Deploy box
- Stake the liquidity of pairs
- Upload Files

| Method         | Description                                                                 |
|----------------|-----------------------------------------------------------------------------|
| transaction    | Dogecoin Transfer                                                           |
| inscribeDrc    | `{ "p": "drc-20", "op": "mint" }`<br>`{ "p": "drc-20", "op": "deploy" }`<br>`{ "p": "drc-20", "op": "transfer" }`<br>`{ "p": "file", "op": "transfer" }`<br>`{ "p": "pair-v1", "op": "swap" }`<br>`{ "p": "pair-v1", "op": "create" }`<br>`{ "p": "pair-v1", "op": "add" }`<br>`{ "p": "pair-v1", "op": "remove" }`<br>`{ "p": "wdoge", "op": "deposit" }`<br>`{ "p": "wdoge", "op": "withdraw" }`<br>`{ "p": "order-v2", "op": "create" }`<br>`{ "p": "order-v2", "op": "trade" }`<br>`{ "p": "order-v2", "op": "cancel" }`<br>`{ "p": "order-v1", "op": "trade" }`<br>`{ "p": "order-v1", "op": "create" }`<br>`{ "p": "order-v1", "op": "cancel" }`<br>`{ "p": "box-v1", "op": "mint" }`<br>`{ "p": "box-v1", "op": "deploy" }`<br>`{ "p": "stake-v1", "op": "stake" }`<br>`{ "p": "stake-v1", "op": "unstake" }`<br>`{ "p": "stake-v1", "op": "getallreward" }`<br>`{ "p": "stake-v2", "op": "create" }`<br>`{ "p": "stake-v2", "op": "stake" }`<br>`{ "p": "stake-v2", "op": "unstake" }`<br>`{ "p": "stake-v2", "op": "getreward" }`<br>`{ "p": "pump", "op": "deploy", "amt": "" }`<br>`{ "p": "pump", "op": "deploy", "amt": "0" }` |
| inscribeRouter | `{ "p": "pair-v2", "op": "create" }`<br>`{ "p": "pair-v2", "op": "add" }`<br>`{ "p": "pair-v2", "op": "remove" }`<br>`{ "p": "pair-v2", "op": "swap" }`<br>`{ "p": "pump", "op": "deploy", "amt" > 0 }`<br>`{ "p": "pump", "op": "trade" }`|
| inscribeFile   | { "p": "file", op: "deploy"} |


## Getting Started
**Installing Dogecoin SDK**
```shell
npm install @unielon/coin-dogecoin
```

## Dogecoin Transfer
```typescript
import { PrevOutput, TransactionData, TransactionTxs, transaction, dogeCoin } from "@unielon/coin-dogecoin";
let privateKey = "QRtc49g1hVrMaqAFqZRb1EiYqUp4F896STQywyiQiUMeUSvcRh15"
const commitTxPrevOutputList: PrevOutput[] = [];
commitTxPrevOutputList.push({
    txId: "6b99015536693df6125ef761654feea9f65fde6cdb53a7561593e18e9bb6f771",
    vOut: 1,
    amount: 876154408,
    address: "DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk",
    privateKey: privateKey,
});

const transactionDataList: TransactionData[] = [];
transactionDataList.push({
    revealAddr: 'DD1sydQLv7B9FhSpBQL9GeJW2Ld6zAyBFK',
    amount: 110000000
},{
    revealAddr: 'DHUUy1vgNzmURipnEwpvFH4niroUeA4ZUg',
    amount: 12000000
});

const request = {
    commitTxPrevOutputList,
    commitFeeRate: 50000,
    revealFeeRate: 50000,
    transactionDataList,
    changeAddress: 'DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk',
    transactionFee: 5000000
};
const txs: TransactionTxs = transaction(dogeCoin, request);
```
## Using Dogecoin SDK
### inscribeDrc
```typescript
import { PrevOutput, DrcInscriptionData, InscribeTxs, inscribeDrc, dogeCoin } from "@unielon/coin-dogecoin";
let privateKey = "QRtc49g1hVrMaqAFqZRb1EiYqUp4F896STQywyiQiUMeUSvcRh15"
const commitTxPrevOutputList: PrevOutput[] = [];
commitTxPrevOutputList.push({
    txId: "3cb1d8da082b2146b8f4c09b06e38eb37f0263ecefb8a52600accc75ccef4c90",
    vOut: 1,
    amount: 793850000,
    address: "DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk",
    privateKey: privateKey,
});
const inscriptionDataList: DrcInscriptionData[] = [];
inscriptionDataList.push({
  contentType: 'text/plain;charset=utf-8',
  body: `{"p":"drc-20","op":"deploy","tick": "GOODS" ,"max": "210000000000", "lim": "1000000"}`,
  revealAddr: 'DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk',
  repeat: repeat || 1
});
const request = {
  commitTxPrevOutputList,
  commitFeeRate: 50000,
  revealFeeRate: 50000,
  inscriptionDataList,
  changeAddress: 'DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk',
  transactionFee: 50000000
};
const res: InscribeTxs = inscribeDrc(dogeCoin, request)
```

### inscribeRouter
```typescript
import { PrevOutput, RouterInscriptionData, InscribeTxs, inscribeRouter, dogeCoin } from "@unielon/coin-dogecoin";
let privateKey = "QRtc49g1hVrMaqAFqZRb1EiYqUp4F896STQywyiQiUMeUSvcRh15"
const commitTxPrevOutputList: PrevOutput[] = [];
commitTxPrevOutputList.push({
    txId: "36ec246a14373d6bf63b3dd513c0e1e687e8f27c164614fe556426296487d4b4",
    vOut: 1,
    amount: 869210840,
    address: "DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk",
    privateKey: privateKey,
});
const inscriptionDataList: RouterInscriptionData[] = [];
inscriptionDataList.push({
    contentType: 'text/plain;charset=utf-8',
    body: '{"p":"pump","op":"trade","tick": "WDOGE(WRAPPED-DOGE)","amt": "0", "symbol": "TDOG", "name": "TDOG", "doge": 1}',
    revealAddr: 'DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk'
}); 
const request = {
    commitTxPrevOutputList,
    commitFeeRate: 50000,
    revealFeeRate: 50000,
    inscriptionDataList,
    changeAddress: 'DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk',
    transactionFee: 50000000,
};

const txs: InscribeTxs = inscribeRouter(dogeCoin, request);
```

### inscribeFile
```typescript
let privateKey = "QRtc49g1hVrMaqAFqZRb1EiYqUp4F896STQywyiQiUMeUSvcRh15"
const commitTxPrevOutputList: PrevOutput[] = [];
commitTxPrevOutputList.push({
    txId: "ca5af8ea9a577cebc1be7e61b8be200754f66c6493fba6f4d6254056c546d99c",
    vOut: 0,
    amount: 200000000,
    address: "DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk",
    privateKey: privateKey,
});

const inscriptionDataList: FileInscriptionData[] = [];
inscriptionDataList.push({
    contentType: 'text/plain;charset=utf-8',
    body: base.fromHex(base.toHex(Buffer.from('{"p":"nft","op":"deploy"}'))),
    file: Buffer.from("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"),
    revealAddr: 'DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk',
    repeat: 1
});
const request = {
    commitTxPrevOutputList,
    commitFeeRate: 50000,
    revealFeeRate: 50000,
    inscriptionDataList,
    changeAddress: 'DEm5jczGyyfrb8AbufR893FLxkWBwY8tAk',
};
const txs: InscribeTxs = inscribeFile(dogeCoin, request);
```

### Deploy drc-20

Inscribe the deploy function to you ordinal compatible wallet with the desired drc-20 parameters set.
It's a example of deploy script as following:
```typescript
{ 
  "p": "drc-20",
  "op": "deploy",
  "tick": "wow",
  "max": "1000000",
  "lim": "100"
}
```

command parameter description
| Key  | Require | Description                                      |
|------|---------|--------------------------------------------------|
| p    | yes     | Protocol: Helps other systems identify and process drc-20 events  |
| op   | yes     | Operation: Type of event (Deploy, Mint, Transfer)                 |
| tick | yes     | Ticker: letter identifier of the drc-20, equal to 3 or 4 characters |
| max  | yes     | Max supply: set max supply of the drc-20                               |
| lim  | no      | Mint limit: If letting users mint to themsleves, limit per cardinal  |

### Mint drc-20

Inscribe the mint function to your cardinal compatible wallet. Make sure the ticker matches either a) the drc-20 you deployed in step 1, or b) any drc-20 that has yet to reach its fully diluted supply. Also if the drc-20 has a mint limit, make sure not to surpass this.

It's a example of mint script as following:
```typescript
{ 
  "p": "drc-20",
  "op": "mint",
  "tick": "wow",
  "amt": "100"
}
```

command parameter description
| Key  | Require | Description                                      |
|------|---------|--------------------------------------------------|
| p    | yes     | Protocol: Helps other systems identify and process drc-20 events  |
| op   | yes     | Operation: Type of event (Deploy, Mint, Transfer)                 |
| tick | yes     | Ticker: letter identifier of the drc-20, equal to 3 or 4 characters |
| amt  | yes     | Amount to mint: States the amount of the drc-20 to mint. Has to be less than "lim" above if stated |

### Transfer drc-20
```typescript
{ "p": "drc-20", "op": "transfer", "tick": "", "amt": "" }
```
### WDOGE

WDOGE is a special kind of drc20. Its mint volume depends entirely on the user’s pledge amount. User can receive wdoge when he/she deposit dogecoin .
The amount he/she withdraw is same with he/she deposit. Hence there are two operator of wdoge: withdraw and deposit.

It's the examples of both scripts as following:

```typescript
{ 
  "p": "wdoge",
  "op": "deposit",
  "tick": "WDOGE(WRAPPED-DOGE)",
  "amt": "100"
}
```

```typescript
{ 
  "p": "wdoge",
  "op": "withdraw",
  "tick": "WDOGE(WRAPPED-DOGE)",
  "amt": "100"
}
```

###  Add or remove the liquidity of pairs
The user can add or remove the liquidity of pairs, and the liquidity of pairs provide the price. 
Every add or remove operation inscribe inscriptions to the dogecoin chain.
It's a example of add script as following:
```typescript
{
  "p": "pair-v1",
  "op": "add",
  "tick0": "",
  "tick1": "",
  "amt0": "",
  "amt1": "",
  "amt0_min": "",
  "amt1_min": "",
  "doge": ""
}

{ 
  "p": "pair-v2",
  "op": "add"
  "pair_id":"",
  "amt0": "",
  "amt1": "",
  "amt0_min": "",
  "amt1_min": "",
  "doge": 0 // 1
}
```

It's a example of remove script as following:
```typescript
{
  "p": "pair-v1",
  "op": "remove",
  "tick0": "",
  "tick1": "",
  "liquidity": "",
  "doge": 0 //1
}

{ 
  "p": "pair-v2",
  "op": "remove"
  "pair_id": "",
  "liquidity": "", 
  "doge": 0 //1
}
```

command parameter description
| Key  | Require | Description                                                              |
|------|---------|--------------------------------------------------------------------------|
| p    | yes     | Protocol: Helps other systems identify and process drc-20 events        |
| op   | yes     | Operation: Type of event (create, add, remove, swap)                    |
| tick | yes     | Ticker: letter identifier of the two drc-20                              |
| amt  | yes     | Amount: the amount of add or remove drc-20                               |
| addr | optional| add liquidity operation get reward of the pairs operation                |


### Swap the liquidity of pairs
Any user can swap one drc-20 for another drc-20 using the drc-20 pairs.
Every swap operation inscribe inscriptions to the dogecoin chain.
It's a example of create script as following:
```typescript
{
  "p": "pair-v1",
  "op": "swap",
  "tick0": "",
  "tick1": "",
  "amt0": "",
  "amt1": "",
  "amt1_min": "",
  "doge": 0 // 1
}

{ 
  "p": "pair-v2",
  "op": "swap"
  "pair_id":"",
  "tick0_id": "",
  "amt0": "",
  "amt1_min": "",
  "doge": 0 // 1
}
```

command parameter description
| Key  | Require | Description                                                              |
|------|---------|--------------------------------------------------------------------------|
| p    | yes     | Protocol: Helps other systems identify and process drc-20 events        |
| op   | yes     | Operation: Type of event (create, add, remove, swap)                    |
| tick | yes     | Ticker: letter identifier of the two drc-20, user transfer from first drc-20 for second drc-20 |
| amt  | yes     | Amount: the amount of swap drc-20, the user balance remove the first one of first drc-20 and get the second one of second drc-20 |


### Create drc20-pairs

Inscribe the `drc20-pairs` function to your compatible wallet with the desired drc-20 parameters set. Here's an example of a create script:

```typescript
{
  "p": "pair-v1",
  "op": "create",
  "tick0": "",
  "tick1": "",
  "amt0": "",
  "amt1": "",
  "amt0_min": "",
  "amt1_min": "",
  "doge": 0 // 1
}

{ 
  "p": "pair-v2",
  "op": "create", 
  "tick0_id": "",
  "tick1_id": "",
  "amt0": "",
  "amt1": "",
  "doge": 0 // 1
}
```

### Create Order
Makers can create a depending order at the price they expect. 
Every order create operation inscribe inscriptions to the dogecoin chain.
It's a example of create script as following:
```typescript
{ 
  "p": "order-v1",
  "op": "create",
  "tick0": "wow",
  "tick1": "doge",
  "amt0": "10", 
  "amt1": "1",
}
{
  "p": "order-v2",
  "op": "create",
  "file_id": "",
  "tick": "",
  "amt": "" 
}
```
command parameter description
| Key   | Require | Description                                    |
|-------|---------|------------------------------------------------|
| p     | yes     | Protocol: Helps other systems identify and process drc-20 events |
| op    | yes     | Operation: Type of event (create,)            |
| tick0 | yes     | The drc20 type makers sell                     |
| tick1 | yes     | The drc20 type makers buy                      |
| amt0  | yes     | The drc20 amount makers buy                    |
| amt1  | yes     | The drc20 amount makers buy                    |

### Cancel Order

Makers can cancel a depending order at the amount they expect. Every order cancel operation inscribes inscriptions to the dogecoin chain. Here's an example of a cancel script:

```typescript
{ 
  "p": "order-v1",
  "op": "cancel",
  "exid": "xxxxxxxxxxxxxxxxx",
  "amt0": "10"
}
{ 
  "p": "order-v2",
  "op": "cancel", 
  "ex_id": "" 
}
```
command parameter description
| Key  | Require | Description                                       |
|------|---------|---------------------------------------------------|
| p    | yes     | Protocol: Helps other systems identify and process drc-20 events |
| op   | yes     | Operation: Type of event (cancel)                |
| exid | yes     | The depending order id                           |
| amt0 | yes     | The drc20 amount makers suppose to cancel        |


### Trade Order
Takers can fill the orders created by the makers.
Every order trade operation inscribe inscriptions to the dogecoin chain.
It's a example of create script as following:
```typescript
{ 
  "p": "order-v1",
  "op": "trade",
  "exid": "xxxxxxxxxxxxxxxxx",
  "amt1": "10",
}
{ 
  "p": "order-v2",
  "op": "trade",
  "ex_id": "",
  "tick": "",
  "amt": "" 
}
```
command parameter description
| Key  | Require | Description                                                              |
|------|---------|--------------------------------------------------------------------------|
| p    | yes     | Protocol: Helps other systems identify and process drc-20 events        |
| op   | yes     | Operation: Type of event (trade)                                        |
| exid | yes     | The depending order id                                                  |
| amt1 | yes     | The drc20 amount makers suppose to trade, it's the drc20 type makers buy|


### Mint box
Anyone mint a box drc20 token. 
It's a example of create script as following:
```typescript
{ 
  "p": "box-v1",
  "op": "mint",
  "tick0": "unix",
  "amt1": "10",
}
```
command parameter description
| Key   | Require | Description                                                               |
|-------|---------|---------------------------------------------------------------------------|
| p     | yes     | Protocol: Helps other systems identify and process drc-20 events         |
| op    | yes     | Operation: Type of event (mint)                                          |
| tick0 | yes     | The drc20 type which will be mint                                         |
| amt1  | yes     | The amount which pay tick1 for tick0                                      |

### Deploy box
Anyone deploy a box drc20 token. He/she can create a deploy a inscription. This inscription contains the token which will deploy and the token which provide liquidity. For example, 50% of the deployment amount will be used for user minting, while the remaining 50% will be automatically added to liquidity after minting is completed.

It's a example of create script as following:
```typescript
{ 
  "p": "box-v1",
  "op": "deploy",
  "tick0": "unix",
  "tick1": "wdoge",
  "max": "10000",
  "amt0": "5000", 
  "amt1": "0",
  "liqamt": "5000",
  "liqblock": "5xxxxxx"
}
```

command parameter description
| Key     | Require | Description                                                                           |
|---------|---------|---------------------------------------------------------------------------------------|
| p       | yes     | Protocol: Helps other systems identify and process drc-20 events                     |
| op      | yes     | Operation: Type of event (deploy)                                                     |
| tick0   | yes     | The drc20 type which will be mint                                                      |
| tick1   | yes     | The drc20 type for establishing trading pairs, it should be a token with consensus value, such as wdoge |
| max     | yes     | The total amount of the deploying token                                                |
| amt0    | yes     | The amount of the deploying token which reserved for mining(pre-sale tokens)           |
| amt1    | no      | Reserved                                                                              |
| liqamt  | yes     | The amount of token1 which will fill in the pairs                                      |
| liqblock| yes     | The ending block height of box drc20 pre-sale                                           |

### Stake the liquidity of pairs
Any user who add liquidity of unix/wdoge pairs can stake their lp to get some reward, or any user stake their unix to get reward. The operation inscribe inscriptinos to the dogecoin chain.
It's a example of create script as following:
```typescript
{ 
  "p": "stake-v1",
  "op": "stake", ["unstake", "getallreward"],
  "tick": "unix-doge", ["unix"],
  "amt": "10", 
}
{ 
  "p": "stake-v2", 
  "op": "stake", ["unstake"],
  "stake_id": "",
  "amt": ""
}
{
  "p": "stake-v2",
  "op": "create",
  "tick0": "",
  "tick1": "",
  "reward": "",
  "each_reward": "",
  "lock_block": ""
}
{
  "p": "stake-v2",
  "op": "getreward",
  "stake_id": ""
}
```
command parameter description
| Key  | Require | Description                                                |
|------|---------|------------------------------------------------------------|
| p    | yes     | Protocol: Helps other systems identify and process drc-20 events |
| op   | yes     | Operation: Type of event, stake or unstake                 |
| tick | yes     | Ticker: support unix-doge or unix                          |
| amt  | yes     | Amount: the liquidity of the tick0-tick1 pair              |

### Upload Files
```typescript
{ "p": "file", "op": "deploy"}

```
### Pump
```typescript
{ 
  "p": "pump",
  "op": "deploy",
  "tick": "CARDI",
  "amt": "10",
  "symbol": "MEME",
  "name": "meme name",
  "doge": 0 // 1
}
```

```typescript
{ 
  "p": "pump",
  "op": "trade",
  "pair_id": "xxxxxxx",
  "tick0_id": "CZZ",
  "amt0": "1000",
  "amt1_min": "1000",
  "doge": 0 // 1
}
```
## License: MIT
