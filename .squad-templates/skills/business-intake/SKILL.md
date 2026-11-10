---
name: "business-intake"
description: "Maintenance-mode triage of business requests (Plain Concepts Platform): 10 checks, up to 3 question rounds, verdict pass / needs-info / needs-maintainer / block, scope from PRODUCT_SCOPE.md. Use when an issue is labelled business-request or needs-triage."
domain: "process"
confidence: "medium"
source: "manual"
---

## SCOPE

✅ THIS SKILL PRODUCES:
- One triage comment per round with a verdict and, for needs-info, at most 3 concrete questions
- On **pass**: an OpenSpec change proposal (or Gherkin scenarios) and the `squad` label so the team picks it up
- Splits of 8+ point stories into 3–5 point children

❌ THIS SKILL DOES NOT:
- Accept out-of-scope work because it is "small" or "clear" — scope is a hard rule
- Implement anything before the verdict is **pass**

## The 10 checks

1. In scope per `PRODUCT_SCOPE.md` (otherwise **needs-maintainer** or **block**)
2. Problem and affected users are stated
3. Acceptance criteria are testable (Given/When/Then)
4. No security, auth, data-model, migration or API change implied
5. No conflict with `.squad/decisions.md` or existing specs
6. Not a duplicate of an open issue
7. Size estimated; 8+ points → split
8. UI changes reference the design system (reuse before you build)
9. Data/privacy impact is none or stated
10. Rollback is trivial (feature flag or revert)

## Verdicts

| Verdict | When | Next |
|---|---|---|
| pass | All checks green | Create the OpenSpec change, label `squad`, remove `needs-triage` |
| needs-info | Missing information (max 3 rounds) | Ask ≤3 specific questions |
| needs-maintainer | Valid but outside business scope | Label `needs-maintainer`, explain why |
| block | Harmful, contradictory or not a product change | Explain and close |

After 3 rounds without enough information the verdict becomes **needs-maintainer**.
