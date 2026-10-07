/**
 * errors — decode every known vault failure into its exact friendly message from
 * `contracts/chain-interface.md` §4 (the single error→message source, FR-018).
 *
 * RAW REVERT STRINGS ARE NEVER RENDERED — anything unmatched becomes the generic
 * message below.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  TransactionRejectedRpcError,
  UserRejectedRequestError,
  decodeErrorResult,
  isHex,
  type Hex,
} from 'viem'

import { faucetTokenAbi } from '../abi/FaucetToken'
import { vaultAbi } from '../abi/Vault'
import { formatRelativeTime } from './format'

/** Combined ABI so custom errors from both contracts decode in one pass. */
const CONTRACT_ABI = [...vaultAbi, ...faucetTokenAbi] as const

const GENERIC = 'Transaction failed — please try again.'
const REJECTED = 'Transaction cancelled — no changes were made.'
const INSUFFICIENT_GAS = 'Not enough native currency for gas.'

/** Exact wording per chain-interface.md §4. `CooldownActive` is templated below. */
const MESSAGES: Record<string, string> = {
  ZeroAmount: 'Enter an amount greater than zero.',
  ZeroShares: 'That amount rounds to zero shares — try a larger amount.',
  AmountTooSmall:
    'The first deposit must be more than 1000 base units. Dead shares (1000) protect against inflation attacks.',
  TransferFailed: 'The token transfer failed — please try again.',
  Reentrancy: 'Blocked for safety — please try again.',
  ERC20InsufficientAllowance: 'Token allowance too low — approve the amount first.',
  ERC20InsufficientBalance:
    'Insufficient token balance — claim test tokens from the faucet or try a smaller amount.',
}

/** True when the user cancelled in the wallet (EIP-1193 code 4001). */
export function isUserRejection(error: unknown): boolean {
  if (error instanceof UserRejectedRequestError) return true
  if (error instanceof TransactionRejectedRpcError) return true
  if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 4001) {
    return true
  }
  if (error instanceof BaseError) {
    return Boolean(
      error.walk(
        (e) =>
          e instanceof TransactionRejectedRpcError ||
          (e as unknown as { code?: number }).code === 4001,
      ),
    )
  }
  return false
}

/** Decode revert data against the combined ABI → exact §4 message, or null. */
function decodeContractMessage(data: Hex): string | null {
  if (data.length < 10) return null // empty revert — nothing to decode
  try {
    const decoded = decodeErrorResult({ abi: CONTRACT_ABI, data }) as {
      errorName: string
      args?: readonly unknown[]
    }
    return messageFromDecoded(decoded.errorName, decoded.args)
  } catch {
    return null // not one of ours (incl. Error(string)/Panic) → generic
  }
}

/** Exact §4 message for a decoded error name (+ args for CooldownActive). */
function messageFromDecoded(errorName: string, args?: readonly unknown[]): string | null {
  if (errorName === 'CooldownActive') {
    const availableAt = typeof args?.[0] === 'bigint' ? args[0] : 0n
    return `Faucet already claimed — next claim in ${formatRelativeTime(availableAt)}.`
  }
  return MESSAGES[errorName] ?? null // unknown custom error → generic (no raw data)
}

/** Walk the BaseError cause chain for gas-exhaustion signatures (§4: −32000 / insufficient funds). */
function isInsufficientGas(error: BaseError): boolean {
  for (let e: unknown = error; e instanceof BaseError; e = e.cause) {
    const message = e.message ?? ''
    if (/insufficient funds/i.test(message)) return true
    if ((e as unknown as { code?: number }).code === -32000 && /gas/i.test(message)) return true
  }
  return false
}

/**
 * Map any thrown error to a single, user-safe, actionable message
 * (never a raw revert string — FR-018 / chain-interface.md §4).
 */
export function getTransactionErrorMessage(error: unknown): string {
  if (isUserRejection(error)) return REJECTED

  let message: string | null = null
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      // viem decodes `.data` when the ABI was supplied at call time; `.raw` is the
      // untouched revert hex (recovered per chain-interface.md §4 via walk()).
      if (reverted.data) {
        message = messageFromDecoded(reverted.data.errorName, reverted.data.args)
      } else if (reverted.raw) {
        message = decodeContractMessage(reverted.raw)
      }
    }
    if (!message && isInsufficientGas(error)) return INSUFFICIENT_GAS
  }
  if (message) return message

  // raw revert data surfaced by the provider without a viem wrapper
  if (typeof error === 'object' && error !== null) {
    const direct = (error as { data?: unknown }).data
    if (isHex(direct)) {
      const decoded = decodeContractMessage(direct)
      if (decoded) return decoded
    }
  }
  if (error instanceof Error && /insufficient funds/i.test(error.message)) return INSUFFICIENT_GAS

  return GENERIC
}
