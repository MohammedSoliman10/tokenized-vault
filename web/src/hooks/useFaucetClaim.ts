import { useState } from 'react'
import type { Address, Log } from 'viem'
import { decodeEventLog } from 'viem'
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi'

import { faucetTokenAbi } from '../abi/FaucetToken'
import { getTransactionErrorMessage, isUserRejection } from '../lib/errors'
import { getDeployment, useVaultStats } from './useVaultStats'

/**
 * Faucet claim state machine (data-model §2.4 / FR-005..FR-007, FR-019):
 *
 * ```text
 * idle ──claim──> claiming ──receipt──> success ──reset──> idle (cooldown active)
 *   └── reject ──> cancelled (cooldown untouched, → idle)   fail ──> error ──reset──> idle
 * ```
 *
 * Cooldown is derived from the single `nextClaimAt(account)` read in the shared
 * snapshot (`0` ⇒ claimable — D3); it is re-read after receipts via `refetch()`.
 * A chain-side `CooldownActive` decodes to the countdown message (FR-006/FR-018).
 */
export type FaucetStatus = 'idle' | 'claiming' | 'success' | 'error' | 'cancelled'

/** Receipt-confirmed amount (SC-005 — decoded from the Claimed event). */
export interface FaucetOutcome {
  amount: bigint
}

/** Decode the faucet's Claimed event out of a receipt's logs; null if absent. */
function decodeClaimedAmount(logs: readonly Log[], token: Address): bigint | null {
  for (const log of logs) {
    if (log.topics.length === 0) continue
    if (log.address.toLowerCase() !== token.toLowerCase()) continue
    try {
      const parsed = decodeEventLog({ abi: faucetTokenAbi, data: log.data, topics: log.topics })
      if (parsed.eventName === 'Claimed') {
        const args = parsed.args as { amount: bigint }
        return args.amount
      }
    } catch {
      /* not a faucet event — keep scanning */
    }
  }
  return null
}

export function useFaucetClaim() {
  const { address } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const stats = useVaultStats()
  const deployment = getDeployment(chainId)

  const [status, setStatus] = useState<FaucetStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<FaucetOutcome | null>(null)

  async function claim(): Promise<void> {
    if (!address || !publicClient || !deployment) {
      setError('Connect a wallet on a supported network to claim.')
      setStatus('error')
      return
    }
    setError(null)
    setOutcome(null)
    try {
      setStatus('claiming')
      const claimHash = await writeContractAsync({
        address: deployment.faucetToken,
        abi: faucetTokenAbi,
        functionName: 'faucet',
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: claimHash })

      const amount = decodeClaimedAmount(receipt.logs, deployment.faucetToken)
      setOutcome(amount !== null ? { amount } : null)
      setStatus('success')
      stats.refetch() // FR-009 — re-reads nextClaimAt (cooldown starts) + balances
    } catch (err) {
      if (isUserRejection(err)) {
        // FR-019/US4 — cancellation never touches the cooldown
        setStatus('cancelled')
        setError(null)
      } else {
        // FR-018 — CooldownActive decodes to the countdown message; never a raw revert
        setError(getTransactionErrorMessage(err))
        setStatus('error')
        // another tab/session may have claimed — refresh the cooldown snapshot
        stats.refetch()
      }
    }
  }

  function reset(): void {
    setStatus('idle')
    setError(null)
    setOutcome(null)
  }

  return { status, error, outcome, claim, reset }
}
