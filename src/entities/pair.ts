import { Price } from './fractions/price'
import { TokenAmount } from './fractions/tokenAmount'
import invariant from 'tiny-invariant'
import JSBI from 'jsbi'
import { pack, keccak256 } from '@ethersproject/solidity'
import { getCreate2Address } from '@ethersproject/address'

import {
  BigintIsh,
  FACTORY_ADDRESS,
  INIT_CODE_HASH,
  MINIMUM_LIQUIDITY,
  ZERO,
  ONE,
  TWO,
  FIVE,
  _98,
  _100,
  _997,
  _1000,
  ChainId, _2Q112, _65535, _32767
} from '../constants'
import { sqrt, parseBigintIsh } from '../utils'
import { InsufficientReservesError, InsufficientInputAmountError } from '../errors'
import { Token } from './token'

let PAIR_ADDRESS_CACHE: { [token0Address: string]: { [token1Address: string]: string } } = {}

export class Pair {
  public readonly liquidityToken: Token
  private readonly tokenAmounts: [TokenAmount, TokenAmount]
  private readonly buyVirtualBalances: [TokenAmount, TokenAmount]
  private readonly sellVirtualBalances: [TokenAmount, TokenAmount]
  private readonly basePrices: [TokenAmount, TokenAmount]
  private readonly R: JSBI

  public static getAddress(tokenA: Token, tokenB: Token): string {
    const tokens = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA] // does safety checks

    if (PAIR_ADDRESS_CACHE?.[tokens[0].address]?.[tokens[1].address] === undefined) {
      PAIR_ADDRESS_CACHE = {
        ...PAIR_ADDRESS_CACHE,
        [tokens[0].address]: {
          ...PAIR_ADDRESS_CACHE?.[tokens[0].address],
          [tokens[1].address]: getCreate2Address(
            FACTORY_ADDRESS,
            keccak256(['bytes'], [pack(['address', 'address'], [tokens[0].address, tokens[1].address])]),
            INIT_CODE_HASH
          )
        }
      }
    }

    return PAIR_ADDRESS_CACHE[tokens[0].address][tokens[1].address]
  }

  public constructor(tokenAmountA: TokenAmount,
                     tokenAmountB: TokenAmount,
                     buyBVirtualBalances: [TokenAmount, TokenAmount] = [tokenAmountA, tokenAmountB],
                     sellBVirtualBalances: [TokenAmount, TokenAmount] = [tokenAmountA, tokenAmountB],
                     basePrices: [TokenAmount, TokenAmount] = [tokenAmountA, tokenAmountB],
                     R: JSBI = ZERO
                     ) {
    invariant(tokenAmountA.token === buyBVirtualBalances[0].token
        && tokenAmountA.token === sellBVirtualBalances[0].token
        && tokenAmountA.token === basePrices[0].token, 'PAIR: TOKEN_A'
    )
    invariant(tokenAmountB.token === buyBVirtualBalances[1].token
        && tokenAmountB.token === sellBVirtualBalances[1].token
        && tokenAmountB.token === basePrices[1].token, 'PAIR: TOKEN_B'
    )

    const _tokenAmounts = tokenAmountA.token.sortsBefore(tokenAmountB.token) // does safety checks
      ? [tokenAmountA, tokenAmountB]
      : [tokenAmountB, tokenAmountA]
    // TOREPLACE with your liquidity token name
    this.liquidityToken = new Token(
      _tokenAmounts[0].token.chainId,
      Pair.getAddress(_tokenAmounts[0].token, _tokenAmounts[1].token),
      18,
      'POW',
      'Powerswap'
    )
    this.tokenAmounts = _tokenAmounts as [TokenAmount, TokenAmount]

    const _basePrices = tokenAmountA.token.sortsBefore(tokenAmountB.token)
        ? basePrices
        : [basePrices[1], basePrices[0]]
    this.basePrices = _basePrices as [TokenAmount, TokenAmount]

    const _buyVirtualBalances = tokenAmountA.token.sortsBefore(tokenAmountB.token)
        ? buyBVirtualBalances : [sellBVirtualBalances[1], sellBVirtualBalances[0]]
    const _sellVirtualBalances = tokenAmountA.token.sortsBefore(tokenAmountB.token)
        ? sellBVirtualBalances : [buyBVirtualBalances[1], buyBVirtualBalances[0]]
    this.buyVirtualBalances = _buyVirtualBalances as [TokenAmount, TokenAmount]
    this.sellVirtualBalances = _sellVirtualBalances as [TokenAmount, TokenAmount]

    this.R = R
  }

  /**
   * Returns true if the token is either token0 or token1
   * @param token to check
   */
  public involvesToken(token: Token): boolean {
    return token.equals(this.token0) || token.equals(this.token1)
  }

  /**
   * Returns the current mid price of the pair in terms of token0, i.e. the ratio of reserve1 to reserve0
   * buy Y; token0Price = dy/dx
   */
  public get token0Price(): Price {
    const _numerator = JSBI.multiply(this.buyVirtualBalances[1].raw, JSBI.multiply(_2Q112, _65535))
    const _denominator = JSBI.add(JSBI.multiply(this.basePrices[0].raw, JSBI.multiply(this.buyVirtualBalances[1].raw, this.R)),
        JSBI.multiply(this.buyVirtualBalances[0].raw, JSBI.multiply(_2Q112, JSBI.subtract(_65535, this.R)))
    )
    return new Price(this.token0, this.token1, _denominator, _numerator)
  }

  /**
   * Returns the current mid price of the pair in terms of token1, i.e. the ratio of reserve0 to reserve1
   * sell Y; token1Price = dx/dy
   */
  public get token1Price(): Price {
    const _numerator = JSBI.multiply(this.sellVirtualBalances[0].raw, JSBI.multiply(_2Q112, _65535))
    const _denominator = JSBI.add(JSBI.multiply(this.basePrices[1].raw, JSBI.multiply(this.sellVirtualBalances[0].raw, this.R)),
        JSBI.multiply(this.sellVirtualBalances[1].raw, JSBI.multiply(_2Q112, JSBI.subtract(_65535, this.R)))
    )
    return new Price(this.token1, this.token0, _denominator, _numerator)
  }

  /**
   * Return the price of the given token in terms of the other token in the pair.
   * @param token token to return price of
   */
  public priceOf(token: Token): Price {
    invariant(this.involvesToken(token), 'TOKEN')
    return token.equals(this.token0) ? this.token0Price : this.token1Price
  }

  /**
   * Returns the chain ID of the tokens in the pair.
   */
  public get chainId(): ChainId {
    return this.token0.chainId
  }

  public get token0(): Token {
    return this.tokenAmounts[0].token
  }

  public get token1(): Token {
    return this.tokenAmounts[1].token
  }

  public get reserve0(): TokenAmount {
    return this.tokenAmounts[0]
  }

  public get reserve1(): TokenAmount {
    return this.tokenAmounts[1]
  }

  public reserveOf(token: Token): TokenAmount {
    invariant(this.involvesToken(token), 'TOKEN')
    return token.equals(this.token0) ? this.reserve0 : this.reserve1
  }

  public get buyBVirtualBalances(): [TokenAmount, TokenAmount]{
    return this.buyVirtualBalances as [TokenAmount, TokenAmount]
  }

  public get sellBVirtualBalances(): [TokenAmount, TokenAmount]{
    return this.sellVirtualBalances as [TokenAmount, TokenAmount]
  }

  private _getOutputAmount(amountIn: JSBI, reserveIn: JSBI, reserveOut: JSBI, price: JSBI, R: JSBI): JSBI{
    invariant(!JSBI.lessThanOrEqual(amountIn, ZERO), 'PAIR: INSUFFICIENT_INPUT_AMOUNT')
    const amountInWithFee = JSBI.divide(JSBI.multiply(amountIn, _997), _1000)
    const amountTemp = JSBI.divide(JSBI.multiply(amountInWithFee, JSBI.multiply(reserveIn, _65535)),
        JSBI.add(JSBI.multiply(amountInWithFee,JSBI.subtract(_65535, R)), JSBI.multiply(reserveIn, _65535)))
    const _numerator = JSBI.multiply(amountTemp, JSBI.multiply(reserveOut, _65535))
    const _denominator = JSBI.add(JSBI.multiply(reserveIn, JSBI.subtract(_65535, R)),
        JSBI.divide(JSBI.multiply(reserveOut, JSBI.multiply(price, R)), _2Q112)
        )
    const amountOut = JSBI.divide(_numerator, _denominator)

    if (JSBI.equal(amountOut, ZERO)) {
      throw new InsufficientInputAmountError()
    }

    return amountOut
  }

  public getOutputAmount(inputAmount: TokenAmount): [TokenAmount, Pair] {
    invariant(this.involvesToken(inputAmount.token), 'TOKEN')
    if (JSBI.equal(this.reserve0.raw, ZERO) || JSBI.equal(this.reserve1.raw, ZERO) ||
        JSBI.equal(this.buyVirtualBalances[0].raw, ZERO) || JSBI.equal(this.buyVirtualBalances[1].raw, ZERO) ||
        JSBI.equal(this.sellVirtualBalances[0].raw, ZERO) || JSBI.equal(this.sellVirtualBalances[1].raw, ZERO)
    ) {
      throw new InsufficientReservesError()
    }
    const _R = this.R
    const amountIn = inputAmount.raw
    if (inputAmount.token == this.token0){
      const reserveIn = this.buyVirtualBalances[0].raw
      const reserveOut = this.buyVirtualBalances[1].raw
      const price = this.basePrices[0].raw
      const amountOut = this._getOutputAmount(amountIn, reserveIn, reserveOut, price, _R)
      const outputAmount = new TokenAmount(this.token1, amountOut)

      return [outputAmount, new Pair(this.tokenAmounts[0].add(inputAmount),
          this.tokenAmounts[1].subtract(outputAmount),
          [this.buyVirtualBalances[0].add(inputAmount), this.buyVirtualBalances[1].subtract(outputAmount)],
          this.sellVirtualBalances,
          this.basePrices,
          _R
          )]
    }else {
      invariant(inputAmount.token.equals(this.token1), 'PAIR: TOKEN')
      const reserveIn  = this.sellVirtualBalances[1].raw
      const reserveOut = this.sellVirtualBalances[0].raw
      const price = this.basePrices[1].raw
      const amountOut = this._getOutputAmount(amountIn, reserveIn, reserveOut, price, _R)
      const outputAmount = new TokenAmount(this.token0, amountOut)

      return [outputAmount, new Pair(this.tokenAmounts[0].subtract(outputAmount),
          this.tokenAmounts[1].add(inputAmount),
          this.buyVirtualBalances,
          [this.sellVirtualBalances[0].subtract(outputAmount), this.sellVirtualBalances[1].add(inputAmount)],
          this.basePrices,
          this.R
      )]
    }
  }

  private _getInputAmount(amountOut:JSBI, reserveIn: JSBI, reserveOut: JSBI, price: JSBI, R: JSBI): JSBI{
    invariant(!JSBI.lessThanOrEqual(amountOut, ZERO),'PAIR: INSUFFICIENT_OUTPUT_AMOUNT')

    const _numeratorTemp = JSBI.multiply(amountOut,
        JSBI.add(
            JSBI.multiply(reserveIn, JSBI.subtract(_65535, R)),
          JSBI.divide(JSBI.multiply(reserveOut,JSBI.multiply(price, R)), _2Q112)
        )
    )
    const _denominatorTemp = JSBI.multiply(reserveOut, _65535)
    const _amountTemp = JSBI.add(JSBI.divide(_numeratorTemp, _denominatorTemp), ONE)
    const _numerator = JSBI.multiply(reserveIn, JSBI.multiply(_amountTemp, JSBI.multiply(_65535, _1000)))
    const _denominator = JSBI.multiply(JSBI.subtract(JSBI.multiply(reserveIn, _65535),
                                                     JSBI.multiply(_amountTemp, JSBI.subtract(_65535, R))), _997)
    const amountIn = JSBI.add(JSBI.divide(_numerator, _denominator), ONE)

    return amountIn
  }

  public getInputAmount(outputAmount: TokenAmount): [TokenAmount, Pair] {
    invariant(this.involvesToken(outputAmount.token), 'TOKEN')
    if (
      JSBI.equal(this.reserve0.raw, ZERO) ||
      JSBI.equal(this.reserve1.raw, ZERO) ||
      JSBI.greaterThanOrEqual(outputAmount.raw, this.reserveOf(outputAmount.token).raw)
    ) {
      throw new InsufficientReservesError()
    }

    const _R = this.R
    const amountOut = outputAmount.raw
    if (outputAmount.token.equals(this.token0)){
      const reserveIn = this.sellVirtualBalances[1].raw
      const reserveOut = this.sellVirtualBalances[0].raw
      const price = this.basePrices[1].raw
      const amountIn = this._getInputAmount(amountOut, reserveIn, reserveOut, price, _R)
      const inputAmount = new TokenAmount(this.token1, amountIn)

      return [inputAmount, new Pair(this.tokenAmounts[0].subtract(outputAmount), this.tokenAmounts[1].add(inputAmount),
        this.buyVirtualBalances,
          [this.sellVirtualBalances[0].subtract(outputAmount), this.sellVirtualBalances[1].add(inputAmount)],
      this.basePrices,
          _R)]
    }else {
      invariant(outputAmount.token.equals(this.token1), 'PAIR: TOKEN')
      const reserveIn = this.buyVirtualBalances[0].raw
      const reserveOut = this.buyVirtualBalances[1].raw
      const price = this.basePrices[0].raw
      const amountIn = this._getInputAmount(amountOut, reserveIn, reserveOut, price, _R)
      const inputAmount = new TokenAmount(this.token0, amountIn)

      return [inputAmount, new Pair(this.tokenAmounts[0].add(inputAmount), this.tokenAmounts[1].subtract(outputAmount),
          [this.buyVirtualBalances[0].add(inputAmount), this.buyVirtualBalances[1].subtract(outputAmount)],
          this.sellVirtualBalances,
          this.basePrices,
          _R)]
    }
  }

  public getLiquidityMinted(
    totalSupply: TokenAmount,
    tokenAmountA: TokenAmount,
    tokenAmountB: TokenAmount
  ): TokenAmount {
    invariant(totalSupply.token.equals(this.liquidityToken), 'LIQUIDITY')
    const tokenAmounts = tokenAmountA.token.sortsBefore(tokenAmountB.token) // does safety checks
      ? [tokenAmountA, tokenAmountB]
      : [tokenAmountB, tokenAmountA]
    invariant(tokenAmounts[0].token.equals(this.token0) && tokenAmounts[1].token.equals(this.token1), 'TOKEN')

    let liquidity: JSBI
    if (JSBI.equal(totalSupply.raw, ZERO)) {
      liquidity = JSBI.subtract(sqrt(JSBI.multiply(tokenAmounts[0].raw, tokenAmounts[1].raw)), MINIMUM_LIQUIDITY)
    } else {
      const amount0 = JSBI.divide(JSBI.multiply(tokenAmounts[0].raw, JSBI.multiply(totalSupply.raw, _98)),
          JSBI.add(JSBI.multiply(this.reserve0.raw, _100), JSBI.multiply(tokenAmounts[0].raw, TWO)))
      const amount1 = JSBI.divide(JSBI.multiply(tokenAmounts[1].raw, JSBI.multiply(totalSupply.raw, _98)),
          JSBI.add(JSBI.multiply(this.reserve1.raw, _100), JSBI.multiply(tokenAmounts[1].raw, TWO)))
      liquidity = JSBI.lessThanOrEqual(amount0, amount1) ? amount0 : amount1
    }
    if (!JSBI.greaterThan(liquidity, ZERO)) {
      throw new InsufficientInputAmountError()
    }
    return new TokenAmount(this.liquidityToken, liquidity)
  }

  public getLiquidityValue(
    token: Token,
    totalSupply: TokenAmount,
    liquidity: TokenAmount,
    feeOn: boolean = false,
    kLast?: BigintIsh
  ): TokenAmount {
    invariant(this.involvesToken(token), 'TOKEN')
    invariant(totalSupply.token.equals(this.liquidityToken), 'TOTAL_SUPPLY')
    invariant(liquidity.token.equals(this.liquidityToken), 'LIQUIDITY')
    invariant(JSBI.lessThanOrEqual(liquidity.raw, totalSupply.raw), 'LIQUIDITY')

    let totalSupplyAdjusted: TokenAmount
    if (!feeOn) {
      totalSupplyAdjusted = totalSupply
    } else {
      invariant(!!kLast, 'K_LAST')
      const kLastParsed = parseBigintIsh(kLast)
      if (!JSBI.equal(kLastParsed, ZERO)) {
        const rootK = sqrt(JSBI.multiply(this.reserve0.raw, this.reserve1.raw))
        const rootKLast = sqrt(kLastParsed)
        if (JSBI.greaterThan(rootK, rootKLast)) {
          const numerator = JSBI.multiply(totalSupply.raw, JSBI.subtract(rootK, rootKLast))
          const denominator = JSBI.add(JSBI.multiply(rootK, FIVE), rootKLast)
          const feeLiquidity = JSBI.divide(numerator, denominator)
          totalSupplyAdjusted = totalSupply.add(new TokenAmount(this.liquidityToken, feeLiquidity))
        } else {
          totalSupplyAdjusted = totalSupply
        }
      } else {
        totalSupplyAdjusted = totalSupply
      }
    }

    const _numerator = JSBI.subtract(JSBI.multiply(totalSupplyAdjusted.raw, _100), JSBI.multiply(liquidity.raw, TWO))
    const _denominator = JSBI.add(JSBI.divide(JSBI.multiply(totalSupplyAdjusted.raw, JSBI.multiply(totalSupplyAdjusted.raw, _98)),
        liquidity.raw), ONE)

    return new TokenAmount(
      token,
      JSBI.divide(JSBI.multiply(_numerator, this.reserveOf(token).raw), _denominator)
    )
  }
}
