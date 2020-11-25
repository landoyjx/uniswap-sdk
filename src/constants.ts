import JSBI from 'jsbi'

// exports for external consumption
export type BigintIsh = JSBI | bigint | string

export enum ChainId {
  MAINNET = 1,
  ROPSTEN = 3,
  RINKEBY = 4,
  GÖRLI = 5,
  KOVAN = 42
}

export enum TradeType {
  EXACT_INPUT,
  EXACT_OUTPUT
}

export enum Rounding {
  ROUND_DOWN,
  ROUND_HALF_UP,
  ROUND_UP
}

// TOREPLACE with your factory address
export const FACTORY_ADDRESS = '0xB89658d9636744D0b016b4AC0d71935d667c2065'
// TOREPLACE with your pair token contract bytecode keccak256
export const INIT_CODE_HASH = '0xa28aaa48c2283c5ec0407803dfdf7b7e702076440f67d00353c0a1eff6ef01e9'

export const MINIMUM_LIQUIDITY = JSBI.BigInt(1000)

// exports for internal consumption
export const ZERO = JSBI.BigInt(0)
export const ONE = JSBI.BigInt(1)
export const TWO = JSBI.BigInt(2)
export const THREE = JSBI.BigInt(3)
export const FIVE = JSBI.BigInt(5)
export const TEN = JSBI.BigInt(10)
export const _98 = JSBI.BigInt(98)
export const _100 = JSBI.BigInt(100)
export const _997 = JSBI.BigInt(997)
export const _1000 = JSBI.BigInt(1000)
export const _32767 = JSBI.BigInt(32767)
export const _65535 = JSBI.BigInt(65535)
export const _2Q112 = JSBI.BigInt(2**112)


export enum SolidityType {
  uint8 = 'uint8',
  uint16 = 'uint16',
  uint112 = 'uint112',
  uint256 = 'uint256'
}

export const SOLIDITY_TYPE_MAXIMA = {
  [SolidityType.uint8]: JSBI.BigInt('0xff'),
  [SolidityType.uint16]: JSBI.BigInt('0xffff'),
  [SolidityType.uint112]: JSBI.BigInt('0xffffffffffffffffffffffffffff'),
  [SolidityType.uint256]: JSBI.BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
}
