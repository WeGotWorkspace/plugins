# Plugin releases

First-party plugins in this repo publish installable ZIPs as GitHub Releases.

## Artifact layout

Each release produces:

| File | Purpose |
|------|---------|
| `wgw-plugin-<id>-<version>.zip` | Upload in **Admin → Plugins** |
| `wgw-plugin-<id>-manifest.json` | Checksum metadata |
| `wgw-plugin-<id>-manifest.sig` | RSA signature over the manifest (when signing key is configured) |

The ZIP contains:

```
<id>/plugin.json
<id>/assets/index.html
<id>/assets/...
```

## Local package

```bash
pnpm install
pnpm release:onlyoffice              # build + write dist/releases/*
pnpm release:onlyoffice -- --skip-build
```

Signing uses `WGW_RELEASE_SIGNING_PRIVATE_KEY` from repo-root `.env` (see `.env.example`).

## Publish (signed tag → CI release)

Tags use `<plugin-id>-v<semver>` (example: `onlyoffice-v0.2.0`).

```bash
cp .env.example .env   # set WGW_GIT_SIGNING_PUBLIC_KEY and optional WGW_RELEASE_SIGNING_PRIVATE_KEY
pnpm release:onlyoffice:publish patch
pnpm release:onlyoffice:publish 0.3.0 --yes
pnpm release:onlyoffice:publish patch --verify   # build ZIP before commit
```

This bumps `<plugin-id>/VERSION`, commits, creates a **signed annotated** git tag, and pushes. GitHub Actions (`.github/workflows/release.yml`) builds the ZIP and attaches it to the GitHub Release.

## CI

- **Pull requests / main:** `.github/workflows/ci.yml` — lint, build, verify unsigned ZIP layout.
- **Tags `*-v*`:** release workflow — build signed artifacts and upload to GitHub Releases.

## GitHub secrets

| Secret | Purpose |
|--------|---------|
| `WGW_RELEASE_SIGNING_PRIVATE_KEY` | RSA PEM for `manifest.sig` on release ZIPs |

## Adding another first-party plugin

1. Add a workspace folder with `VERSION`, `<id>.plugin.json` (or `plugin.json`), and a `build` script producing `out/`.
2. Package locally: `node tools/build-plugin-release.mjs <id>`.
3. Add `release:<id>` scripts to root `package.json` mirroring onlyoffice.
4. Extend CI to build and verify the new plugin.

Third-party plugins outside this repo use the same ZIP layout; see [wegotworkspace `docs/plugins.md`](https://github.com/WeGotWorkspace/wegotworkspace/blob/main/docs/plugins.md).
