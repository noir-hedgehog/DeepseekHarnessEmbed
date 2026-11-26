# dsh-obsidian-embed

Embed mode for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI.
It is the DSH-side half of the [dsh-embed](https://github.com/noir-hedgehog/DeepseekHarnessEmbed)
Obsidian plugin, and it is also usable on its own by any client that iframes the web GUI.

## What it does

- Hides the left sidebar and the stock chrome, leaving the conversation column.
- Adds a compact in-frame top bar: workspace picker, session picker, **new session**, zoom
  controls, and an embed-settings popover (font scale).
- Scales conversation fonts without touching the rest of the UI.
- Auto-connects the workspace named in the `obVault` query parameter.
- Accepts the launch token as a query parameter / Bearer header so the web GUI can load inside a
  cross-site iframe (DSH >= 0.1.2), without changing the normal browser-session flow.

Everything is feature-detected and scoped to embed pages: a normal `dsh web` tab in a browser is
unchanged.

## Install

```sh
dsh plugin --profile web add dsh-obsidian-embed
```

Or install the `.tgz` attached to a [release](https://github.com/noir-hedgehog/DeepseekHarnessEmbed/releases):

```sh
dsh plugin --profile web add ./dsh-obsidian-embed-<version>.tgz
```

The bundling Obsidian plugin installs this package for you; you only need the command above if you
are wiring the embed into a different client.

Restart the DSH server after installing.

## License

MIT