import { fallback, http } from 'viem'
import { anvil, sepolia } from 'wagmi/chains'

/** Supported chains only (constitution): Anvil 31337 + Sepolia 11155111. */
export const chains = [anvil, sepolia] as const

/**
 * Transports — addresses/URLs from env/config only, never hardcoded in components.
 * Anvil: fixed local URL (not a secret).
 * Sepolia: configured URL first (optional VITE_SEPOLIA_RPC_URL), public RPC fallback
 * when unset — viem's `fallback` also failovers at runtime (research D13).
 */
export const transports = {
  [anvil.id]: http('http://127.0.0.1:8545'),
  [sepolia.id]: fallback([
    http(import.meta.env.VITE_SEPOLIA_RPC_URL),
    http('https://ethereum-sepolia-rpc.publicnode.com'),
  ]),
}
