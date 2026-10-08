# Implementation Plan: Tokenized Vault Dapp

**Branch**: `001-tokenized-vault-dapp` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-tokenized-vault-dapp/spec.md`

## Summary

Build the Tokenized Vault demo as a two-package monorepo: `contracts/` (Foundry, solc 0.8.31)
keeps `Vault.sol` and `SollyWeb3.sol` frozen as the source of truth and adds
`contracts/src/FaucetToken.sol` (18-decimal ERC-20 "Vault Test Token"/VTT with a public faucet
of 1000e18 per 24h per address), covered by unit, fuzz, invariant, custom-error, and
malicious-token reentrancy tests, plus a `Deploy.s.sol` broadcast script for both networks.
`web/` is a Vite + React 18 + TypeScript (strict) + Tailwind v4 dapp using wagmi v2 + viem +
`@tanstack/react-query` with a custom headless wallet modal (no RainbowKit/ConnectKit):
multicall-driven stats, a pure-bigint `vaultMath.ts` that mirrors Solidity rounding including
the dead-shares bootstrap, approve→deposit and withdraw state machines, a chunked `getLogs`
activity feed from `deployBlock`, and friendly decoding of all contract errors. Deployed
addresses flow from `contracts/broadcast/**/run-latest.json` through
`scripts/sync-deployments.mjs` into `web/src/config/deployments.json` — never hardcoded in
components. Every task ends with the constitution's verification gates green: `forge test`,
`tsc --noEmit`, lint, `build`.

## Technical Context

**Language/Version**: Solidity 0.8.31 (pinned in `contracts/foundry.toml`); TypeScript 5.x with
`strict` (+ `noUncheckedIndexedAccess`); React 18; Node 20+ for auxiliary scripts

**Primary Dependencies**: Contracts: OpenZeppelin v5.7.0 and forge-std v1.17.0 as git
submodules (verified checked out in `contracts/lib/`), npm as package manager for the web
package. Web: Vite (current stable, v8 line), `@tailwindcss/vite` (Tailwind v4), wagmi v2,
viem v2, `@tanstack/react-query` v5, `@radix-ui/react-dialog`, `@fontsource/inter`,
ESLint 9 flat config + typescript-eslint

**Storage**: N/A — no backend or database; on-chain state plus the generated config file
`web/src/config/deployments.json` (Sepolia entries committed, Anvil entries regenerated
locally from untracked `contracts/broadcast/`)

**Testing**: Foundry `forge test` — unit, fuzz, invariant (Vault solvency AND FaucetToken
claim/supply), every custom error, and a reentrancy test with a malicious token; frontend
verified with `tsc --noEmit`, `eslint .`, a production `build`, plus Vitest + React Testing
Library tests via `npm test` (frontend test stack IN SCOPE per owner directive; the
constitution's Definition of Done gates remain `forge test` / `tsc --noEmit` / lint / `build`)

**Target Platform**: Modern browsers with injected wallets (MetaMask) and optional
WalletConnect; exactly two chains — Anvil (31337) and Sepolia (11155111); responsive 360px →
desktop, blue-and-white light theme, Inter

**Project Type**: Monorepo — smart contracts + web dapp (npm per package, no workspace tooling)

**Performance Goals**: Vault stats visible < 2s via a single multicall (`useReadContracts`);
activity log fetched in ≤ 10,000-block chunks with auto-halving on RPC range errors; live
updates via `useWatchContractEvent`

**Constraints**: Constitution v1.0.0 — `Vault.sol`/`SollyWeb3.sol` frozen; every contract
change ships unit + fuzz + invariant tests (invariant: vault token balance ≥ value of all
non-dead shares, plus totalSupply == sum of balances); zero secrets (deploy key read from
gitignored `contracts/.env`, never printed/logged/committed; `.env.example` only); addresses
and RPC endpoints from env/config only; stack fixed to Vite + React + TS strict + Tailwind +
wagmi/viem with a custom modal (no RainbowKit/ConnectKit); contract deps as git submodules,
never vendored; Conventional Commits; verification gates MUST pass before any task is marked
done; no push to GitHub and no Vercel deploy until the owner explicitly instructs

**Scale/Scope**: 5 user stories (P1–P5), 2 frozen contracts + 1 new contract, 1 vault with 1
asset, ~12 UI components, demo-scale traffic; out of scope: share transfers, mainnet,
multiple vaults

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / Rule | Status | Evidence in this plan |
|---|------------------|--------|------------------------|
| I | Contract source of truth; `Vault.sol` not modified without explicit approval | PASS | `Vault.sol` and `SollyWeb3.sol` untouched; only new file is `FaucetToken.sol`; frontend consumes generated ABIs from forge artifacts |
| II | Contract changes need unit + fuzz + invariant tests (vault balance ≥ value of non-dead shares) | PASS | Test plan: `Vault.t.sol` (unit), `FaucetToken.t.sol` (unit + fuzz: claim always exactly `1000e18`, cooldown over fuzzed timestamps/addresses), Vault fuzz round-trips/share math, Vault invariant suite with handler (solvency + totalSupply == sum of balances), FaucetToken invariant suite (supply grows +`1000e18` per claim, `nextClaimAt` never decreases), all custom errors, malicious-token reentrancy test |
| III | Zero secrets; deploy key from `contracts/.env`, never printed/logged/committed | PASS | `Deploy.s.sol` reads key via `vm.envUint("PRIVATE_KEY")`; shell scripts `source` `contracts/.env` without `set -x`/`echo`; only `.env.example` committed; Anvil script uses Anvil's publicly documented default account key (not a secret, local-only) |
| IV | Every task ends with verification command passing (`forge test`, `tsc --noEmit`, lint, `build`) | PASS | Quickstart "Verification gates" section; CI runs the same four gates; tasks phase will attach gates to every task |
| V | Only chains 31337 + 11155111; addresses from env/config, never hardcoded in components | PASS | `web/src/config/deployments.json` (generated) is the single address source; RPCs from `VITE_SEPOLIA_RPC_URL`/fixed local URL; components import config only |
| VI | Vite + React + TS strict + Tailwind + wagmi/viem; plain wagmi connectors + custom modal; no RainbowKit | PASS | `injected()` (+ conditional `walletConnect({ projectId })`); custom modal on Radix Dialog; explicitly no RainbowKit/ConnectKit; `@tanstack/react-query` is the wagmi v2 required peer |
| VII | Contract dependencies as git submodules, never vendored | PASS | OZ v5.7.0 + forge-std already submodules in `.gitmodules`; new contract imports via remappings only; npm deps stay in `node_modules` (ignored) |
| — | Repo standards: README (architecture + design notes), MIT LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, CI with `submodules: recursive`, issue/PR templates | PASS | In scope (FR-029) and listed in Project Structure; CI checkout uses `submodules: recursive` |
| — | Conventional Commits; no GitHub push / no Vercel deploy until owner instructs | PASS | Recorded under Constraints and in quickstart; plan phase performs no push or deploy |

**Gate result**: PASS — no violations, no unresolved `NEEDS CLARIFICATION` items, so
Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-tokenized-vault-dapp/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (interface contracts)
│   ├── README.md
│   ├── chain-interface.md
│   ├── env-config.md
│   └── ui-contracts.md
├── checklists/
│   └── requirements.md  # from /speckit.specify
├── spec.md              # from /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
.
├── contracts/
│   ├── src/
│   │   ├── Vault.sol              # FROZEN — source of truth, no edits without approval
│   │   ├── SollyWeb3.sol          # FROZEN — source of truth, no edits without approval
│   │   └── FaucetToken.sol        # NEW — ERC-20 + faucet (1000e18 / 24h / address)
│   ├── test/
│   │   ├── Vault.t.sol            # unit tests: deposit/withdraw, bootstrap, custom errors
│   │   ├── FaucetToken.t.sol      # unit tests: faucet, cooldown, CooldownActive, Claimed
│   │   ├── VaultFuzz.t.sol        # fuzz: deposit/withdraw round trips, share math
│   │   ├── VaultInvariant.t.sol   # invariant + handler: solvency, share accounting
│   │   └── Reentrancy.t.sol       # malicious token attacking deposit/withdraw
│   ├── script/
│   │   └── Deploy.s.sol           # deploys FaucetToken then Vault; vm.envUint PRIVATE_KEY
│   ├── lib/                       # git submodules: openzeppelin-contracts (v5.7.0), forge-std
│   ├── foundry.toml               # solc 0.8.31 (existing, unchanged)
│   ├── remappings.txt             # existing, unchanged
│   ├── .env.example               # committed placeholders (SEPOLIA_RPC_URL, ETHERSCAN_API_KEY, PRIVATE_KEY)
│   └── .env                       # gitignored — never committed, never logged
├── web/
│   ├── src/
│   │   ├── abi/                   # GENERATED by scripts/sync-abis.mjs, committed: Vault.ts, FaucetToken.ts, ERC20.ts (`as const`)
│   │   ├── config/
│   │   │   ├── deployments.json   # GENERATED by scripts/sync-deployments.mjs (chainId -> {faucetToken, vault, deployBlock})
│   │   │   └── chains.ts          # chain definitions + RPC transports from env
│   │   ├── lib/
│   │   │   ├── vaultMath.ts       # pure bigint share math mirroring Solidity rounding (incl. dead-shares bootstrap)
│   │   │   ├── errors.ts          # decode vault/FaucetToken errors + wallet errors -> friendly messages
│   │   │   └── format.ts          # unit/display formatting helpers
│   │   ├── hooks/
│   │   │   ├── useVaultStats.ts   # useReadContracts multicall: TVL, shares, price, balances, pct
│   │   │   ├── useDeposit.ts      # state machine: idle -> approving -> depositing -> success | error
│   │   │   ├── useWithdraw.ts     # state machine: idle -> withdrawing -> success | error
│   │   │   ├── useFaucetClaim.ts  # state machine + nextClaimAt cooldown
│   │   │   ├── useActivity.ts     # chunked getLogs from deployBlock + useWatchContractEvent
│   │   │   └── useTokenBalance.ts # ERC-20 balance/allowance reads
│   │   ├── components/
│   │   │   ├── WalletModal.tsx    # custom modal (Radix Dialog): connectors, connecting/error states
│   │   │   ├── NetworkSwitcher.tsx# Anvil <-> Sepolia switch + wrong-network banner
│   │   │   ├── StatsGrid.tsx      # six dashboard metrics
│   │   │   ├── DepositForm.tsx    # amount input, live share estimate, approve/deposit steps
│   │   │   ├── WithdrawForm.tsx   # shares input, Max, live token estimate
│   │   │   ├── FaucetPanel.tsx    # claim button + cooldown countdown
│   │   │   ├── ActivityFeed.tsx   # newest 20 events, self-highlight, explorer links (Sepolia only)
│   │   │   └── ... (App/Header/toast/status primitives)
│   │   ├── App.tsx
│   │   ├── main.tsx               # WagmiProvider + QueryClientProvider
│   │   └── index.css              # Tailwind v4 CSS-first config + blue-and-white light theme + Inter
│   ├── .env.example               # VITE_SEPOLIA_RPC_URL, VITE_REOWN_PROJECT_ID (placeholders)
│   ├── package.json               # scripts: dev, build, preview, typecheck, lint, test
│   ├── eslint.config.js           # ESLint 9 flat config (typescript-eslint, react-hooks)
│   ├── vitest.config.ts           # Vitest (jsdom) — `npm test`
│   ├── tsconfig.json              # strict: true, noUncheckedIndexedAccess: true
│   └── vite.config.ts             # react + @tailwindcss/vite plugins
├── scripts/
│   ├── deploy-anvil.sh            # forge script against http://127.0.0.1:8545 (public Anvil key 0)
│   ├── deploy-sepolia.sh          # sources contracts/.env; --rpc-url --broadcast --verify
│   ├── sync-abis.mjs              # forge out/**/*.json -> web/src/abi/*.ts (`as const`)
│   └── sync-deployments.mjs       # broadcast/**/run-latest.json -> web/src/config/deployments.json
├── .github/
│   ├── workflows/ci.yml           # contracts job (checkout submodules: recursive, forge test) + web job (tsc, lint, build)
│   ├── ISSUE_TEMPLATE/            # bug report + feature request
│   └── PULL_REQUEST_TEMPLATE.md
├── README.md                      # architecture diagram + design notes (FR-030)
├── LICENSE                        # MIT
├── SECURITY.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
├── .gitignore                     # .env, .env.*, !.env.example, node_modules, broadcast, dist (exists; extended)
└── .gitmodules                    # forge-std + openzeppelin-contracts (exists, unchanged)
```

**Structure Decision**: Monorepo with two packages — `contracts/` (Foundry layout, existing)
and `web/` (Vite scaffold, new) — coordinated by root-level `scripts/` (cross-package glue:
deploy + codegen) and root-level docs/CI. Generated artifacts (`web/src/abi/*`,
`deployments.json`) are committed so the web CI job builds without Foundry, and are
regenerated by the sync scripts whenever contracts are rebuilt or redeployed. The literal
`script/` path is reserved for Foundry Solidity scripts; shell/Node automation lives in
root `scripts/`.

## Constitution Check (post-Phase 1 re-evaluation)

Re-checked after research.md, data-model.md, contracts/, and quickstart.md were produced:

| Concern | Result |
|---------|--------|
| Design introduces no edits to `Vault.sol` / `SollyWeb3.sol` | PASS — frozen files referenced read-only; all new behavior in `FaucetToken.sol` or `web/` |
| Test tiers designed — Vault AND FaucetToken each covered by unit + fuzz + invariant tiers, with the solvency invariant required by Principle II (`data-model.md` §Vault/§FaucetToken, `quickstart.md` Scenario 1) | PASS |
| Secret handling designed end-to-end (`contracts/env-config.md`): key never printed/logged/committed, `.env.example` only | PASS |
| Address/config rule: components read `deployments.json` + env only | PASS |
| Frontend stack + custom modal (no RainbowKit/ConnectKit) | PASS |
| Dependencies as submodules; no vendoring | PASS |
| Verification gates + publishing embargo present in quickstart | PASS |

**Gate result**: PASS — no violations; Complexity Tracking remains empty.

## Complexity Tracking

No constitution violations were found in either evaluation, so no justifications are required.
