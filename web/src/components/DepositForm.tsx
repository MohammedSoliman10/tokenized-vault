import { useState } from 'react'
import { parseUnits } from 'viem'
import { useAccount } from 'wagmi'

import { useDeposit } from '../hooks/useDeposit'
import { useTokenBalance } from '../hooks/useTokenBalance'
import { useVaultStats } from '../hooks/useVaultStats'
import { DEAD_SHARES, estimateShares } from '../lib/vaultMath'
import { formatTokenAmountExact } from '../lib/format'
import { requestWalletConnect } from './WalletModal'
import { useWrongNetwork } from './WrongNetworkBanner'

type Parsed = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; value: bigint }

function parseAmount(value: string): Parsed {
  const trimmed = value.trim()
  if (trimmed === '') return { kind: 'empty' }
  try {
    return { kind: 'ok', value: parseUnits(trimmed, 18) }
  } catch {
    return { kind: 'invalid' }
  }
}

/** Inline pre-tx guard messages (FR-013/FR-014 — §4 wording, base units spelled out). */
function guardMessage(
  parsed: Parsed,
  balance: bigint | null,
  atBootstrap: boolean,
): string | null {
  if (parsed.kind === 'invalid') return 'Enter a valid token amount (up to 18 decimal places).'
  if (parsed.kind === 'empty') return null
  const amount = parsed.value
  if (amount === 0n) return 'Enter an amount greater than zero.'
  if (balance !== null && amount > balance) {
    return 'Insufficient token balance — claim test tokens from the faucet or try a smaller amount.'
  }
  if (atBootstrap && amount <= DEAD_SHARES) {
    // FR-014: exact chain-interface §4 AmountTooSmall wording — BASE UNITS, not tokens.
    return 'The first deposit must be more than 1000 base units. Dead shares (1000) protect against inflation attacks.'
  }
  return null
}

export function DepositForm() {
  const { status, error, outcome, deposit, reset } = useDeposit()
  const stats = useVaultStats()
  const token = useTokenBalance()
  const { address } = useAccount()
  const wrongNetwork = useWrongNetwork()
  const [input, setInput] = useState('')

  const connected = address !== undefined
  const parsed = parseAmount(input)
  const amount = parsed.kind === 'ok' ? parsed.value : null
  // The balance guard is meaningful only for a connected account — while
  // disconnected the zero-address read would mask the base-units rule.
  const guard = guardMessage(parsed, connected ? token.balance : null, stats.atBootstrap)
  const pending = status === 'approving' || status === 'depositing'
  const disabled = wrongNetwork || !stats.deployed

  // FR-010 — live share estimate as the user types (bootstrap small amounts throw → guard shows)
  let estimate: bigint | null = null
  if (amount !== null && amount > 0n && stats.totalShares !== null && stats.tvl !== null) {
    try {
      estimate = estimateShares(amount, stats.totalShares, stats.tvl)
    } catch {
      estimate = null
    }
  }

  // Step indicator: approve is skipped when allowance already covers the amount (FR-011)
  const approveNeeded = amount !== null && amount > 0n && (token.allowance ?? 0n) < amount
  const approveState =
    status === 'approving'
      ? 'active'
      : status === 'depositing' || status === 'success'
        ? 'done'
        : amount !== null && amount > 0n && !approveNeeded
          ? 'skip'
          : 'idle'

  const canDeposit =
    connected &&
    !disabled &&
    !pending &&
    guard === null &&
    amount !== null &&
    amount > 0n &&
    token.balance !== null && // FR-020: detect insufficient balance before submission
    status !== 'success'

  function submit(): void {
    if (!canDeposit || amount === null) return
    void deposit(amount)
  }

  const stepClass = (state: string): string =>
    state === 'active'
      ? 'text-accent'
      : state === 'done'
        ? 'text-emerald-400'
        : state === 'skip'
          ? 'text-gray-600 line-through'
          : 'text-gray-500'

  return (
    <section
      aria-labelledby="deposit-heading"
      className="rounded-xl border border-edge bg-surface-raised p-4"
    >
      <h2 id="deposit-heading" className="text-sm font-semibold text-white">
        Deposit
      </h2>
      <p className="mt-1 text-xs text-gray-400">Tokens in → shares out (approve, then deposit).</p>

      <label className="mt-3 block text-xs text-gray-400" htmlFor="deposit-amount">
        Token amount
      </label>
      <input
        id="deposit-amount"
        type="text"
        inputMode="decimal"
        placeholder="0.0"
        value={input}
        disabled={disabled || pending}
        onChange={(event) => setInput(event.target.value)}
        className="mt-1 w-full rounded-lg border border-edge bg-surface-overlay px-3 py-2 text-sm text-white placeholder:text-gray-600 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />

      <p className="mt-2 min-h-4 text-xs text-gray-400" aria-live="polite">
        {estimate !== null && estimate > 0n
          ? `≈ ${formatTokenAmountExact(estimate)} shares`
          : amount !== null && amount > 0n && estimate === 0n
            ? 'That amount rounds to zero shares — try a larger amount.'
            : '\u00A0'}
      </p>

      {guard && (
        <p role="alert" className="mt-1 text-xs text-amber-300">
          {guard}
        </p>
      )}
      {disabled && (
        <p className="mt-1 text-xs text-gray-500">
          {wrongNetwork
            ? 'Switch your wallet to a supported network to deposit.'
            : 'Vault is not deployed on this network.'}
        </p>
      )}

      {/* Approve → Deposit step indicator (FR-012) */}
      <ol className="mt-3 flex items-center gap-2 text-xs" aria-label="Deposit steps">
        <li className={stepClass(approveState)}>
          1. Approve
          {status === 'approving' && (
            <span
              aria-hidden
              className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent align-[-2px]"
            />
          )}
        </li>
        <li aria-hidden className="text-gray-600">
          →
        </li>
        <li className={stepClass(status === 'depositing' ? 'active' : status === 'success' ? 'done' : 'idle')}>
          2. Deposit
          {status === 'depositing' && (
            <span
              aria-hidden
              className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent align-[-2px]"
            />
          )}
        </li>
        {amount !== null && amount > 0n && approveState === 'skip' && (
          <li className="ml-auto text-gray-600">approval not needed</li>
        )}
      </ol>

      {!connected ? (
        <button
          type="button"
          onClick={requestWalletConnect}
          className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Connect wallet to deposit
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!canDeposit}
          className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {status === 'approving'
            ? 'Approving…'
            : status === 'depositing'
              ? 'Depositing…'
              : 'Deposit'}
        </button>
      )}

      {/* Receipt-confirmed success (SC-005 — amounts from the Deposit event) */}
      {status === 'success' && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
        >
          {outcome
            ? `Deposited ${formatTokenAmountExact(outcome.amount)} tokens → minted ${formatTokenAmountExact(outcome.shares)} shares.`
            : 'Deposit confirmed.'}
          <button
            type="button"
            onClick={reset}
            className="ml-2 underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* FR-018 — decoded friendly messages only, never raw reverts */}
      {status === 'error' && error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {error}
          <button
            type="button"
            onClick={reset}
            className="ml-2 underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* FR-019 — neutral cancellation, distinct from failure */}
      {status === 'cancelled' && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-edge bg-surface-overlay px-3 py-2 text-xs text-gray-300"
        >
          Transaction cancelled — no changes were made.
          <button
            type="button"
            onClick={reset}
            className="ml-2 underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  )
}
