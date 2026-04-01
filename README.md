# CommitCraft — Local AI

**AI-generated conventional commit messages. Entirely on-device. No API keys. No code leaves your machine.**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/cyferlawyn.cyferlawyn-commitcraft?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=cyferlawyn.cyferlawyn-commitcraft)

---

## What it does

CommitCraft generates [Conventional Commits](https://www.conventionalcommits.org/) from your staged `git diff` using a locally-running AI model (`Qwen2.5-Coder-3B`). The model runs entirely on your machine via a bundled [llama.cpp](https://github.com/ggerganov/llama.cpp) binary — no internet connection required after the initial model download, no API keys, no telemetry.

Click the sparkle icon (✨) in the Source Control panel title bar, and CommitCraft fills the commit message box for you.

---

## Features

- One-click commit message generation from staged diffs
- Follows the Conventional Commits spec (`feat`, `fix`, `chore`, `refactor`, etc.)
- Respects your project's `commitlint` configuration if present
- 100% offline after first use
- Supports `commitlint` scopes, breaking changes, and optional body generation
- Works on Windows (x64), macOS (arm64 / x64), and Linux (x64)

---

## Installation

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=cyferlawyn.cyferlawyn-commitcraft)
2. On first use, CommitCraft will prompt you to download the AI model (~1.9 GB) from Hugging Face. This happens once and is cached in `~/.commitcraft/models/`
3. Stage some changes in git, click ✨ in the Source Control panel — done

---

## License

CommitCraft is **free to use for 14 days** (trial). After the trial, a one-time license key is required.

**Purchase at [commitcraft.cyferlawyn.org](https://commitcraft.cyferlawyn.org/) — $9 one-time, perpetual.**

### Activating your license key

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **CommitCraft: Enter License Key**
3. Paste your key — validation is instant and fully offline

---

## Configuration

All settings are under `commitcraft.*` in VS Code settings:

| Setting | Default | Description |
|---|---|---|
| `commitcraft.modelPath` | _(auto)_ | Override the model file path |
| `commitcraft.modelUrl` | _(HuggingFace)_ | Override the model download URL |
| `commitcraft.inferenceTimeout` | `30` | Seconds to wait for inference |
| `commitcraft.maxDiffTokens` | `4000` | Max diff tokens sent to the model |
| `commitcraft.generateBody` | `false` | Also generate a commit body paragraph |

---

## macOS note

macOS may quarantine the bundled llama.cpp binary on first run. If you see a security warning, run once in terminal:

```sh
xattr -dr com.apple.quarantine ~/.vscode/extensions/cyferlawyn.cyferlawyn-commitcraft-*/bin/darwin-*/
```

Then reload VS Code.

---

## Privacy

- Your code never leaves your machine
- No analytics, no telemetry, no network calls during inference
- License validation is cryptographic (Ed25519) and fully offline
- The model is downloaded once from Hugging Face over HTTPS and verified by SHA-256

---

## Source

The extension source is open under MIT for the source code. Pre-built binaries are covered by a separate commercial license. See [LICENSE](LICENSE) for details.

GitHub: [cyferlawyn/commitcraft-vscode](https://github.com/cyferlawyn/commitcraft-vscode)
