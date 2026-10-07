import { useState } from 'react'
import type { Address, Log } from 'viem'
import { decodeEventLog } from 'viem'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'

import { vaultAbi } from '../abi/Vault'
import { getTransactionErrorMessage, isUserRejection } from '../lib/errors'
import { getDeployment, useActiveChainId, useVaultStats } from './useVaultStats'

/**
 * Withdraw state machine (data-model §2.3 / FR-016, FR-019):
 *
 * ```text
 * idle ──confirm──> withdrawing ──receipt──> success ──reset──> idle
 *   └── reject ──> cancelled (neutral, → idle)   fail ──> error ──retry──> idle
 * ```
 */
export type WithdrawStatus = 'idle' | 'withdrawing' | 'success' | 'error' | 'cancelled'

/** Receipt-confirmed amounts (SC-005 — decoded from the Withdraw event, not the estimate). */
export interface WithdrawOutcome {
  shares: bigint
  amount: bigint
}

/** Decode the vault's Withdraw event out of a receipt's logs; null if absent. */
function decodeWithdrawOutcome(logs: readonly Log[], vault: Address): WithdrawOutcome | null {
  for (const log of logs) {
    if (log.topics.length === 0) continue
    if (log.address.toLowerCase() !== vault.toLowerCase()) continue
    try {
      const parsed = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics })
      if (parsed.eventName === 'Withdraw') {
        const args = parsed.args as { shares: bigint; amount: bigint }
        return { shares: args.shares, amount: args.amount }
      }
    } catch {
      /* not a Vault event — keep scanning */
    }
  }
  return null
}

export function useWithdraw() {
  const { address } = useAccount()
  const chainId = useActiveChainId()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const stats = useVaultStats()
  const deployment = getDeployment(chainId)

  const [status, setStatus] = useState<WithdrawStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<WithdrawOutcome | null>(null)

  async function withdraw(shares: bigint): Promise<void> {
    if (!address || !publicClient || !deployment) {
      setError('Connect a wallet on a supported network to withdraw.')
      setStatus('error')
      return
    }
    setError(null)
    setOutcome(null)
    try {
      setStatus('withdrawing')
      const withdrawHash = await writeContractAsync({
        address: deployment.vault,
        abi: vaultAbi,
        functionName: 'withdraw',
        args: [shares],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash })

      const decoded = decodeWithdrawOutcome(receipt.logs, deployment.vault)
      setOutcome(decoded ?? null) // null only if the event is somehow absent → generic copy
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

  return { status, error, outcome, withdraw, reset }
}
