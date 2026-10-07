import { useCallback, useEffect, useState } from 'react'
import { usePublicClient, useWatchContractEvent } from 'wagmi'
import type { Address, Hex, Log } from 'viem'
import { decodeEventLog } from 'viem'

import { vaultAbi } from '../abi/Vault'
import { getDeployment, useActiveChainId } from './useVaultStats'

/** One activity row (FR-021) — decoded Deposit/Withdraw log, newest 20 kept (FR-023, D11). */
export interface ActivityEntry {
  type: 'Deposit' | 'Withdraw'
  account: Address
  amount: bigint
  shares: bigint
  blockNumber: bigint
  transactionHash: Hex
  logIndex: number
  /** Block timestamp in seconds; null when the block lookup failed (row still shown). */
  timestamp: bigint | null
}

export type ActivityStatus = 'loading' | 'ready' | 'error' | 'unavailable'

export interface ActivitySnapshot {
  /** 'unavailable' = this chain has no vault in deployments.json (FR-028). */
  status: ActivityStatus
  entries: ActivityEntry[]
  /** Re-run the fetch after a failure; preserves any entries already shown (never blanks). */
  retry: () => void
}

/** D11: eth_getLogs range protection — halve on RPC range errors, floor at 1 000 blocks. */
const MAX_CHUNK = 10_000n
const MIN_CHUNK = 1_000n
/** FR-023 / D11: bounded feed. */
const NEWEST = 20

const ACTIVITY_ERROR = 'Could not load activity — check your connection and retry.'

/** RPC range/limit failures (wording differs per provider) — trigger auto-halving only. */
const RANGE_PATTERN = /range|too many|limit|exceed/i

function isRangeError(error: unknown): boolean {
  let text = ''
  let current: unknown = error
  while (current instanceof Error) {
    text += ` ${current.message}`
    current = (current as { cause?: unknown }).cause
  }
  return RANGE_PATTERN.test(text)
}

/** Decode one raw log; null for anything that is not a Vault Deposit/Withdraw. */
function decodeEntry(log: Log): ActivityEntry | null {
  if (log.topics.length === 0) return null
  if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) return null
  try {
    const parsed = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics })
    if (parsed.eventName !== 'Deposit' && parsed.eventName !== 'Withdraw') return null
    const args = parsed.args as { caller: Address; amount: bigint; shares: bigint } | undefined
    if (!args || typeof args.amount !== 'bigint' || typeof args.shares !== 'bigint') return null
    return {
      type: parsed.eventName,
      account: args.caller,
      amount: args.amount,
      shares: args.shares,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      timestamp: null,
    }
  } catch {
    return null
  }
}

/**
 * Dedupe by `(transactionHash, logIndex)`, sort block desc + logIndex desc,
 * keep the newest 20 (D11 / FR-023).
 */
function finalize(entries: Iterable<ActivityEntry>): ActivityEntry[] {
  const byId = new Map<string, ActivityEntry>()
  for (const entry of entries) {
    const id = `${entry.transactionHash}-${entry.logIndex}`
    if (!byId.has(id)) byId.set(id, entry)
  }
  return [...byId.values()]
    .sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1
      return b.logIndex - a.logIndex
    })
    .slice(0, NEWEST)
}

function decodeAll(logs: readonly Log[]): ActivityEntry[] {
  const decoded: ActivityEntry[] = []
  for (const log of logs) {
    const entry = decodeEntry(log)
    if (entry !== null) decoded.push(entry)
  }
  return decoded
}

/** Attach block timestamps (best-effort: a failed lookup leaves `timestamp: null`). */
async function withTimestamps(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  entries: ActivityEntry[],
): Promise<ActivityEntry[]> {
  const blocks = [...new Set(entries.map((entry) => entry.blockNumber))]
  const timestamps = new Map<bigint, bigint | null>()
  await Promise.all(
    blocks.map(async (blockNumber) => {
      try {
        const block = await client.getBlock({ blockNumber })
        timestamps.set(blockNumber, block.timestamp)
      } catch {
        timestamps.set(blockNumber, null)
      }
    }),
  )
  return entries.map((entry) => ({
    ...entry,
    timestamp: timestamps.get(entry.blockNumber) ?? null,
  }))
}

/** Chunked `getLogs` from `deployBlock` with auto-halving on range errors (D11). */
async function fetchChunkedLogs(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  vault: Address,
  deployBlock: number,
): Promise<Log[]> {
  const from = BigInt(deployBlock)
  const latest = await client.getBlockNumber()
  if (latest < from) return []

  const logs: Log[] = []
  let chunk = MAX_CHUNK
  let cursor = from
  while (cursor <= latest) {
    let end = cursor + chunk - 1n
    if (end > latest) end = latest
    try {
      const part = await client.getLogs({ address: vault, fromBlock: cursor, toBlock: end })
      for (const log of part) logs.push(log)
      cursor = end + 1n
    } catch (error) {
      if (isRangeError(error) && chunk > MIN_CHUNK) {
        chunk = chunk / 2n
        if (chunk < MIN_CHUNK) chunk = MIN_CHUNK
        continue // retry the same cursor with a smaller window
      }
      throw error
    }
  }
  return logs
}

interface FeedState {
  key: string
  status: 'loading' | 'ready' | 'error'
  entries: ActivityEntry[]
}

/**
 * Activity feed over Vault `Deposit`/`Withdraw` logs (FR-021..FR-023, research D11):
 * one chunked `getLogs` history fetch from `deployments.json` `deployBlock`, plus
 * `useWatchContractEvent` appends for live updates. State is keyed by chain+vault so a
 * network change shows a fresh (loading) feed instead of stale-chain rows, and all
 * updates preserve already-loaded rows — a failed fetch only surfaces an inline,
 * retryable error (never blanks the list).
 */
export function useActivity(): ActivitySnapshot {
  const chainId = useActiveChainId()
  const entry = getDeployment(chainId)
  const publicClient = usePublicClient()

  const vault = entry?.vault
  const deployBlock = entry?.deployBlock
  const key = `${chainId}:${vault ?? 'none'}`

  const [state, setState] = useState<FeedState | null>(null)
  const [attempt, setAttempt] = useState(0)

  const active = state !== null && state.key === key ? state : null

  useEffect(() => {
    if (!vault || deployBlock === undefined || !publicClient) return
    let cancelled = false

    async function load(
      client: NonNullable<ReturnType<typeof usePublicClient>>,
      vaultAddress: Address,
      startBlock: number,
    ): Promise<void> {
      try {
        const logs = await fetchChunkedLogs(client, vaultAddress, startBlock)
        const stamped = await withTimestamps(client, decodeAll(logs))
        if (cancelled) return
        setState((prev) => {
          const merged =
            prev !== null && prev.key === key ? [...prev.entries, ...stamped] : stamped
          return { key, status: 'ready', entries: finalize(merged) }
        })
      } catch {
        if (cancelled) return
        setState((prev) => ({
          key,
          status: 'error',
          entries: prev !== null && prev.key === key ? prev.entries : [], // never blank
        }))
      }
    }

    // narrowed sync here → passed as typed arguments (closure capture keeps optional types)
    void load(publicClient, vault, deployBlock)
    return () => {
      cancelled = true
    }
  }, [publicClient, vault, deployBlock, key, attempt])

  const appendLogs = useCallback(
    (logs: readonly unknown[]) => {
      if (!publicClient) return
      const stampedPromise = withTimestamps(publicClient, decodeAll(logs as readonly Log[]))
      void stampedPromise.then((stamped) => {
        if (stamped.length === 0) return
        setState((prev) => {
          if (prev === null || prev.key !== key || prev.status !== 'ready') return prev
          return { ...prev, entries: finalize([...prev.entries, ...stamped]) }
        })
      })
    },
    [publicClient, key],
  )

  // Live appends — two watchers share one deduped merge path (FR-023).
  // A defined entry means getDeployment(chainId) matched ⇒ chain is configured.
  const watcherChainId = entry !== undefined ? (chainId as 31337 | 11155111) : undefined
  useWatchContractEvent({
    address: vault,
    abi: vaultAbi,
    chainId: watcherChainId,
    eventName: 'Deposit',
    enabled: vault !== undefined && publicClient !== undefined,
    onLogs: (logs) => appendLogs(logs),
  })
  useWatchContractEvent({
    address: vault,
    abi: vaultAbi,
    chainId: watcherChainId,
    eventName: 'Withdraw',
    enabled: vault !== undefined && publicClient !== undefined,
    onLogs: (logs) => appendLogs(logs),
  })

  const retry = useCallback(() => {
    setState((prev) =>
      prev !== null && prev.key === key
        ? { ...prev, status: 'loading' } // keep rows visible while retrying
        : { key, status: 'loading', entries: [] },
    )
    setAttempt((n) => n + 1)
  }, [key])

  const status: ActivityStatus = !entry ? 'unavailable' : (active?.status ?? 'loading')
  const entries = active?.entries ?? []

  return { status, entries, retry }
}

export { ACTIVITY_ERROR }
