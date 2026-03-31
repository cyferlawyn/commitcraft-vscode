/**
 * CommitCraft — git.ts
 * Reads the staged diff from the current workspace using git.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface DiffResult {
  diff: string;
  truncated: boolean;
  originalLength: number;
}

/**
 * Returns the staged diff for the given workspace root.
 * Throws if git is not available or no staged changes exist.
 */
export async function getStagedDiff(
  workspaceRoot: string,
  maxChars: number = 16000, // ~4000 tokens at ~4 chars/token
): Promise<DiffResult> {
  let stdout: string;

  try {
    const result = await execFileAsync('git', ['diff', '--staged', '--no-color'], {
      cwd: workspaceRoot,
      maxBuffer: 10 * 1024 * 1024, // 10MB limit — very large diffs
    });
    stdout = result.stdout;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not a git repository')) {
      throw new Error('The current workspace is not a git repository.');
    }
    throw new Error(`Failed to run git: ${message}`);
  }

  if (!stdout.trim()) {
    throw new Error('No staged changes. Stage your files first (git add).');
  }

  const originalLength = stdout.length;
  const truncated = originalLength > maxChars;
  const diff = truncated ? stdout.slice(0, maxChars) + '\n[diff truncated]' : stdout;

  return { diff, truncated, originalLength };
}

/**
 * Returns the workspace root for the first active workspace folder.
 * Throws if no workspace is open.
 */
export function getWorkspaceRoot(
  workspaceFolders: readonly { uri: { fsPath: string } }[] | undefined,
): string {
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('No workspace folder is open. Open a git repository first.');
  }
  return workspaceFolders[0].uri.fsPath;
}
