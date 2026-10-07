import { describe, expect, it } from 'vitest'
import {
  DEAD_SHARES,
  estimateShares,
  estimateWithdraw,
  sharePriceScaled18,
  userShareBps,
} from './vaultMath'

describe('estimateShares — first-deposit boundary (mirrors AmountTooSmall)', () => {
  it('rejects exactly 1000n at bootstrap (contract reverts AmountTooSmall)', () => {
    expect(() => estimateShares(1000n, 0n, 0n)).toThrow(/AmountTooSmall/)
  })

  it('rejects every amount <= 999n at bootstrap', () => {
    expect(() => estimateShares(1n, 0n, 0n)).toThrow(/AmountTooSmall/)
    expect(() => estimateShares(999n, 0n, 0n)).toThrow(/AmountTooSmall/)
  })

  it('returns 1n share for 1001n (1000 dead + 1 to caller)', () => {
    expect(estimateShares(1001n, 0n, 0n)).toBe(1n)
    expect(DEAD_SHARES).toBe(1000n)
  })

  it('returns 2n shares for 1002n', () => {
    expect(estimateShares(1002n, 0n, 0n)).toBe(2n)
  })
})

describe('estimateShares — proportional branch (floor)', () => {
  it('matches floor(amount * totalSupply / vaultBalance)', () => {
    // 1000 * 10000 / 12000 = 833.33… → 833
    expect(estimateShares(1000n, 10_000n, 12_000n)).toBe(833n)
    // exact ratio stays exact
    expect(estimateShares(5_000n, 10_000n, 10_000n)).toBe(5_000n)
    // 1 wei into a large supply floors to 0 (contract reverts ZeroShares)
    expect(estimateShares(1n, 10n ** 24n, 10n ** 24n + 1n)).toBe(0n)
  })
})

describe('round trips — floor rounding never profits (estimateWithdraw(estimateShares(x)) <= x)', () => {
  const cases: Array<{ label: string; amount: bigint; supply: bigint; balance: bigint }> = [
    { label: 'bootstrap single depositor', amount: 1001n, supply: 0n, balance: 0n },
    { label: 'bootstrap large deposit', amount: 10n ** 18n, supply: 0n, balance: 0n },
    { label: '1:1 supply/balance', amount: 777n, supply: 10_000n, balance: 10_000n },
    { label: 'donation raises balance', amount: 777n, supply: 10_000n, balance: 12_000n },
    { label: 'heavy donation', amount: 3n, supply: 1_000n, balance: 9_000n },
    { label: 'e18 amounts with donation', amount: 2_500n * 10n ** 18n, supply: 4_000n * 10n ** 18n, balance: 5_000n * 10n ** 18n },
  ]

  for (const { label, amount, supply, balance } of cases) {
    it(label, () => {
      const shares = estimateShares(amount, supply, balance)
      // post-deposit state: at bootstrap the contract ALSO mints DEAD_SHARES to 0xdead
      const postSupply = supply === 0n ? amount : supply + shares
      const returned = estimateWithdraw(shares, postSupply, balance + amount)
      expect(returned <= amount).toBe(true)
      // and the round trip cannot lose more than the dead-share slice + floor dust
      expect(amount - returned <= DEAD_SHARES + 1n).toBe(true)
    })
  }
})

describe('estimateWithdraw', () => {
  it('is floor(shares * balance / supply)', () => {
    expect(estimateWithdraw(647n, 10_000n, 12_000n)).toBe(776n) // 776.4 → 776
    expect(estimateWithdraw(0n, 10_000n, 12_000n)).toBe(0n)
  })

  it('returns 0n at bootstrap (no shares exist)', () => {
    expect(estimateWithdraw(0n, 0n, 0n)).toBe(0n)
  })
})

describe('sharePriceScaled18', () => {
  it('is null at bootstrap (totalSupply === 0n)', () => {
    expect(sharePriceScaled18(0n, 0n)).toBeNull()
  })

  it('is 1e18 when balance equals supply', () => {
    expect(sharePriceScaled18(10_000n, 10_000n)).toBe(10n ** 18n)
  })

  it('reflects donations (price above 1e18)', () => {
    // (12_000 * 1e18) / 10_000 = 1.2e18
    expect(sharePriceScaled18(10_000n, 12_000n)).toBe(1_200_000_000_000_000_000n)
  })
})

describe('userShareBps', () => {
  it('is 0n at bootstrap', () => {
    expect(userShareBps(0n, 0n)).toBe(0n)
  })

  it('is floor(shares * 10_000 / totalSupply)', () => {
    expect(userShareBps(2_500n, 10_000n)).toBe(2_500n) // 25%
    expect(userShareBps(1n, 3n)).toBe(3_333n) // floor(3333.33…)
  })
})
