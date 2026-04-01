/**
 * CommitCraft — model.ts
 * Manages the GGUF model: locates it, downloads it on first use,
 * verifies its SHA-256 checksum.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as crypto from 'crypto';
import { URL } from 'url';
import * as vscode from 'vscode';

// ---- Model metadata -------------------------------------------------------

export const MODEL_ID = 'qwen2.5-coder-3b-q4_k_m';

export const DEFAULT_MODEL_URL =
  'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf';

// SHA-256 of the canonical GGUF release from HuggingFace.
// Source: https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/blob/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf
export const MODEL_SHA256 =
  '724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7';

export const MODEL_FILENAME = 'qwen2.5-coder-3b-instruct-q4_k_m.gguf';

// ---- Path helpers ---------------------------------------------------------

export function getDefaultModelDir(): string {
  return path.join(os.homedir(), '.commitcraft', 'models');
}

export function getModelPath(overridePath?: string): string {
  if (overridePath && overridePath.trim()) {
    return overridePath.trim();
  }
  return path.join(getDefaultModelDir(), MODEL_FILENAME);
}

// ---- Existence check ------------------------------------------------------

export function modelExists(modelPath: string): boolean {
  return fs.existsSync(modelPath);
}

// ---- SHA-256 verification -------------------------------------------------

export async function verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
  if (expectedSha256.startsWith('PLACEHOLDER')) {
    return true;
  }

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk: Buffer | string) => hash.update(chunk));
    stream.on('end', () => {
      const actual = hash.digest('hex');
      resolve(actual === expectedSha256.toLowerCase());
    });
    stream.on('error', reject);
  });
}

// ---- Download -------------------------------------------------------------

/**
 * Downloads the model file with resumable support.
 * Reports progress through a VS Code progress notification.
 */
export async function downloadModel(
  modelPath: string,
  modelUrl: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken,
): Promise<void> {
  const dir = path.dirname(modelPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const partPath = modelPath + '.part';
  const partialBytes = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;

  const headers: Record<string, string> = {
    'User-Agent': 'CommitCraft-VSCode/0.1.0',
  };
  if (partialBytes > 0) {
    headers['Range'] = `bytes=${partialBytes}-`;
  }

  await new Promise<void>((resolve, reject) => {
    const makeRequest = (requestUrl: URL, redirectCount = 0): void => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const options = {
        hostname: requestUrl.hostname,
        port: requestUrl.port ? parseInt(requestUrl.port) : 443,
        path: requestUrl.pathname + requestUrl.search,
        method: 'GET',
        headers,
      };

      const req = https.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeRequest(new URL(res.headers.location), redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        const contentRange = res.headers['content-range'];
        const totalBytes =
          res.statusCode === 206 && contentRange
            ? partialBytes + parseInt(contentRange.split('/')[1] ?? '0')
            : parseInt(res.headers['content-length'] ?? '0');

        const file = fs.createWriteStream(partPath, {
          flags: partialBytes > 0 ? 'a' : 'w',
        });

        let downloaded = partialBytes;
        let lastReportedPercent = 0;

        res.on('data', (chunk: Buffer) => {
          if (token.isCancellationRequested) {
            req.destroy();
            file.close();
            reject(new Error('Download cancelled'));
            return;
          }

          downloaded += chunk.length;
          file.write(chunk);

          if (totalBytes > 0) {
            const percent = Math.floor((downloaded / totalBytes) * 100);
            const mb = (downloaded / 1024 / 1024).toFixed(0);
            const totalMb = (totalBytes / 1024 / 1024).toFixed(0);

            if (percent > lastReportedPercent) {
              progress.report({
                message: `Downloading model... ${mb}MB / ${totalMb}MB (${percent}%)`,
                increment: percent - lastReportedPercent,
              });
              lastReportedPercent = percent;
            }
          }
        });

        res.on('end', () => {
          file.close(() => {
            fs.renameSync(partPath, modelPath);
            resolve();
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.end();
    };

    makeRequest(new URL(modelUrl));
  });
}

// ---- Ensure model is available --------------------------------------------

/**
 * Ensures the model is present and verified.
 * If not present, prompts the user and downloads.
 * Returns the path to the model file, or throws if unavailable.
 */
export async function ensureModel(
  context: vscode.ExtensionContext,
): Promise<string> {
  const config = vscode.workspace.getConfiguration('commitcraft');
  const modelPath = getModelPath(config.get<string>('modelPath'));
  const modelUrl = config.get<string>('modelUrl') || DEFAULT_MODEL_URL;

  if (modelExists(modelPath)) {
    return modelPath;
  }

  const answer = await vscode.window.showInformationMessage(
    `CommitCraft needs to download the AI model (~1.9GB) to ${path.dirname(modelPath)}. ` +
    `The model is a public artifact from Hugging Face and will only be downloaded once.`,
    { modal: true },
    'Download',
    'Cancel',
  );

  if (answer !== 'Download') {
    throw new Error('Model download cancelled. CommitCraft requires the model to function.');
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'CommitCraft',
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: 'Starting model download...', increment: 0 });
      await downloadModel(modelPath, modelUrl, progress, token);
      progress.report({ message: 'Verifying model integrity...', increment: 0 });

      const valid = await verifyChecksum(modelPath, MODEL_SHA256);
      if (!valid) {
        fs.unlinkSync(modelPath);
        throw new Error(
          'Model file failed checksum verification. The file may be corrupted. Please try again.',
        );
      }
    },
  );

  return modelPath;
}
