# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-07

First release of the Tokenized Vault demo (feature `001-tokenized-vault-dapp`).

### Added

- **Contracts** (`contracts/src/`): `Vault.sol` — internal share ledger, bootstrap deposits
  with 1000 **base units** of dead shares, floor-rounded deposit/withdraw math, custom
  errors, reentrancy guard (frozen after implementation); `FaucetToken.sol` — ERC-20 with a
  24 h cooldown `faucet()`; `SollyWeb3.sol` helper (frozen).
- **Contracts tests**: unit, fuzz (256 runs), and invariant suites (solvency,
  `totalSupply == sum(balances)`, supply growth per claim, monotonic `nextClaimAt`).
- **Frontend** (`web/`): Vite + React 18 + TypeScript strict + Tailwind; wagmi v2 / viem /
  TanStack Query v5 with a custom connect modal (no RainbowKit/ConnectKit).
  - US1: connect modal, wrong-network banner, six-stat dashboard with bootstrap
    placeholders and wallet-chain-pinned reads.
  - US2: deposit flow — live share estimate, exact-amount approve → deposit, inline
    first-deposit (1000 base units) explanation.
  - US3: withdraw flow — Max, live token estimate, inline validation.
  - US4: faucet claim with live 24 h cooldown countdown.
  - US5: activity feed — chunked `getLogs` history (newest 20), live event appends,
    explorer links only on Sepolia, plain tx hashes on Anvil.
- **Tooling**: `scripts/` deploy (Anvil, Sepolia) + config/ABI sync, GitHub Actions CI
  (contracts + web gates), Vercel config (`web/vercel.json`, config-only).
- **Docs & process**: Spec Kit spec/plan/tasks under `specs/001-tokenized-vault-dapp/`,
  README with mermaid architecture, quickstart, security policy, contributing guide,
  code of conduct, issue/PR templates.

### Security

- No secrets in the repository: `.env*` gitignored, CI uses no secrets, key-literal scan in
  the Definition of Done.
- Demo scope: unaudited, Anvil/Sepolia only, never for mainnet with real funds.
