/**
 * CommitCraft — commitlint.ts
 * Detects and extracts rules from commitlint config files in the workspace.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CommitlintRules } from './validator';

const CONFIG_FILES = [
  'commitlint.config.js',
  'commitlint.config.cjs',
  'commitlint.config.mjs',
  'commitlint.config.ts',
  '.commitlintrc',
  '.commitlintrc.json',
  '.commitlintrc.yml',
  '.commitlintrc.yaml',
];

/**
 * Attempts to find and parse commitlint rules from the workspace root.
 * Returns an empty object if no config is found or parsing fails.
 * 
 * Note: We do a best-effort static parse — we do NOT execute the config file,
 * to avoid security issues and to keep the extension dependency-free.
 * Only JSON-serializable configs (.commitlintrc, .commitlintrc.json) are
 * fully parsed. JS/TS configs are detected but not executed.
 */
export async function detectCommitlintRules(workspaceRoot: string): Promise<CommitlintRules> {
  for (const filename of CONFIG_FILES) {
    const filepath = path.join(workspaceRoot, filename);
    if (!fs.existsSync(filepath)) {
      continue;
    }

    // Only attempt to parse JSON-format configs
    if (filename === '.commitlintrc' || filename === '.commitlintrc.json') {
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        return parseJsonConfig(content);
      } catch {
        return {};
      }
    }

    if (filename.endsWith('.yml') || filename.endsWith('.yaml')) {
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        return parseYamlConfig(content);
      } catch {
        return {};
      }
    }

    // For JS/TS configs: we found one exists but can't safely execute it.
    // Return empty rules — the model will use defaults.
    return {};
  }

  return {};
}

function parseJsonConfig(content: string): CommitlintRules {
  const raw = JSON.parse(content);
  return extractRulesFromObject(raw);
}

/**
 * Minimal YAML parser for the subset of commitlint config we care about.
 * Handles the simple flat structure that most commitlint YAML configs use.
 * Does NOT handle YAML anchors, multi-line strings, or complex nesting.
 */
function parseYamlConfig(content: string): CommitlintRules {
  // Convert minimal YAML to a rough JS object via line parsing
  // This handles the common case:
  //   rules:
  //     type-enum: [2, always, [feat, fix, ...]]
  const rules: Record<string, unknown> = {};
  const lines = content.split('\n');
  let inRules = false;

  for (const line of lines) {
    if (line.trim() === 'rules:') {
      inRules = true;
      continue;
    }
    if (inRules && /^\s+\S/.test(line)) {
      const match = line.match(/^\s+([\w-]+):\s*(.+)/);
      if (match) {
        rules[match[1]] = match[2];
      }
    } else if (inRules && /^\S/.test(line)) {
      inRules = false;
    }
  }

  return extractRulesFromObject({ rules });
}

function extractRulesFromObject(config: unknown): CommitlintRules {
  const result: CommitlintRules = {};

  if (typeof config !== 'object' || config === null) {
    return result;
  }

  const raw = config as Record<string, unknown>;
  const rules = raw['rules'];

  if (typeof rules !== 'object' || rules === null) {
    return result;
  }

  const r = rules as Record<string, unknown>;

  const typeEnum = extractEnumRule(r['type-enum']);
  if (typeEnum) {
    result.typeEnum = typeEnum;
  }

  const scopeEnum = extractEnumRule(r['scope-enum']);
  if (scopeEnum) {
    result.scopeEnum = scopeEnum;
  }

  const subjectMaxLength = extractNumberRule(r['subject-max-length']);
  if (subjectMaxLength !== undefined) {
    result.subjectMaxLength = subjectMaxLength;
  }

  const headerMaxLength = extractNumberRule(r['header-max-length']);
  if (headerMaxLength !== undefined) {
    result.headerMaxLength = headerMaxLength;
  }

  return result;
}

/**
 * commitlint rule format: [severity, 'always'|'never', value]
 * e.g. type-enum: [2, 'always', ['feat', 'fix']]
 */
function extractEnumRule(rule: unknown): string[] | undefined {
  if (!Array.isArray(rule)) {
    return undefined;
  }
  // [severity, condition, value]
  const value = rule[2];
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
    return value as string[];
  }
  return undefined;
}

function extractNumberRule(rule: unknown): number | undefined {
  if (!Array.isArray(rule)) {
    return undefined;
  }
  const value = rule[2];
  if (typeof value === 'number') {
    return value;
  }
  return undefined;
}
