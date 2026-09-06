# Compute Chain Atlas / 算力图谱

## Source and workflow

- The canonical source is `WangTianai920/compute-chain-atlas` on GitHub.
- Communicate with the owner in Chinese. Implement and verify requested changes, then submit the result to GitHub as requested.
- Keep work in a `codex/` branch unless the user explicitly requests another workflow.
- Read `docs/cloud-development.md` for reproducible cloud setup and remaining migration checks.

## Development and verification

- Use Node.js 22.18.0 (`.nvmrc`) and the committed npm lockfile.
- Setup: `bash scripts/cloud-setup.sh`.
- Full validation: `npm run cloud:check` (tests, ESLint, and build).
- HTTP/database smoke check: `npm run cloud:smoke`.
- Preview: `npm run dev:local -- --hostname 0.0.0.0 --port 5173`.
- `COMPUTE_CHAIN_LOCAL_ONLY=1` disables remote AI and profile workflow bindings. D1 is simulated inside the development environment; first data access creates and seeds the database.
- Development seeds are not a copy of the current production database. Do not present fixture data or unavailable market quotes as live data.
- Keep Chinese and English interfaces working. Missing financial/history data must not be replaced by invented values or data for another company.

## Production boundary

- Cloud development does not authorize a website deployment, production D1 write, secret rotation, or DNS change. Obtain explicit user authorization for those actions.
- Do not run remote database imports or exports as part of environment setup.
- Do not read, log, commit, or upload production credentials, `.dev.vars`, `.env*`, local database files, archives, or browser/account state.
- Do not delete the original local folder as part of development. Its unuploaded credentials, database state, backups, and original Git history require a separate retention decision.
- For an authorized Pages release, run `npm test`, `npm run pages:stage`, inspect staged files for credentials, and verify the deployed site and relevant API data.
