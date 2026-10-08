import { useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useAccount } from 'wagmi'

import { useVaultStats } from '../hooks/useVaultStats'
import { useWithdraw } from '../hooks/useWithdraw'
import { formatTokenAmountExact } from '../lib/format'
import { estimateWithdraw } from '../lib/vaultMath'
import { requestWalletConnect } from './WalletModal'
import { useWrongNetwork } from './WrongNetworkBanner'

type Parsed = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; value: bigint }

function parseShares(value: string): Parsed {
  const trimmed = value.trim()
  if (trimmed === '') return { kind: 'empty' }
  try {
    return { kind: 'ok', value: parseUnits(trimmed, 18) }
  } catch {
    return { kind: 'invalid' }
  }
}

/** Inline pre-tx guards (FR-017 — zero and over-balance blocked before any tx). */
function guardMessage(parsed: Parsed, userShares: bigint | null): string | null {
  if (parsed.kind === 'invalid') return 'Enter a valid share amount (up to 18 decimal places).'
  if (parsed.kind === 'empty') return null
  const shares = parsed.value
  if (shares === 0n) return 'Enter an amount greater than zero.'
  if (userShares !== null && shares > userShares) {
    return `Amount exceeds your share balance — you can withdraw up to ${formatTokenAmountExact(userShares)} shares.`
  }
  return null
}

export function WithdrawForm() {
  const { status, error, outcome, withdraw, reset } = useWithdraw()
  const stats = useVaultStats()
  const { address } = useAccount()
  const wrongNetwork = useWrongNetwork()
  const [input, setInput] = useState('')

  const connected = address !== undefined
  const parsed = parseShares(input)
  const shares = parsed.kind === 'ok' ? parsed.value : null
  const guard = guardMessage(parsed, stats.userShares)
  const pending = status === 'withdrawing'
  const disabled = wrongNetwork || !stats.deployed

  // FR-015 — live token estimate, floor math (vaultMath.estimateWithdraw)
  let estimate: bigint | null = null
  if (shares !== null && shares > 0n && stats.totalShares !== null && stats.tvl !== null) {
    estimate = estimateWithdraw(shares, stats.totalShares, stats.tvl)
  }
  const roundsToZero = estimate === 0n && shares !== null && shares > 0n

  const canWithdraw =
    connected &&
    !disabled &&
    !pending &&
    guard === null &&
    !roundsToZero &&
    shares !== null &&
    shares > 0n &&
    stats.userShares !== null &&
    status !== 'success'

  function submit(): void {
    if (!canWithdraw || shares === null) return
    void withdraw(shares)
  }

  function fillMax(): void {
    if (stats.userShares === null) return
    setInput(formatUnits(stats.userShares, 18))
  }

  return (
    <section
      aria-labelledby="withdraw-heading"
      className="rounded-xl border border-edge bg-surface-raised p-4 shadow-sm"
    >
      <h2 id="withdraw-heading" className="text-sm font-semibold text-ink">
        Withdraw
      </h2>
      <p className="mt-1 text-xs text-ink-muted">Shares in → tokens out (no approval needed).</p>

      <label className="mt-3 block text-xs text-ink-muted" htmlFor="withdraw-amount">
        Share amount
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="withdraw-amount"
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={input}
          disabled={disabled || pending}
          onChange={(event) => setInput(event.target.value)}
          className="w-full min-w-0 rounded-lg border border-edge-strong bg-surface-overlay px-3 py-2 text-sm text-ink placeholder:text-ink-muted disabled:bg-disabled-bg disabled:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="button"
          onClick={fillMax}
          disabled={disabled || pending || !connected || stats.userShares === null}
          className="shrink-0 rounded-lg border border-edge-strong bg-surface-overlay px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:bg-disabled-bg disabled:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Max
        </button>
      </div>

      <p className="mt-2 min-h-4 text-xs text-ink-muted" aria-live="polite">
        {estimate !== null && estimate > 0n
          ? `≈ ${formatTokenAmountExact(estimate)} tokens`
          : roundsToZero
            ? 'That amount rounds to zero shares — try a larger amount.'
            : '\u00A0'}
      </p>

      {guard && (
        <p role="alert" className="mt-1 text-xs text-warning">
          {guard}
        </p>
      )}
      {disabled && (
        <p className="mt-1 text-xs text-ink-muted">
          {wrongNetwork
            ? 'Switch your wallet to a supported network to withdraw.'
            : 'Vault is not deployed on this network.'}
        </p>
      )}

      {!connected ? (
        <button
          type="button"
          onClick={requestWalletConnect}
          className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover active:bg-accent-pressed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Connect wallet to withdraw
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!canWithdraw}
          className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {pending ? 'Withdrawing…' : 'Withdraw'}
        </button>
      )}

      {/* Receipt-confirmed success (SC-005 — amounts from the Withdraw event) */}
      {status === 'success' && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-xs text-success"
        >
          {outcome
            ? `Withdrew ${formatTokenAmountExact(outcome.shares)} shares → received ${formatTokenAmountExact(outcome.amount)} tokens.`
            : 'Withdraw confirmed.'}
          <button
            type="button"
            onClick={reset}
            className="ml-2 underline hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* FR-018 — decoded friendly messages only, never raw reverts */}
      {status === 'error' && error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-error/40 bg-error-soft px-3 py-2 text-xs text-error"
        >
          {error}
          <button
            type="button"
            onClick={reset}
            className="ml-2 underline hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* FR-019 — neutral cancellation, distinct from failure */}
      {status === 'cancelled' && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-edge bg-section px-3 py-2 text-xs text-ink-muted"
        >
          Transaction cancelled — no changes were made.
          <button
            type="button"
            onClick={reset}
            className="ml-2 underline hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  )
}
