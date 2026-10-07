# Environment & Configuration Contract

**Feature**: 001-tokenized-vault-dapp | **Date**: 2026-10-07

Every configuration input, its consumer, where it is stored, and its secrecy class.
Governing rule (Constitution Principle III): **the repository contains no secret values —
ever.** Only `.env.example` files with empty/placeholder values are committed.

---

## 1. Variable table

### `contracts/.env` (gitignored — deploy-time, shell-side)

| Variable | Consumer | Required when | Example value | Secrecy |
|----------|----------|---------------|---------------|---------|
| `PRIVATE_KEY` | `Deploy.s.sol` via `vm.envUint("PRIVATE_KEY")` (exported by `scripts/deploy-sepolia.sh`) | Sepolia deploy | *(never shown — empty in `.env.example`)* | **SECRET.** Never print, log, echo, commit, or paste into issues/PRs/screenshots |
| `SEPOLIA_RPC_URL` | `scripts/deploy-sepolia.sh` → `forge script --rpc-url` | Sepolia deploy | `https://sepolia.drpc.org` (public ok) | Sensitive-ish (treat as config) |
| `ETHERSCAN_API_KEY` | `scripts/deploy-sepolia.sh` → `--etherscan-api-key` | Sepolia verify | *(placeholder in `.env.example`)* | Sensitive — gitignored |

Committed placeholder: `contracts/.env.example` (exists today, keys with empty values).

### Anvil exception

`scripts/deploy-anvil.sh` supplies Anvil's **publicly documented** default account #0 key
(Anvil prints it at startup; it only controls a local, disposable chain). It is a well-known
constant, not a secret, and is safe to appear in the script. It MUST NOT be reused on any
public network.

### `web/.env` (gitignored — build/runtime, browser-side)

| Variable | Consumer | Required when | Example value | Secrecy |
|----------|----------|---------------|---------------|---------|
| `VITE_SEPOLIA_RPC_URL` | wagmi/viem transport `fallback[...]` (first entry) | Optional — falls back to a public RPC when unset | `https://ethereum-sepolia-rpc.publicnode.com` | Public |
| `VITE_REOWN_PROJECT_ID` | `walletConnect({ projectId })` connector registration | Optional — WalletConnect entry hidden when unset | `3fcc6bba…` | Public (client id) |

Committed placeholder: `web/.env.example`.

**Browser rule**: anything prefixed `VITE_` is bundled into the client and is PUBLIC. Never
place a secret in a `VITE_` variable (enforced by this contract + code review).

### Fixed non-secret values

| Value | Where | Note |
|-------|-------|------|
| `http://127.0.0.1:8545` | `web/src/config/chains.ts`, `scripts/deploy-anvil.sh` | Local Anvil RPC — not a secret |
| Chain ids `31337`, `11155111` | config only — never hardcoded in components | Constitution Principle V |

---

## 2. Generated config (not env, but configuration)

| Artifact | Producer | Consumers | Commit? |
|----------|----------|-----------|---------|
| `web/src/abi/{Vault,FaucetToken,ERC20}.ts` | `scripts/sync-abis.mjs` (after `forge build`) | hooks, `errors.ts` | Yes |
| `web/src/config/deployments.json` | `scripts/sync-deployments.mjs` (after deploy) | address lookups, `deployBlock` for activity | Sepolia entries yes; Anvil entries regenerated locally |

Rule: components read addresses **only** from `deployments.json`; a chain missing from the
file renders a "not deployed on this network" state — no hardcoded fallback (FR-028).

---

## 3. Shell-script secrecy invariants (checked in review)

1. `scripts/deploy-sepolia.sh`: `set -euo pipefail` and **no** `set -x`; loads env via
   `set -a; source contracts/.env; set +a`; never `echo`s any variable value.
2. Forge output prints deployed **addresses** only — `Deploy.s.sol` has no `console.log` of
   `PRIVATE_KEY`.
3. `git check-ignore contracts/.env` succeeds; `git status` never stages `.env` (only
   `.env.example`).
4. CI logs must never contain secrets: CI runs tests only — **deploy jobs are not in CI**
   for this feature (deploys are local, owner-initiated).

## 4. Verification commands (secret hygiene)

```bash
git check-ignore -q contracts/.env && echo "OK: .env ignored"
grep -rE "0x[a-fA-F0-9]{64}" --exclude-dir=.git --exclude-dir=lib --exclude-dir=out \
  --exclude-dir=broadcast --exclude=".env*" . && echo "FAIL: key-like literal found" || echo "OK"
```

Expected: `OK: .env ignored` and `OK` (no key-like literals outside gitignored files).
