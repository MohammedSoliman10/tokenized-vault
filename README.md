# Tokenized Vault — a tokenized vault dapp

[![CI](https://github.com/MohammedSoliman10/tokenized-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/MohammedSoliman10/tokenized-vault/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/solidity-0.8.31-363636.svg)](https://docs.soliditylang.org/en/latest/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](#verification)

> **⚠️ Educational / testnet demo.** This project is an unaudited demonstration built for
> learning and testing on Anvil (31337) and Sepolia (11155111). It is **not for mainnet use
> with real funds**. No security audit has been performed; expect bugs.

**Live demo**: _added after deployment_ (pending — see [Deployment](#deployment)).

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Design notes](#design-notes)
- [Quickstart](#quickstart)
- [Verification](#verification)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Overview

A minimal ERC-4626-style tokenized vault: deposit an ERC-20 token, receive non-transferable
shares priced by `vault balance / totalSupply`, withdraw back to tokens, and claim test tokens
from a cooldown faucet. The frontend is a Vite + React + TypeScript (strict) single-page app
using wagmi v2, viem, and a custom connect modal — no RainbowKit or ConnectKit.

## Features

| # | User story | What it delivers |
|---|------------|------------------|
| US1 | Connect & dashboard | Custom wallet modal, wrong-network banner, six-stat dashboard |
| US2 | Deposit | Live share estimate, approve → deposit flow, first-deposit (dead shares) explanation |
| US3 | Withdraw | Max shares, live token estimate, inline validation |
| US4 | Faucet | 1000-token claim with a live 24 h cooldown countdown |
| US5 | Activity feed | Newest 20 Deposit/Withdraw events, live updates, explorer links only on Sepolia |

## Architecture

```mermaid
flowchart LR
  subgraph frontend["Frontend — web/ (Vite · React · TypeScript strict)"]
    UI["UI components<br/>Dashboard · Deposit · Withdraw · Faucet · Activity · Modal"]
    Hooks["wagmi v2 + viem hooks<br/>useVaultStats · useDeposit · useWithdraw<br/>useFaucetClaim · useActivity"]
    CFG[("web/src/config/deployments.json<br/>generated — addresses + deployBlock")]
    UI --> Hooks
    Hooks --> CFG
  end

  subgraph networks["Networks (31337 / 11155111 only)"]
    A["Anvil — local chain<br/>chainId 31337"]
    S["Sepolia — public testnet<br/>chainId 11155111"]
  end

  subgraph contracts["Contracts — contracts/src (OpenZeppelin submodule)"]
    V["Vault.sol<br/>shares · deposit · withdraw"]
    F["FaucetToken.sol<br/>ERC-20 · faucet()"]
  end

  subgraph tooling["Tooling — scripts/"]
    DEPLOY["deploy-anvil.sh · deploy-sepolia.sh<br/>forge script --broadcast"]
    SYNC["sync-deployments.mjs · sync-abis.mjs<br/>writes generated config"]
  end

  Hooks -->|"JSON-RPC: reads + transactions"| A
  Hooks -->|"JSON-RPC: reads + transactions"| S
  A -.hosts.-> V
  A -.hosts.-> F
  S -.hosts.-> V
  S -.hosts.-> F
  DEPLOY -->|"broadcast"| A
  DEPLOY -->|"broadcast"| S
  DEPLOY --> SYNC --> CFG
```

The frontend never hardcodes chain data: addresses, deploy blocks, and ABIs flow from
deployments via the `scripts/` tooling into `web/src/config/`, and every read is pinned to the
wallet's active chain.

## Design notes

- Shares are **non-transferable**: the vault tracks balances internally and deliberately has no
  `transfer`/`approve` surface for shares.
- **Fee-on-transfer tokens are unsupported**: deposits assume `transferFrom` moves exactly the
  amount the depositor authorized.
- 1000 **BASE UNITS** of dead shares protect against first-depositor inflation attacks: the
  first deposit mints 1000 base units (not whole tokens) to `0xdead…dead`, so a later donor
  cannot skew the share price (FR-029/FR-030).

## Quickstart

Happy path — five lines (Foundry + Node 20 installed, `anvil` running in a second terminal):

```bash
git clone --recursive https://github.com/MohammedSoliman10/tokenized-vault.git
cd tokenized-vault/web && npm install
cd ../contracts && forge test
./scripts/deploy-anvil.sh && node scripts/sync-deployments.mjs
cd web && npm run dev
```

Full scenarios (Sepolia deploys, secret hygiene, CI expectations, Definition of Done):
**[specs/001-tokenized-vault-dapp/quickstart.md](specs/001-tokenized-vault-dapp/quickstart.md)**

## Verification

Every task gates on these commands (all must exit 0):

```bash
cd contracts && forge fmt --check && forge test
cd ../web && npm run typecheck && npm run lint && npm test && npm run build
```

CI runs the same commands on every push — see [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Deployment

Deployment is config-only until the owner initiates it (T040): [`web/vercel.json`](web/vercel.json)
declares the Vite framework, install/build commands, and `dist` output for the `web/` root.

In the Vercel project settings:

- **Root Directory**: `web`
- **Environment variables** (both optional — the app degrades gracefully without them):

  | Variable | Purpose |
  |----------|---------|
  | `VITE_SEPOLIA_RPC_URL` | Custom Sepolia RPC; falls back to a public RPC when unset |
  | `VITE_REOWN_PROJECT_ID` | Enables the WalletConnect option in the connect modal (injected wallets always work) |

Environment values belong in Vercel/dashboard `.env` files only — never committed (the repo
gitignores `.env*` and CI ships no secrets).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md): Conventional Commits and the Definition of Done gates.
By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

This code is unaudited and demo-scoped. To report a vulnerability, use GitHub's **private
vulnerability reporting** (Security tab → Report a vulnerability) as described in
[SECURITY.md](SECURITY.md) — please do not open a public issue.

## License

[MIT](LICENSE) © 2026 Mohammed Soliman
