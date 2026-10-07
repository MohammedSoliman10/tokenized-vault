import { describe, expect, it } from 'vitest'

import { ANVIL_CHAIN_ID, SEPOLIA_CHAIN_ID, supportedChainId } from './chainId'

describe('supportedChainId — pins reads to a configured chain only', () => {
  it('passes through both configured chains (31337, 11155111)', () => {
    expect(supportedChainId(ANVIL_CHAIN_ID)).toBe(31337)
    expect(supportedChainId(SEPOLIA_CHAIN_ID)).toBe(11155111)
    expect(supportedChainId(31337)).toBe(31337)
    expect(supportedChainId(11155111)).toBe(11155111)
  })

  it('returns undefined for every other chain — a stale/foreign client can never be built', () => {
    for (const id of [1, 5, 10, 137, 42161, 8453, 0, -1, 999999]) {
      expect(supportedChainId(id)).toBeUndefined()
    }
  })

  it('the configured set is exactly two chains (constitution gate)', () => {
    const configured = new Set<number>()
    // exhaustive scan across the whole id space the two chains live in
    for (let id = 0; id <= 11_155_111; id += 1) {
      if (supportedChainId(id) !== undefined) configured.add(id)
    }
    expect([...configured].sort((a, b) => a - b)).toEqual([31337, 11155111])
  })
})
