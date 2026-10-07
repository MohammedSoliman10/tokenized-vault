import { useAccount, useChainId, useReadContracts } from 'wagmi'
import type { Address } from 'viem'

import { erc20Abi } from '../abi/ERC20'
import { faucetTokenAbi } from '../abi/FaucetToken'
import { vaultAbi } from '../abi/Vault'
import deploymentsJson from '../config/deployments.json'
import { sharePriceScaled18, userSharePct1e4 } from '../lib/vaultMath'

/** Address/URLs come from config only (constitution V / FR-028). */
export interface DeploymentEntry {
  faucetToken: Address
  vault: Address
  deployBlock: number
}

const deployments = deploymentsJson as Partial<Record<string, DeploymentEntry>>

/** Config lookup shared by read + write hooks — one address source (FR-028). */
export function getDeployment(chainId: number): DeploymentEntry | undefined {
  return deployments[String(chainId)]
}

/**
 * Chain every read/write targets: the wallet's actual chain when connected,
 * otherwise the config's current chain. Guards against a wallet switching
 * networks outside the dapp — addresses and reads must follow the real chain
 * (FR-002/FR-003), not a stale config value.
 */
export function useActiveChainId(): number {
  const { chainId } = useAccount()
  const fallbackChainId = useChainId()
  return chainId ?? fallbackChainId
}

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'

/** One multicall result slot → bigint, or null when absent/failed (never a fake 0). */
function readBigint(slot: { status: string; result?: unknown } | undefined): bigint | null {
  if (!slot || slot.status !== 'success') return null
  return typeof slot.result === 'bigint' ? slot.result : null
}

export interface VaultStatsSnapshot {
  /** false when this chain is missing from deployments.json → "not deployed" UI (FR-028). */
  deployed: boolean
  /** The six dashboard stats (FR-008). null = not loaded or not deployed. */
  tvl: bigint | null
  totalShares: bigint | null
  /** tokens per share scaled 1e18; null at bootstrap — never a fake 0. */
  sharePriceScaled18: bigint | null
  userShares: bigint | null
  userTokenBalance: bigint | null
  /** user's percent of the vault scaled 1e4 (0.0999% → 999); denominator includes dead shares; null at bootstrap or before first read. */
  userPct1e4: bigint | null
  /** Supporting reads consumed by later flows: allowance (T023), faucet cooldown (T028). */
  allowance: bigint | null
  nextClaimAt: bigint | null
  /** Confirmed empty vault (totalShares === 0) — drives bootstrap placeholders. */
  atBootstrap: boolean
  /** First load in flight (nothing to show yet). */
  isLoading: boolean
  /** Background refetch in flight — previous values stay visible (SC-002, no blanking). */
  isFetching: boolean
  /** Non-raw load failure message (FR-018 wording discipline). */
  error: string | null
  /**
   * The single invalidation path (FR-009): call after every confirmed transaction
   * to refresh this snapshot for all selectors built on it.
   */
  refetch: () => void
}

const READ_ERROR = 'Could not load vault statistics - check your connection and retry.'

/**
 * One `useReadContracts` multicall (research D9) feeding every dashboard value.
 * Account or network change alters the query key (FR-009); background polling plus
 * `refetch()` keep data fresh while React Query keeps the previous snapshot visible.
 */
export function useVaultStats(): VaultStatsSnapshot {
  const { address } = useAccount()
  const chainId = useActiveChainId()
  const entry = deployments[String(chainId)]
  const actor: Address = address ?? ZERO_ADDRESS
  const vault: Address = entry?.vault ?? ZERO_ADDRESS
  const token: Address = entry?.faucetToken ?? ZERO_ADDRESS
  const deployed = entry !== undefined

  const { data, error, isLoading, isFetching, refetch } = useReadContracts({
    contracts: [
      { address: vault, abi: vaultAbi, functionName: 'totalSupply' },
      { address: vault, abi: vaultAbi, functionName: 'balanceOf', args: [actor] },
      { address: token, abi: erc20Abi, functionName: 'balanceOf', args: [vault] },
      { address: token, abi: erc20Abi, functionName: 'balanceOf', args: [actor] },
      { address: token, abi: erc20Abi, functionName: 'allowance', args: [actor, vault] },
      { address: token, abi: faucetTokenAbi, functionName: 'nextClaimAt', args: [actor] },
    ],
    query: {
      enabled: deployed,
      refetchInterval: 4_000,
    },
  })

  const [totalSupplySlot, userSharesSlot, vaultBalanceSlot, userBalanceSlot, allowanceSlot, nextClaimSlot] =
    data ?? []

  const totalShares = readBigint(totalSupplySlot)
  const userShares = readBigint(userSharesSlot)
  const tvl = readBigint(vaultBalanceSlot)
  const userTokenBalance = readBigint(userBalanceSlot)
  const allowance = readBigint(allowanceSlot)
  const nextClaimAt = readBigint(nextClaimSlot)

  const sharePrice =
    totalShares !== null && tvl !== null ? sharePriceScaled18(totalShares, tvl) : null
  const userPct1e4 =
    totalShares !== null && totalShares > 0n && userShares !== null
      ? userSharePct1e4(userShares, totalShares)
      : null

  return {
    deployed,
    tvl,
    totalShares,
    sharePriceScaled18: sharePrice,
    userShares,
    userTokenBalance,
    userPct1e4,
    allowance,
    nextClaimAt,
    atBootstrap: totalShares === 0n,
    isLoading,
    isFetching,
    error: error === null ? null : READ_ERROR,
    refetch: () => void refetch(),
  }
}
