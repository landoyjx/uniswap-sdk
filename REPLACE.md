# only for kovan env


### old

FACTORY: 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f

INIT_CODE_HASH: 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f

WETH: 0xd0A1E359811322d97991E03f863a0C30C2cF029C


### new

FACTORY: 0xbA283609B43046f4844E5364E0FAd622678af44C

INIT_CODE_HASH: 0xa1900462e5312ab2fee9934dc9cb002f7f422b14939fd79178045c5c08d4df5f

WETH: 0x9F4B99590B6577C4515BF314597B6D4dCA8af45A

replace with new your factory, init_code_hash and weth contract address


then

yarn install

yarn build

rm old ~/your-uniswap-interface/node-modules/@uniswap/sdk/sdk/dist

cp -R build to ~/your-uniswap-interface/node-modules/@uniswap/sdk/
