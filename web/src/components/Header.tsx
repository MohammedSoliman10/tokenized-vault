import { useEffect, useRef, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'

import { chains } from '../config/chains'
import { truncateAddress } from '../lib/format'
import { WalletModal } from './WalletModal'

/**
 * Top bar: brand, network indicator, and wallet controls.
 * Disconnected → "Connect" opens the custom modal (ui-contracts §1);
 * connected → truncated address + account menu with Disconnect.
 */
export function Header() {
  const { address, chain, chainId, status } = useAccount()
  const { disconnect } = useDisconnect()
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const connected = status === 'connected' && address !== undefined
  const supported = chainId !== undefined && chains.some((c) => c.id === chainId)

  // account menu: Esc + outside click close it
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-surface-raised/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <span className="text-base font-semibold tracking-tight text-white">
          Tokenized Vault
        </span>

        <div className="flex items-center gap-3">
          {connected && (
            <span
              className={
                supported
                  ? 'hidden items-center gap-2 rounded-full border border-edge bg-surface-overlay px-3 py-1 text-xs text-gray-300 sm:flex'
                  : 'flex items-center gap-2 rounded-full border border-red-500/50 bg-red-500/10 px-3 py-1 text-xs text-red-300'
              }
            >
              <span
                aria-hidden
                className={
                  supported ? 'h-2 w-2 rounded-full bg-emerald-400' : 'h-2 w-2 rounded-full bg-red-400'
                }
              />
              {supported && chain ? chain.name : 'Unsupported network'}
            </span>
          )}

          {connected && address !== undefined && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="rounded-full border border-edge bg-surface-overlay px-3 py-1 font-mono text-xs text-white transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {truncateAddress(address)}
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Account"
                  className="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-edge bg-surface-raised p-1 shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      disconnect()
                    }}
                    className="w-full rounded px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-surface-overlay focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          )}

          {!connected && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <WalletModal open={modalOpen} onOpenChange={setModalOpen} />
    </header>
  )
}
