# DeepSeek Harness (Embed)

Embed your running [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI in an Obsidian sidebar tab — the vault becomes the agent's workspace.

## What it does

- **Sidebar panel** with the full DSH Web GUI embedded, restyled for the narrow column (workspace/session pickers on top, zoom control in the ⚙ menu).
- **Vault as workspace**: on open, the panel registers the current vault as a DSH workspace (or reuses it) and lands on its most recently active session.
- **Selection → chat**: select text in any note, run *Send selection to DSH* (command palette or right-click), optionally annotate it, then queue it into the active session's composer or send it directly.
- **No separate process**: the plugin reuses the DSH server you already run (`dsh web`). It discovers the per-process launch token automatically from the server log, and self-heals when the server restarts (token rotation).

## Requirements

- Desktop Obsidian 1.5.0+ (the plugin shells out to read the server log and start the server if needed).
- DeepSeek Harness installed and its web server configured (`dsh web`, default `http://127.0.0.1:3080`).

## First run

On first enable, the plugin asks for consent to install a small server component into `~/.dsh/profiles/web/` (outside the vault). The component adds token-in-URL authentication for the embedded page (Obsidian renders it in a webview where the server's `SameSite=Strict` session cookie is not sent) and the embed UI tweaks (top bar, vault auto-connect). It is a plain Cordis patch row; removing the plugin does not remove it — delete the `dsh-obsidian-embed` row from `~/.dsh/profiles/web/cordis.patch.yml` to uninstall completely.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| Server URL | `http://127.0.0.1:3080` | Where `dsh web` listens |
| Auth URL | *(empty)* | Full URL with `?token=…`; overrides log discovery |
| Token log path | launchd default | Log file scanned for the `?token=` launch line |
| Start command | `dsh web` | Used by the panel's Start button when the server is down |

## Development

```bash
npm install
npm run build   # type-checks, embeds the server package, bundles main.js
```

`main.js`, `manifest.json` and `styles.css` are the release artifacts.

## License

MIT
