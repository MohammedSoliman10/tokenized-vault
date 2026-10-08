import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ProviderNotFoundError, useConnect, useConnectors, type Connector } from 'wagmi'

import { getTransactionErrorMessage } from '../lib/errors'

/** Window event name for "an action control needs a wallet" (ui-contracts §1). */
const OPEN_CONNECT_EVENT = 'vault:open-connect'

/**
 * Any action control calls this while disconnected to open the wallet modal —
 * the same trigger as the header Connect button (ui-contracts §1).
 */
export function requestWalletConnect(): void {
  window.dispatchEvent(new CustomEvent(OPEN_CONNECT_EVENT))
}

interface WalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Friendly, non-raw message for connector failures (FR-018 applies to wallet errors too). */
function connectErrorMessage(error: unknown): string {
  if (error instanceof ProviderNotFoundError) {
    return 'No browser wallet detected — install a wallet extension (e.g. MetaMask) and reload.'
  }
  return getTransactionErrorMessage(error)
}

/**
 * Custom wallet modal (constitution VI — no RainbowKit/ConnectKit).
 * One row per available connector: injected always; WalletConnect only appears when
 * `VITE_REOWN_PROJECT_ID` registered it. Focus trap/Esc/ARIA come from Radix Dialog (ui-contracts §1).
 */
export function WalletModal({ open, onOpenChange }: WalletModalProps) {
  const connectors = useConnectors()
  const { connect, error, isPending, reset, status } = useConnect()
  const [pendingName, setPendingName] = useState<string | null>(null)

  // dedupe by name — multi-wallet browsers can expose several injected providers
  const entries: Connector[] = [...new Map(connectors.map((c) => [c.name, c])).values()]

  // connected → close the modal (ui-contracts §1); opening starts from a clean slate
  useEffect(() => {
    if (status === 'success') onOpenChange(false)
  }, [status, onOpenChange])

  // action controls can request the modal while disconnected (ui-contracts §1)
  useEffect(() => {
    const onOpenRequest = () => onOpenChange(true)
    window.addEventListener(OPEN_CONNECT_EVENT, onOpenRequest)
    return () => window.removeEventListener(OPEN_CONNECT_EVENT, onOpenRequest)
  }, [onOpenChange])

  function handleOpenChange(next: boolean) {
    if (next) {
      setPendingName(null)
      reset()
    }
    onOpenChange(next)
  }

  function handleConnect(connector: Connector) {
    setPendingName(connector.name)
    connect({ connector })
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim/70" />
        <Dialog.Content
          aria-label="Connect wallet"
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-edge bg-surface-raised p-6 shadow-xl focus:outline-none"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-ink">
                Connect wallet
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                Pick a wallet to connect. Vault stats stay readable without one.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="rounded p-1 text-ink-muted transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ✕
            </Dialog.Close>
          </div>

          <ul className="mt-4 space-y-2">
            {entries.map((connector) => {
              const connecting = isPending && pendingName === connector.name
              return (
                <li key={connector.uid}>
                  <button
                    type="button"
                    onClick={() => handleConnect(connector)}
                    disabled={isPending}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-edge-strong bg-surface-overlay px-4 py-3 text-left text-ink transition-colors hover:border-accent disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="font-medium">{connector.name}</span>
                    {connecting ? (
                      <span
                        aria-hidden
                        className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
                      />
                    ) : (
                      <span aria-hidden className="text-ink-muted">
                        →
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {isPending && pendingName && (
            <p role="status" className="mt-3 text-sm text-ink">
              Connecting to {pendingName}…
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-error/40 bg-error-soft px-3 py-2 text-sm text-error"
            >
              <span>{connectErrorMessage(error)}</span>
              <button
                type="button"
                onClick={() => {
                  reset()
                  setPendingName(null)
                }}
                className="ml-2 underline hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Retry
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
