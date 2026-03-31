/**
 * CommitCraft — extension.ts
 * VS Code extension entry point.
 * Registers the generate command and wires everything together.
 */

import * as vscode from 'vscode';
import { getStagedDiff, getWorkspaceRoot } from './git';
import { detectCommitlintRules } from './commitlint';
import { buildPrompt } from './prompt';
import { runInference } from './inference';
import { validateCommit, extractCommitLine } from './validator';
import { ensureModel } from './model';
import { checkLicenseGate } from './license';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'commitcraft.generate',
    () => generateCommitMessage(context),
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // Nothing to clean up
}

async function generateCommitMessage(context: vscode.ExtensionContext): Promise<void> {
  // 1. License gate
  const licensed = await checkLicenseGate(context);
  if (!licensed) {
    return;
  }

  // 2. Get workspace root
  let workspaceRoot: string;
  try {
    workspaceRoot = getWorkspaceRoot(vscode.workspace.workspaceFolders);
  } catch (err) {
    vscode.window.showErrorMessage(errorMessage(err));
    return;
  }

  // 3. Ensure model is available (downloads if needed)
  let modelPath: string;
  try {
    modelPath = await ensureModel(context);
  } catch (err) {
    vscode.window.showErrorMessage(errorMessage(err));
    return;
  }

  // 4. Get staged diff
  let diffResult: Awaited<ReturnType<typeof getStagedDiff>>;
  try {
    const config = vscode.workspace.getConfiguration('commitcraft');
    const maxDiffTokens = config.get<number>('maxDiffTokens') ?? 4000;
    const maxChars = maxDiffTokens * 4; // rough chars-per-token estimate
    diffResult = await getStagedDiff(workspaceRoot, maxChars);
  } catch (err) {
    vscode.window.showErrorMessage(errorMessage(err));
    return;
  }

  if (diffResult.truncated) {
    vscode.window.showWarningMessage(
      `CommitCraft: Diff was truncated to fit the model context window ` +
      `(${diffResult.originalLength} → ${diffResult.diff.length} chars). ` +
      `The generated message may be incomplete.`,
    );
  }

  // 5. Detect commitlint rules
  const rules = await detectCommitlintRules(workspaceRoot);

  // 6. Build prompt
  const prompt = buildPrompt(diffResult.diff, rules);

  // 7. Run inference with progress indicator
  let rawOutput: string;
  try {
    rawOutput = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'CommitCraft: Generating commit message...',
        cancellable: false,
      },
      async () => {
        const config = vscode.workspace.getConfiguration('commitcraft');
        const timeoutMs = (config.get<number>('inferenceTimeout') ?? 30) * 1000;

        const result = await runInference({
          modelPath,
          prompt,
          timeoutMs,
          extensionPath: context.extensionPath,
        });

        return result.output;
      },
    );
  } catch (err) {
    vscode.window.showErrorMessage(`CommitCraft inference failed: ${errorMessage(err)}`);
    return;
  }

  // 8. Validate output — retry once with a stricter prompt if needed
  let validation = validateCommit(rawOutput, rules);

  if (!validation.valid) {
    // Retry with explicit correction instruction
    const retryPrompt = buildPrompt(diffResult.diff, rules) +
      `\n\nPrevious attempt "${rawOutput}" was invalid. ` +
      `Output ONLY the commit message in format type(scope): subject`;

    try {
      const config = vscode.workspace.getConfiguration('commitcraft');
      const timeoutMs = (config.get<number>('inferenceTimeout') ?? 30) * 1000;

      const retryResult = await runInference({
        modelPath,
        prompt: retryPrompt,
        timeoutMs,
        extensionPath: context.extensionPath,
      });

      const retryValidation = validateCommit(retryResult.output, rules);
      if (retryValidation.valid) {
        validation = retryValidation;
        rawOutput = retryResult.output;
      }
    } catch {
      // Retry failed — fall through with the original (invalid) output
    }
  }

  const commitLine = extractCommitLine(rawOutput);

  // 9. Present result to the user
  await presentResult(commitLine, validation.issues);
}

async function presentResult(
  commitMessage: string,
  issues: string[],
): Promise<void> {
  const hasIssues = issues.length > 0;

  // Build quick pick items
  const items: vscode.QuickPickItem[] = [
    {
      label: '$(check) Accept',
      description: commitMessage,
      detail: hasIssues
        ? `Warnings: ${issues.join('; ')}`
        : `${commitMessage.length} chars`,
      alwaysShow: true,
    },
    {
      label: '$(edit) Edit',
      description: 'Open the message in an input box for editing',
      alwaysShow: true,
    },
    {
      label: '$(sync) Regenerate',
      description: 'Generate a new message',
      alwaysShow: true,
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'CommitCraft — Generated Commit Message',
    placeHolder: commitMessage,
    ignoreFocusOut: true,
  });

  if (!picked) {
    return; // User dismissed
  }

  if (picked.label.includes('Accept')) {
    await writeToCommitInput(commitMessage);
  } else if (picked.label.includes('Edit')) {
    const edited = await vscode.window.showInputBox({
      value: commitMessage,
      prompt: 'Edit the commit message',
      ignoreFocusOut: true,
    });
    if (edited) {
      await writeToCommitInput(edited);
    }
  } else if (picked.label.includes('Regenerate')) {
    // Re-run the whole command
    vscode.commands.executeCommand('commitcraft.generate');
  }
}

/**
 * Writes a message to the VS Code SCM (Source Control) commit message input box.
 * Uses the Git extension's API to write directly into the input box.
 */
async function writeToCommitInput(message: string): Promise<void> {
  const gitExtension = vscode.extensions.getExtension('vscode.git');

  if (gitExtension) {
    const git = gitExtension.isActive
      ? gitExtension.exports
      : await gitExtension.activate();

    const api = git.getAPI(1);
    const repo = api.repositories[0];

    if (repo) {
      repo.inputBox.value = message;
      // Focus the SCM view so the user sees the message
      vscode.commands.executeCommand('workbench.view.scm');
      return;
    }
  }

  // Fallback: copy to clipboard and notify
  await vscode.env.clipboard.writeText(message);
  vscode.window.showInformationMessage(
    `CommitCraft: Copied to clipboard — "${message}"`,
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
