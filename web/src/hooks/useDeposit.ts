import { useState } from 'react'
import type { Address, Log } from 'viem'
import { decodeEventLog } from 'viem'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'

import { erc20Abi } from '../abi/ERC20'
import { vaultAbi } from '../abi/Vault'
import { supportedChainId } from '../lib/chainId'
import { getTransactionErrorMessage, isUserRejection } from '../lib/errors'
import { getDeployment, useActiveChainId, useVaultStats } from './useVaultStats'

/**
 * Deposit state machine (data-model §2.2 / FR-011, FR-012, FR-019):
 *
 * ```text
 * idle ──confirm──> approving ──receipt──> depositing ──receipt──> success ──reset──> idle
 *   │ allowance >= amount ──────────────────────┘ (approve skipped, FR-011)
 *   │ allowance dropped before deposit ──> approving (re-validated, edge case)
 *   └── reject ──> cancelled (neutral, → idle)   fail ──> error ──retry──> idle
 * ```
 */
export type DepositStatus =
  | 'idle'
  | 'approving'
  | 'depositing'
  | 'success'
  | 'error'
  | 'cancelled'

/** Receipt-confirmed amounts (SC-005 — decoded from the Deposit event, not the estimate). */
export interface DepositOutcome {
  amount: bigint
  shares: bigint
}

/** Decode the vault's Deposit event out of a receipt's logs; null if absent. */
function decodeDepositOutcome(logs: readonly Log[], vault: Address): DepositOutcome | null {
  for (const log of logs) {
    if (log.topics.length === 0) continue
    if (log.address.toLowerCase() !== vault.toLowerCase()) continue
    try {
      const parsed = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics })
      if (parsed.eventName === 'Deposit') {
        const args = parsed.args as { amount: bigint; shares: bigint }
        return { amount: args.amount, shares: args.shares }
      }
    } catch {
      /* not a Vault event — keep scanning */
    }
  }
  return null
}

export function useDeposit() {
  const { address } = useAccount()
  const chainId = useActiveChainId()
  // Pinned to the wallet's active chain — allowance re-reads and receipt waits
  // must never hit a stale config-state client after an external switch.
  const publicClient = usePublicClient({ chainId: supportedChainId(chainId) })
  const { writeContractAsync } = useWriteContract()
  const stats = useVaultStats()
  const deployment = getDeployment(chainId)

  const [status, setStatus] = useState<DepositStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<DepositOutcome | null>(null)

  async function readAllowance(): Promise<bigint> {
    if (!publicClient || !deployment || !address) return 0n
    const value = (await publicClient.readContract({
      address: deployment.faucetToken,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [address, deployment.vault],
    })) as bigint
    return value
  }

  async function approveExact(amount: bigint): Promise<void> {
    if (!publicClient || !deployment) return
    // EXACT amount only — never unlimited (constitution / FR-011)
    const approveHash = await writeContractAsync({
      address: deployment.faucetToken,
      abi: erc20Abi,
      functionName: 'approve',
      args: [deployment.vault, amount],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }

  async function deposit(amount: bigint): Promise<void> {
    if (!address || !publicClient || !deployment) {
      setError('Connect a wallet on a supported network to deposit.')
      setStatus('error')
      return
    }
    setError(null)
    setOutcome(null)
    try {
      // Pre-submission allowance check (FR-011 skip / FR-020 detect before proposing)
      let allowance = await readAllowance()
      if (allowance < amount) {
        setStatus('approving')
        await approveExact(amount)
      }

      // Re-validate IMMEDIATELY before the deposit step — if the allowance was
      // revoked between open and confirm, route back to Approve (T024 edge case).
      allowance = await readAllowance()
      if (allowance < amount) {
        setStatus('approving')
        await approveExact(amount)
      }

      setStatus('depositing')
      const depositHash = await writeContractAsync({
        address: deployment.vault,
        abi: vaultAbi,
        functionName: 'deposit',
        args: [amount],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash })

      const decoded = decodeDepositOutcome(receipt.logs, deployment.vault)
      setOutcome(decoded) // null only if the event is somehow absent → generic success copy
      setStatus('success')
      stats.refetch() // FR-009 — the single invalidation path from T021
    } catch (err) {
      if (isUserRejection(err)) {
        // FR-019 — neutral cancellation, never stuck pending, on-chain state untouched
        setStatus('cancelled')
        setError(null)
      } else {
        setError(getTransactionErrorMessage(err)) // FR-018 — never a raw revert
        setStatus('error')
      }
    }
  }

  function reset(): void {
    setStatus('idle')
    setError(null)
    setOutcome(null)
  }

  return { status, error, outcome, deposit, reset }
}
