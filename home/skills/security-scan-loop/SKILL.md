---
name: security-scan-loop
description: Run a post-implementation security review loop using Semgrep and Trivy, validate findings against the code, identify false positives, prioritize real risks, and produce a concise evidence-backed report. Use when the user says code is done, asks for a security scan or security report, wants Semgrep and Trivy run, or explicitly invokes $security-scan-loop.
---

# Security Scan Loop

Scan the current project with Semgrep and Trivy, then validate and prioritize the findings. Treat
scanner output as candidate evidence, not as confirmed vulnerabilities.

Read [references/triage-and-report.md](references/triage-and-report.md) before classifying findings.

## Inputs

- Target: default to the current project root
- Scope: default to the working tree; honor a user-specified path or diff scope
- Artifact directory: create an isolated temporary directory outside the target
- Maximum diagnostic cycles per finding: 3

## Loop

1. Confirm the scan target and inspect its languages, manifests, lockfiles, and existing scanner
   configuration.
2. Verify `semgrep` and `trivy` are available. Report a missing tool instead of silently replacing
   it.
3. Record tool versions and database age when available.
4. Run Semgrep with the project's configuration when present; otherwise use an appropriate broad
   ruleset such as `--config auto`. Save JSON output.
5. Run Trivy filesystem scanning for vulnerabilities, secrets, and misconfigurations. Save JSON
   output.
6. Exclude generated dependency/build directories when scanners do not already exclude them, but
   continue scanning lockfiles and infrastructure configuration.
7. Parse and deduplicate findings by root cause. Do not count the same issue repeatedly because
   multiple tools or locations report it.
8. For each material finding, inspect the referenced code and trace whether attacker-controlled
   input can reach the dangerous operation or vulnerable dependency in a realistic execution path.
9. Classify the finding as confirmed, likely, false positive, or needs review. Include evidence for
   every false-positive classification.
10. Assign priority using exploitability, impact, exposure, and confidence rather than scanner
    severity alone.
11. Repeat targeted scans or code inspection when evidence is incomplete, changing the hypothesis
    or method each cycle.
12. Write `security-scan-report.md` in the artifact directory using the required report format.

## Default Commands

Adapt paths and existing project configuration as needed:

```bash
semgrep scan --config auto --json --output <artifact-dir>/semgrep.json <target>
trivy fs --scanners vuln,secret,misconfig --format json \
  --output <artifact-dir>/trivy.json <target>
```

Use project-owned Semgrep configuration instead of `auto` when present. Preserve lockfile scanning.
Skip bulky generated directories such as `node_modules`, build outputs, and scanner artifact
directories when necessary.

If a scanner crashes or cannot initialize, capture its error, diagnose obvious environment causes,
and retry only when the method changes. Do not treat a failed scanner as a clean result.

## Boundaries

- Do not modify source code, scanner configuration, ignore files, or suppress findings unless the
  user explicitly asks.
- Do not upload private source code or findings to external services.
- Do not claim a finding is exploitable without a plausible source-to-sink or dependency path.
- Do not dismiss a finding only because tests pass or the scanner confidence is low.
- Treat secrets as sensitive: redact secret values from all output and reports.
- Request network approval before downloading rule packs or vulnerability database updates.

## Stop

Stop successfully when both scans complete, material findings are validated, and the report is
written.

Stop partially complete when a scanner cannot run or a finding cannot be validated; include the
exact limitation and keep it in `needs review`.

## Report

Report the artifact directory, tool versions, scan coverage, counts by classification and priority,
the highest-priority findings, false-positive rationale, and unresolved limitations.
