## Description

<!-- What does this PR change, and why? Link related issues: Fixes #NN -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactor / chore / CI

## Verification commands run

<!-- All that apply — every command listed MUST have exited 0. Delete nothing; if a gate was
     not applicable, say why in the notes. -->

- [ ] `cd contracts && forge fmt --check`
- [ ] `cd contracts && forge test`
- [ ] `cd web && npm run typecheck`
- [ ] `cd web && npm run lint`
- [ ] `cd web && npm test`
- [ ] `cd web && npm run build`

Notes / test output:

```text

```

## Hard-rules checklist

- [ ] `git diff main -- contracts/src/Vault.sol contracts/src/SollyWeb3.sol` is **empty**
      (frozen contracts untouched)
- [ ] No secrets staged: no `.env` files, no key-like literals (`git status` reviewed)
- [ ] No test was weakened, skipped, or deleted to make the gates pass
- [ ] Commit messages follow Conventional Commits
