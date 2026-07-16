# Git hooks

Lightweight, dependency-free hooks for this repo.

## Enable (one-time, per clone)

Git doesn't run tracked hooks automatically. Point Git at this folder:

```
git config core.hooksPath .githooks
```

(Already enabled on the machine where these were added.)

## `pre-commit` — secret guard

Blocks a commit if the staged changes contain:

- a real `.env` file (`.env`, `.env.local`, … — `*.example`/`*.sample`/`*.template` are allowed), or
- private-key material: a Hedera DER-encoded key (`302e…`/`302a…`) or a raw
  32-byte hex key (`0x` + 64 hex chars).

Common false positives (tx hashes, keccak/sha, bytecode, selectors) are
ignored automatically.

### If it fires

- **Genuine false positive:** add `# allow-secret` on that line.
- **Need to bypass entirely (be sure!):** `git commit --no-verify`.
