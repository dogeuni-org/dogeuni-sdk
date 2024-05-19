# unielon-sdk

This is a typescript/javascript language wallet solution that supports offline transactions.

## Npm Install
To obtain the latest version, simply require the project using npm:

```shell
# needed for all coins
npm install @unielon/crypto-lib
npm install @unielon/coin-base

# for dogecoin
npm install @unielon/coin-dogecoin
```

## Build Locally
You can build the sdk locally ,and run test-code.
```shell
sh build.sh
```

## Supported chains

|          | Account Generation | Transaction Creation | Transaction Signing |
|----------|-------------------|----------------------|---------------------|
| BTC      | ✅                 | ✅                    | ✅                   | 
| DOGE     | ✅                 | ✅                    | ✅                   |

## Main modules

- crypto-lib: Handles general security and signature algorithms.
- coin-base: Provides  coin common interface.
- coin-*: Implements transaction creation and signature in each coin type.


## Example

For specific usage examples of each coin type, please refer to the corresponding test files. Remember to replace the
placeholder private key with your own private key, which is generally in hex format.

## Feedback

You can provide feedback directly in GitHub Issues, and we will respond promptly.

## License
Most packages or folders are MIT licensed, see package or folder for the respective license.
