/**
 * Chain pinning (constitution: networks 31337 / 11155111 ONLY).
 *
 * Every read path must target the WALLET's active chain: wagmi falls back to
 * `config.state.chainId`, which goes stale when the wallet switches networks
 * outside the dapp (FR-002/FR-003). Narrowing the active id to this union at
 * the call sites keeps client/contract reads pinned to a configured chain and
 * yields `undefined` (config default, and reads disabled) for anything else.
 */
export type SupportedChainId = 31337 | 11155111

export const ANVIL_CHAIN_ID = 31337
export const SEPOLIA_CHAIN_ID = 11155111

/** Narrow a raw chain id to the configured set, else undefined (never a foreign chain). */
export function supportedChainId(chainId: number): SupportedChainId | undefined {
  if (chainId === ANVIL_CHAIN_ID) return ANVIL_CHAIN_ID
  if (chainId === SEPOLIA_CHAIN_ID) return SEPOLIA_CHAIN_ID
  return undefined
}
