# Phase 1: Data Model — Tokenized Vault Dapp

**Feature**: 001-tokenized-vault-dapp | **Date**: 2026-10-07 | **Plan**: [plan.md](./plan.md)

Entities are grouped by plane: on-chain (frozen or new contracts), client state (frontend
derived state machines), and configuration. Validation rules reference spec FR/SC/edge-case
IDs.

---

## 1. On-chain entities

### 1.1 Vault (contracts/src/Vault.sol — FROZEN, source of truth)

Immutable/constant attributes:

| Attribute | Type | Notes |
|-----------|------|-------|
| `token` | `IERC20 immutable` | The deposited asset — deployed as FaucetToken on both networks |
| `DEAD_SHARES` | `uint256 constant = 1000` | Base units (wei), private |
| `DEAD_ADDRESS` | `address constant = 0xdead` | Holds dead shares, private |
| `locked` | `uint256` | Reentrancy guard: `NOT_ENTERED=1` / `ENTERED=2`, private |

State:

| Attribute | Type | Invariants / validation |
|-----------|------|--------------------------|
| `totalSupply` | `uint256` | Sum of all share balances **including** `DEAD_ADDRESS` after bootstrap |
| `balanceOf(account)` | `mapping(address => uint256)` | Per-account shares; no transfer function exists (non-transferable by construction, FR/US5 + design note) |

Operations and state transitions:

```text
deposit(amount)  [nonReentrant]
  amount == 0                     -> revert ZeroAmount()
  totalSupply == 0  (bootstrap):  amount <= 1000        -> revert AmountTooSmall()
                                  else mint 1000 to 0xdead; shares = amount - 1000
  totalSupply > 0:                shares = amount * totalSupply / token.balanceOf(vault)   [floor]
  shares == 0                    -> revert ZeroShares()
  mint(msg.sender, shares); transferFrom(msg.sender, vault, amount) [false -> TransferFailed()]
  emit Deposit(caller, amount, shares)

withdraw(shares)  [nonReentrant]
  shares == 0                    -> revert ZeroShares()
  amount = shares * token.balanceOf(vault) / totalSupply   [floor]
  burn(msg.sender, shares); transfer(msg.sender, amount) [false -> TransferFailed()]
  emit Withdraw(caller, shares, amount)
```

Derived facts (used by frontend math, see research D8):

- Bootstrap: first deposit must be **> 1000 base units of VTT** (wei, not whole tokens —
  research D4).
- When `totalSupply > 0` then `token.balanceOf(vault) > 0` (dead shares always leave a
  nonzero balance) — division safety.
- Share price is never stored; it is always derived: `balance / totalSupply`.
- Known frozen-contract quirk: tokens donated to the vault before the first deposit accrue to
  the first depositor (bootstrap branch ignores current balance). Document in README design
  notes; not fixable without modifying `Vault.sol`.

Custom errors (all must map to friendly messages — FR-018): `ZeroAmount()`, `ZeroShares()`,
`AmountTooSmall()`, `TransferFailed()`, `Reentrancy()`.

Events (activity feed source — FR-021): `Deposit(address indexed caller, uint256 amount,
uint256 shares)`, `Withdraw(address indexed caller, uint256 shares, uint256 amount)`.

### 1.2 FaucetToken (contracts/src/FaucetToken.sol — NEW)

ERC-20 "Vault Test Token" (VTT), 18 decimals, OpenZeppelin v5.7.0, no owner.

| Attribute | Type | Validation / rule |
|-----------|------|--------------------|
| `name` / `symbol` / `decimals` | `"Vault Test Token"` / `"VTT"` / `18` | ERC-20 standard surface |
| `FAUCET_AMOUNT` | `uint256 constant = 1000e18` | Minted per successful claim (FR-005) |
| `COOLDOWN` | `uint256 constant = 24 hours` | Rolling per-address window (FR-005) |
| `lastClaimAt[account]` | `mapping(address => uint256)` | `0` = never claimed |

Operations and state transitions:

```text
faucet()
  now < lastClaimAt[msg.sender] + COOLDOWN (and lastClaimAt != 0)
                           -> revert CooldownActive(lastClaimAt[msg.sender] + COOLDOWN)
  lastClaimAt[msg.sender] = now
  _mint(msg.sender, 1000e18)
  emit Claimed(caller, amount)

nextClaimAt(account) -> uint256   [view]
  lastClaimAt == 0 -> 0            (claimable now)
  else              -> lastClaimAt + COOLDOWN
```

- Error: `CooldownActive(uint256 availableAt)` (FR-018/US4.2 — UI shows remaining time from
  `availableAt`).
- Event: `Claimed(address indexed caller, uint256 amount)`.
- Supply is unbounded (public faucet) — acceptable for a test token; documented in README.

### 1.3 Share (derived view of Vault state)

| Field | Derivation | Display rule |
|-------|------------|--------------|
| `balance` | `Vault.balanceOf(account)` | Raw bigint, formatted to 18 dec |
| `value` | `balance * vaultBalance / totalSupply` (floor) | Same as withdraw estimate (US3.2) |
| `pctOfVault` | `balance * 10_000 / totalSupply` basis points (floor) | 0–100% with 2 decimals (FR-008) |
| `sharePrice` | `vaultBalance * 10^18 / totalSupply` (scaled) | `null` → explanatory placeholder in bootstrap (edge case) |

Relationships: a Share belongs to exactly one account; the Vault holds N shares (N ≥ 1 after
bootstrap: the dead address's 1000 are permanent); FaucetToken is the Vault's `token`.

### 1.4 ActivityEntry (derived from Vault logs)

| Field | Source | Rules |
|-------|--------|-------|
| `type` | event kind | `"Deposit"` \| `"Withdraw"` |
| `account` | `caller` | Displayed truncated; highlighted when == connected address (assumption, US5.4) |
| `amount` | event `amount` | Token base units → 18-dec display |
| `shares` | event `shares` | Same |
| `blockNumber`, `txHash`, `logIndex` | log metadata | Dedupe key = `(txHash, logIndex)` |
| `timestamp` | block timestamp (resolved per block, cached) | Relative "x min ago" display |
| `explorerUrl` | `https://sepolia.etherscan.io/tx/{txHash}` | **Only** chain 11155111; `null` on 31337 (FR-022) |

Retention/scope: newest 20 after sort (block desc, logIndex desc); fetched from
`deployBlock` in ≤10k-block chunks with auto-halving (research D11).

---

## 2. Client state entities (frontend)

### 2.1 WalletSession

| Field | Values | Transitions |
|-------|--------|-------------|
| `status` | `disconnected → connecting → connected \| error → disconnected` | `connect()` / `disconnect()` / connector failure |
| `address` | `0x… \| null` | set on connect; cleared on disconnect/account change |
| `chainId` | `31337 \| 11155111 \| other` | wallet-driven; `other` triggers wrong-network banner (FR-003) |
| `connectorId` | `injected \| walletConnect \| null` | WalletConnect entry exists only if env configured (D14) |

Validation: write actions require `status === connected && chainId ∈ {31337, 11155111}`
(FR-002/FR-003); otherwise read-only dashboard + connect/switch prompts (FR-004).

### 2.2 DepositFormState (FR-011, FR-012, US2)

```text
idle ──confirm──> approving ──receipt──> depositing ──receipt──> success ──dismiss──> idle
  │                   │                      │
  └──validation────> blocked (inline msg, no tx)          any step: reject/fail ──> error ──retry──> idle
  └──allowance >= amount (skip approving) ──> depositing
```

| Guard (pre-tx validation) | Message source |
|---------------------------|----------------|
| input empty/zero | FR-013 inline message |
| `amount > userTokenBalance` | FR-013 / FR-020 "insufficient balance" |
| bootstrap && `amount <= 1000` | FR-014 dead-share explanation |
| not connected / wrong network | FR-003/FR-004 prompts (form disabled) |

### 2.3 WithdrawFormState (FR-015..FR-017, US3)

```text
idle ──confirm──> withdrawing ──receipt──> success ──dismiss──> idle
  │                     │
  └──validation──> blocked (zero / > share balance)     reject/fail ──> error ──retry──> idle
```

`Max` fills `Vault.balanceOf(account)` (US3.1); live estimate via
`estimateWithdraw(shares, totalSupply, vaultBalance)` (floor).

### 2.4 FaucetClaimState (FR-005..FR-007, US4)

```text
idle ──claim──> claiming ──receipt──> success ──> idle (cooldown active)
  │                 │
  └──nextClaimAt > now ──> disabled + countdown        reject/fail ──> error ──> idle
```

Cooldown derived from a single `nextClaimAt(account)` read; `0` ⇒ claimable (D3).

### 2.5 VaultStats (FR-008, FR-009)

One multicall snapshot (D9) producing: `tvl` (= `token.balanceOf(vault)`), `totalShares`,
`sharePrice` (nullable), `userShares`, `userTokenBalance`, `userPct` (percent × 10⁴ for
four-decimal display — denominator `totalSupply` includes the dead shares). Refresh triggers:
tx receipt confirmation, account change, network change (FR-009); stale data shows a subtle
"updating…" indicator rather than blanking (SC-002: never an indefinite spinner).

### 2.6 Error surface → friendly message mapping (FR-018, FR-019)

**Single source of truth**: [`contracts/chain-interface.md` §4](../contracts/chain-interface.md)
owns the complete error → friendly-message table (vault custom errors, `CooldownActive`,
OpenZeppelin `ERC20InsufficientAllowance`/`ERC20InsufficientBalance`, user rejection,
insufficient gas, wrong network, not connected, RPC unreachable, and the unmatched
fallback). This section intentionally holds no copy of the table to prevent drift —
`web/src/lib/errors.ts` (T018) and the UI contracts implement from that single table.

---

## 3. Configuration entities

### 3.1 `web/src/config/deployments.json` (generated, committed for Sepolia)

```json
{
  "31337":   { "faucetToken": "0x…", "vault": "0x…", "deployBlock": 12 },
  "11155111": { "faucetToken": "0x…", "vault": "0x…", "deployBlock": 8123456 }
}
```

- Keyed by chain id (only 31337 / 11155111 ever written — Principle V).
- `deployBlock` = min block number of the two deployment receipts (activity feed lower
  bound, US5/FR-021).
- Produced by `scripts/sync-deployments.mjs` from `contracts/broadcast/**/run-latest.json`
  (D15); missing entry for the active chain ⇒ friendly "Vault not deployed on this network"
  state, never a hardcoded fallback.

### 3.2 Environment contract (see contracts/env-config.md for the full table)

| Variable | Consumer | Secret? |
|----------|----------|---------|
| `PRIVATE_KEY` | `Deploy.s.sol` via `vm.envUint` (read from `contracts/.env`) | **Yes** — never printed/logged/committed |
| `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY` | `scripts/deploy-sepolia.sh` | Treat as sensitive; gitignored file |
| `VITE_SEPOLIA_RPC_URL` | wagmi transport (optional, public-RPC fallback) | No |
| `VITE_REOWN_PROJECT_ID` | WalletConnect connector (optional) | No (public client id) |

### 3.3 Relationships summary

```text
FaucetToken 1──* claim (lastClaimAt, Claimed events)
Vault 1──1 FaucetToken (token, per network)
Vault 1──* Share (balanceOf, non-transferable)
Vault 1──* ActivityEntry (Deposit/Withdraw logs from deployBlock)
WalletSession 1──0..1 DepositFormState / WithdrawFormState / FaucetClaimState
deployments.json 1──1 per-chain {FaucetToken, Vault, deployBlock}
```
