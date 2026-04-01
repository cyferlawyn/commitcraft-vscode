/**
 * CommitCraft — git.ts
 * Reads the staged diff from the current workspace using git.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface DiffResult {
  diff: string;
  truncated: boolean;
  originalLength: number;
}

/**
 * Resolves the actual git repository root from any directory within the repo.
 * Uses `git rev-parse --show-toplevel` so we always run diff from the right cwd
 * regardless of which subfolder VS Code has open as the workspace.
 */
async function resolveGitRoot(startDir: string): Promise<string> {
  try {
    const result = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: startDir,
    });
    return result.stdout.trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not a git repository')) {
      throw new Error('The current workspace is not a git repository.');
    }
    throw new Error(`Failed to run git: ${message}`);
  }
}

/**
 * Returns the staged diff for the given workspace root.
 * Throws if git is not available or no staged changes exist.
 */
export async function getStagedDiff(
  workspaceRoot: string,
  maxChars: number = 16000, // ~4000 tokens at ~4 chars/token
): Promise<DiffResult> {
  const gitRoot = await resolveGitRoot(workspaceRoot);

  let stdout: string;

  try {
    const result = await execFileAsync('git', ['diff', '--staged', '--no-color'], {
      cwd: gitRoot,
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
    // git diff --staged can be empty even with staged changes in edge cases
    // (e.g. pure deletions on some git versions, binary files, submodules).
    // Fall back to git status to check if anything is actually staged.
    let statusOut = '';
    try {
      const statusResult = await execFileAsync('git', ['status', '--short'], {
        cwd: gitRoot,
      });
      statusOut = statusResult.stdout;
    } catch {
      // ignore
    }

    const hasStagedChanges = statusOut.split('\n').some(line => /^[AMDRC]/.test(line));
    if (!hasStagedChanges) {
      throw new Error('No staged changes. Stage your files first (git add).');
    }

    // Something is staged but produces no text diff (binary, submodule, etc.)
    // Use git diff --staged --name-status as a minimal description for the model.
    try {
      const nsResult = await execFileAsync(
        'git', ['diff', '--staged', '--name-status', '--no-color'],
        { cwd: gitRoot },
      );
      stdout = nsResult.stdout.trim()
        ? `Staged changes (no text diff available):\n${nsResult.stdout}`
        : statusOut.split('\n')
            .filter(l => /^[AMDRC]/.test(l))
            .map(l => l.trim())
            .join('\n');
    } catch {
      throw new Error('No staged changes. Stage your files first (git add).');
    }

    if (!stdout.trim()) {
      throw new Error('No staged changes. Stage your files first (git add).');
    }
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
