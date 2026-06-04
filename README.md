# WeGotWorkspace plugins

Official **first-party** plugin packages for [WeGotWorkspace](https://github.com/WeGotWorkspace/wegotworkspace). Third-party plugins are also supported when they follow the [plugin standards](https://github.com/WeGotWorkspace/wegotworkspace/blob/main/docs/plugins.md).

Each top-level folder is one installable plugin. Release artifacts are published as GitHub Releases (`wgw-plugin-<id>-<version>.zip`).

## Plugins

| Folder | Plugin id | Route | Description |
|--------|-----------|-------|-------------|
| [`onlyoffice/`](onlyoffice/) | `onlyoffice` | `/office/` | ONLYOFFICE document editor (docx, xlsx, pptx) |

## Install

Download a plugin ZIP from [Releases](https://github.com/WeGotWorkspace/plugins/releases), then upload it in **Admin → Plugins** on your WeGotWorkspace install.

Manual install: unpack so `plugin.json` and `assets/` land under `wgw-plugins/<plugin-id>/`.

## Develop

```bash
pnpm install
pnpm --filter @wgw/plugin-onlyoffice dev
pnpm --filter @wgw/plugin-onlyoffice build
pnpm release:onlyoffice
```

See [`onlyoffice/README.md`](onlyoffice/README.md) for editor-specific notes.

## Release

Tags use `<plugin-id>-v<semver>` (example: `onlyoffice-v0.2.0`). CI builds and uploads signed ZIPs to GitHub Releases.

```bash
cp .env.example .env
pnpm release:onlyoffice:publish patch
```

Full flow: [`docs/release.md`](docs/release.md).

## License

Plugin packages may include third-party components under their own licenses (see each plugin folder). WeGotWorkspace core remains AGPL-3.0-or-later unless noted otherwise.
