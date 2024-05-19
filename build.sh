#/bin/sh
echo `pwd`

npm install

echo "build crypto-lib"

cd ./packages/crypto-lib  &&   npm install && npm run build && npm link && cd -


echo "build coin-base"
cd ./packages/coin-base  &&   npm link @unielon/crypto-lib && npm run build && npm link && cd -

string="coin-bitcoin"
dir="./packages/$string"
echo "build $string"
cd $dir && npm link @unielon/coin-base @unielon/crypto-lib && npm run build && echo "build $string success.\n\n" && cd -