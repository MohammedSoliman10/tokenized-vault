import { useAccount } from 'wagmi'

import { useVaultStats } from '../hooks/useVaultStats'
import { formatTokenAmount } from '../lib/format'

interface StatCardProps {
  label: string
  value?: string
  placeholder?: string
  hint?: string
}

/** Never renders NaN/0 pretending to be real: falls back to a labeled placeholder. */
function StatCard({ label, value, placeholder, hint }: StatCardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-edge bg-surface-raised px-4 py-3">
      <p className="truncate text-xs text-gray-400">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-white">
        {value ?? (
          <span className="text-sm font-normal text-gray-500">{placeholder ?? '—'}</span>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

/** Basis points → "12.34%" with pure bigint math (no float). */
function pctText(bps: bigint): string {
  const whole = bps / 100n
  const frac = bps % 100n
  return `${whole}.${frac.toString().padStart(2, '0')}%`
}

/**
 * The six dashboard stats (FR-008, ui-contracts §3).
 * Public rows render read-only while disconnected; "your" rows show a connect
 * prompt instead of zeros. Bootstrap vault explains why share price / % are blank.
 */
export function StatsGrid() {
  const { address } = useAccount()
  const stats = useVaultStats()
  const { deployed, isLoading, isFetching, error } = stats
  const connected = address !== undefined

  const publicValue = (value: bigint | null, decimals?: number): string | undefined =>
    value !== null ? formatTokenAmount(value, decimals) : undefined

  const userPlaceholder = 'Connect wallet'

  return (
    <section aria-labelledby="dashboard-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2
          id="dashboard-heading"
          className="text-xs font-semibold uppercase tracking-wider text-gray-400"
        >
          Dashboard
        </h2>
        <div className="flex items-center gap-3 text-xs">
          {deployed && isFetching && !isLoading && (
            <span className="text-gray-500" aria-live="polite">
              updating…
            </span>
          )}
          {error && (
            <span role="alert" className="text-red-300">
              {error}
            </span>
          )}
        </div>
      </div>

      {!deployed ? (
        <p className="rounded-xl border border-edge bg-surface-raised px-4 py-8 text-center text-sm text-gray-400">
          Vault contracts are not deployed on this network yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Total value locked (tokens)"
            value={publicValue(stats.tvl)}
            placeholder={isLoading ? 'Loading…' : undefined}
          />
          <StatCard
            label="Total shares"
            value={publicValue(stats.totalShares)}
            placeholder={isLoading ? 'Loading…' : undefined}
          />
          <StatCard
            label="Share price (tokens/share)"
            value={
              stats.atBootstrap
                ? undefined
                : publicValue(stats.sharePriceScaled18, 18)
            }
            placeholder={stats.atBootstrap ? 'Not set yet' : isLoading ? 'Loading…' : undefined}
            hint={stats.atBootstrap ? 'Share price appears after the first deposit.' : undefined}
          />
          <StatCard
            label="Your shares"
            value={connected ? publicValue(stats.userShares) : undefined}
            placeholder={connected ? undefined : userPlaceholder}
          />
          <StatCard
            label="Your token balance (tokens)"
            value={connected ? publicValue(stats.userTokenBalance) : undefined}
            placeholder={connected ? undefined : userPlaceholder}
          />
          <StatCard
            label="Your % of vault"
            value={
              connected && !stats.atBootstrap && stats.userPctBps !== null
                ? pctText(stats.userPctBps)
                : undefined
            }
            placeholder={
              !connected
                ? userPlaceholder
                : stats.atBootstrap
                  ? 'Not set yet'
                  : isLoading
                    ? 'Loading…'
                    : undefined
            }
            hint={
              connected && stats.atBootstrap ? 'Your share appears after the first deposit.' : undefined
            }
          />
        </div>
      )}
    </section>
  )
}
