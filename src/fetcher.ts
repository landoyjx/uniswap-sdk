import { Contract } from '@ethersproject/contracts'
import { getNetwork } from '@ethersproject/networks'
import { getDefaultProvider } from '@ethersproject/providers'
import { TokenAmount } from './entities/fractions/tokenAmount'
import { Pair } from './entities/pair'
//import IUniswapV2Pair from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import PowerswapPair from './abis/PowerswapPair.json' // copied from powerswap-core/contracts/artifacts
import invariant from 'tiny-invariant'
import ERC20 from './abis/ERC20.json'
import {ChainId} from './constants'
import { Token } from './entities/token'
import JSBI from "jsbi";


let TOKEN_DECIMALS_CACHE: { [chainId: number]: { [address: string]: number } } = {
  [ChainId.MAINNET]: {
    '0xE0B7927c4aF23765Cb51314A0E0521A9645F0E2A': 9 // DGD
  } //
}

/**
 * Contains methods for constructing instances of pairs and tokens from on-chain data.
 */
export abstract class Fetcher {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  /**
   * Fetch information for a given token on the given chain, using the given ethers provider.
   * @param chainId chain of the token
   * @param address address of the token on the chain
   * @param provider provider used to fetch the token
   * @param symbol optional symbol of the token
   * @param name optional name of the token
   */
  public static async fetchTokenData(
    chainId: ChainId,
    address: string,
    provider = getDefaultProvider(getNetwork(chainId)),
    symbol?: string,
    name?: string
  ): Promise<Token> {
    const parsedDecimals =
      typeof TOKEN_DECIMALS_CACHE?.[chainId]?.[address] === 'number'
        ? TOKEN_DECIMALS_CACHE[chainId][address]
        : await new Contract(address, ERC20, provider).decimals().then((decimals: number): number => {
            TOKEN_DECIMALS_CACHE = {
              ...TOKEN_DECIMALS_CACHE,
              [chainId]: {
                ...TOKEN_DECIMALS_CACHE?.[chainId],
                [address]: decimals
              }
            }
            return decimals
          })
    return new Token(chainId, address, parsedDecimals, symbol, name)
  }

  /**
   * Fetches information about a pair and constructs a pair from the given two tokens.
   * @param tokenA first token
   * @param tokenB second token
   * @param provider the provider to use to fetch the data
   */
  public static async fetchPairData(
    tokenA: Token,
    tokenB: Token,
    provider = getDefaultProvider(getNetwork(tokenA.chainId))
  ): Promise<Pair> {
    invariant(tokenA.chainId === tokenB.chainId, 'CHAIN_ID')
    const address = Pair.getAddress(tokenA, tokenB)
    const [reserves0, reserves1] = await new Contract(address, PowerswapPair.abi, provider).getReserves()
    const [balanceBuy0, balanceBuy1, balanceSell0, balanceSell1] = await new Contract(address, PowerswapPair.abi, provider).getBalances()
    const [buyPrice, sellPrice] = await new Contract(address, PowerswapPair.abi, provider).getPrices()
    const R = await new Contract(address, PowerswapPair.abi, provider).getR()

    const balances = tokenA.sortsBefore(tokenB) ? [reserves0, reserves1] : [reserves1, reserves0]
    const [balanceBuyA, balanceBuyB, balanceSellA, balanceSellB] = tokenA.sortsBefore(tokenB)
        ? [balanceBuy0, balanceBuy1, balanceSell0, balanceSell1]
        : [balanceSell1, balanceSell0, balanceBuy1, balanceBuy0]
    const [buyBPrice, sellBPrice] = tokenA.sortsBefore(tokenB) ? [buyPrice, sellPrice] : [sellPrice, buyPrice]


    return new Pair(
        new TokenAmount(tokenA, balances[0]),
        new TokenAmount(tokenB, balances[1]),
        [new TokenAmount(tokenA, balanceBuyA), new TokenAmount(tokenB, balanceBuyB)],
        [new TokenAmount(tokenA, balanceSellA), new TokenAmount(tokenB, balanceSellB)],
        [new TokenAmount(tokenA, buyBPrice), new TokenAmount(tokenB, sellBPrice)],
        JSBI.BigInt(R)
    )
  }
}
