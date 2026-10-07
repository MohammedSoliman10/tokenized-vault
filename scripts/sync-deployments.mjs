#!/usr/bin/env node
/**
 * sync-deployments.mjs — merge forge broadcast artifacts into the frontend address config.
 *
 * Reads `contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json` for chains
 * 31337 (Anvil) and 11155111 (Sepolia), extracts the FaucetToken + Vault
 * `contractAddress`, computes `deployBlock` = min receipt `blockNumber`, and merges
 * per-chain into `web/src/config/deployments.json`:
 *
 *   { "<chainId>": { "faucetToken": "0x…", "vault": "0x…", "deployBlock": 123 } }
 *
 * MUST exit 0 writing `{}` when no broadcast exists (fresh clone).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHAINS = ['31337', '11155111']
const outFile = join(repoRoot, 'web', 'src', 'config', 'deployments.json')

/** @type {Record<string, {faucetToken: string, vault: string, deployBlock: number}>} */
const deployments = {}

for (const chainId of CHAINS) {
  const runFile = join(
    repoRoot,
    'contracts',
    'broadcast',
    'Deploy.s.sol',
    chainId,
    'run-latest.json',
  )
  if (!existsSync(runFile)) continue // no broadcast for this chain

  const run = JSON.parse(readFileSync(runFile, 'utf8'))
  const creates = (run.transactions ?? []).filter(
    (tx) =>
      tx.transactionType === 'CREATE' &&
      (tx.contractName === 'FaucetToken' || tx.contractName === 'Vault'),
  )
  const faucet = creates.find((tx) => tx.contractName === 'FaucetToken')
  const vault = creates.find((tx) => tx.contractName === 'Vault')
  if (!faucet || !vault) continue

  const blockNumbers = (run.receipts ?? [])
    .map((receipt) => Number(receipt.blockNumber))
    .filter((n) => Number.isFinite(n))
  if (blockNumbers.length === 0) continue

  deployments[chainId] = {
    faucetToken: faucet.contractAddress,
    vault: vault.contractAddress,
    deployBlock: Math.min(...blockNumbers),
  }
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, `${JSON.stringify(deployments, null, 2)}\n`)

const chains = Object.keys(deployments)
console.log(
  chains.length === 0
    ? 'sync-deployments: no broadcasts found — wrote {}'
    : `sync-deployments: wrote ${chains.join(', ')}`,
)
