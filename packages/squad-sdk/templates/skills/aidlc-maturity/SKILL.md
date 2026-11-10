---
name: "aidlc-maturity"
description: "AIDLC 0–5 maturity model (Plain Concepts Platform): level criteria, how to assess a repo and how to climb to autonomous delivery. Use when asked about AI maturity, 'what next', guardrails, quality gates or reaching maintenance mode."
domain: "process"
confidence: "medium"
source: "manual"
---

## SCOPE

✅ THIS SKILL PRODUCES:
- An up-to-date `.squad/aidlc/assessment.md` (run `squad aidlc`)
- A prioritised roadmap: one issue per missing check, lowest level first
- Guardrail changes (CI gates, specs, docs) that move the repo up one level

❌ THIS SKILL DOES NOT:
- Lower a coverage/quality floor to go green ("floors only ratchet up")
- Skip a level: you cannot reach autonomous delivery without the guardrails

## The scale

Built on the Plain Concepts Platform method (https://platform.plainconcepts.dev): engineering levels L1–L3, its twelve practices, and the phases Discovery → Foundations → Maintenance mode. Levels are cumulative.

| Level | Name | Must be true |
|---|---|---|
| 0 | Ad-hoc | — |
| 1 | Assisted | `AGENTS.md` hub + host instructions (copilot-instructions / CLAUDE.md); build & test commands discoverable |
| 2 | Structured | Squad team cast; skills installed; OpenSpec; automated tests; CI; repo map / graph for agents |
| 3 | Guarded (PC L1) | Secrets (TruffleHog), vulnerabilities (Trivy), SAST (Semgrep) in PR CI; spec-in-PR gate; ARCHITECTURE.md + ADRs |
| 4 | Autonomous delivery (PC L2) | Coverage floor enforced; Gherkin specs bound to OpenSpec; SBOM (Syft CycloneDX); agentic workflows (triage → implement); token tooling (RTK / economy) |
| 5 | Self-maintaining (PC L3) | Mutation (Stryker), DAST (ZAP), complexity (CC ≤ 15, CRAP ≤ 30); merge gate auto-merges bot PRs; `.platform/contract.yml` + Project Health |

Level 4 test: *can a change go from issue to production without an engineer reading the diff?* If the answer is "it would probably be fine", the guardrails are not finished.

## How to climb

1. Run `squad aidlc` and read the "Next steps".
2. Lead turns each step into an issue labelled `squad` (one guardrail per PR).
3. Human checkpoints stay only for: `.github/` changes, secrets, >10k changed lines, irreversible changes, verified high-severity findings, low agent confidence.
4. Gates become **required status checks** (repository ruleset), never advisory.
5. After merging, run `squad aidlc` again and commit the refreshed assessment.

## Useful installs

- Platform skills: `npx skills add PlainConceptsPlatform/Foundations --skill platform-onboard`
- Agentic workflows: `npx @plainconceptsplatform/workflows add --template quality-gates`
- Specs: `npx @fission-ai/openspec@latest init`
