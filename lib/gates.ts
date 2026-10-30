/**
 * Governed gates: what actually runs (or is attested) per change.
 *
 * - DLP scan runs server-side over pushed file contents and never
 *   echoes secret values — findings carry path + rule only.
 * - Unit tests / Lint / Production build / Dependency audit are
 *   attested by the reporter (connector/CI runs them where the code
 *   lives and reports pass/fail per check name). Missing or failed
 *   attestation blocks the deploy — "green until proven otherwise"
 *   ends here; a check with no fresh result fails closed.
 *
 * Pure over its inputs so the pipeline is unit-testable offline.
 */

import type { Check, CheckStatus } from "./control-plane";

export interface PushFile {
  path: string;
  content: string;
}

export interface DlpFinding {
  path: string;
  rule: string;
}

const DLP_RULES: Array<{ rule: string; pattern: RegExp }> = [
  { rule: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { rule: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { rule: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { rule: "generic secret assignment", pattern: /(?:api[_-]?key|client[_-]?secret|password)\s*[:=]\s*["'][^"'\s]{8,}["']/i },
];

/** Scan pushed files for secrets. Env files are findings by name. */
export function scanDlp(files: readonly PushFile[]): DlpFinding[] {
  const findings: DlpFinding[] = [];
  for (const file of files) {
    const base = file.path.split("/").pop() ?? file.path;
    if (/^\.env($|\.)/.test(base) && base !== ".env.example") {
      findings.push({ path: file.path, rule: "env file committed" });
    }
    for (const { rule, pattern } of DLP_RULES) {
      if (pattern.test(file.content)) {
        findings.push({ path: file.path, rule });
      }
    }
  }
  return findings;
}

export interface GateOutcome {
  checks: Check[];
  blocked: boolean;
  dlpFindings: DlpFinding[];
  /** Human line for the activity trail, e.g. the blocking gate. */
  summary: string;
}

/**
 * Evaluate the five governed gates for one push. `reported` maps
 * check name → attested status from the connector/CI; DLP is always
 * computed here and overrides any attestation.
 */
export function evaluateGates(
  current: readonly Check[],
  input: { files: readonly PushFile[]; reported?: Record<string, CheckStatus> },
): GateOutcome {
  const dlpFindings = scanDlp(input.files);
  const checks: Check[] = current.map((check) => {
    if (check.name === "DLP scan") {
      return { ...check, status: dlpFindings.length > 0 ? "fail" : "pass" };
    }
    const reported = input.reported?.[check.name];
    return { ...check, status: reported ?? "fail" };
  });
  const failed = checks.filter((c) => c.status !== "pass");
  const blocked = failed.length > 0;
  const summary = blocked
    ? `blocked — ${failed.map((c) => c.name).join(", ")} did not pass`
    : "all gates passed";
  return { checks, blocked, dlpFindings, summary };
}
