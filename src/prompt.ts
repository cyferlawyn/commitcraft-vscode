/**
 * CommitCraft — prompt.ts
 * Builds the model prompt from a diff and optional commitlint rules.
 */

import type { CommitlintRules } from './validator';

export function buildPrompt(diff: string, rules: CommitlintRules = {}, generateBody = false): string {
  const allowedTypes = rules.typeEnum ?? [
    'feat', 'fix', 'refactor', 'docs', 'style',
    'test', 'chore', 'perf', 'ci', 'build', 'revert',
  ];

  const scopeConstraint = rules.scopeEnum
    ? `The scope MUST be one of: [${rules.scopeEnum.join(', ')}]. Choose the most appropriate one.`
    : `Use a short module/package name as scope if identifiable. Do NOT use file paths, directory paths, or file extensions as the scope.`;

  const maxLen = rules.subjectMaxLength ?? 72;

  const bodyInstruction = generateBody
    ? `After the commit message line, add a blank line and then a short paragraph (2-3 sentences) ` +
      `explaining the motivation or context for the change.`
    : `Output ONLY the single commit message line. No explanation, no extra text.`;

  return `You are a commit message generator. Given a git diff, output exactly one conventional commit message line.

Format: <type>(<scope>): <subject>

Allowed types: ${allowedTypes.join(', ')}

Type rules (choose the FIRST matching rule):
1. Only .md or comment changes → docs
2. Tests added or modified → test
3. New user-visible functionality added (new file, new function, new endpoint, new parameter) → feat
4. Existing bug corrected, nothing new added → fix
5. Code restructured with no behavior change → refactor
6. Build/config/tooling changes → chore

${scopeConstraint}
Subject: imperative mood, lowercase start, no trailing period, max ${maxLen} chars.
${bodyInstruction}

Examples:
diff adds new CSV export endpoint → feat(api): add csv export endpoint
diff fixes null pointer in login → fix(auth): prevent null pointer on missing user
diff extracts helper functions, same behavior → refactor(utils): extract price calculation helpers
diff updates README only → docs(readme): add getting started section
diff adds loading prop to Button → feat(ui): add loading state to button component

Git diff:
${diff}

Commit message:`;
}
