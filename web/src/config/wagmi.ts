import { createConfig } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'

import { chains, transports } from './chains'

const reownProjectId = import.meta.env.VITE_REOWN_PROJECT_ID

/**
 * Plain wagmi connectors ONLY (constitution VI) — no RainbowKit/ConnectKit.
 * `injected()` always; `walletConnect()` only when VITE_REOWN_PROJECT_ID is configured.
 */
export const config = createConfig({
  chains,
  transports,
  connectors: [injected(), ...(reownProjectId ? [walletConnect({ projectId: reownProjectId })] : [])],
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
