# CommitCraft — Local AI

**AI-generated conventional commit messages. Entirely on-device. No API keys. No code leaves your machine.**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/cyferlawyn.cyferlawyn-commitcraft?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=cyferlawyn.cyferlawyn-commitcraft)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/cyferlawyn.cyferlawyn-commitcraft)](https://marketplace.visualstudio.com/items?itemName=cyferlawyn.cyferlawyn-commitcraft)

---

## The problem

Your company uses [Conventional Commits](https://www.conventionalcommits.org/). Commitlint rejects messages that don't conform. Writing a good `type(scope): subject` line every time is friction you don't need.

AI tools like Copilot and ChatGPT can solve this — but they send your staged diff to a remote server. At a bank, a hospital, a defense contractor, or any organization with a code-confidentiality policy, that's a non-starter.

**CommitCraft solves the content problem without the data leak.**

---

## How it works

Stage your changes. Click ✦ in the Source Control panel. CommitCraft reads your diff, runs a 3B-parameter code model entirely on your CPU, and writes the commit message directly into the input box — in under 6 seconds on a typical laptop.

```
git diff --staged  →  local model  →  fix(auth): return 401 when authorization header is missing
```

Zero network calls at inference time. The model runs in a bundled [llama.cpp](https://github.com/ggerganov/llama.cpp) binary. Nothing leaves your machine.

---

## Features

- **Fully offline after first use** — inference never touches the network
- **Conventional Commits** — `type(scope): subject` every time
- **commitlint-aware** — reads your `.commitlintrc` / `commitlint.config.js` for allowed types, scopes, and length limits
- **Zero config** — works out of the box; model downloads itself on first use
- **Open source** — [audit every line on GitHub](https://github.com/cyferlawyn/commitcraft-vscode); no hidden telemetry
- **Windows · macOS · Linux** — platform-specific builds, no Ollama required

---

## Installation

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=cyferlawyn.cyferlawyn-commitcraft)
2. On first use, CommitCraft prompts you to download the AI model (~1.9 GB) from Hugging Face — once, cached to `~/.commitcraft/models/`
3. Stage some changes, click ✦ in the Source Control panel

---

## License

**Free 14-day trial.** After that, a one-time license key unlocks CommitCraft permanently.

**[$9 one-time — cyferlawyn.org/commitcraft](https://www.cyferlawyn.org/commitcraft)**

No subscription. No seat limits. No expiry. License validation is cryptographic (Ed25519) and fully offline — no license server is ever contacted.

### Activating your key

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **CommitCraft: Enter License Key** → paste your key.

Check your trial status at any time: Command Palette → **CommitCraft: License Info**.

---

## Privacy

| What | Does it leave your machine? |
|---|---|
| Your staged diff | **Never** |
| Your source code | **Never** |
| License key validation | **Never** (Ed25519, offline) |
| Model download | Once, from Hugging Face over HTTPS, SHA-256 verified |
| Analytics / telemetry | None |

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `commitcraft.modelPath` | *(auto)* | Override the model file path (e.g. for corporate IT distribution) |
| `commitcraft.modelUrl` | *(Hugging Face)* | Override the download URL (e.g. internal mirror for air-gapped environments) |
| `commitcraft.inferenceTimeout` | `120` | Seconds to wait for inference |
| `commitcraft.maxDiffTokens` | `4000` | Max diff size sent to the model |
| `commitcraft.generateBody` | `false` | Also generate a multi-line commit body |

---

## macOS note

macOS may quarantine the bundled llama.cpp binary. If you see a security error on first run, open a terminal and run:

```sh
xattr -dr com.apple.quarantine ~/.vscode/extensions/cyferlawyn.cyferlawyn-commitcraft-*/bin/darwin-*/
```

Then reload VS Code. This is a one-time step.

---

## Source & license

Extension source: MIT license — [github.com/cyferlawyn/commitcraft-vscode](https://github.com/cyferlawyn/commitcraft-vscode)

Compiled binaries and releases: commercial license. See [LICENSE](LICENSE).
