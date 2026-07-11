# Security Finding Triage And Report

## Classification

- **Confirmed**: Evidence establishes a realistic vulnerable path or an affected dependency is
  present and reachable under the project's deployment assumptions.
- **Likely**: Strong evidence exists, but one material runtime or deployment assumption remains.
- **False positive**: The scanner rule does not apply, the path is unreachable, input is trusted or
  correctly constrained, the vulnerable feature is not used, or another concrete control removes
  the risk. State the evidence.
- **Needs review**: Evidence is insufficient or requires domain, deployment, or ownership context.

## Priority

- **P0 Critical**: Active secret exposure, practical unauthenticated remote compromise, or immediate
  production-impacting risk.
- **P1 High**: Realistic exploitation with severe confidentiality, integrity, or availability
  impact.
- **P2 Medium**: Exploitation requires meaningful preconditions or impact is limited.
- **P3 Low**: Defense-in-depth issue, weak signal, or low-impact exposure.

Lower priority when exploitation requires unrealistic conditions. Raise priority when the path is
internet-facing, handles sensitive data, crosses a trust boundary, or has a known practical exploit.

## Validation Checklist

For code findings:

1. Identify the source, sink, and sanitization or validation.
2. Trace the real call path and entry point.
3. Check authentication, authorization, and deployment exposure.
4. Look for framework controls the scanner may not model.
5. Verify whether the flagged code executes in production.

For dependency findings:

1. Confirm the resolved vulnerable version from a lockfile or installed package metadata.
2. Confirm whether the dependency is production, development-only, optional, or transitive.
3. Check whether the vulnerable feature or execution path is used.
4. Record the fixed version and upgrade constraints when known.

For secret findings:

1. Never reproduce the secret value.
2. Confirm whether it is a real credential, test fixture, example, hash, or public identifier.
3. Treat a real committed credential as P0 until rotation and exposure are assessed.

## Required Report Format

```markdown
# Security Scan Report

## Executive Summary
- Target:
- Semgrep:
- Trivy:
- Coverage and limitations:
- Confirmed / likely / false positive / needs review counts:

## Priority Findings
### [P1] Finding title
- Classification:
- Tool and rule/CVE:
- Location:
- Evidence:
- Exploit scenario:
- Impact:
- Recommendation:

## False Positives
### Finding title
- Tool and rule/CVE:
- Location:
- Why it is not applicable:
- Evidence:

## Needs Review
- Finding and missing information

## Scan Details
- Commands/configuration:
- Tool versions and database age:
- Raw artifact paths:
```

Order priority findings from P0 to P3. Within a priority, order confirmed before likely.
