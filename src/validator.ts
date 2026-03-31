/**
 * CommitCraft — validator.ts
 * Validates that a string is a well-formed conventional commit message.
 */

export interface CommitlintRules {
  typeEnum?: string[];
  scopeEnum?: string[];
  subjectMaxLength?: number;
  headerMaxLength?: number;
  subjectCase?: string;
}

export interface ValidationResult {
  valid: boolean;
  message: string;
  type?: string;
  scope?: string;
  breaking?: boolean;
  subject?: string;
  issues: string[];
}

const VALID_TYPES = [
  'feat', 'fix', 'refactor', 'docs', 'style',
  'test', 'chore', 'perf', 'ci', 'build', 'revert',
];

// Allows alphanumeric, dots, slashes, hyphens, underscores in scope
const COMMIT_REGEX =
  /^(feat|fix|refactor|docs|style|test|chore|perf|ci|build|revert)(\([a-z0-9_./-]+\))?(!)?:\s(.+)/i;

/**
 * Extracts the first line of a model response that looks like a conventional commit.
 * The model sometimes emits preamble before the actual message.
 */
export function extractCommitLine(raw: string): string {
  const lines = raw.trim().split('\n');
  for (const line of lines) {
    if (COMMIT_REGEX.test(line.trim())) {
      return line.trim();
    }
  }
  // Fall back to the first non-empty line
  return lines.find(l => l.trim().length > 0)?.trim() ?? '';
}

export function validateCommit(
  message: string,
  rules: CommitlintRules = {},
): ValidationResult {
  const line = extractCommitLine(message);
  const issues: string[] = [];

  const match = line.match(COMMIT_REGEX);
  if (!match) {
    return {
      valid: false,
      message: line,
      issues: [`Output does not match conventional commit format: "${line}"`],
    };
  }

  const [, type, scopeRaw, breaking, subject] = match;
  const normalizedType = type.toLowerCase();
  const scope = scopeRaw ? scopeRaw.replace(/[()]/g, '') : undefined;

  const allowedTypes = rules.typeEnum ?? VALID_TYPES;
  if (!allowedTypes.includes(normalizedType)) {
    issues.push(`Type "${normalizedType}" is not in allowed types: [${allowedTypes.join(', ')}]`);
  }

  if (rules.scopeEnum && scope && !rules.scopeEnum.includes(scope)) {
    issues.push(`Scope "${scope}" is not in allowed scopes: [${rules.scopeEnum.join(', ')}]`);
  }

  if (subject.endsWith('.')) {
    issues.push('Subject must not end with a period');
  }

  const maxSubject = rules.subjectMaxLength ?? 72;
  if (subject.length > maxSubject) {
    issues.push(`Subject is ${subject.length} chars, max is ${maxSubject}`);
  }

  const headerMaxLength = rules.headerMaxLength ?? 100;
  if (line.length > headerMaxLength) {
    issues.push(`Header is ${line.length} chars, max is ${headerMaxLength}`);
  }

  return {
    valid: issues.length === 0,
    message: line,
    type: normalizedType,
    scope,
    breaking: !!breaking,
    subject,
    issues,
  };
}
