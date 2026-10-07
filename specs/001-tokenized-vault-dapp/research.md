# Phase 0: Research & Decisions — Tokenized Vault Dapp

**Feature**: 001-tokenized-vault-dapp | **Date**: 2026-10-07 | **Plan**: [plan.md](./plan.md)

## Clarification Status

No `NEEDS CLARIFICATION` markers were raised: the technical context was fully specified by the
owner (stack, contracts, scripts, flows). The decisions below resolve the remaining open
implementation choices so the plan is unambiguous for `/speckit.tasks`.

---

## D1. Monorepo layout and package management

- **Decision**: Two packages — `contracts/` (Foundry) and `web/` (npm project) — plus
  root-level `scripts/` for cross-package glue and root-level docs/CI. npm is the package
  manager; no npm workspaces, turborepo, or pnpm (owner's choice: npm).
- **Rationale**: The two toolchains are independent (Foundry vs Node); workspace tooling adds
  config with no payoff at this scale. Root `scripts/` can read `contracts/broadcast/**` and
  write `web/src/config/**` in one pass.
- **Alternatives considered**: npm workspaces / pnpm (rejected — unnecessary orchestration);
  a single root `package.json` for everything (rejected — Foundry does not use npm).

## D2. Script placement (`script/` vs `scripts/`)

- **Decision**: Foundry Solidity scripts stay in `contracts/script/` (existing convention).
  Shell and Node automation live in root `scripts/`: `deploy-anvil.sh`, `deploy-sepolia.sh`,
  `sync-abis.mjs`, `sync-deployments.mjs`.
- **Rationale**: Owner referred to `scripts/deploy-sepolia.sh` and `scripts/sync-deployments.mjs`
  without a `contracts/` prefix, and the sync script spans both packages, so it must live at a
  neutral root path.
- **Alternatives considered**: `contracts/scripts/` for shell deploy scripts (rejected —
  splits automation across two roots; deploy scripts `cd` into `contracts/` instead).

## D3. FaucetToken design

- **Decision**: OpenZeppelin v5.7.0 `ERC20`, `name = "Vault Test Token"`, `symbol = "VTT"`,
  18 decimals (OZ default). No `Ownable` — the faucet is fully public and permissionless.
  - `uint256 public constant FAUCET_AMOUNT = 1000e18;`
  - `uint256 public constant COOLDOWN = 24 hours;`
  - `mapping(address => uint256) private lastClaimAt;`
  - `function faucet() external` — reverts `CooldownActive(uint256 availableAt)` when
    `block.timestamp < lastClaimAt[msg.sender] + COOLDOWN` (only for prior claimers),
    otherwise records `lastClaimAt[msg.sender] = block.timestamp`, `_mint(msg.sender, FAUCET_AMOUNT)`,
    emits `Claimed(address indexed caller, uint256 amount)`.
  - `function nextClaimAt(address account) external view returns (uint256)` — returns
    `lastClaimAt[account] + COOLDOWN`, or `0` when the account has never claimed
    (0 ⇒ claimable now; avoids a separate boolean).
- **Rationale**: Matches the owner's spec exactly; `nextClaimAt` as "last + 24h or 0" keeps the
  frontend logic trivial (one read for cooldown state). The vault is deployed with FaucetToken
  as its asset on both networks, so the faucet token is also the deposit token.
- **Alternatives considered**: merkle-drip faucet (rejected — overkill); epoch-based resets
  (rejected — rolling per-address cooldown was specified); returning `block.timestamp` when
  claimable (rejected — 0 is unambiguous for "never claimed").

## D4. Dead-shares interplay with an 18-decimal asset

- **Decision**: `Vault.DEAD_SHARES = 1000` base units (wei), so the first deposit must exceed
  **1000 wei of VTT** (0.000000000000001 VTT) — not 1000 whole tokens. The UI explanation
  (FR-014) must state the threshold in base units exactly as the contract enforces it.
- **Rationale**: `Vault.sol` is frozen; the threshold is a raw integer constant. Documenting it
  as "1000 tokens" would be factually wrong and fail spec acceptance scenario US2.4.
- **Alternatives considered**: none viable — changing the constant requires owner approval to
  modify `Vault.sol` (Constitution Principle I) and is out of scope.

## D5. Test architecture (Foundry)

- **Decision**:
  - `Vault.t.sol` — unit: deposit/withdraw happy paths, bootstrap branch (first deposit
    `> 1000` succeeds, `<= 1000` reverts `AmountTooSmall`), `ZeroAmount`, `ZeroShares`,
    `TransferFailed`, event emission, balance accounting.
  - `FaucetToken.t.sol` — unit + fuzz: `faucet()` mints `1000e18`, `Claimed` event, cooldown
    blocks second claim with `CooldownActive(availableAt)` (time-warp boundaries: `+86399`
    fails, `+86400` succeeds), `nextClaimAt` semantics, ERC-20 basics; FUZZ over fuzzed
    timestamps and addresses: the claim amount is always exactly `1000e18`, and a second
    claim reverts `CooldownActive` strictly before `lastClaim + 24h` and succeeds at/after
    it.
  - `VaultFuzz.t.sol` — fuzz: deposit→withdraw round trips (returns within rounding
    tolerance), share math `shares = amount * totalSupply / balance` for arbitrary
    amounts/supplies, monotonicity (larger deposits never mint fewer shares).
  - `VaultInvariant.t.sol` + handler — invariants: (1)
    `token.balanceOf(vault) >= valueOfNonDeadShares` (solvency, the constitution's required
    invariant), (2) `totalSupply == sum(all balances)` including the dead address, via
    `ghost_` sum tracking in the handler; bounded runs (`runs = 256`, `depth = 32`).
  - `FaucetTokenInvariant.t.sol` + handler — invariants: (3) FaucetToken `totalSupply` grows
    by exactly `1000e18` per successful claim (ghost claim-sum), (4) `nextClaimAt(user)` never
    decreases across any claim sequence.
  - `Reentrancy.t.sol` — a malicious ERC-20 whose `transfer`/`transferFrom` re-enters
    `deposit`/`withdraw`; asserts `Reentrancy` error and state consistency.
  - Shared `VaultTestBase` (fixture token + vault setup) to avoid duplication.
- **Rationale**: Covers every test tier the constitution and spec require (unit, fuzz,
  invariant, all five custom errors, reentrancy) with clear file ownership.
- **Alternatives considered**: single giant test file (rejected — unmaintainable); mock-only
  reentrancy via `vm.expectRevert` on the vault itself (rejected — the guard is token-callback
  driven, needs a malicious token).

## D6. Deployment key handling (Constitution III)

- **Decision**: `Deploy.s.sol` always does `vm.envUint("PRIVATE_KEY")` — no key literals in
  Solidity, no `console.log` of the key (only deployed addresses are logged).
  - `scripts/deploy-sepolia.sh` runs with `set -euo pipefail`, `set -a; source contracts/.env; set +a`
    (no `set -x`, no `echo $PRIVATE_KEY`), then invokes forge with `--rpc-url $SEPOLIA_RPC_URL
    --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY`.
  - `scripts/deploy-anvil.sh` exports Anvil's publicly documented default account #0 key
    (`0xac0974...` from Anvil's own startup output) — a well-known constant that only exists
    on a local node, so it is not a secret — and runs against `http://127.0.0.1:8545` without
    verification.
  - `PRIVATE_KEY` itself lives only in gitignored `contracts/.env`; `.env.example` carries an
    empty placeholder.
- **Rationale**: Zero-secret rule without breaking `vm.envUint`; the Anvil default key is
  safe-by-design (public, local-only).
- **Alternatives considered**: `--private-key` on the CLI (rejected — appears in shell history
 /process lists); keystore + password (rejected — extra ceremony for a demo); reading
  `contracts/.env` inside Solidity (not possible).

## D7. ABI sync (`scripts/sync-abis.mjs`)

- **Decision**: Node script reads `contracts/out/FaucetToken.sol/FaucetToken.json` and
  `contracts/out/Vault.sol/Vault.json` (forge build output), extracts `.abi`, and writes
  `web/src/abi/FaucetToken.ts` and `web/src/abi/Vault.ts` as
  `export const faucetTokenAbi = [...] as const;` (and `vaultAbi`, `erc20Abi` derived from the
  FaucetToken artifact's standard ERC-20 subset for balance/approve/allowance reads). Generated
  files are **committed**.
- **Rationale**: `as const` gives wagmi/viem full type inference (typed reads, error decoding,
  event filters). Committing them lets the web CI job run `tsc`/`lint`/`build` without
  installing Foundry, and the sync script keeps them from drifting after contract changes.
- **Alternatives considered**: wagmi CLI codegen (rejected — extra toolchain); JSON imports
  with manual `as const` (rejected — loses type inference); hand-written ABIs (rejected —
  drift risk against the frozen source of truth).

## D8. Share math module (`web/src/lib/vaultMath.ts`)

- **Decision**: Pure functions over `bigint`, mirroring `Vault.sol` exactly with truncating
  (floor) division — Solidity `/` on unsigned ints:
  - `estimateShares(amount, totalSupply, vaultBalance)`:
    `totalSupply === 0n` → bootstrap: require `amount > 1000n`, return `amount - 1000n`;
    else `(amount * totalSupply) / vaultBalance`.
  - `estimateWithdraw(shares, totalSupply, vaultBalance)`: `(shares * vaultBalance) / totalSupply`.
  - `sharePriceScaled18(totalSupply, vaultBalance)`: `(vaultBalance * 10n**18n) / totalSupply`
    for display; `null` when `totalSupply === 0n` (bootstrap placeholder).
  - `userShareBps(userShares, totalSupply)`: `(userShares * 10_000n) / totalSupply` → percent.
  - Invariant noted in code: when `totalSupply > 0n` then `vaultBalance > 0n` (dead shares
    always back a nonzero balance), so division is safe.
- **Rationale**: Estimates must match what the chain will do (spec SC-005, US1.4/US2.1); bigint
  floor division is behaviorally identical to Solidity for positive values. The bootstrap case
  is a distinct branch because `amount - DEAD_SHARES` is not a ratio.
- **Alternatives considered**: floating-point math (rejected — rounding drift fails SC-005);
  a math library like `bigint-math` (rejected — four functions don't need one); calling the
  contract for estimates (rejected — no view function exists and `Vault.sol` is frozen).

## D9. Reading stats: multicall

- **Decision**: One `useReadContracts` call batching: `Vault.totalSupply`,
  `Vault.balanceOf(user)`, `Vault.token()`, `ERC20.balanceOf(vault)`,
  `ERC20.balanceOf(user)`, `ERC20.allowance(user, vault)`,
  `FaucetToken.nextClaimAt(user)`; resolved through viem's Multicall3 aggregator.
- **Rationale**: Spec requires all six dashboard stats (FR-008) and fresh data under 2s
  (SC-008); a single round trip also keeps allowance/withdraw state consistent within one
  snapshot. `readContracts` polling + explicit invalidation after tx receipts handles
  refresh rules (FR-009).
- **Alternatives considered**: separate `useReadContract` per value (rejected — N round trips,
  torn reads); manual `Multicall3.aggregate3` (rejected — wagmi already wraps it).

## D10. Deposit / withdraw state machines

- **Decision**:
  - Deposit: `idle → approving → depositing → success`, with `error` reachable from
    `approving`/`depositing` and returning to `idle` on retry/dismiss. Allowance pre-check:
    `allowance >= amount` skips `approving` (FR-011). Approve is for the **exact amount**
    (never unlimited). Wait for the approval receipt before firing `deposit`.
  - Withdraw: `idle → withdrawing → success | error`.
  - Faucet: `idle → claiming → success | error`; cooldown state derived from `nextClaimAt`.
  - User rejection at any step → `error` with a "cancelled" flavor that returns to `idle`
    without leaving spinners (FR-019).
- **Rationale**: The state machine is the contract between `DepositForm` UX and the hooks —
  it enumerates every pending/success/error state the spec demands and prevents stuck UI.
- **Alternatives considered**: Permit2/EIP-2612 permit flow (rejected — VTT has no `permit`,
  and one signature less keeps the demo simpler); unlimited approve (rejected — bad practice
  for a teaching demo).

## D11. Activity feed via chunked `getLogs`

- **Decision**: `viem getLogs` for `Deposit`/`Withdraw` on the vault address, `fromBlock =
  deployBlock` (from `deployments.json`), chunked at ≤ 10,000 blocks per request; on RPC
  "range too large" errors the chunk size halves (floor 1,000) and retries. Results dedupe by
  `(transactionHash, logIndex)`, sort by block desc + logIndex desc, keep the newest 20.
  `useWatchContractEvent` appends live events (deduped the same way). Explorer link
  `https://sepolia.etherscan.io/tx/{hash}` only for chain 11155111; Anvil entries render
  without a link (FR-022).
- **Rationale**: `deployBlock` bounds the search (Sepolia vault deployed recently, so the
  window is small), chunking protects against public-RPC `eth_getLogs` range limits, and
  auto-halving degrades gracefully instead of failing (edge case: RPC unreachable/range
  error → retry UI).
- **Alternatives considered**: indexer/subgraph (rejected — backend violates "no backend"
  assumption); fetch-all-logs each load (rejected — unbounded growth); `eth_getLogs` from
  block 0 (rejected — pointless scan).

## D12. Custom wallet modal

- **Decision**: `@radix-ui/react-dialog` (headless, unstyled) styled with Tailwind for the
  modal: lists connectors returned by `useConnectors()` (injected always; WalletConnect entry
  only when `VITE_REOWN_PROJECT_ID` was set at config build time), plus connecting spinner and
  error states, and the two-chain network switcher using `switchChain`/`useSwitchChain`.
  RainbowKit and ConnectKit explicitly excluded.
- **Rationale**: Constitution Principle VI mandates plain wagmi connectors + a custom modal;
  Radix gives accessibility (focus trap, esc, ARIA) without importing a design system.
- **Alternatives considered**: Headless UI (equally valid — rejected on Radix's smaller
  footprint and composable primitives); native `<dialog>` (rejected — styling/animaton
  inconsistencies); RainbowKit/ConnectKit (rejected by constitution).

## D13. Chain & transport configuration

- **Decision**: `chains` = `[anvil, sepolia]` from `wagmi/chains`. Transports:
  - Anvil: `http('http://127.0.0.1:8545')` (fixed local URL — not a secret).
  - Sepolia: `fallback([http(import.meta.env.VITE_SEPOLIA_RPC_URL), http('https://ethereum-sepolia-rpc.publicnode.com')])`
    — configured URL first, a public RPC when unset (spec: "falls back to a public RPC").
- **Rationale**: `viem`'s `fallback` handles the optional env var at runtime with automatic
  failover; the public fallback keeps the demo usable with zero config.
- **Alternatives considered**: build-time-only substitution with `import.meta.env.VITE_... ?? url`
  (rejected — no failover if the configured RPC dies); Infura/Alchemy keys (rejected —
  secrets and signup friction for a public demo).

## D14. WalletConnect optional connector

- **Decision**: Build the connector array conditionally in `web/src/config/wagmi.ts`:
  `[injected(), ...(projectId ? [walletConnect({ projectId })] : [])]` with
  `projectId = import.meta.env.VITE_REOWN_PROJECT_ID`. The modal only shows a WalletConnect
  entry when the connector exists.
- **Rationale**: wagmi v2 uses function-style connectors (verified: `injected()`,
  `walletConnect({ projectId })`); conditional inclusion means zero-config demos work
  (injected only) while the owner can enable WalletConnect by setting one env var (spec:
  "only when that env var is set").
- **Alternatives considered**: always registering WalletConnect with an empty projectId
  (rejected — renders a broken option); AppKit (rejected — it's a full modal kit, conflicts
  with the custom-modal requirement).

## D15. Deployment address sync (`scripts/sync-deployments.mjs`)

- **Decision**: Read `contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json`, take each
  `contractAddress` for the `FaucetToken` and `Vault` creations, and compute
  `deployBlock = min(receipt.blockNumber)` over the two deployment transactions. Write
  `web/src/config/deployments.json` keyed by chain id:
  `{ "31337": {...}, "11155111": {...} }`. Sepolia entries are committed (public);
  Anvil entries are regenerated locally after each local deploy (broadcast output is
  gitignored). The script merges per-chain instead of clobbering entries for other chains.
- **Rationale**: Single source of truth flows from forge's broadcast artifacts → config file →
  components import the file (Constitution Principle V: never hardcoded).
- **Alternatives considered**: hardcoding addresses in a constants file (rejected by
  constitution); reading broadcast JSON at runtime in the browser (rejected — can't access
  `contracts/` from the built app and would leak build paths); a backend registry (rejected —
  no backend).

## D16. Design system (dark theme, Inter)

- **Decision**: Tailwind v4 CSS-first configuration in `index.css` (`@import "tailwindcss";`
  + `@theme` tokens): near-black surfaces (`zinc-950`-family), single accent color, Inter via
  `@fontsource/inter` (self-hosted bundle), responsive single-column → grid layouts.
  Verified current: Tailwind v4 ships `@tailwindcss/vite` (v4.2.2+ supports Vite 8).
- **Rationale**: Spec FR-024 (dark, clean, minimal, 360px→desktop) + owner's "dark theme,
  Inter"; self-hosting avoids third-party font requests (privacy + offline dev).
- **Alternatives considered**: Tailwind v3 + `tailwind.config.js` (rejected — v4 is current
  and simpler with Vite); Google Fonts CDN (rejected — external dependency); `next/font`
  (N/A — not Next.js).

## D17. TypeScript, lint, and verification tooling

- **Decision**: `tsconfig.json` with `strict: true` + `noUncheckedIndexedAccess: true`.
  ESLint 9 flat config (`typescript-eslint` recommended, `eslint-plugin-react-hooks` rules)
  with `npm run lint`; `npm run typecheck` = `tsc --noEmit`; `npm run build` =
  `tsc -b && vite build`. **Frontend test stack IN SCOPE (owner directive)**: Vitest +
  React Testing Library (jsdom) via `npm test` — task-pinned test files:
  `web/src/lib/vaultMath.test.ts` boundary suite (T017); React Testing Library for any
  component tests.
- **Rationale**: These are exactly the constitution's Definition of Done gates
  (`forge test`, `tsc --noEmit`, lint, `build`); keeping the toolset minimal matches the
  demo's scope.
- **Alternatives considered**: Prettier (optional — can be added without violating anything);
  Biome (rejected — not in the owner's stated stack). Vitest + React Testing Library are
  the chosen frontend test stack (in scope per owner directive).

## D18. CI design (GitHub Actions)

- **Decision**: `.github/workflows/ci.yml`, two independent jobs on push/PR:
  - `contracts`: `actions/checkout` with `submodules: recursive` → `foundry-toolchain` →
    `forge fmt --check` → `forge test -vvv`.
  - `web`: `actions/checkout` (no submodules needed — ABIs committed) → `actions/setup-node`
    (Node 20, npm cache) → `npm ci` → `npm run typecheck` → `npm run lint` → `npm run build`.
- **Rationale**: Recursive submodule checkout is a constitution requirement; committed ABIs
  decouple the jobs so frontend failures surface without Foundry installed.
- **Alternatives considered**: single job doing everything (rejected — slow, couples unrelated
  failures); regenerating ABIs in CI and diffing (good follow-up, deferred to keep CI simple
  now).

## D19. Out-of-scope guardrails

- **Decision**: No share transfers (Vault has no transfer function — shares are inherently
  non-transferable), no mainnet chain config, single vault/single asset by construction.
  `SollyWeb3.sol` remains untouched (it is not the demo asset; FaucetToken is).
- **Rationale**: Matches the spec's explicit out-of-scope list and Constitution Principle I.
- **Alternatives considered**: supporting arbitrary ERC-20 assets via factory (rejected —
  multiple vaults out of scope).

## Deferred (not blocking planning)

- ~~Frontend unit tests~~ **RESOLVED — now IN SCOPE (owner directive)**: Vitest + React
  Testing Library form the frontend test stack (`npm test`); `vaultMath.ts` boundary tests
  at the 1000/1001 first-deposit threshold are task-mandated (T017), with Vitest configured
  in T003. This supersedes the earlier "deferred" judgment.
- **CI ABI-drift check**: `sync-abis.mjs && git diff --exit-code web/src/abi` in the
  contracts job — good hardening once the pipeline exists.
- **Prettier**: optional formatting standard to adopt in `CONTRIBUTING.md` if desired.
