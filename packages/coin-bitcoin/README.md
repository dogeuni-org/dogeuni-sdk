# @unielon/coin-dogecoin
Dogecoin SDK is used to interact with the Dogecoin Mainnet or Testnet, it contains various functions can be used to web3 wallet.

## What Can Dogecoin SDK Do
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

## Getting Started
**Installing Dogecoin SDK**
```shell
npm install @unielon/coin-dogecoin
```

## Using Dogecoin SDK

```typescript
import { DogeWallet } from "@unielon/coin-dogecoin";
let wallet = new DogeWallet()
let privateKey = "QRJx7uvj55L3oVRADWJfFjJ31H9Beg75xZ2GcmR8rKFNHA4ZacKJ"
const commitTxPrevOutputList: PrevOutput[] = [];
commitTxPrevOutputList.push({
    txId: "3cb1d8da082b2146b8f4c09b06e38eb37f0263ecefb8a52600accc75ccef4c90",
    vOut: 1,
    amount: 793850000,
    address: "DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ",
    privateKey: privateKey,
});
const inscriptionDataList: DrcInscriptionData[] = [];
inscriptionDataList.push({
  contentType: 'text/plain;charset=utf-8',
  body: `{"p":"drc-20","op":"deploy","tick": "GOODS" ,"max": "210000000000", "lim": "1000000"}`,
  revealAddr: 'DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ',
  repeat: repeat || 1
});
const request = {
  commitTxPrevOutputList,
  commitFeeRate: 50000,
  revealFeeRate: 50000,
  inscriptionDataList,
  changeAddress: 'DJu5mMUKprfnyBhot2fqCsW9sZCsfdfcrZ',
};
const res =  await wallet.inscribeDrc(dogeCoin, request)
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
  "tick0": "wow",
  "tick1": "doge",
  "amt0": "1000000", 
  "amt1": "1000",
  "addr": "Dxxxxxxxx"
}
```

It's a example of remove script as following:
```typescript
{ 
  "p": "pair-v1",
  "op": "remove",
  "tick0": "wow",
  "tick1": "doge",
  "amt": "1000000", 
  "addr": "Dxxxxxxxx"
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
  "tick0": "wow",
  "tick1": "doge",
  "amt0": "10", 
  "amt1": "1",
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
  "tick0": "wow",
  "tick1": "doge",
  "addr": "Dxxxxxxxx"
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
  "op": "stake", ["unstake", "getallreward"]
  "tick": "unix-doge", ["unix"]
  "amt": "10", 
}
```
command parameter description
| Key  | Require | Description                                                |
|------|---------|------------------------------------------------------------|
| p    | yes     | Protocol: Helps other systems identify and process drc-20 events |
| op   | yes     | Operation: Type of event, stake or unstake                 |
| tick | yes     | Ticker: support unix-doge or unix                          |
| amt  | yes     | Amount: the liquidity of the tick0-tick1 pair              |

## License: MIT
