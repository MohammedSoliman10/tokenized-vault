# Quickstart & Validation Guide — Tokenized Vault Dapp

**Feature**: 001-tokenized-vault-dapp | **Date**: 2026-10-07 | **Plan**: [plan.md](./plan.md)

Runnable scenarios that prove the feature works end-to-end. References
[data-model.md](./data-model.md) and [contracts/](./contracts/README.md) instead of
duplicating them. No implementation code here — commands and expected outcomes only.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `anvil`, `cast`)
- Node.js 20+ and npm
- Git with submodule support
- A browser wallet (MetaMask) for the UI scenarios

## Setup

```bash
git clone --recursive <repo-url> tokenized-vault   # or: git submodule update --init --recursive
cp contracts/.env.example contracts/.env           # fill only for Sepolia deploys (never commit)
cd web && npm install && cd ..                     # web/ dependencies
```

Sanity checks:

```bash
git check-ignore -q contracts/.env && echo "OK: .env ignored"   # expect OK
ls contracts/lib/openzeppelin-contracts                           # expect OZ sources (v5.7.0)
```

---

## Scenario 1 — Contract verification gates (Constitution IV)

```bash
cd contracts
forge build          # compiles Vault.sol (frozen), SollyWeb3.sol (frozen), FaucetToken.sol
forge fmt --check
forge test -vvv      # unit + fuzz + invariant + custom errors + reentrancy
```

**Expected**: all tests pass, including —
- bootstrap branch: first deposit `<= 1000` base units reverts `AmountTooSmall`, `1001` succeeds
- every custom error covered: `ZeroAmount`, `ZeroShares`, `AmountTooSmall`, `TransferFailed`,
  `Reentrancy`, `CooldownActive`
- fuzz: deposit→withdraw round trips within rounding tolerance; share math matches
  `amount * totalSupply / balance` (floor)
- invariants: **`token.balanceOf(vault) >= value of all non-dead shares`** and
  `totalSupply == sum(balances)` (incl. `0xdead`) across randomized runs
- reentrancy: malicious token's nested call reverts `Reentrancy`, state stays consistent

## Scenario 2 — Frontend verification gates (Constitution IV)

```bash
cd web
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint .
npm run build        # production build
```

**Expected**: all three exit 0. If `web/src/abi/*` or `deployments.json` are stale, regenerate
first (`node scripts/sync-abis.mjs` after `forge build`; `node scripts/sync-deployments.mjs`
after a deploy) and re-run.

## Scenario 3 — Secret hygiene (Constitution III)

```bash
git check-ignore -q contracts/.env && echo "OK"
grep -rE "0x[a-fA-F0-9]{64}" --exclude-dir=.git --exclude-dir=lib --exclude-dir=out \
  --exclude-dir=broadcast --exclude=".env*" . && echo "FAIL" || echo "OK"
```

**Expected**: `OK` twice — no key-like literals outside gitignored files.

---

## Scenario 4 — Full local demo (Anvil), user stories P1–P5

Terminal A:

```bash
anvil                      # local chain on http://127.0.0.1:8545 (chain id 31337)
```

Terminal B:

```bash
./scripts/deploy-anvil.sh        # deploys FaucetToken then Vault; logs both addresses
node scripts/sync-deployments.mjs   # writes web/src/config/deployments.json (31337 entry)
cd web && npm run dev               # open http://localhost:5173
```

Walkthrough and expected outcomes:

1. **US1 (connect/dashboard)** — Header → Connect: custom modal lists *Injected* (plus
   WalletConnect only if `VITE_REOWN_PROJECT_ID` set). Connect MetaMask on Anvil
   (add network: RPC `http://127.0.0.1:8545`, chain id `31337`; import an Anvil dev account —
   its key is printed by `anvil` and is a public test key). Stats grid shows all six values;
   switching MetaMask to another chain shows the wrong-network banner and disables actions.
2. **US4 (faucet)** — Claim: +1000 VTT within one block; second claim shows a live countdown
   until `nextClaimAt`.
3. **US2 (deposit)** — Enter an amount → live share estimate. First-ever deposit: the UI
   explains the "> 1000 base units (dead shares)" rule; a too-small amount is blocked
   inline with that explanation. Confirm → Approve step (exact amount) → Deposit step →
   success; stats update; approve step is skipped on the next deposit.
4. **US3 (withdraw)** — Max fills full shares; live token estimate; withdraw returns tokens;
   stats update. Zero/over-balance inputs blocked inline. Rejecting in MetaMask shows
   "Transaction cancelled" with no stuck spinner.
5. **US5 (activity)** — Recent Deposit/Withdraw rows appear (newest first, own rows
   highlighted); on Anvil there are **no** explorer links (plain hashes).

**Expected**: every scenario meets its acceptance criteria from
[spec.md](./spec.md); shared UI rules per [ui-contracts.md](./contracts/ui-contracts.md).

## Scenario 5 — Sepolia deploy + verification (owner-initiated)

> Publishing embargo (Constitution): **no `git push` and no Vercel deploy until the repo
> owner explicitly instructs it.** Running deploys locally is fine; publishing is not.

```bash
# 1. fill contracts/.env: SEPOLIA_RPC_URL, ETHERSCAN_API_KEY, PRIVATE_KEY   (stays gitignored)
./scripts/deploy-sepolia.sh        # forge script --broadcast --verify; logs FaucetToken + Vault addresses
node scripts/sync-deployments.mjs  # adds/updates the 11155111 entry (public addresses)
# 2. verify on https://sepolia.etherscan.io (contract pages show "Source code verified")
# 3. cd web && npm run typecheck && npm run lint && npm run build   (gates must stay green)
# 4. commit only web/src/config/deployments.json + generated ABIs — never .env
```

**Expected**: contracts verified on Etherscan; `deployments.json` contains both chain ids;
`git status` shows no `.env` staged.

## Scenario 6 — CI (GitHub Actions)

Push (when the owner allows pushing) must trigger `.github/workflows/ci.yml`:

- `contracts` job: `actions/checkout` with `submodules: recursive` → `forge fmt --check` +
  `forge test` → green
- `web` job: `npm ci` → `npm run typecheck` → `npm run lint` → `npm run build` → green

**Expected**: both jobs pass; a PR cannot merge red (Constitution: compliance review).

---

## Definition of Done for any task (Constitution IV)

Run and attach output for the applicable gates before marking a task done:

| Area | Command |
|------|---------|
| Contracts | `cd contracts && forge test` |
| Frontend types | `cd web && npm run typecheck` |
| Lint | `cd web && npm run lint` && `cd contracts && forge fmt --check` |
| Build | `cd web && npm run build` |

All applicable commands MUST exit 0.
