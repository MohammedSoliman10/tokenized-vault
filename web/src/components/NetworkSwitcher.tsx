import { useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'

import { chains } from '../config/chains'
import { getTransactionErrorMessage } from '../lib/errors'

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function getInjectedProvider(): Eip1193Provider | null {
  return (window as { ethereum?: Eip1193Provider }).ethereum ?? null
}

/** Ask the wallet to add a chain it doesn't know yet (wallet_addEthereumChain). */
async function addChainToWallet(chain: (typeof chains)[number]): Promise<void> {
  const provider = getInjectedProvider()
  if (!provider) throw new Error('No browser wallet available to add the network.')
  const rpcUrl = chain.rpcUrls.default.http[0]
  if (!rpcUrl) throw new Error(`No RPC URL configured for ${chain.name}.`)
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: `0x${chain.id.toString(16)}`,
        chainName: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: [rpcUrl],
      },
    ],
  })
}

/** Detect "wallet doesn't know this chain" (e.g. MetaMask code 4902) across the cause chain. */
function isUnknownChainError(error: unknown): boolean {
  let text = ''
  let current: unknown = error
  for (let i = 0; i < 10 && current instanceof Error; i += 1) {
    const code = (current as { code?: unknown }).code
    text += ` ${String(current)} ${code ?? ''}`
    current = (current as { cause?: unknown }).cause
  }
  return /unrecognized|not been added|unknown chain|wallet doesn't know|4902/i.test(text)
}

/**
 * Two-chain switcher (ui-contracts §2): Anvil + Sepolia, nothing else.
 * If the wallet doesn't know the target chain it is added first, then switched to.
 */
export function NetworkSwitcher() {
  const { chainId, status } = useAccount()
  const { switchChainAsync, isPending } = useSwitchChain()
  const [switchingId, setSwitchingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const connected = status === 'connected'

  async function handleSwitch(target: (typeof chains)[number]): Promise<void> {
    if (!connected) return
    setError(null)
    setSwitchingId(target.id)
    try {
      await switchChainAsync({ chainId: target.id })
    } catch (err) {
      if (isUnknownChainError(err)) {
        try {
          await addChainToWallet(target)
          await switchChainAsync({ chainId: target.id })
        } catch (retryErr) {
          setError(getTransactionErrorMessage(retryErr))
        }
      } else {
        setError(getTransactionErrorMessage(err))
      }
    } finally {
      setSwitchingId(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div
        role="group"
        aria-label="Network"
        className="flex rounded-full border border-edge bg-surface-overlay p-1"
      >
        {chains.map((chain) => {
          const active = chainId === chain.id
          const busy = isPending && switchingId === chain.id
          return (
            <button
              key={chain.id}
              type="button"
              aria-pressed={active}
              disabled={!connected || isPending}
              onClick={() => void handleSwitch(chain)}
              className={
                active
                  ? 'flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70'
                  : 'flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70'
              }
            >
              {busy && (
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
                />
              )}
              {chain.name}
            </button>
          )
        })}
      </div>
      {!connected && (
        <p className="text-xs text-gray-500">Connect a wallet to switch networks.</p>
      )}
      {error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
