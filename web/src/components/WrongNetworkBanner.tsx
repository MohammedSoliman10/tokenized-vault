import { useAccount, useSwitchChain } from 'wagmi'

import { chains } from '../config/chains'
import { getTransactionErrorMessage } from '../lib/errors'

/**
 * Shared FR-003 guard: connected wallet sits on a chain outside the config's
 * supported set. Deposit/withdraw/faucet controls consume this to disable
 * themselves with an explanation instead of failing silently.
 */
export function useWrongNetwork(): boolean {
  const { chainId, status } = useAccount()
  return (
    status === 'connected' && chainId !== undefined && !chains.some((c) => c.id === chainId)
  )
}

/**
 * Persistent banner + "Switch network" CTA while on an unsupported network
 * (ui-contracts §2). Renders nothing on a supported chain.
 */
export function WrongNetworkBanner() {
  const wrongNetwork = useWrongNetwork()
  const { switchChainAsync, isPending, error, reset } = useSwitchChain()

  if (!wrongNetwork) return null
  const fallback = chains[0]
  if (!fallback) return null

  async function handleSwitch(): Promise<void> {
    reset()
    try {
      await switchChainAsync({ chainId: fallback.id })
    } catch {
      /* the mutation `error` below explains the failure in FR-018 wording */
    }
  }

  const supportedNames = chains.map((c) => c.name).join(' and ')

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3"
    >
      <p className="text-sm text-ink">
        Your wallet is on an unsupported network. The vault works on {supportedNames} only.
      </p>
      <div className="flex items-center gap-3">
        {error && (
          <span className="text-xs text-error">{getTransactionErrorMessage(error)}</span>
        )}
        <button
          type="button"
          onClick={() => void handleSwitch()}
          disabled={isPending}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {isPending ? 'Switching…' : 'Switch network'}
        </button>
      </div>
    </div>
  )
}
