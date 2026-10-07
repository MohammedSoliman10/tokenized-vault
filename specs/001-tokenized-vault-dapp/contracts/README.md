# Interface Contracts — Tokenized Vault Dapp

**Feature**: 001-tokenized-vault-dapp | **Phase**: 1 (Design) | **Date**: 2026-10-07

These documents define the interfaces this feature exposes to its consumers — the frontend,
the deploy tooling, and the user — independent of implementation internals.

| File | Interface | Consumers |
|------|-----------|-----------|
| [chain-interface.md](./chain-interface.md) | On-chain ABI surface (Vault, FaucetToken, ERC-20), events, custom errors, and error→message mapping | `web/src/abi/*` (generated), hooks, `errors.ts` |
| [env-config.md](./env-config.md) | Environment/config contract: every variable, who reads it, secrecy rules | Shell scripts, `Deploy.s.sol`, Vite config |
| [ui-contracts.md](./ui-contracts.md) | UI behavioral contracts: wallet modal, network switching, deposit/withdraw/faucet flows, activity feed display rules | Components/hooks, acceptance tests |

Rules that bind these interfaces (Constitution v1.0.0):

- The Vault ABI is **frozen** — `contracts/src/Vault.sol` is the source of truth and changes
  require explicit owner approval.
- Generated ABI files are derived from forge build output only (`scripts/sync-abis.mjs`);
  hand-editing `web/src/abi/*` is prohibited.
- No secret value may appear in any of these interfaces (see env-config.md).
