# UI Behavioral Contracts

**Feature**: 001-tokenized-vault-dapp | **Date**: 2026-10-07

What each surface guarantees to the user — the contract acceptance tests verify against.
Error wording lives in [chain-interface.md §4](./chain-interface.md); state details live in
[data-model.md §2](../data-model.md).

---

## 1. Wallet modal (custom — no RainbowKit/ConnectKit)

- Trigger: any action-control click while disconnected, or the header "Connect" button.
- Content: one entry per available connector — **injected** always; **WalletConnect** only
  when `VITE_REOWN_PROJECT_ID` was configured (its absence hides the row, never breaks it).
- States: `idle → connecting (spinner, connector name) → connected (modal closes, address in
  header) | error (message + retry)`.
- Accessible: focus trapped, Esc closes, ARIA roles (Radix Dialog).
- Disconnect: header menu → back to `disconnected`; forms reset (edge case: account switch).

## 2. Network switching

- Supported: Anvil (31337), Sepolia (11155111) — nothing else (FR-002).
- Switcher requests the wallet's `switchChain`; wallet prompts to add the chain when unknown
  (Anvil must be pre-added by the user — documented in README quickstart).
- Wrong network: persistent banner + "Switch network" CTA; deposit/withdraw/faucet controls
  disabled with explanation — never silent failures (FR-003, US1.3).

## 3. Dashboard (stats grid)

- Shows exactly six values (FR-008): TVL, total shares, share price, your shares, your token
  balance, your % of vault.
- Readable while disconnected (public data); your-row values show a connect prompt instead of
  zeros (FR-004).
- Bootstrap vault (no deposits yet): share price and % show an explanatory placeholder —
  never `NaN`/`0.00` pretending to be real (edge case).
- Refresh after every confirmed tx / account / network change; while refreshing, previous
  values stay visible with an "updating…" hint (no blanking, no indefinite spinner — SC-002).

## 4. Deposit flow

- Live share estimate as the user types (FR-010; math per `vaultMath.estimateShares`).
- Step indicator reflects the state machine: **Approve → Deposit**; the approve step is
  skipped when allowance suffices (FR-011). Approval is for the exact amount only, and the
  allowance is re-validated immediately before the deposit step — if it dropped mid-flow
  (revoked elsewhere), the flow returns to Approve with a friendly message.
- Pre-tx guards block: empty/zero/over-balance amounts and first-deposit ≤ 1000 base units,
  each with an inline message that explains the rule (FR-013, FR-014, US2.3/US2.4).
- Every step shows pending/success/error; success confirms with amounts actually received
  (from the receipt, not the estimate — SC-005).
- User rejection → neutral "Transaction cancelled" state, form returns to idle (FR-019).

## 5. Withdraw flow

- Shares input with **Max** = full `balanceOf` (US3.1); live token estimate (floor math).
- Blocks zero and over-balance shares inline (FR-017).
- States: idle → withdrawing → success | error; rejection behaves as deposit (US3.4).

## 6. Faucet

- Claim button states: available → claiming (pending) → success (balance updates) |
  cooldown (disabled + live countdown from `nextClaimAt`) (FR-005..FR-007, US4).
- Cooldown message shows remaining time, including after a mid-session cooldown expiry
  (button re-enables without reload — edge case).
- `CooldownActive` from chain (e.g., another tab claimed) decodes to the same countdown
  message (chain-interface §4).

## 7. Activity feed

- Newest 20 Deposit/Withdraw entries; columns: type, account (truncated; connected user's rows
  highlighted), amount, shares, time (US5.1/US5.4).
- Explorer link → `sepolia.etherscan.io/tx/…` on 11155111; on Anvil: no external link
  (FR-022) — render as plain hash text, never a dead/broken link.
- Live updates via event subscription; entries deduped by `(txHash, logIndex)`; a failed
  log fetch shows an inline error + retry (edge case) and never blanks existing entries.
- Data window: `deployBlock` → latest, in ≤10,000-block chunks with auto-halving (D11).

## 8. Global experience rules

- Blue-and-white light theme (white surfaces, accent `#375BD2`, navy text, muted blue-gray
  secondary text), Inter, minimal; usable 360px → desktop (FR-024). All colors come from
  centralized Tailwind v4 `@theme` tokens in `web/src/index.css` — the `accent` token name
  is part of the feed-highlight contract (`border-l-accent`). Status colors and focus rings
  meet WCAG AA: 4.5:1 text, 3:1 focus rings and control boundaries. No gradients or
  decorative illustrations.
- Every transaction path resolves visibly: pending within 1s, then success/error/cancelled
  (SC-002) — no indefinite spinners.
- Raw revert strings, stack traces, or `undefined` values are never rendered (FR-018).
- Address/amount formatting: truncated addresses (`0x1234…abcd`), amounts human-scaled with
  full precision available on hover/title.
