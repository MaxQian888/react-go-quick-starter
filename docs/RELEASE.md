# Release Process

End-to-end guide for cutting a new release of `react-go-quick-starter`.

## Versioning

We follow [Semantic Versioning](https://semver.org/). Three files must agree:

- `package.json` (`version`)
- `src-tauri/tauri.conf.json` (`version`)
- `src-tauri/Cargo.toml` (`[package].version`)

Run `node scripts/check-versions.js` to confirm — or `--fix` to align all three
to `package.json`. The release workflow runs this as a pre-flight.

## Cutting a release

```bash
# 1. Bump versions
npm version patch          # or minor/major. Updates package.json
node scripts/check-versions.js --fix
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore(release): vX.Y.Z"

# 2. Tag and push
git tag vX.Y.Z
git push origin master --tags

# 3. The .github/workflows/release.yml workflow will:
#    - run quality + test + go-ci
#    - build Tauri installers for Windows / macOS / Linux
#    - upload the artifacts to a draft GitHub Release
#
# 4. Edit the draft release notes, then publish.
```

## Auto-update (Tauri)

The updater plugin is **disabled by default** so a fresh clone can build
without first generating signing keys. To enable:

### One-time setup

```bash
# Generate a key pair. Store the .key file securely (1Password/Bitwarden);
# never commit it. Stash the public key for the conf below.
pnpm tauri signer generate -w ~/.tauri/<project>.key

# Copy the printed public key into src-tauri/tauri.conf.json
#   plugins.updater.pubkey = "..."
# Switch:
#   plugins.updater.active = true
#   bundle.createUpdaterArtifacts = true
```

### Per-release

Each `pnpm tauri:build` with the updater enabled and `--features updater`
emits `.sig` files alongside the installer. The release workflow then
generates a `latest.json` describing each platform's binary URL and
signature; clients fetch this on launch and prompt the user to update.

```jsonc
// latest.json (generated on each release)
{
  "version": "v1.2.3",
  "notes": "release notes",
  "pub_date": "2026-05-05T10:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "...", "url": "...dmg" },
    "windows-x86_64": { "signature": "...", "url": "...msi" },
    "linux-x86_64": { "signature": "...", "url": "...AppImage" },
  },
}
```

### Triggering an update from the frontend

Inside Tauri only (use `useIsTauri()` to gate). With the updater feature on:

```ts
import { check } from "@tauri-apps/plugin-updater";

const update = await check();
if (update?.available) {
  await update.downloadAndInstall();
}
```

## Code signing

Code signing is **disabled** in the default workflow. To enable:

- **macOS**: store `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` as
  GitHub secrets. Uncomment the macOS signing block in `build-tauri.yml`.
- **Windows**: store `WINDOWS_CERTIFICATE` (base64 .pfx) and
  `WINDOWS_CERTIFICATE_PASSWORD`. Set `bundle.windows.certificateThumbprint`
  and `bundle.windows.timestampUrl` in `tauri.conf.json`, or pass via the
  workflow.
- See `CI_CD.md` for the full secret matrix.

## Rollback

Tags are immutable. To roll back a published release:

1. Yank the GitHub Release (Edit → Delete release; tag stays).
2. Tag a hotfix release `vX.Y.Z+1` from the previous good commit.
3. If the auto-updater has already shipped to users, follow up with a forced
   re-update by bumping `latest.json` and pushing the new artifacts.
