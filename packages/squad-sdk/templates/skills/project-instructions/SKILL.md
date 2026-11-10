---
name: "project-instructions"
description: "Keep AGENTS.md, .github/copilot-instructions.md, .github/instructions/*.instructions.md and CLAUDE.md accurate for this project. Use after stack changes, new conventions, or when an agent repeated a mistake that a rule would have prevented."
domain: "documentation"
confidence: "medium"
source: "manual"
---

## SCOPE

✅ THIS SKILL PRODUCES:
- A short `AGENTS.md` hub (commands, where to look, working rules) shared by every host
- Copilot repo-wide and path-scoped instructions (`applyTo` globs)
- `CLAUDE.md` importing `AGENTS.md` (`@AGENTS.md`)

❌ THIS SKILL DOES NOT:
- Restate rules that already live elsewhere — link to them
- Edit inside `<!-- squad-pc:start -->…<!-- squad-pc:end -->` by hand (regenerate instead)

## Workflow

1. `squad optimize instructions` regenerates the managed blocks from the detected stack.
2. Project-specific rules go **outside** the managed block, as short imperative bullets ("Use X", "Never Y because Z").
3. Path-specific rules go to `.github/instructions/<topic>.instructions.md` with `applyTo:` so they only load when relevant (fewer tokens per request).
4. When an agent makes the same mistake twice, add one rule and record the decision in `.squad/decisions/inbox/`.
5. Keep the hub under ~150 lines; move detail into `docs/` and link it.
