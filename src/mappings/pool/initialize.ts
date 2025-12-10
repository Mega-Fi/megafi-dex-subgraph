import { BigInt } from '@graphprotocol/graph-ts'

import { Bundle, Pool, Token } from '../../types/schema'
import { Initialize } from '../../types/templates/Pool/Pool'
import { getSubgraphConfig, SubgraphConfig } from '../../utils/chains'
import { updatePoolDayData, updatePoolHourData } from '../../utils/intervalUpdates'
import { findNativePerToken, getNativePriceInUSD, sqrtPriceX96ToTokenPrices } from '../../utils/pricing'

export function handleInitialize(event: Initialize): void {
  handleInitializeHelper(event)
}

export function handleInitializeHelper(event: Initialize, subgraphConfig: SubgraphConfig = getSubgraphConfig()): void {
  const stablecoinWrappedNativePoolAddress = subgraphConfig.stablecoinWrappedNativePoolAddress
  const stablecoinIsToken0 = subgraphConfig.stablecoinIsToken0
  const wrappedNativeAddress = subgraphConfig.wrappedNativeAddress
  const stablecoinAddresses = subgraphConfig.stablecoinAddresses
  const minimumNativeLocked = subgraphConfig.minimumNativeLocked

  // update pool sqrt price and tick
  const pool = Pool.load(event.address.toHexString())!
  pool.sqrtPrice = event.params.sqrtPriceX96
  pool.tick = BigInt.fromI32(event.params.tick)
  
  // update token prices
  const token0 = Token.load(pool.token0)
  const token1 = Token.load(pool.token1)

  // calculate and set pool prices from sqrtPrice
  if (token0 && token1) {
    const prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0 as Token, token1 as Token)
    pool.token0Price = prices[0]
    pool.token1Price = prices[1]
  }
  pool.save()

  // update ETH price now that prices could have changed
  const bundle = Bundle.load('1')!
  bundle.ethPriceUSD = getNativePriceInUSD(stablecoinWrappedNativePoolAddress, stablecoinIsToken0)
  bundle.save()

  updatePoolDayData(event)
  updatePoolHourData(event)

  // update token prices
  if (token0 && token1) {
    token0.derivedETH = findNativePerToken(
      token0 as Token,
      wrappedNativeAddress,
      stablecoinAddresses,
      minimumNativeLocked,
    )
    token1.derivedETH = findNativePerToken(
      token1 as Token,
      wrappedNativeAddress,
      stablecoinAddresses,
      minimumNativeLocked,
    )
    token0.save()
    token1.save()
  }
}
