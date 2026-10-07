import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'

import { useFaucetClaim } from '../hooks/useFaucetClaim'
import { useVaultStats } from '../hooks/useVaultStats'
import { formatTokenAmount } from '../lib/format'
import { requestWalletConnect } from './WalletModal'
import { useWrongNetwork } from './WrongNetworkBanner'

/** Seconds-level cooldown text: "7h 59m 59s" / "12m 05s" / "45s". */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}h ${mm}m ${ss}s` : `${minutes}m ${ss}s`
}

/**
 * Faucet panel (ui-contracts §6): available → claiming → success | cooldown.
 * The cooldown ticks every second against `nextClaimAt`, so the button re-enables
 * the moment the window expires — no reload (edge case, FR-006).
 */
export function FaucetPanel() {
  const { status, error, outcome, claim, reset } = useFaucetClaim()
  const stats = useVaultStats()
  const { address } = useAccount()
  const wrongNetwork = useWrongNetwork()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const connected = address !== undefined
  const pending = status === 'claiming'
  const disabled = wrongNetwork || !stats.deployed

  const nextClaimAt = stats.nextClaimAt ?? 0n
  const remainingMs = Number(nextClaimAt) * 1000 - now
  const inCooldown =
    connected && !wrongNetwork && nextClaimAt > 0n && remainingMs > 0 && stats.deployed

  const buttonDisabled = disabled || pending || inCooldown

  return (
    <section
      aria-labelledby="faucet-heading"
      className="rounded-xl border border-edge bg-surface-raised p-4"
    >
      <h2 id="faucet-heading" className="text-sm font-semibold text-white">
        Faucet
      </h2>
      <p className="mt-1 text-xs text-gray-400">
        1000 free test tokens per address every 24 hours.
      </p>

      {inCooldown && (
        <p
          className="mt-3 text-xs text-amber-300"
          aria-describedby="faucet-cooldown-value"
        >
          Cooldown active — faucet ready in{' '}
          <span id="faucet-cooldown-value" className="font-mono">
            {formatRemaining(remainingMs)}
          </span>
        </p>
      )}

      {disabled && (
        <p className="mt-3 text-xs text-gray-500">
          {wrongNetwork
            ? 'Switch your wallet to a supported network to claim.'
            : 'Vault is not deployed on this network.'}
        </p>
      )}

      {!connected ? (
        <button
          type="button"
          onClick={requestWalletConnect}
          className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Connect wallet to claim
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void claim()}
          disabled={buttonDisabled}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {pending && (
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            />
          )}
          {pending ? 'Claiming…' : inCooldown ? 'Cooldown' : 'Claim 1000 tokens'}
        </button>
      )}

      {/* Receipt-confirmed success (SC-005 — amount from the Claimed event) */}
      {status === 'success' && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
        >
          {outcome
            ? `Claimed ${formatTokenAmount(outcome.amount)} tokens — balance updated.`
            : 'Claim confirmed.'}
          <button
            type="button"
            onClick={reset}
            className="ml-2 underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* FR-018 — decoded friendly messages only (CooldownActive → countdown copy) */}
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

      {/* FR-019 — neutral cancellation, cooldown untouched */}
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
