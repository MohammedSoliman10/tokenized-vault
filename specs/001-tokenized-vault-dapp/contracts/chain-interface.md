# Chain Interface (ABI Surface)

**Feature**: 001-tokenized-vault-dapp | **Date**: 2026-10-07

The exact surface the frontend consumes. ABIs are generated into `web/src/abi/` by
`scripts/sync-abis.mjs` from `contracts/out/**/*.json` with `as const` typing; the tables
below are the human-readable contract of record.

---

## 1. Vault (FROZEN — `contracts/src/Vault.sol`)

### Read functions

| Function | Signature | Returns | Used by |
|----------|-----------|---------|---------|
| Total shares | `totalSupply()` | `uint256` | `useVaultStats`, `vaultMath` |
| Shares of | `balanceOf(address)` | `uint256` | `useVaultStats`, Max button, withdraw validation |
| Asset | `token()` | `address` | config wiring / sanity read |

### Write functions

| Function | Signature | Precondition (reverts if unmet) | Gas notes |
|----------|-----------|----------------------------------|-----------|
| Deposit | `deposit(uint256 amount) returns (uint256 shares)` | `amount > 0` (`ZeroAmount`); bootstrap `amount > 1000` (`AmountTooSmall`); resulting shares `> 0` (`ZeroShares`); ERC-20 allowance ≥ amount and transfer succeeds (`TransferFailed`) | first token approval must precede the first deposit per account |
| Withdraw | `withdraw(uint256 shares) returns (uint256 amount)` | `shares > 0` (`ZeroShares`); user holds ≥ shares (Solidity underflow otherwise — UI pre-validates); transfer succeeds (`TransferFailed`) | amount = `shares * vaultBalance / totalSupply` (floor) |

Both functions are `nonReentrant` (guard state `1 → 2 → 1`).

### Events (activity feed source)

```solidity
event Deposit(address indexed caller, uint256 amount, uint256 shares)
event Withdraw(address indexed caller, uint256 shares, uint256 amount)
```

Filters used by `useActivity`: `address = vault`, `fromBlock = deployBlock`
(from `deployments.json`), chunked ≤ 10,000 blocks, dedupe key `(transactionHash, logIndex)`.

### Custom errors (must decode to friendly messages)

```solidity
error ZeroAmount();      // deposit of 0
error ZeroShares();      // withdraw of 0, or deposit rounding to 0 shares
error AmountTooSmall();  // first deposit <= 1000 base units (dead shares)
error TransferFailed();  // ERC-20 returned false
error Reentrancy();      // nested call during a deposit/withdraw
```

### Bootstrap rule (documented in UI, FR-014)

If `totalSupply == 0`: first deposit MUST be **> 1000 base units** of the asset (VTT wei);
1000 shares are minted to `0xdead`, depositor receives `amount - 1000` shares.

---

## 2. FaucetToken (NEW — `contracts/src/FaucetToken.sol`)

ERC-20 standard surface (`totalSupply`, `balanceOf`, `transfer`, `approve`, `allowance`,
`transferFrom`, `Transfer`/`Approval` events) plus:

| Member | Signature | Behavior |
|--------|-----------|----------|
| Faucet claim | `faucet()` | Mints `FAUCET_AMOUNT = 1000e18` to `msg.sender`; reverts `CooldownActive(availableAt)` inside the 24h window |
| Next claim time | `nextClaimAt(address account) view returns (uint256)` | `lastClaimAt + 24 hours`, or `0` if never claimed (0 ⇒ claimable now) |
| Constant | `FAUCET_AMOUNT` (= `1000e18`) | Per-claim amount |
| Constant | `COOLDOWN` (= `86400`) | Seconds per address |

```solidity
error CooldownActive(uint256 availableAt);   // availableAt = lastClaim + 24h
event Claimed(address indexed caller, uint256 amount);
```

Faucet claims are **not** part of the activity feed (feed shows Deposit/Withdraw only).

---

## 3. Generic ERC-20 reads (`web/src/abi/ERC20.ts`)

Extracted from the FaucetToken artifact's standard subset; consumed for:

- `balanceOf(vault)` → TVL and share-math denominator
- `balanceOf(user)` → token balance display and deposit validation
- `allowance(user, vault)` → approve-skip decision (FR-011)
- `approve(vault, amount)` → exact-amount approval step

---

## 4. Error → message mapping (contract for `web/src/lib/errors.ts`)

Decoding uses viem's `BaseError.walk()` + `ContractFunctionRevertedError.data` to recover
custom-error names/args; anything unmatched falls back to a generic "Transaction failed —
please try again" (never a raw revert string — FR-018).

| Error | Friendly message |
|-------|------------------|
| `ZeroAmount()` | Enter an amount greater than zero. |
| `ZeroShares()` | That amount rounds to zero shares — try a larger amount. |
| `AmountTooSmall()` | The first deposit must be more than 1000 base units. Dead shares (1000) protect against inflation attacks. |
| `TransferFailed()` | The token transfer failed — please try again. |
| `Reentrancy()` | Blocked for safety — please try again. |
| `CooldownActive(availableAt)` | Faucet already claimed — next claim in {relative time}. |
| `ERC20InsufficientAllowance` (OpenZeppelin, allowance race) | Token allowance too low — approve the amount first. |
| `ERC20InsufficientBalance` (OpenZeppelin) | Insufficient token balance — claim test tokens from the faucet or try a smaller amount. |
| User rejection (4001 / `UserRejectedRequestError`) | Transaction cancelled — no changes were made. |
| Insufficient gas (−32000 / "insufficient funds") | Not enough {native currency} for gas. |
| Unmatched | Transaction failed — please try again. |

Display-state rules: pending states appear within 1s of action and always resolve
(success / error / cancelled) — SC-002. See [ui-contracts.md](./ui-contracts.md).
