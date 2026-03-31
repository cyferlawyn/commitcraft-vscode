/**
 * CommitCraft — inference.ts
 * Spawns the bundled llama.cpp binary to run inference on the local model.
 *
 * Binary strategy (llama.cpp b8603):
 *   - macOS/Linux: use `llama-completion` (non-interactive, single-shot, clean stdout)
 *   - Windows:     use `llama-cli --single-turn` (llama-completion not in CPU zip)
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface InferenceOptions {
  modelPath: string;
  prompt: string;
  timeoutMs: number;
  extensionPath: string;
}

export interface InferenceResult {
  output: string;
  elapsedMs: number;
}

/** Which binary variant to use for inference. */
type BinaryMode = 'completion' | 'cli-single-turn';

interface BinaryInfo {
  binaryPath: string;
  mode: BinaryMode;
}

/**
 * Returns the path to the bundled llama.cpp binary and the invocation mode.
 * Prefers `llama-completion` (clean stdout) when available; falls back to
 * `llama-cli --single-turn` on Windows where llama-completion is not shipped.
 */
export function getBinaryInfo(extensionPath: string): BinaryInfo {
  const platform = process.platform;
  const arch = process.arch;

  let dir: string;
  let completionBin: string;
  let cliBin: string;

  if (platform === 'win32' && arch === 'x64') {
    dir = path.join(extensionPath, 'bin', 'win32-x64');
    completionBin = path.join(dir, 'llama-completion.exe');
    cliBin = path.join(dir, 'llama-cli.exe');
  } else if (platform === 'darwin' && arch === 'arm64') {
    dir = path.join(extensionPath, 'bin', 'darwin-arm64');
    completionBin = path.join(dir, 'llama-completion');
    cliBin = path.join(dir, 'llama-cli');
  } else if (platform === 'darwin' && arch === 'x64') {
    dir = path.join(extensionPath, 'bin', 'darwin-x64');
    completionBin = path.join(dir, 'llama-completion');
    cliBin = path.join(dir, 'llama-cli');
  } else if (platform === 'linux' && arch === 'x64') {
    dir = path.join(extensionPath, 'bin', 'linux-x64');
    completionBin = path.join(dir, 'llama-completion');
    cliBin = path.join(dir, 'llama-cli');
  } else {
    throw new Error(
      `Unsupported platform: ${platform}-${arch}. ` +
      `CommitCraft supports win32-x64, darwin-arm64, darwin-x64, and linux-x64.`,
    );
  }

  if (fs.existsSync(completionBin)) {
    return { binaryPath: completionBin, mode: 'completion' };
  }

  if (fs.existsSync(cliBin)) {
    return { binaryPath: cliBin, mode: 'cli-single-turn' };
  }

  throw new Error(
    `llama.cpp binary not found in ${dir}. ` +
    `The extension may be corrupted. Please reinstall CommitCraft.`,
  );
}

/** @deprecated Use getBinaryInfo instead */
export function getBinaryPath(extensionPath: string): string {
  return getBinaryInfo(extensionPath).binaryPath;
}

/**
 * Strips markdown code fences from model output.
 * The model sometimes wraps its response in ```commit ... ``` or ``` ... ```.
 */
function stripMarkdownFences(text: string): string {
  // Remove opening fence (e.g. ```commit or ```)
  const withoutOpening = text.replace(/^```[a-z]*\n?/i, '');
  // Remove closing fence
  const withoutClosing = withoutOpening.replace(/\n?```\s*$/i, '');
  return withoutClosing.trim();
}

/**
 * Strips the llama-cli chat banner and perf footer from stdout.
 * The banner appears before the actual response; the footer appears after.
 * Example banner: "Loading model...\n▄▄ ▄▄\n..."
 * Example footer: "[ Prompt: 49.9 t/s | Generation: 10.9 t/s ]"
 */
function stripChatBanner(text: string): string {
  // Remove everything up to and including the first blank line after the banner
  // The banner always ends with a blank line before the actual prompt/response
  const lines = text.split('\n');
  let contentStart = 0;

  // Find the '>' prompt echo line and skip past it
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('>')) {
      contentStart = i + 1;
      break;
    }
  }

  // Remove perf footer lines like "[ Prompt: ... | Generation: ... ]"
  const content = lines
    .slice(contentStart)
    .filter(l => !l.match(/^\[.*t\/s.*\]/))
    .filter(l => !l.trim().startsWith('Exiting'))
    .join('\n');

  return content.trim();
}

/**
 * Runs inference using the bundled llama.cpp binary.
 * Automatically selects the best available binary for the current platform.
 */
export async function runInference(options: InferenceOptions): Promise<InferenceResult> {
  const { modelPath, prompt, timeoutMs, extensionPath } = options;

  const { binaryPath, mode } = getBinaryInfo(extensionPath);
  const startTime = Date.now();

  // Common args shared by both modes
  const commonArgs = [
    '--model', modelPath,
    '--prompt', prompt,
    '--n-predict', '128',      // max output tokens — commit messages are short
    '--temp', '0.2',           // low temperature for deterministic output
    '--top-p', '0.9',
    '--repeat-penalty', '1.1',
    '--log-disable',           // suppress llama.cpp internal logs
  ];

  // Mode-specific args
  const modeArgs = mode === 'completion'
    ? [
        // llama-completion: clean non-interactive mode, no banner, no prompt echo
        '--no-display-prompt',
      ]
    : [
        // llama-cli: chat UI mode; --single-turn exits after one response
        '--no-display-prompt',
        '--single-turn',
      ];

  const args = [...commonArgs, ...modeArgs];

  return new Promise((resolve, reject) => {
    const proc = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    let timer: ReturnType<typeof setTimeout>;

    timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Inference timed out after ${timeoutMs / 1000}s. Try increasing the timeout in settings.`));
    }, timeoutMs);

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      const elapsed = Date.now() - startTime;

      if (code !== 0 && code !== null) {
        reject(new Error(
          `Inference process exited with code ${code}. ` +
          `stderr: ${stderr.slice(0, 500)}`,
        ));
        return;
      }

      // For cli-single-turn mode, strip the chat banner before processing
      const raw = mode === 'cli-single-turn'
        ? stripChatBanner(stdout)
        : stdout.trim();

      resolve({ output: stripMarkdownFences(raw), elapsedMs: elapsed });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start inference: ${err.message}`));
    });
  });
}
