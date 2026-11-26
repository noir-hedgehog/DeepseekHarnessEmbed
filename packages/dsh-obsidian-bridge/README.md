# dsh-obsidian-bridge

Host-side bridge for the DSH Web GUI when it runs inside
[Obsidian](https://obsidian.md) through the
[dsh-embed](https://github.com/noir-hedgehog/DeepseekHarnessEmbed) plugin.

It is **optional**: the Obsidian plugin works without it, with click-to-open and selection
delivery disabled.

## What it does

- Injects a small `postMessage` client into the served web GUI (via an `index.html` transform,
  zero DSH source changes).
- Accepts `dsh-fill-draft` messages and writes the text into the composer draft, preserving
  whatever the user already typed.
- Turns clicks on vault file paths in the conversation into `dsh-open-in-obsidian` messages, so
  the Obsidian side can open the note in a tab.
- Relays configured keyboard shortcuts back to Obsidian.
- Registers an agent pre-step hook: when the newest user message carries a `BRIDGES` marker, it
  turns it into a deterministic edit instruction (read the region, show the result, ask for
  consent, then write), without the instruction appearing in the chat UI.

## Install

```sh
dsh plugin --profile web add dsh-obsidian-bridge
```

Or install the `.tgz` attached to a [release](https://github.com/noir-hedgehog/DeepseekHarnessEmbed/releases).

Restart the DSH server after installing.

## License

MIT