<!-- Sync Impact Report (temporary scratch for review — remove before committing this amendment)
- Version change: scaffold (unversioned) -> 1.0.0 (initial ratification; MAJOR — first adoption of
  governance content replacing the empty template placeholders)
- Modified principles: none (no principles had been adopted before; scaffold placeholders replaced)
- Added sections: Core Principles I-VII (Contract Source of Truth; Test-First Contract Changes
  (NON-NEGOTIABLE); Zero Secrets (NON-NEGOTIABLE); Verified Definition of Done; Configuration-Driven
  Networks; Frontend Stack Discipline; Submodule Dependencies), Repository Standards, Development
  Workflow, Governance (amendment procedure, versioning policy, compliance review)
- Removed sections: none (template placeholder sections replaced 1:1 by concrete content)
- Follow-up TODOs: none. RATIFICATION_DATE set to 2026-10-07 because the scaffold had never been
  adopted prior to this amendment.
-->

# Tokenized Vault Constitution

## Core Principles

### I. Contract Source of Truth

- `contracts/src/Vault.sol` and `contracts/src/SollyWeb3.sol` are the single source of truth for
  on-chain behavior; docs, ABIs, frontend bindings, and tests MUST be derived from them and MUST
  NOT contradict them.
- `Vault.sol` MUST NOT be modified without explicit, recorded approval from the repo owner
  (issue or PR comment); an unapproved edit MUST be reverted.
- Rationale: the demo's credibility and audit trail depend on the contract surface staying stable
  and on every deviation being a deliberate, reviewable decision.

### II. Test-First Contract Changes (NON-NEGOTIABLE)

- Every change under `contracts/src/**` MUST ship with Foundry tests covering all three tiers:
  unit tests, fuzz tests, and at least one invariant test.
- The invariant suite MUST include: vault token balance >= value of all non-dead shares
  (i.e., `asset.balanceOf(vault) >= totalValueOf(nonDeadShares)`), checked via an
  invariant/handler runner, not a single scenario assertion.
- A contract change missing any required tier MUST NOT be merged or marked done.
- Rationale: fund-handling code without fuzz and invariant coverage hides rounding, share-price,
  and solvency bugs that unit tests alone cannot catch.

### III. Zero Secrets (NON-NEGOTIABLE)

- The repository MUST contain no secret values at any time, in any file, commit, or CI log.
- Only `.env.example` with placeholder values may be committed; all `.env` files are gitignored.
- The deploy key MUST be read from `contracts/.env` (gitignored) at runtime and MUST NOT be
  printed, logged, echoed, or committed — including in terminal transcripts, task reports,
  screenshots, or GitHub Actions output.
- Rationale: a leaked deploy key in a public demo repo is unrecoverable and indefensible.

### IV. Verified Definition of Done

- No task is done until its verification command exits 0; the applicable gate is:
  `forge test` for contract work, `tsc --noEmit` + the configured linter + `build` for frontend
  work, and all applicable gates for cross-cutting tasks.
- The passing verification output MUST be recorded in the task/PR report before the task is
  marked complete; failed or skipped verification keeps the task open.
- Rationale: "done" must mean demonstrably working, not merely written.

### V. Configuration-Driven Networks

- Supported networks are Anvil (chainId 31337) and Sepolia (chainId 11155111); adding any other
  network requires a constitution amendment.
- Contract addresses and RPC endpoints MUST come from environment variables or config files;
  components MUST NOT hardcode addresses, keys, or chain-specific literals.
- Rationale: the same build must run against local and testnet deployments without code edits.

### VI. Frontend Stack Discipline

- The frontend MUST use Vite + React + TypeScript (strict mode enabled and kept enabled) +
  Tailwind + wagmi/viem.
- Wallet connection MUST use plain wagmi connectors behind a custom wallet modal; RainbowKit and
  similar wrapper libraries MUST NOT be used.
- Rationale: a fixed, small stack keeps the demo reviewable and avoids dependency sprawl in a
  teaching-oriented codebase.

### VII. Submodule Dependencies

- Contract dependencies (e.g., `forge-std`, `openzeppelin-contracts`) MUST live under
  `contracts/lib/` as git submodules declared in `.gitmodules`.
- Dependency source files MUST NOT be vendored (copied) into the repository.
- Rationale: submodules keep provenance and version pinning explicit, which vendored copies
  silently destroy.

## Repository Standards

The default branch MUST ship with, and continuously maintain:

- `README.md` — setup, architecture, and verification commands
- `LICENSE` — MIT
- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`
- GitHub Actions CI that runs `forge test`, `tsc --noEmit`, lint, and `build`, with the checkout
  step using `submodules: recursive` so `contracts/lib/` resolves correctly
- Issue and pull-request templates under `.github/`

A release MUST NOT be cut while any of these artifacts is missing or non-functional.

## Development Workflow

- Every commit MUST follow Conventional Commits: `type(scope): subject`, using types such as
  `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`, `build`, `ci`, `style`, `revert`.
- Publishing embargo: nothing MUST be pushed to GitHub and no deployment to Vercel (or any other
  host) MUST be initiated until the repo owner explicitly instructs it, regardless of task status.
- Each PR MUST record the verification commands it passed (Principle IV); contract PRs MUST also
  record the three required test tiers (Principle II).
- `Vault.sol` modifications on a PR MUST reference the owner's explicit approval (Principle I).
- Proposed complexity (extra abstractions, new dependencies, new networks) MUST be justified in
  the PR description or be rejected.

## Governance

- This constitution supersedes ad-hoc practices: where a spec, plan, task list, or doc conflicts
  with it, the constitution wins until formally amended.
- Amendment procedure: propose the change with rationale → obtain repo owner approval → update
  this document via the constitution command → bump the version per the policy below → set
  `LAST_AMENDED_DATE` → record the change in `CHANGELOG.md`.
- Versioning policy (semantic): MAJOR — principle removal or backward-incompatible redefinition;
  MINOR — new principle or materially expanded guidance; PATCH — clarifications, wording, typo
  fixes, non-semantic refinements.
- Compliance review: every plan, PR, and task list MUST be checked against these principles
  before merge or task completion; any violation blocks merge until resolved. Reviewers MUST
  verify that claimed verification commands actually passed.

**Version**: 1.0.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
