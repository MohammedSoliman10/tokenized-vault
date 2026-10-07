---

description: "Task list for Tokenized Vault dapp implementation"
---

# Tasks: Tokenized Vault Dapp

**Input**: Design documents from `/specs/001-tokenized-vault-dapp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included by explicit request — Foundry unit/fuzz/invariant suites (FR-026) and
Vitest for `vaultMath.ts` (owner instruction).

**Organization**: Setup → Foundational (contracts + their tests FIRST, then shared frontend
foundations) → one phase per user story P1–P5 → Polish (docs, repo files, CI, Vercel config,
validation) → final manual publishing gate.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 (Setup, Foundational, and Polish phases carry no story label)
- Every task names the exact file path(s) it touches and ends with a **Verify:** command
  that MUST exit 0 before the task counts as done (Constitution Principle IV)

## Hard Rules (Constitution v1.0.0)

- **FROZEN**: `contracts/src/Vault.sol` and `contracts/src/SollyWeb3.sol` are NEVER modified
  by any task — they are the source of truth and require explicit owner approval to change
  (Principle I). No task below touches them.
- **No secrets** in any committed file; only `.env.example` placeholders. The deploy key comes
  from gitignored `contracts/.env` and is never printed, logged, or committed (Principle III).
- **No task pushes to GitHub and no task deploys to Vercel** — publishing is the final manual
  step (T040) awaiting the owner's explicit go-ahead.
- Addresses come from `web/src/config/deployments.json` / env — never hardcoded in components
  (Principle V). Supported chains only: 31337, 11155111.
- Conventional Commits for every commit.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the `web/` package so all later tasks have a green baseline.

- [X] T001 Scaffold the web package with strict TS and lint from day one: create
  `web/package.json` (scripts: `dev`, `build`, `preview`, `typecheck`, `lint`; deps pinned
  per plan.md: vite, react 18, react-dom, typescript, wagmi v2, viem,
  @tanstack/react-query, @radix-ui/react-dialog, tailwindcss, @tailwindcss/vite,
  @fontsource/inter, eslint + typescript-eslint + react-hooks plugins, vitest,
  @testing-library/react, jsdom), `web/tsconfig.json` (`strict: true`,
  `noUncheckedIndexedAccess: true`), `web/eslint.config.js` (ESLint 9 flat:
  typescript-eslint recommended, react-hooks rules, ignore `web/src/abi/` generated files),
  `web/vite.config.ts` (react plugin), `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`.
  Verify: `cd web && npm install && npm run typecheck && npm run lint && npm run build`
- [X] T002 [P] Configure Tailwind v4 + dark theme + Inter: edit `web/vite.config.ts`
  (`@tailwindcss/vite` plugin), create `web/src/index.css` (`@import "tailwindcss";` CSS-first
  `@theme` tokens, near-black surfaces, accent color) and import Inter from
  `@fontsource/inter` in `web/src/main.tsx`.
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [X] T003 [P] Configure Vitest: create `web/vitest.config.ts` (jsdom environment so React
  Testing Library component tests can run alongside pure-function tests) and add
  `"test": "vitest run"` to `web/package.json` (no test files yet — the boundary suite
  arrives in T017).
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [X] T004 [P] Create env contract for the frontend: `web/.env.example` (placeholders only:
  `VITE_SEPOLIA_RPC_URL=`, `VITE_REOWN_PROJECT_ID=`) and `web/src/vite-env.d.ts` (typed
  `ImportMetaEnv` for those two optional keys).
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`

**Checkpoint**: Web package builds, typechecks, and lints green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: FaucetToken + ALL contract tests FIRST (they gate every frontend task), then
deploy/ABI tooling, then shared frontend foundations.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### 2a. Contracts & Foundry tests (before any dependent frontend task)

- [X] T005 Implement `contracts/src/FaucetToken.sol` per data-model §1.2 / research D3:
  OZ v5.7.0 ERC20 ("Vault Test Token", "VTT", 18 decimals), `FAUCET_AMOUNT = 1000e18`,
  `COOLDOWN = 24 hours`, `faucet()` minting to `msg.sender` with per-address
  `lastClaimAt` check reverting `error CooldownActive(uint256 availableAt)`
  (`availableAt = lastClaim + 24h`), `event Claimed(address indexed caller, uint256 amount)`,
  `function nextClaimAt(address) view returns (uint256)` (0 when never claimed).
  Verify: `cd contracts && forge build && forge test`
- [X] T006 [P] FaucetToken unit + fuzz tests in `contracts/test/FaucetToken.t.sol`: claim mints
  exactly 1000e18 + emits `Claimed`; second claim within 24h reverts `CooldownActive(last+86400)`
  (use `vm.warp` at boundary: `+86399` fails, `+86400` succeeds); `nextClaimAt` returns 0
  before first claim, `last+86400` after; ERC-20 transfer/approve/allowance basics; **FUZZ
  (fuzzed timestamps + addresses)**: the claim amount is always exactly `1000e18`, and a
  second claim reverts `CooldownActive(availableAt)` for every timestamp strictly before
  `lastClaim + 24h` and succeeds at/after it (Constitution II — FaucetToken fuzz tier).
  Verify: `cd contracts && forge test`
- [X] T007 Vault unit tests + shared fixture: create `contracts/test/VaultTestBase.sol`
  (deploys FaucetToken + Vault fixture, helper actors) and `contracts/test/Vault.t.sol`:
  deposit/withdraw happy paths and events; bootstrap branch — first deposit `<= 1000` base
  units reverts `AmountTooSmall`, `1001` succeeds (1000 shares to `0xdead`, caller gets 1);
  `ZeroAmount` (deposit 0), `ZeroShares` (withdraw 0), `AmountTooSmall`, `TransferFailed`
  (mock returning false); shares non-transferable by construction (no transfer fn — assert
  ABI surface has none). Verify: `cd contracts && forge test`
- [X] T008 [P] Fuzz tests in `contracts/test/VaultFuzz.t.sol` (extends `VaultTestBase`):
  deposit→withdraw round trip returns within floor-rounding tolerance for fuzzed amounts;
  `shares == amount * totalSupply / balance` (floor) for fuzzed supplies; larger deposits
  never mint fewer shares (monotonicity); first-deposit boundary fuzz around 1000/1001.
  Verify: `cd contracts && forge test`
- [X] T009 [P] Invariant suites: `contracts/test/VaultInvariant.t.sol` +
  `contracts/test/helpers/VaultHandler.sol` (ghost sums incl. dead address, bounded
  `runs = 256`, `depth = 32`) with invariants, verbatim: (1)
  `token.balanceOf(vault) >= value of all non-dead shares` (constitution-required solvency),
  (2) `totalSupply == sum of all balances including the dead address` — handler actions:
  deposit, withdraw, donate, warp; PLUS `contracts/test/FaucetTokenInvariant.t.sol` +
  `contracts/test/helpers/FaucetTokenHandler.sol` with invariants: (3) FaucetToken
  `totalSupply` grows by exactly `1000e18` per successful claim (ghost claim-sum), and
  (4) `nextClaimAt(user)` never decreases across any claim sequence (Constitution II —
  FaucetToken invariant tier). Verify: `cd contracts && forge test`
- [X] T010 [P] Reentrancy test: create `contracts/test/mocks/MaliciousToken.sol`
  (ERC-20 whose `transfer`/`transferFrom` re-enters `deposit`/`withdraw`) and
  `contracts/test/Reentrancy.t.sol` asserting `Reentrancy` error on nested call and state
  consistency after the failed attempt. Verify: `cd contracts && forge test`

*(T006–T010 are mutually parallel — different files — after T005; T008–T010 depend on the
T007 fixture.)*

### 2b. Deploy & codegen tooling

- [X] T011 Create `contracts/script/Deploy.s.sol`: reads key via `vm.envUint("PRIVATE_KEY")`
  (NEVER logs it — logs only deployed addresses), deploys `FaucetToken` then
  `Vault(faucetToken)` per research D6, writes nothing else.
  Verify: `cd contracts && forge build && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 forge script script/Deploy.s.sol && forge test`
  (public Anvil/Hardhat key #0 — local simulation only; the real Sepolia key stays in
  gitignored `contracts/.env`)
- [X] T012 [P] Create shell wrappers `scripts/deploy-anvil.sh` (`set -euo pipefail`,
  exports the public Anvil account #0 key, runs forge script with
  `--rpc-url http://127.0.0.1:8545 --broadcast`) and `scripts/deploy-sepolia.sh`
  (loads `contracts/.env` via `set -a; source contracts/.env; set +a`; NO `set -x`, NO echo
  of values; runs with `--rpc-url $SEPOLIA_RPC_URL --broadcast --verify
  --etherscan-api-key $ETHERSCAN_API_KEY`); `chmod +x` both.
  Verify: `bash -n scripts/deploy-anvil.sh && bash -n scripts/deploy-sepolia.sh`
- [X] T013 [P] Create `scripts/sync-deployments.mjs`: reads
  `contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json` for chains 31337/11155111,
  extracts FaucetToken + Vault `contractAddress`, computes `deployBlock` = min receipt
  `blockNumber`, merges per-chain into `web/src/config/deployments.json`
  (`{chainId: {faucetToken, vault, deployBlock}}`); MUST exit 0 writing `{}` when no
  broadcast exists (fresh clone). Verify: `node scripts/sync-deployments.mjs && cat web/src/config/deployments.json`
- [X] T014 [P] Create `scripts/sync-abis.mjs`: reads forge artifacts under `contracts/out/`
  and writes `web/src/abi/Vault.ts`, `web/src/abi/FaucetToken.ts`, `web/src/abi/ERC20.ts`
  as exported `... as const` arrays (ERC20 = standard subset of the FaucetToken artifact).
  Verify: `cd contracts && forge build && cd .. && node scripts/sync-abis.mjs && cd web && npm run typecheck`

### 2c. Shared frontend foundations

- [ ] T015 Create wagmi config and providers: `web/src/config/chains.ts` (anvil 31337 +
  sepolia 11155111; transports: `http('http://127.0.0.1:8545')` and
  `fallback([http(VITE_SEPOLIA_RPC_URL), http('https://ethereum-sepolia-rpc.publicnode.com')])`
  when unset), `web/src/config/wagmi.ts` (`createConfig` with
  `[injected(), ...(VITE_REOWN_PROJECT_ID ? [walletConnect({projectId})] : [])]` — plain
  wagmi connectors ONLY, no RainbowKit/ConnectKit), `web/src/main.tsx`
  (WagmiProvider + QueryClientProvider), ensure `web/src/config/deployments.json` exists
  (from T013). Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T016 Create `web/src/lib/vaultMath.ts` per research D8: pure bigint,
  floor division mirroring `Vault.sol`: `estimateShares(amount, totalSupply, vaultBalance)`
  (bootstrap `totalSupply == 0`: returns invalid/throws for `amount <= 1000n`, else
  `amount - 1000n`; else `(amount * totalSupply) / vaultBalance`),
  `estimateWithdraw(shares, totalSupply, vaultBalance) = (shares * vaultBalance) / totalSupply`,
  `sharePriceScaled18` (null when `totalSupply == 0`), `userShareBps = shares * 10_000n / totalSupply`.
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T017 Create the Vitest boundary suite `web/src/lib/vaultMath.test.ts` (Vitest already
  configured in T003) covering the FIRST-DEPOSIT BOUNDARY explicitly:
  `estimateShares(1000n, 0n, 0n)` → rejects/returns invalid (contract would revert
  `AmountTooSmall`), `estimateShares(1001n, 0n, 0n)` → `1n` share,
  `estimateShares(1002n, 0n, 0n)` → `2n`; plus floor-rounding round-trips
  (`estimateWithdraw(estimateShares(x,...),...) <= x`) and `sharePriceScaled18` null at
  bootstrap. Verify: `cd web && npm test && npm run typecheck && npm run lint && npm run build`
- [ ] T018 [P] Create `web/src/lib/errors.ts` (decode `ZeroAmount`, `ZeroShares`,
  `AmountTooSmall`, `TransferFailed`, `Reentrancy`, `CooldownActive(availableAt)`,
  OpenZeppelin `ERC20InsufficientAllowance` (allowance race) and `ERC20InsufficientBalance`
  with actionable messages, user rejection (4001/`UserRejectedRequestError`), insufficient
  gas, unmatched → generic; exact friendly wording per contracts/chain-interface.md §4 —
  raw revert strings NEVER rendered) and `web/src/lib/format.ts` (truncated addresses,
  18-dec amount display, relative time).
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`

**Checkpoint**: Foundation ready — contracts fully tested (unit/fuzz/invariant/reentrancy),
deploy + ABI/address sync tooling in place, wagmi/vaultMath/errors shared modules green.
User story implementation can now begin.

---

## Phase 3: User Story 1 - Connect wallet and view vault dashboard (Priority: P1) 🎯 MVP

**Goal**: Custom wallet modal + network switching between Anvil/Sepolia + all six vault
stats (read-only while disconnected).

**Independent Test**: Open with no wallet → stats render read-only and actions prompt
connect (FR-004); connect injected wallet → address + network shown; wrong chain → banner +
disabled actions (FR-003); connected → all six stats visible and chain-consistent (FR-008).

- [ ] T019 [US1] Create `web/src/components/WalletModal.tsx` (headless dialog via
  `@radix-ui/react-dialog`: lists connectors from `useConnectors()` — injected always,
  walletConnect only when registered; `connecting` spinner + `error` states; accessible focus
  trap/Esc/ARIA) and `web/src/components/Header.tsx` (Connect button, truncated address,
  network indicator, Disconnect). Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T020 [P] [US1] Create `web/src/components/NetworkSwitcher.tsx` (two-chain switcher via
  `useSwitchChain`, adds Anvil chain if wallet doesn't know it) and
  `web/src/components/WrongNetworkBanner.tsx` (persistent banner + "Switch network" CTA when
  `chainId ∉ {31337, 11155111}`; deposit/withdraw/faucet controls disabled — FR-003).
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T021 [P] [US1] Create `web/src/hooks/useVaultStats.ts`: one `useReadContracts`
  multicall (`Vault.totalSupply`, `Vault.balanceOf(user)`, `ERC20.balanceOf(vault)`,
  `ERC20.balanceOf(user)`, `ERC20.allowance(user, vault)`, `FaucetToken.nextClaimAt(user)`)
  producing the six stats (tvl, totalShares, sharePrice via `vaultMath` with null→placeholder
  at bootstrap, userShares, userTokenBalance, userPct from `userShareBps`); refresh on tx
  receipt/account/network change (FR-009); previous values stay visible while updating
  (SC-002, no blanking). Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T022 [US1] Create `web/src/components/StatsGrid.tsx` (six labeled stats, responsive
  360px→desktop, connect-prompt placeholders for user rows when disconnected, bootstrap
  explanatory placeholder for share price — never NaN/0 pretending) and wire US1 into
  `web/src/App.tsx` (header + grid layout, dark theme). Verify:
  `cd web && npm run typecheck && npm run lint && npm run build`

**Checkpoint**: US1 fully functional and testable independently (MVP checkpoint).

---

## Phase 4: User Story 2 - Deposit tokens for shares (Priority: P2)

**Goal**: Amount input → live share estimate → approve (exact) → deposit with full
pending/success/error states and all pre-tx guards.

**Independent Test**: Funded account deposits → shares minted, stats update, approve step
skipped when allowance suffices; zero/over-balance/first-deposit-≤1000 blocked inline with
explanations; wallet rejection shows "cancelled" with no stuck spinner.

- [ ] T023 [P] [US2] Create `web/src/hooks/useTokenBalance.ts` as a thin selector over the
  T021 `useVaultStats` snapshot (token `balanceOf` + `allowance(user, vault)` only) — one
  source and one invalidation path for balance/allowance reads (no duplicate fetch paths;
  invalidation after receipts flows from T021).
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T024 [US2] Create `web/src/hooks/useDeposit.ts`: state machine
  `idle → approving → depositing → success | error` per data-model §2.2 — exact-amount
  `approve(vault, amount)` (NEVER unlimited), wait for approval receipt before `deposit`,
  skip `approving` when `allowance >= amount` (FR-011), **re-validate the allowance
  immediately before the `deposit` step and route back to `approving` if it dropped
  mid-flow** (edge case: allowance revoked between open and confirm), decode all failures
  via `errors.ts`, user rejection → cancelled state returning to idle (FR-019).
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T025 [US2] Create `web/src/components/DepositForm.tsx` and wire into `web/src/App.tsx`:
  live share estimate (`vaultMath.estimateShares`), inline guards for empty/zero/over-balance
  amounts (FR-013) and first deposit ≤ 1000 base units with the dead-share explanation
  (FR-014 — wording says "1000 base units", NOT tokens), step indicators for Approve→Deposit,
  pending/success/error display with receipt-confirmed actual amounts.
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`

**Checkpoint**: Deposit round trip works end-to-end from US1's connected state.

---

## Phase 5: User Story 3 - Withdraw shares for tokens (Priority: P3)

**Goal**: Shares input with Max → live token estimate → withdraw with state handling.

**Independent Test**: Share holder withdraws → tokens returned, share balance decreases,
stats update; Max fills full balance; zero/over-balance blocked; rejection cancels cleanly.

- [ ] T026 [P] [US3] Create `web/src/hooks/useWithdraw.ts`: `idle → withdrawing → success |
  error` (data-model §2.3), error decoding via `errors.ts`, rejection → cancelled → idle.
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T027 [US3] Create `web/src/components/WithdrawForm.tsx` and wire into `web/src/App.tsx`:
  shares input, **Max** = full `Vault.balanceOf(account)` (US3.1), live estimate
  (`vaultMath.estimateWithdraw`, floor), inline guards for zero/over-balance shares
  (FR-017), pending/success/error states showing receipt-confirmed amounts.
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`

**Checkpoint**: US1+US2+US3 — full deposit→withdraw round trip demonstrable.

---

## Phase 6: User Story 4 - Claim free test tokens from the faucet (Priority: P4)

**Goal**: Public faucet claim (1000 VTT / 24h / address) with cooldown countdown.

**Independent Test**: Eligible address claims → +1000 VTT balance; immediate second claim
blocked with remaining-time countdown; rejection cancels without changing cooldown.

- [ ] T028 [P] [US4] Create `web/src/hooks/useFaucetClaim.ts`: `idle → claiming → success |
  error`, cooldown derived from `nextClaimAt(account)` (0 ⇒ claimable), re-read after
  receipt; `CooldownActive` decode → countdown message (FR-006/FR-018).
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T029 [US4] Create `web/src/components/FaucetPanel.tsx` and wire into `web/src/App.tsx`:
  claim button with available/claiming/success/cooldown states, live countdown that re-enables
  the button on expiry without reload, disabled+explained on wrong network/disconnected.
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`

**Checkpoint**: A brand-new wallet can self-fund and deposit without external tokens.

---

## Phase 7: User Story 5 - Review recent vault activity (Priority: P5)

**Goal**: Newest 20 Deposit/Withdraw events from on-chain logs, own rows highlighted,
Sepolia explorer links only.

**Independent Test**: After a deposit, feed shows it (type/account/amount/time, self
highlighted); Sepolia entries link to `sepolia.etherscan.io/tx/…`; Anvil entries show plain
hashes with NO external link; failed fetch shows inline retry without blanking.

- [ ] T030 [P] [US5] Create `web/src/hooks/useActivity.ts`: viem `getLogs` on Vault
  `Deposit`/`Withdraw` from `deployments.json` `deployBlock`, chunks ≤ 10,000 blocks with
  auto-halving on RPC range errors (min 1,000), dedupe by `(transactionHash, logIndex)`,
  sort block desc, keep newest 20 (FR-021/FR-023, research D11), plus
  `useWatchContractEvent` live appends; fetch failure → retryable error state (never blanks
  existing entries). Verify: `cd web && npm run typecheck && npm run lint && npm run build`
- [ ] T031 [US5] Create `web/src/components/ActivityFeed.tsx` and wire into `web/src/App.tsx`:
  columns type/account(truncated, self highlighted)/amount/shares/relative time; explorer link
  ONLY for chainId 11155111, plain-hash rendering on 31337 (FR-022 — never a broken link).
  Verify: `cd web && npm run typecheck && npm run lint && npm run build`

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Professional repo file set (constitution), CI, Vercel config, full validation.
Repo gate command used below = `cd web && npm run typecheck && npm run lint && npm run build && cd ../contracts && forge test`

- [ ] T032 [P] Write `README.md` with: project overview, ASCII/mermaid **architecture
  diagram** (web ↔ chains ↔ contracts, scripts, generated config), **design notes section
  stating verbatim**: shares are non-transferable, fee-on-transfer tokens are unsupported,
  and 1000 **BASE UNITS** of dead shares protect against first-depositor inflation attacks
  (FR-029/FR-030), and a **Quickstart section** that LINKS to
  `specs/001-tokenized-vault-dapp/quickstart.md` and contains only the 5-line happy path
  (clone → `npm install` → `forge test` → Anvil deploy → `npm run dev`).
  Verify: (repo gate command)
- [ ] T033 [P] Create `LICENSE` (MIT, copyright holder placeholder), `SECURITY.md`
  (vulnerability reporting, demo-scope disclaimer), `CONTRIBUTING.md` (Conventional Commits,
  Definition of Done gates), `CODE_OF_CONDUCT.md` (Contributor Covenant), `CHANGELOG.md`
  (Keep a Changelog, 0.1.0 entry). Verify: (repo gate command)
- [ ] T034 [P] Create GitHub templates: `.github/ISSUE_TEMPLATE/bug_report.md`,
  `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/PULL_REQUEST_TEMPLATE.md` (includes
  "verification commands run" checklist). Verify: (repo gate command)
- [ ] T035 Create `.github/workflows/ci.yml`: job `contracts` —
  `actions/checkout` with `submodules: recursive`, foundry-toolchain, `forge fmt --check`,
  `forge test`; job `web` — setup-node 20 with npm cache, `npm ci` in `web/`,
  `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. (No deploy jobs, no
  secrets used.) Verify: local equivalent of CI (must pass before committing):
  `cd contracts && forge fmt --check && forge test && cd ../web && npm run typecheck && npm run lint && npm test && npm run build`
- [ ] T036 [P] Vercel CONFIG ONLY (no deploy — T040 gates it): create `web/vercel.json`
  (framework vite, install/build/output settings for `web/` root) and document required
  `VITE_*` env vars in `README.md` deployment section. Verify:
  `node -e "JSON.parse(require('fs').readFileSync('web/vercel.json','utf8'))" && cd web && npm run typecheck && npm run lint && npm test && npm run build`
- [ ] T037 Secret-hygiene check (quickstart.md Scenario 3): run exactly
  `git check-ignore -q contracts/.env && echo "OK"` and
  `grep -rE "0x[a-fA-F0-9]{64}" --exclude-dir=.git --exclude-dir=lib --exclude-dir=out --exclude-dir=broadcast --exclude=".env*" . && echo "FAIL" || echo "OK"`
  — both MUST print `OK` (no key-like literals in tracked files). If `FAIL`, find and remove
  the leak, then re-run. Verify: re-run both commands → `OK` twice.
- [ ] T038 Anvil end-to-end demo run (quickstart.md Scenario 4, manual): start `anvil`, run
  `./scripts/deploy-anvil.sh`, `node scripts/sync-deployments.mjs`,
  `cd contracts && forge build && cd .. && node scripts/sync-abis.mjs`,
  `cd web && npm run dev`; walk US1–US5: connect modal, network switch + wrong-network
  banner, faucet claim + cooldown, deposit incl. 1000/1001 first-deposit explanation,
  approve→deposit states, withdraw + Max, activity feed (no explorer links on Anvil), all
  error states (reject tx, zero amount, insufficient balance).
  **Timing observation (stopwatch)**: state change visible < 1s after each action (SC-002)
  and vault stats visible < 2s on load (SC-008), measured against local Anvil — record the
  numbers observed.
  Verify: `./scripts/deploy-anvil.sh && node scripts/sync-deployments.mjs` exits 0 AND every
  walkthrough item above passes manually (record results in the PR description).
- [ ] T039 Full quickstart validation (quickstart.md Scenarios 1–3 + Definition of Done):
  run the complete gate set and confirm all exit 0.
  Verify: `cd contracts && forge fmt --check && forge test && cd ../web && npm run typecheck && npm run lint && npm test && npm run build`
- [ ] T040 **MANUAL — BLOCKED until owner explicitly says go**: publishing, executed
  strictly in this order AFTER the owner's explicit go-ahead (Constitution publishing
  embargo): **1)** Sepolia deploy + Etherscan verification — quickstart.md Scenario 5:
  `./scripts/deploy-sepolia.sh`, then `node scripts/sync-deployments.mjs`, confirm the
  verified source on sepolia.etherscan.io; **2)** Vercel deploy of `web/` (project env:
  `VITE_SEPOLIA_RPC_URL`, `VITE_REOWN_PROJECT_ID`); **3)** push the branch to GitHub and
  confirm Actions CI green on both jobs. DO NOT execute any part of this task without the
  owner's explicit go-ahead (Constitution publishing embargo). Verify (post go-ahead only):
  Etherscan shows verified source + production URL loads + GitHub Actions green.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 → {T002, T003, T004} parallel
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories
  - Contracts first: T005 → (T006 ∥ T007) → (T008 ∥ T009 ∥ T010 after T007)
  - Tooling: T011 → T012 ∥ T013 ∥ T014 (T014 needs T001 web scaffold; T015 needs T013+T014)
  - Frontend foundations: T015 → T016 → T017; T018 ∥ T016 (both after T015)
- **User Stories (Phases 3–7)**: all depend on Foundational completion (T005–T018);
  among themselves they are independent and may run in priority order (P1 → P5) or in
  parallel if staffed — each touches its own component/hook files, with App.tsx wiring being
  the only shared file (serialize T022, T025, T027, T029, T031 or rebase carefully)
- **Polish (Phase 8)**: depends on all stories being complete (T032–T036 can start earlier
  in parallel with stories if desired; T037–T039 validate the whole; T040 last, manual)

### User Story Dependencies

- **US1 (P1)**: after Foundational — no dependency on other stories (MVP)
- **US2 (P2)**: after Foundational — uses vaultMath (T016), errors (T018), ABIs (T014), and
  US1's `useVaultStats` snapshot via T023 (single balance/allowance source); renders in US1's
  layout — test US2 with US1's connected state
- **US3 (P3)**: after Foundational — same shared libs; independent of US2/US4/US5
- **US4 (P4)**: after Foundational — needs FaucetToken (T005/T006) + config (T015)
- **US5 (P5)**: after Foundational — needs deployBlock from T013 + vault ABIs from T014

### Within Each User Story

Hooks (`use*`) before components; components before App wiring; verify gates after each task.

---

## Parallel Opportunities

- **Setup**: T002 ∥ T003 ∥ T004 (all different files, after T001)
- **Foundational**: T006 ∥ T007; then T008 ∥ T009 ∥ T010; T012 ∥ T013 ∥ T014; T016 ∥ T018
- **US1**: T019 ∥ T020 ∥ T021 → T022
- **US2**: T023 then T024; US3–US5 first tasks (T026, T028, T030) are [P]-marked and
  mutually parallel across phases
- **Polish**: T032 ∥ T033 ∥ T034 ∥ T036
- **Cross-story**: once Foundational is done, US2/US3/US4/US5 can each be picked up in any
  order by different agents — every story has its own hook + component files

## Parallel Example: User Story 1

```bash
# Launch together (different files, no mutual dependencies):
Task T019: web/src/components/WalletModal.tsx + web/src/components/Header.tsx
Task T020: web/src/components/NetworkSwitcher.tsx + web/src/components/WrongNetworkBanner.tsx
Task T021: web/src/hooks/useVaultStats.ts
# Then sequential:
Task T022: web/src/components/StatsGrid.tsx + web/src/App.tsx wiring
```

---

## Implementation Strategy

### MVP First (Setup + Foundational + User Story 1)

1. Phase 1: Setup (T001–T004)
2. Phase 2: Foundational — contracts + ALL their tests first (T005–T010), then tooling and
   shared modules (T011–T018) **(CRITICAL — blocks all stories)**
3. Phase 3: User Story 1 (T019–T022)
4. **STOP and VALIDATE**: independent test criteria + gates green → demo-able MVP
   (read-only vault dashboard with wallet connection)

### Incremental Delivery

1. Setup + Foundational → foundation ready (contracts fully tested)
2. US1 → test independently → MVP demo
3. US2 → deposit works → test independently
4. US3 → withdraw works → full round trip
5. US4 → self-funding faucet
6. US5 → activity transparency
7. Polish → professional repo, CI, validation; publishing waits for explicit go-ahead

### Definition of Done (every task, Constitution IV)

The task's **Verify:** command must exit 0 and be recorded (e.g., in the commit/PR) before
the task may be marked complete. Commits follow Conventional Commits
(`feat(us2): ...`, `test(contracts): ...`, `docs: ...`).

## Notes

- Frozen files: no task ever modifies `contracts/src/Vault.sol` or
  `contracts/src/SollyWeb3.sol`; if a task appears to require it, STOP and ask the owner.
- `web/src/abi/*` is generated (T014) — never hand-edited; rerun `node scripts/sync-abis.mjs`
  after contract rebuilds.
- No task pushes to GitHub or deploys to Vercel; T040 is manual and blocked on the owner's
  explicit go-ahead.
- [P] tasks = different files, no dependencies; App.tsx is the one shared frontend file —
  serialize story wiring tasks.
- Stop at any checkpoint to validate a story independently.
