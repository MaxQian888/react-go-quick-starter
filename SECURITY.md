# Security Policy

## Supported Versions

Until the project tags `v1.0.0`, only the latest minor on `master` receives
security patches. After GA, the latest two minor versions are supported.

| Version | Status |
| ------- | ------ |
| 0.x     | Active |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email the maintainers privately (see `package.json` `author` / repo metadata)
with:

- A short summary of the issue.
- Reproduction steps or a proof-of-concept (minimal repo or curl invocation).
- The version / commit you tested against.
- Any suggested fix or mitigation.

Expect an acknowledgement within **3 business days**. We aim to ship a patch
or coordinated disclosure within **30 days** of confirmation. If an issue is
under active exploitation we treat it as P0 and respond same-day.

We do not currently run a paid bug bounty. Researchers are credited in the
release notes (with consent).

## Hardening Notes

- **JWT secret**: production builds reject any secret shorter than 32 chars
  (`cfg.Validate()` in `src-go/internal/config`). Rotate via the deployment
  pipeline; never commit production secrets.
- **Token storage**: the bundled frontend persists access + refresh tokens in
  `localStorage` for development convenience. Production deployments should
  swap to httpOnly cookies set by the backend; the auth-store keeps that
  swap surface narrow (one file).
- **Updater**: signing keys live outside the repo. See `docs/RELEASE.md`.
- **Dependencies**: `pnpm audit --prod --audit-level=high` and `govulncheck`
  run on every PR (see `.github/workflows/quality.yml` and `go-ci.yml`).
- **CodeQL**: scheduled weekly + on every PR (`.github/workflows/codeql.yml`).
