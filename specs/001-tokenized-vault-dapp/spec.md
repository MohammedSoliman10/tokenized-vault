# Feature Specification: Tokenized Vault Dapp

**Feature Branch**: `001-tokenized-vault-dapp`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Build "Tokenized Vault": a simple, polished dapp where users deposit an ERC-20 token into a share-based Vault and withdraw it later. Users connect a wallet via a custom modal (MetaMask/injected, optional WalletConnect) and switch between Anvil and Sepolia; claim free test tokens from a public faucet (FaucetToken, 1000 per 24h per address); see vault stats; deposit with estimated shares, approve-then-deposit, clear pending/success/error states; withdraw shares with Max and estimated tokens out; see recent Deposit/Withdraw activity from onchain events with block explorer links; handle wallet-not-connected, wrong network, zero amounts, insufficient balance/allowance, user-rejected tx, and the vault's custom errors (ZeroAmount, ZeroShares, AmountTooSmall, TransferFailed, Reentrancy) as friendly messages; first deposit must exceed 1000 base units (dead shares) and the UI must explain this. Scope also includes a new FaucetToken contract, contract tests (unit, fuzz, invariant) and a deploy script for Anvil and Sepolia with Etherscan verification, the full frontend scaffold, every professional repo file required by the constitution, and a dark, clean, minimal, responsive design. Out of scope: share transfers, mainnet deployment, multiple vaults."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect wallet and view vault dashboard (Priority: P1)

A visitor opens the dapp and can immediately read live vault statistics (total value locked,
total shares, share price, their balance and share of the vault if connected). To interact, they
connect their wallet through a custom connection modal and, if they are on the wrong network,
are guided to switch to either the local Anvil network or Sepolia.

**Why this priority**: Nothing else works without a wallet connection and the correct network.
The dashboard also delivers standalone value: anyone can understand the vault's state without
transacting, making this the foundation every other story builds on.

**Independent Test**: Open the dapp with no wallet connected and verify stats render read-only;
connect an injected wallet and verify the account and network are displayed; with the wallet on
an unsupported chain, verify a switch-network prompt appears and write actions are blocked.

**Acceptance Scenarios**:

1. **Given** no wallet is connected, **When** the dapp loads, **Then** vault statistics display
   read-only and every action control prompts the user to connect first.
2. **Given** the user clicks connect, **When** they approve an injected wallet (e.g., MetaMask)
   in the custom modal, **Then** their account address and current network are shown.
3. **Given** the wallet is on an unsupported network, **When** the dapp detects it, **Then** a
   prominent prompt offers to switch to a supported network and deposit/withdraw/faucet actions
   are disabled until the switch succeeds.
4. **Given** a connected user on a supported network, **When** they view the dashboard, **Then**
   total value locked, total shares, share price, their share balance, their token balance, and
   their percentage of the vault are all visible and consistent with on-chain state.

---

### User Story 2 - Deposit tokens for shares (Priority: P2)

A connected user with test tokens enters a deposit amount, sees how many shares they will
receive, approves the token spend when required, and confirms the deposit. The UI keeps them
informed through every step and updates their balances on success.

**Why this priority**: Deposit is the core action of the product; without it there is no vault
activity to demonstrate.

**Independent Test**: With a funded wallet on a supported network, deposit a token amount and
verify shares are minted, stats update, and the full approve-then-deposit flow completes with
visible state transitions.

**Acceptance Scenarios**:

1. **Given** a connected user with sufficient token balance, **When** they enter a deposit
   amount, **Then** the estimated shares they will receive update live as they type.
2. **Given** the vault needs a token approval first, **When** they confirm the deposit, **Then**
   they are guided through approval and then deposit as distinguishable steps with
   pending/success/error states for each.
3. **Given** an empty, zero, or over-balance amount, **When** they attempt to deposit, **Then**
   the action is blocked before any transaction is proposed and an inline friendly message
   explains why.
4. **Given** this is the very first deposit ever and it is 1000 base units or less, **When** it
   is attempted, **Then** the user sees a friendly message explaining that the first deposit must
   exceed 1000 base units and why dead shares exist.
5. **Given** the user rejects a transaction in their wallet, **When** the rejection is detected,
   **Then** a calm "transaction cancelled" message is shown and the app remains fully usable.

---

### User Story 3 - Withdraw shares for tokens (Priority: P3)

A shareholder enters how many shares to redeem (or taps Max), sees the estimated tokens they
will receive, and confirms the withdrawal, receiving their tokens back.

**Why this priority**: Completes the deposit/withdraw round trip that proves the vault works;
without it users cannot exit their position.

**Independent Test**: With a non-zero share balance, withdraw shares and verify tokens are
returned, the share balance decreases, and stats update.

**Acceptance Scenarios**:

1. **Given** the user holds shares, **When** they enter a share amount, **Then** the estimated
   tokens out update live and **Max** fills their entire share balance.
2. **Given** a valid share amount within their balance, **When** they confirm, **Then** the
   transaction completes with pending/success states and tokens arrive in their wallet.
3. **Given** zero shares or more shares than they hold, **When** they attempt to withdraw,
   **Then** the action is blocked with an inline friendly message.
4. **Given** the user rejects the transaction in their wallet, **When** the rejection is
   detected, **Then** a friendly cancelled message is shown and no state is corrupted.

---

### User Story 4 - Claim free test tokens from the faucet (Priority: P4)

A brand-new visitor with an empty wallet claims FaucetToken test tokens from the built-in
public faucet so they can try depositing without needing tokens from elsewhere.

**Why this priority**: Removes the onboarding barrier for anyone without tokens, but deposit and
withdraw remain demonstrable with pre-funded demo accounts, so the faucet ranks below the core
round trip.

**Independent Test**: With a connected, eligible address, claim from the faucet and verify the
token balance increases; attempt a second claim immediately and verify the cooldown is enforced.

**Acceptance Scenarios**:

1. **Given** a connected address that has not claimed in the last 24 hours, **When** they claim,
   **Then** they receive 1000 test tokens and their balance updates.
2. **Given** an address that claimed within the last 24 hours, **When** they view the faucet,
   **Then** the claim action is disabled and shows the remaining time until the next claim.
3. **Given** any state, **When** the user rejects the claim transaction, **Then** a friendly
   cancelled message appears and the cooldown state is unchanged.

---

### User Story 5 - Review recent vault activity (Priority: P5)

A visitor sees the most recent deposits and withdrawals pulled from on-chain events, with links
to view each transaction on the block explorer.

**Why this priority**: Adds transparency and proof-of-life for the demo but is supplementary to
the core deposit/withdraw functionality.

**Independent Test**: After a deposit occurs, load the activity view and verify the new event
appears with amounts, account, time, and an explorer link where applicable.

**Acceptance Scenarios**:

1. **Given** recent deposit/withdraw events exist, **When** the activity view loads, **Then**
   the latest events are listed with type, account, amounts, and timestamp.
2. **Given** a transaction on Sepolia, **When** the user clicks its link, **Then** the public
   block explorer opens for that transaction.
3. **Given** a transaction on the local network (no public explorer), **When** the entry is
   shown, **Then** the link is omitted and the entry is presented without a broken link.
4. **Given** the connected user's own transaction confirms, **When** activity refreshes, **Then**
   their entry appears (highlighted) among the recent events.

---

### Edge Cases

- Empty or zero deposit/withdraw input: submit disabled with an inline explanation.
- Amount exceeds the user's token balance (deposit) or share balance (withdraw): blocked with a
  friendly message before any transaction is proposed.
- Deposit amount so small it rounds to zero shares (subsequent deposits): friendly message
  explaining a larger amount is needed.
- First deposit boundary: exactly 1000 base units is rejected; 1001 base units succeeds.
- Allowance already sufficient: the deposit proceeds directly without a redundant approval step.
- Allowance revoked or reduced between opening the form and confirming: flow re-enters the
  approval step gracefully.
- User rejects the transaction at any step (approve, deposit, withdraw, faucet): friendly
  cancelled message; no stuck pending states.
- Wallet disconnected or account switched while a form is open: form state resets for the new
  account and no stale transaction is submitted.
- Network switched while a form is open: form state resets and actions re-validate against the
  new network.
- Vault in bootstrap state (no deposits yet): share price and TVL display an explanatory
  placeholder until the first deposit establishes them.
- Faucet claimed exactly at the 24-hour boundary: claim becomes available again.
- Deposit/withdraw transaction fails on-chain (e.g., transfer failure or reentrancy guard):
  the specific failure maps to a friendly message; balances remain consistent.
- Estimate vs. final result: rounding may cause the final on-chain amounts to differ by a few
  base units from the live estimate; the confirmed result from the transaction is always
  displayed as authoritative.
- Node/RPC unreachable or slow: a clear loading/error state with a retry option appears
  instead of infinite spinners.
- Very large amounts: values display in a readable, scaled format without precision loss.

## Requirements *(mandatory)*

### Functional Requirements

**Wallet and network**

- **FR-001**: Users MUST be able to connect and disconnect a wallet through a custom connection
  modal supporting injected browser wallets (e.g., MetaMask), with optional mobile/remote wallet
  linking available when configured.
- **FR-002**: The dapp MUST support exactly two networks — Anvil local (chain id 31337) and
  Sepolia (chain id 11155111) — and MUST let users switch between them from the interface.
- **FR-003**: When the wallet is on an unsupported network, the dapp MUST show a prominent
  switch-network prompt and MUST block all deposit, withdraw, and faucet actions until the user
  is on a supported network.
- **FR-004**: When no wallet is connected, vault statistics MUST still be viewable read-only,
  and every write action MUST prompt the user to connect first.

**Faucet**

- **FR-005**: Users MUST be able to claim FaucetToken test tokens from a public faucet: 1000
  whole tokens per address per rolling 24-hour period.
- **FR-006**: During the 24-hour cooldown the claim action MUST be disabled and MUST show the
  remaining time until the next claim is available.
- **FR-007**: Faucet claims MUST show pending/success/error states like all other transactions.

**Dashboard statistics**

- **FR-008**: The dashboard MUST display: total value locked, total shares, share price (tokens
  per share), the user's share balance, the user's token balance, and the user's percentage of
  the vault.
- **FR-009**: Statistics MUST refresh automatically after every confirmed transaction, account
  change, and network change.

**Deposit**

- **FR-010**: The deposit form MUST show a live estimate of shares to be received for the
  entered token amount.
- **FR-011**: Deposit MUST follow an approve-then-deposit flow when the required allowance is
  insufficient, presenting approval and deposit as distinguishable steps; when allowance is
  already sufficient, deposit MUST proceed without a redundant approval step.
- **FR-012**: The deposit flow MUST display clear pending, success, and error states, including
  which step (approval or deposit) is in progress.
- **FR-013**: The deposit form MUST block empty, zero, and over-balance amounts before any
  transaction is proposed, with inline friendly messages.
- **FR-014**: The first deposit into an empty vault MUST exceed 1000 base units (dead shares);
  the UI MUST explain this minimum and its purpose, and rejections MUST cite the rule.

**Withdraw**

- **FR-015**: The withdraw form MUST accept a share amount, provide a **Max** button that fills
  the user's full share balance, and show a live estimate of tokens to be received.
- **FR-016**: The withdraw flow MUST display clear pending, success, and error states.
- **FR-017**: The withdraw form MUST block zero amounts and amounts exceeding the user's share
  balance before any transaction is proposed, with inline friendly messages.

**Error handling**

- **FR-018**: Every known vault failure — `ZeroAmount`, `ZeroShares`, `AmountTooSmall`,
  `TransferFailed`, `Reentrancy` — MUST be mapped to a friendly, plain-language message; raw
  error or revert text MUST NOT be shown to users.
- **FR-019**: User-rejected transactions MUST be presented as a neutral cancellation, distinct
  from genuine failures, and MUST NOT leave the interface in a pending state.
- **FR-020**: Insufficient balance or insufficient allowance situations MUST be detected before
  submission and explained with an actionable message (e.g., claim faucet tokens or approve
  spending).

**Activity feed**

- **FR-021**: The dapp MUST show recent Deposit and Withdraw activity derived from on-chain
  events, including event type, account, amounts, shares, and timestamp.
- **FR-022**: Each activity entry MUST link to the transaction on the network's block explorer
  when a public explorer exists; entries on the local network MUST be shown without an external
  link.
- **FR-023**: The activity list MUST show a bounded set of the most recent events and MUST
  refresh when new transactions confirm.

**Experience and design**

- **FR-024**: The interface MUST use a dark, clean, minimal visual design and MUST be usable on
  screen widths from 360px mobile to desktop.

**Contracts, deployment, and repository deliverables**

- **FR-025**: A new FaucetToken contract MUST provide the public 1000-per-24h-per-address
  faucet described above and MUST be usable as the vault's deposit asset.
- **FR-026**: Contract changes MUST ship with automated tests covering unit, fuzz, and invariant
  tiers; the invariant suite MUST enforce: vault token balance >= value of all non-dead shares.
- **FR-027**: A repeatable deployment process MUST support both Anvil and Sepolia and MUST
  include automatic verification of deployed contracts on the network's block explorer.
- **FR-028**: Contract addresses and network endpoints MUST be supplied by configuration
  (environment/config files), never hardcoded in interface components.
- **FR-029**: The repository MUST ship the professional open-source file set required by the
  project constitution: README (including an architecture diagram and the design notes below),
  LICENSE (MIT), SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md, GitHub Actions
  CI, and issue/PR templates.
- **FR-030**: The README MUST document these design notes: shares are non-transferable,
  fee-on-transfer tokens are unsupported, and 1000 dead shares protect against first-depositor
  inflation attacks.
- **FR-031**: No secrets may exist anywhere in the repository; only placeholder `.env.example`
  files may be committed, and the deploy key MUST never be printed, logged, or committed.

### Key Entities

- **Vault**: Holds the deposited ERC-20 asset and issues shares. Key attributes: total value
  locked (token balance held), total shares outstanding, share price (value per share). Behaves
  differently on the very first deposit (dead-share bootstrap) than afterwards.
- **Share**: A user's proportional claim on the vault's assets. Key attributes: balance per
  account, value (share price × balance), percentage of total. Non-transferable — only minted on
  deposit and burned on withdraw.
- **FaucetToken**: A free test ERC-20 with a built-in public faucet. Key attributes: user
  balance, decimals/scale, last claim timestamp per address (drives the 24-hour cooldown).
- **Activity entry**: A record of a Deposit or Withdraw on-chain event. Key attributes: event
  type, account address, token amount, share amount, timestamp, transaction reference (with
  explorer link where applicable).
- **Wallet session**: The connected account and selected network. Key attributes: account
  address, connection state, current chain, support status of that chain.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor with a fresh wallet can claim test tokens, deposit, and see
  their updated balance in under 5 minutes without external help or documentation.
- **SC-002**: 100% of deposit, withdraw, and faucet attempts show a visible state change within
  one second of the user's action (measured against local Anvil or public Sepolia RPC under
  normal conditions), and always resolve to a success, error, or cancellation message — never
  an indefinite spinner.
- **SC-003**: 100% of the five specified vault failures surface as plain-language messages, with
  zero raw error/revert strings visible in the interface.
- **SC-004**: 100% of rejections caused by the first-deposit minimum include the explanation of
  the 1000 base-unit dead-share rule in the message shown.
- **SC-005**: A deposit-then-withdraw round trip on a standard token returns an amount within 1
  base unit per operation of what was originally deposited (rounding tolerance only, no value
  leakage).
- **SC-006**: The vault solvency invariant (vault token balance >= value of all non-dead shares)
  holds across the full automated fuzz and invariant suite, and the suite passes on 100% of
  changes before any task is marked done.
- **SC-007**: 90% of first-attempt users complete a full deposit-withdraw round trip in user
  testing without asking for help.
- **SC-008**: Vault statistics appear within 2 seconds of opening the dapp (measured against
  local Anvil or public Sepolia RPC under normal conditions), and the interface remains fully
  usable from 360px mobile width up to desktop.

## Assumptions

- "1000 per 24h per address" means 1000 whole FaucetTokens per claim (scaled by the token's
  decimals), with a rolling 24-hour cooldown tracked per address.
- Activity feed shows vault-wide recent events (bounded to a small recent set), with the
  connected user's own entries highlighted — covering both "my activity" and "network activity"
  expectations without a mode toggle.
- Vault statistics are readable without a wallet connection (public chain data); only write
  actions require connection.
- Optional remote wallet linking (e.g., WalletConnect-style) is enabled only when configured;
  injected wallets are always available. If unconfigured, the option is hidden, not broken.
- Live estimates (shares out, tokens out) round in the user's disfavored direction; the final
  on-chain result from the transaction receipt is always authoritative and displayed.
- The deposit asset is a standard ERC-20: fee-on-transfer and rebasing tokens are explicitly
  unsupported (documented as a design note, per FR-030).
- All reads come directly from the chain; no backend, indexer, or database is required for this
  scope.
- Supported environments are Anvil (local) and Sepolia (testnet) only; contract addresses come
  from configuration per FR-028.
- Technical stack, tooling, code structure, and architecture are governed by the project
  constitution and will be fixed during the planning phase — this specification stays focused on
  behavior and deliverables.
- A Vercel configuration file for the `web/` app is included in scope, but deployment itself
  is manual and gated on the owner's explicit go-ahead — no task deploys automatically.
- Explicitly out of scope: share transfers, mainnet deployment, and multiple vaults.
