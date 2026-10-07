/**
 * vaultMath — pure bigint share math mirroring `contracts/src/Vault.sol` exactly.
 *
 * All divisions are truncating (floor), behaviorally identical to Solidity's `/` on
 * unsigned integers for positive values (research D8, spec SC-005).
 */

/** Dead-share slice minted to address(0xdead) on the first deposit (base units, NOT e18). */
export const DEAD_SHARES = 1000n

/**
 * Estimate shares minted for a deposit — mirrors `Vault.deposit`.
 *
 * - Bootstrap (`totalSupply === 0n`): first deposit must exceed `DEAD_SHARES`
 *   (the contract reverts `AmountTooSmall`); returns `amount - DEAD_SHARES`.
 * - Otherwise: `floor(amount * totalSupply / vaultBalance)`.
 */
export function estimateShares(
  amount: bigint,
  totalSupply: bigint,
  vaultBalance: bigint,
): bigint {
  if (totalSupply === 0n) {
    if (amount <= DEAD_SHARES) {
      throw new Error(
        `AmountTooSmall: first deposit must exceed ${DEAD_SHARES} base units (contract reverts AmountTooSmall)`,
      )
    }
    return amount - DEAD_SHARES
  }
  // Invariant: totalSupply > 0n ⇒ vaultBalance > 0n (dead shares always back a
  // nonzero balance), so this division is safe.
  return (amount * totalSupply) / vaultBalance
}

/**
 * Estimate tokens returned for burning shares — mirrors `Vault.withdraw`:
 * `floor(shares * vaultBalance / totalSupply)`.
 *
 * Returns 0n at bootstrap (no shares exist — unreachable state on-chain).
 */
export function estimateWithdraw(
  shares: bigint,
  totalSupply: bigint,
  vaultBalance: bigint,
): bigint {
  if (totalSupply === 0n) return 0n
  return (shares * vaultBalance) / totalSupply
}

/**
 * Share price scaled by 1e18 for display: `floor(vaultBalance * 1e18 / totalSupply)`.
 * Returns `null` when `totalSupply === 0n` (bootstrap placeholder).
 */
export function sharePriceScaled18(totalSupply: bigint, vaultBalance: bigint): bigint | null {
  if (totalSupply === 0n) return null
  return (vaultBalance * 10n ** 18n) / totalSupply
}

/**
 * User's share of the vault in basis points: `floor(userShares * 10_000 / totalSupply)`.
 * Returns 0n at bootstrap (no shares exist).
 */
export function userShareBps(userShares: bigint, totalSupply: bigint): bigint {
  if (totalSupply === 0n) return 0n
  return (userShares * 10_000n) / totalSupply
}
