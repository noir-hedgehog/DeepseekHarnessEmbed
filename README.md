# DeepSeek Harness (Embed)

Embed your running [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI in an Obsidian sidebar tab — the vault becomes the agent's workspace.

Desktop only: the plugin talks to the DSH server you already run, through Electron/Node APIs.

## Features

- **Sidebar panel** with the real DSH Web GUI, adapted to a narrow column: workspace and session pickers on top, zoom control in the ⚙ menu, sidebar rail hidden.
- **Vault as workspace**: on open, the panel registers the current vault as a DSH workspace (or reuses it) and lands on its most recently active session.
- **Selection → chat**: select text in any note, run *Send selection to DeepSeek Harness…* (command palette or editor context menu), optionally annotate it, then add it to the active session's composer or send it directly.
- **No second process**: the plugin reuses the `dsh web` server you already run. It discovers the per-process launch token from the server log and refreshes itself when the server restarts (the token rotates on every restart).

## Requirements

- Desktop Obsidian **1.5.0+**.
- DeepSeek Harness installed, with its web server running (`dsh web`, default `http://127.0.0.1:3080`).

## Installation

**Community plugins** (once this plugin is listed): *Settings → Community plugins → Browse →* search for **DeepSeek Harness (Embed)**.

**BRAT** (works before the listing is approved): install [BRAT](https://github.com/TfTHacker/obsidian42-brat), then *Add Beta plugin* → `noir-hedgehog/DeepseekHarnessEmbed`.

**Manual**: copy `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/noir-hedgehog/DeepseekHarnessEmbed/releases/latest) into `<vault>/.obsidian/plugins/dsh-embed/`, then enable the plugin in *Settings → Community plugins*.

## First run

On first enable, the plugin asks for consent to install a small **server component** into `~/.dsh/profiles/web/` (outside the vault):

- `packages/dsh-obsidian-embed/` — a Cordis plugin that lets the embedded page authenticate with the DSH launch token (`?token=…&ob=1`, `Authorization: Bearer`) instead of the browser-session cookie, which a cross-site iframe cannot use; it also injects the embed-mode client (top bar, vault auto-connect, selection bridge).
- one `dsh-obsidian-embed` row in `~/.dsh/profiles/web/cordis.patch.yml` so the DSH host loads it.

Nothing is installed without confirming the dialog, and nothing outside `~/.dsh/profiles/web/` is touched. Removing the Obsidian plugin does **not** remove the server component — delete the `dsh-obsidian-embed` row from `cordis.patch.yml` (and the `packages/dsh-obsidian-embed` folder) to uninstall it completely.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| Server URL | `http://127.0.0.1:3080` | Where `dsh web` listens |
| Auth URL or token | *(empty)* | Full launch URL with `?token=…`, or a bare token; overrides log discovery |
| Token log path | `~/Library/Application Support/DeepSeek-Harness/logs/launchd.out.log` | Log scanned for the freshest `dsh web: …?token=…` line. `~` is expanded; macOS default shown — point it at your own log on Windows/Linux |
| Start command | *(empty)* | Optional shell command used by the panel's **Start service** button when the server is offline |
| File click preview | off | Needs the optional [`dsh-obsidian-embed-bridge`](packages/dsh-obsidian-embed-bridge) DSH-side package: clicking a file path in the panel then opens it in the center. Inert without it |
| DSH profile directory | `~/.dsh/profiles/web` | Where the server component installs |

## Security & privacy

- **Network use**: the only endpoint this plugin talks to is the DSH server you configure (default `http://127.0.0.1:3080`), which serves the embedded UI. Nothing is downloaded from the internet — the companion server component ships inside the plugin.
- **Files outside the vault**: it reads the server log file you point it at (to discover the launch token) and, only after you confirm the dialog, writes the companion component under `~/.dsh/profiles/web/`.
- **No self-update**: the plugin never updates itself or its dependencies; new versions arrive through Obsidian's community-plugin updater.
- **No telemetry**: no analytics, no third-party network calls.
- **Token**: the launch token is a local credential. It stays in the iframe URL and in `Authorization` headers to your own server; it is not sent anywhere else.

## Troubleshooting

- **Panel says "DSH server is not reachable"** — start `dsh web` (or set *Start command*), then hit **Retry**.
- **Panel says "rejected the launch token (401)"** — the token rotated (server restart). Wait ~20 s for the self-heal, or paste the current launch URL into *Auth URL or token*.
- **Plugin was just updated but the panel did not change** — the server component is re-offered once per plugin version; accept the install prompt, then reload the panel.

## Repository layout

- **Root** — the Obsidian plugin (`main.js`, `manifest.json`, `styles.css`). Obsidian's release
  process requires these at the repository root.
- **`packages/dsh-obsidian-embed/`** — the DSH-side companion this plugin installs for you: embed
  mode for the web GUI (top bar, zoom, vault auto-connect) plus the token auth that makes an iframe
  work. It is a normal DSH bundle: `dsh plugin --profile web add dsh-obsidian-embed`.
- **`packages/dsh-obsidian-embed-bridge/`** — optional DSH-side bridge for the click-to-open /
  selection-delivery / shortcut features: `dsh plugin --profile web add dsh-obsidian-embed-bridge`.
- **`src/`** — plugin source; `scripts/gen-embedded.mjs` embeds the companion package into
  `main.js` at build time, so users never run the DSH-side install themselves.

## Development

```bash
npm install
npm run build   # type-checks, embeds the DSH-side packages, bundles main.js
```

`main.js`, `manifest.json` and `styles.css` are the release artifacts. Each commit that should ship
to the DSH side ships a `.tgz` per package on the release, built with `npm pack` inside the package
directory.

## 中文速览

在 Obsidian 侧边栏里嵌入你正在运行的 DeepSeek Harness Web GUI，把当前 vault 直接当成 agent 的工作区：

- 顶部是工作区 / 会话切换和 ⚙（字号）设置，面板自适应窄栏；
- 首次启用会询问是否在 `~/.dsh/profiles/web/` 安装一个服务端组件（用于 iframe 内的 token 认证和嵌入 UI），不装就不会写任何文件；
- 选中笔记里的文字后可以用命令面板或右键「发送到 DeepSeek Harness…」，附加说明后放进输入框或直接发送；
- 复用你已有的 `dsh web` 进程，从日志里读取启动 token，服务重启后会自动刷新。

要求：桌面版 Obsidian ≥ 1.5.0，本机已安装并运行 DeepSeek Harness（默认 `http://127.0.0.1:3080`）。Token 日志路径在 Windows/Linux 上需要改成你自己的 `dsh web` 日志位置。

## License

MIT

---

Not affiliated with Obsidian.md or DeepSeek. DeepSeek Harness is a separate project; this plugin only embeds a server you run yourself.