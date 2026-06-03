# WeGotWorkspace plugins

Official plugin packages for [WeGotWorkspace](https://github.com/WeGotWorkspace/wegotworkspace).

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
pnpm run release:onlyoffice
```

See [`onlyoffice/README.md`](onlyoffice/README.md) for editor-specific notes.

## License

Plugin packages may include third-party components under their own licenses (see each plugin folder). WeGotWorkspace core remains AGPL-3.0-or-later unless noted otherwise.
