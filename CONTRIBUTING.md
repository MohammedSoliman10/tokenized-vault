# Contributing

Thanks for helping improve the Tokenized Vault demo. This project follows its Spec Kit
workflow and constitution (`.specify/memory/constitution.md`); changes are reviewed against
the Definition of Done below.

## Getting started

```bash
git clone --recursive https://github.com/MohammedSoliman10/tokenized-vault.git
cd tokenized-vault/web && npm install
cd ../contracts && forge test
```

## Commits — Conventional Commits

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short imperative summary>

[optional body]
```

- `type`: `feat` | `fix` | `docs` | `test` | `refactor` | `chore` | `ci` | `build` | `style`
- `scope`: e.g. `web`, `contracts`, `spec`
- Examples: `feat(web): render activity feed table`, `fix(web): pin all reads to the wallet's active chain`

## Definition of Done — verification gates

Every change must run these commands locally and **all must exit 0** before a PR is opened
(same commands CI runs):

| Area | Command |
|------|---------|
| Contracts — format | `cd contracts && forge fmt --check` |
| Contracts — tests | `cd contracts && forge test` |
| Frontend — types | `cd web && npm run typecheck` |
| Frontend — lint | `cd web && npm run lint` |
| Frontend — tests | `cd web && npm test` |
| Frontend — build | `cd web && npm run build` |

Never weaken, skip, or delete a test to make it pass; fix the code (or the test's expectation
only with clear justification in the PR).

## Hard rules

- `contracts/src/Vault.sol` and `contracts/src/SollyWeb3.sol` are **frozen** — byte-for-byte
  identical to `main` (`git diff main -- contracts/src/Vault.sol contracts/src/SollyWeb3.sol`
  must be empty).
- **No secrets**: never commit `.env` files or key-like literals (the repo gitignores `.env*`).
- Networks: Anvil (31337) and Sepolia (11155111) only.
- Describe the verification commands you ran in the pull request template checklist.

## Pull requests

1. Branch from `main` (or the active feature branch named in the PR).
2. Keep one logical change per PR; include the *why* in the description.
3. Fill in the "verification commands run" checklist.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
