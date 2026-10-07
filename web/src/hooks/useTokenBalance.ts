import { useVaultStats } from './useVaultStats'

/**
 * Thin selector over the single `useVaultStats` snapshot (T021): token balance +
 * allowance only. Because React Query dedupes identical query keys, any component
 * using this hook shares ONE fetch path and ONE invalidation path (`refetch`) with
 * the dashboard — no duplicate reads to keep in sync.
 */
export function useTokenBalance() {
  const stats = useVaultStats()
  return {
    /** ERC20.balanceOf(account) — null before first read / not deployed. */
    balance: stats.userTokenBalance,
    /** ERC20.allowance(account, vault) — feeds the approve-then-deposit decision (FR-011). */
    allowance: stats.allowance,
    isLoading: stats.isLoading,
    isFetching: stats.isFetching,
    /** The shared invalidation path: call after receipts (FR-009). */
    refetch: stats.refetch,
  }
}
