import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'

import { ACTIVITY_ERROR, useActivity } from '../hooks/useActivity'
import { useActiveChainId } from '../hooks/useVaultStats'
import type { ActivityEntry } from '../hooks/useActivity'
import { SEPOLIA_CHAIN_ID } from '../lib/chainId'
import { formatRelativeTime, formatTokenAmountExact } from '../lib/format'

/** FR-022: explorer link only for Sepolia — Anvil rows are plain text, never a dead link. */
const EXPLORER_CHAIN_ID = SEPOLIA_CHAIN_ID
const EXPLORER_TX_BASE = 'https://sepolia.etherscan.io/tx/'

/** Relative times age without a reload (ui-contracts §7 / US5.4). */
const TIME_TICK_MS = 30_000

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`
}

function TxCell({ entry, chainId }: { entry: ActivityEntry; chainId: number }) {
  if (chainId === EXPLORER_CHAIN_ID) {
    return (
      <a
        href={`${EXPLORER_TX_BASE}${entry.transactionHash}`}
        target="_blank"
        rel="noreferrer noopener"
        className="font-mono text-accent underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {shortHash(entry.transactionHash)}
      </a>
    )
  }
  // Local network (31337): plain hash text — FR-022 "never a dead/broken link".
  return (
    <span className="font-mono text-ink-muted" title={entry.transactionHash}>
      {shortHash(entry.transactionHash)}
    </span>
  )
}

/**
 * Activity feed (ui-contracts §7 / FR-021..FR-023): newest 20 Deposit/Withdraw rows,
 * connected user's rows highlighted, live-updated via the T030 hook. A failed fetch
 * shows an inline retry without blanking rows already on screen.
 */
export function ActivityFeed() {
  const { status, entries, retry } = useActivity()
  const { address } = useAccount()
  const chainId = useActiveChainId()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TIME_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const connectedAddress = address?.toLowerCase()

  return (
    <section aria-labelledby="activity-heading" className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2
          id="activity-heading"
          className="text-xs font-semibold uppercase tracking-wider text-ink-muted"
        >
          Recent activity
        </h2>
        <span className="text-xs text-ink-muted">Newest 20 deposits and withdrawals</span>
      </div>

      {status === 'unavailable' ? (
        <p className="rounded-xl border border-edge bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted shadow-sm">
          Vault contracts are not deployed on this network yet.
        </p>
      ) : (
        <>
          {/* FR-023 edge case: inline error + retry, rows above stay visible */}
          {status === 'error' && (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-error/40 bg-error-soft px-3 py-2 text-xs text-error"
            >
              <span>{ACTIVITY_ERROR}</span>
              <button
                type="button"
                onClick={retry}
                className="rounded border border-error/50 px-2 py-1 font-medium hover:bg-error/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Retry
              </button>
            </div>
          )}

          {entries.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-edge bg-surface-raised shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Vault deposit and withdrawal activity, newest first</caption>
                <thead>
                  <tr className="border-b border-edge text-xs text-ink-muted">
                    <th scope="col" className="px-3 py-2 font-medium">Type</th>
                    <th scope="col" className="px-3 py-2 font-medium">Account</th>
                    <th scope="col" className="px-3 py-2 font-medium">Amount (tokens)</th>
                    <th scope="col" className="px-3 py-2 font-medium">Shares</th>
                    <th scope="col" className="px-3 py-2 font-medium">Time</th>
                    <th scope="col" className="px-3 py-2 font-medium">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isSelf =
                      connectedAddress !== undefined &&
                      entry.account.toLowerCase() === connectedAddress
                    return (
                      <tr
                        key={`${entry.transactionHash}-${entry.logIndex}`}
                        className={`border-b border-edge/60 last:border-b-0 ${
                          isSelf ? 'border-l-2 border-l-accent bg-accent-soft' : ''
                        }`}
                      >
                        <td className="px-3 py-2">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-xs ${
                              entry.type === 'Deposit'
                                ? 'border-success/40 text-success'
                                : 'border-accent/40 text-accent'
                            }`}
                          >
                            {entry.type}
                          </span>
                        </td>
                        <td
                          className={`px-3 py-2 font-mono text-xs ${
                            isSelf ? 'text-ink' : 'text-ink-muted'
                          }`}
                          title={entry.account}
                        >
                          {isSelf ? 'you' : ''}{' '}
                          {`${entry.account.slice(0, 6)}…${entry.account.slice(-4)}`}
                        </td>
                        <td className="px-3 py-2 text-ink">
                          {formatTokenAmountExact(entry.amount)}
                        </td>
                        <td className="px-3 py-2 text-ink">
                          {formatTokenAmountExact(entry.shares)}
                        </td>
                        <td className="px-3 py-2 text-ink-muted">
                          {entry.timestamp !== null ? formatRelativeTime(entry.timestamp, now) : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <TxCell entry={entry} chainId={chainId} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : status === 'loading' ? (
            <p className="rounded-xl border border-edge bg-surface-raised px-4 py-6 text-center text-sm text-ink-muted shadow-sm">
              Loading activity…
            </p>
          ) : status === 'ready' ? (
            <p className="rounded-xl border border-edge bg-surface-raised px-4 py-6 text-center text-sm text-ink-muted shadow-sm">
              No activity yet — deposits and withdrawals will appear here.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
