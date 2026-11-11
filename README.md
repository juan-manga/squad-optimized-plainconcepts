# Squad Optimized — Plain Concepts

> **A squad generator.** You install this tool once on your machine, then run `squad init` inside any project to give it an AI agent team plus the instructions, specs, skills, token savers and CI guardrails needed to go from **AIDLC 0 to 4–5** following the [Plain Concepts Platform](https://platform.plainconcepts.dev) method. This repository only contains the generator; your projects keep their own code and simply receive the generated files.
>
> Fork of [bradygaster/squad](https://github.com/bradygaster/squad). Everything upstream still works; this section documents what the fork adds, and the original Squad docs follow below.

**Contents:** [Install](#install) · [Use it in a project](#use-it-in-a-project) · [The installer](#the-installer-squad-init) · [AIDLC levels](#aidlc-maturity-levels-squad-aidlc) · [Commands](#squad-optimize-commands) · [Features](#features-in-detail) · [Metrics](#delivery-metrics-squad-metrics) · [Generated files](#files-the-optimizer-generates) · [Config](#squadconfigjson-keys) · [Fork maintenance](#maintaining-the-fork) · [Limitations](#known-limitations)

## Install

**Requirements:** Node.js 22.5 or newer, npm, and git. Optional extras the wizard can use: [RTK](https://github.com/rtk-ai/rtk) (`winget install rtk-ai.rtk` / `brew install rtk`) for shell-output token savings, and Python 3.10+ for [graphify](https://github.com/Graphify-Labs/graphify) (`uv tool install graphifyy`). Plus at least one AI host: GitHub Copilot (VS Code or Copilot CLI), Claude Code or OpenCode.

### Option A — from a release (recommended)

One command, no npm registry or clone needed:

```bash
npm install -g https://github.com/juan-manga/squad-optimized-plainconcepts/releases/latest/download/squad-cli.tgz --allow-scripts=@bradygaster/squad-cli
```

`--allow-scripts` lets the CLI's post-install step run (npm 11 blocks install scripts by default); it patches an ESM import in the Copilot SDK that Node 22+ rejects otherwise. To pin a version, replace `latest/download` with `download/<tag>` from the [releases page](https://github.com/juan-manga/squad-optimized-plainconcepts/releases).

Check it:

```bash
squad --version
squad help
```

`squad help` must list `optimize`, `aidlc`, `metrics` and `context-mcp`; if it doesn't, you are running the upstream Squad (see the note below).

### Option B — from source (contributors)

```bash
git clone https://github.com/juan-manga/squad-optimized-plainconcepts.git
cd squad-optimized-plainconcepts
npm ci
npm run dev:link
```

`dev:link` builds the SDK and CLI and links the `squad` command globally to your clone, so `git pull && npm run build` updates it. Undo with `npm run dev:unlink`.

### Update and uninstall

```bash
npm install -g https://github.com/juan-manga/squad-optimized-plainconcepts/releases/latest/download/squad-cli.tgz --allow-scripts=@bradygaster/squad-cli
npm uninstall -g @bradygaster/squad-cli
```

> **Same package name as upstream.** The fork keeps the `@bradygaster/squad-cli` / `squad-sdk` package names, so installing it **replaces** a global upstream Squad, and `npm update -g` would swap it back to upstream from the npm registry. Always update with the release command above. Never install `@bradygaster/squad-cli` from npm on the same machine unless you want the original.

### Publishing a release (maintainers)

Releases are built by `.github/workflows/pc-release.yml` when you push a tag starting with `pc-v`; the tag becomes the version:

```bash
git tag pc-v2.0.0-preview.3.pc.1
git push origin pc-v2.0.0-preview.3.pc.1
```

The workflow builds both packages, attaches `squad-sdk.tgz` and `squad-cli.tgz` to a GitHub Release, and points the CLI's SDK dependency at that same release, so the CLI never pulls the upstream SDK. GitHub Actions must be enabled on the fork (Actions tab → enable).

## Use it in a project

Inside the project you want to level up (not inside this repository):

```bash
cd path/to/your-project
squad init                # interactive wizard
squad aidlc               # where you are (0–5) and the roadmap to the next level
```

Non-interactive (CI, scripts, devcontainers):

```bash
squad init --yes --client copilot,claude,opencode     # accept every recommended answer
squad init --yes --offline --no-gates                 # local generators only, no CI files
```

Then open the project in your AI host and talk to the Squad agent: `copilot --agent squad`, `claude --agent squad`, or select **Squad** in VS Code / OpenCode, and describe what you're building so it casts the team.

Typical path to level 4–5: `squad init` → let the team cast itself → `squad optimize gates` → make the `pc-*` jobs required checks → write OpenSpec specs → `squad optimize specs` → enable auto-merge for the merge gate → `squad metrics labels` and watch `squad metrics` → `squad optimize platform` and register in Project Health.

## The installer (`squad init`)

After the normal Squad scaffolding prompt, `squad init` asks **"Apply Plain Concepts optimizations?"** and then:

| # | Question | Default | Flag |
|---|---|---|---|
| 1 | AI hosts: `copilot`, `claude`, `opencode` (optional `cursor`, `codex`) | first three | `--client a,b` or `--hosts a,b` |
| 2 | Model provider for OpenCode: `github-copilot`, `anthropic`, `forge` | github-copilot | `--provider forge` |
| 3 | Use OpenSpec for spec-driven changes? | yes | `--openspec` / `--no-openspec` |
| 4 | Model per team member: recommended / per role / auto | recommended | `--models recommended\|auto\|lead=claude-opus-5.5,tester=…`, `--default-model <id>` |
| 5 | Skills to install (stack-aware list, `*` = pre-selected) | `*` | `--skills recommended\|none\|all\|id1,id2` |
| 6 | Token-budgeted repo map | yes | `--repomap` / `--no-repomap` |
| 7 | RTK shell-output compaction | yes | `--rtk` / `--no-rtk` |
| 8 | graphify knowledge graph | yes for >500 files | `--graphify` / `--no-graphify` |
| 9 | `squad-context` MCP server | yes | `--mcp` / `--no-mcp` |
| 10 | Project instructions (AGENTS.md, Copilot, Claude) | yes | `--instructions` / `--no-instructions` |
| 11 | CI guardrails (quality gates, PR guardrails, merge gate) | yes | `--gates` / `--no-gates` |
| 12 | Platform files (contract, product scope, business request form) | yes | `--platform` / `--no-platform` |

Global flags: `--yes`/`-y` (accept recommended, no prompts), `--optimize` (run the optimizer non-interactively), `--no-optimize` (plain upstream init), `--offline` (skip every network install), `--fast` / `SQUAD_FAST=1` (skip animations).

Without a TTY and without `--optimize`/`--yes`, init behaves exactly like upstream and prints a tip to run `squad optimize`.

Order of work: answers are collected **before** scaffolding (so the chosen hosts drive Squad's client projections). Local generators run first (milliseconds), network installs (OpenSpec, skills, RTK, graphify) run concurrently, instructions are written **after** installs so they only mention tools that are really installed, and the AIDLC assessment runs last.

## AIDLC maturity levels (`squad aidlc`)

Plain Concepts Platform defines engineering levels L0–L3, twelve practices, three phases (Discovery → Foundations → Maintenance mode) and agentic adoption verdicts. This fork maps them onto a cumulative **0–5 AIDLC scale** (a level counts only when every check of it and the levels below passes):

| Level | Name | Checks | How the fork gets you there |
|---|---|---|---|
| 0 | Ad-hoc | — | — |
| 1 | Assisted | AGENTS.md hub · host instructions · build/test commands discoverable | `squad optimize instructions` |
| 2 | Structured | Squad team cast · skills · OpenSpec · tests · CI · repo map/graph | `squad init`, `optimize skills`, `optimize tools --openspec`, `optimize repomap` |
| 3 | Guarded (PC L1) | Secrets (TruffleHog) · Vulnerabilities (Trivy) · SAST (Semgrep) · spec-in-PR gate · ARCHITECTURE.md + ADRs | `squad optimize gates` |
| 4 | Autonomous delivery (PC L2) | Coverage floor · Gherkin specs bound to OpenSpec · SBOM (Syft) · agentic workflows · delivery metrics · token tooling | `optimize gates`, `optimize specs`, `metrics setup`, `optimize tools --rtk` |
| 5 | Self-maintaining (PC L3 + Maintenance mode) | Mutation (Stryker) · DAST (ZAP) · complexity gate · merge gate · intake (PRODUCT_SCOPE) · `.platform/contract.yml` | `optimize gates` (weekly quality + merge gate), `optimize intake`, `optimize platform` |

`squad aidlc` writes `.squad/aidlc/assessment.md` (levels, ✅/❌ per check, the exact fix for each ❌, a numbered roadmap, and a **Token economy** section) and `.squad/aidlc/assessment.json` (read by the AIDLC trend gate). `--json` prints the JSON; `--offline` skips the models.dev price lookup. The `aidlc-maturity` skill teaches the team the criteria; the coordinator proposes the next roadmap item when the backlog is empty.

Level 4 test, from the Platform docs: *can a change go from issue to production without an engineer reading the diff?* If the answer is "it would probably be fine", the guardrails are not finished.

## `squad optimize` commands

| Command | What it does |
|---|---|
| `squad optimize` | Re-runs the whole wizard on an existing project (same flags as init). |
| `squad optimize instructions` | Regenerates the managed blocks of `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` and `CLAUDE.md`. Idempotent. |
| `squad optimize repomap [--tokens N]` | Rebuilds `.squad/context/repomap.md` (incremental, default budget 4000 tokens). |
| `squad optimize skills [--list] [--skills …]` | Lists stack-aware recommendations with their `npx skills add` command, or installs them. |
| `squad optimize tools [--openspec] [--rtk] [--graphify]` | Installs/initializes OpenSpec, RTK hooks and graphify for the configured hosts. |
| `squad optimize models [--models …] [--provider forge]` | Sets per-role models (`auto` clears them); `--provider forge` adds the Forge provider to `opencode.json`. |
| `squad optimize gates [--force] [--no-merge-gate]` | Writes the CI guardrails (see below). Never overwrites edited workflows without `--force`. |
| `squad optimize specs` | Converts OpenSpec scenarios into `features/*.feature`. |
| `squad optimize platform [--force]` | Writes `.platform/contract.yml` and prints the Project Health registration command. |
| `squad optimize intake [--force]` | Writes `PRODUCT_SCOPE.md` and the business request issue form. |
| `squad optimize mcp` | Registers the `squad-context` MCP server in `.mcp.json`. |
| `squad optimize metrics` | Same as `squad metrics setup`. |
| `squad metrics [--since 30d\|YYYY-MM-DD] [--until …] [--repo o/r] [--json]` | Delivery metrics of PRs labelled `squad` → `.squad/metrics/report.md`, `metrics.json`, `prs.csv`. |
| `squad metrics labels [--repo o/r]` | Creates the label set in the GitHub repo (`squad`, `squad:auto-merged`, `human-review`, `squad:role:*`). |
| `squad metrics setup [--force]` | Writes the `pc-squad-labels` and `pc-metrics` workflows and their scripts. |
| `squad optimize usage [--offline]` | Prints the token economy report (models per role, relative cost, models.dev prices, repo map size, RTK savings). |
| `squad aidlc [--json] [--offline]` | AIDLC assessment + roadmap. |
| `squad context-mcp` | Runs the MCP server over stdio (used by `.mcp.json`). |

## Features in detail

### 1. OpenSpec (spec-driven changes)
`npx @fission-ai/openspec@latest init --tools <hosts> --force` with tool ids mapped from your hosts (`github-copilot`, `claude`, `opencode`, `cursor`, `codex`). The coordinator routes non-trivial work through `/opsx:propose` → Lead review → `/opsx:apply` → `/opsx:archive`, and app-code PRs must touch a spec, change or decision record (enforced by the spec gate).

### 2. Executable specs (OpenSpec → Gherkin)
`squad optimize specs` reads `openspec/specs/<capability>/spec.md` (`### Requirement:`, `#### Scenario:`, `- **GIVEN/WHEN/THEN/AND**` bullets) and writes `features/<capability>.feature` with one `Rule` per requirement and `@spec`-tagged scenarios. Bind the steps with **Reqnroll** (.NET), **playwright-bdd / Cucumber** (JS/TS) or **pytest-bdd** (Python). Generated files carry a `# generated-by` marker and are refreshed on every run; hand-written features are never touched. It also runs automatically at the end of the wizard.

### 3. Skills (skills.sh + Plain Concepts Platform)
Recommendations come from the detected stack and install with `npx skills add <repo> --skill <name> -a <host>` (sequentially, because the CLI shares one `skills-lock.json` that pins versions):

| Skill | Source | When |
|---|---|---|
| `pc-onboard` * | `PlainConceptsPlatform/Foundations` → `platform-onboard` | always |
| `pc-upstream` | `PlainConceptsPlatform/Foundations` → `platform-upstream` | Platform family apps |
| `pc-new-project` | `PlainConceptsPlatform/Foundations` → `platform-new-project` | near-empty repos |
| `pc-workflow-consumer` | `PlainConceptsPlatform/agentic-workflows` → `workflow-consumer` | repos with CI |
| `find-skills` * | `vercel-labs/skills` | always |
| `tdd` * | `mattpocock/skills` | code present |
| `diagnosing-bugs`, `domain-modeling` | `mattpocock/skills` | always |
| `improve-architecture` | `mattpocock/skills` → `improve-codebase-architecture` | >200 files |
| `frontend-design` * | `anthropics/skills` | React/Next/Vue/Angular/Svelte |
| `web-design-guidelines` | `vercel-labs/agent-skills` | web UI |
| `react-best-practices` * | `vercel-labs/agent-skills` → `vercel-react-best-practices` | React/Next |
| `agent-browser` | `vercel-labs/agent-browser` | web apps |
| `azure-prepare`, `azure-deploy` | `microsoft/azure-skills` | Azure SDK / Bicep / Aspire |

The fork also ships its own Squad skills (installed in `.github/skills/` by `squad init`): **`aidlc-maturity`**, **`token-economy`**, **`project-instructions`** and **`business-intake`**.

### 4. Project instructions for every host
One detected stack produces: an `AGENTS.md` hub (overview, commands, where to look, working rules), `.github/copilot-instructions.md`, path-scoped `.github/instructions/{typescript,dotnet,python,tests}.instructions.md` with `applyTo` globs (so rules only load when relevant), and `CLAUDE.md` importing `@AGENTS.md`. Content lives between `<!-- squad-pc:start -->` and `<!-- squad-pc:end -->`; anything you write outside is preserved, and files you created yourself are never overwritten.

### 5. Copilot, Claude Code, OpenCode (+ Cursor, Codex)
Hosts drive Squad's projections (`.github/agents/squad.agent.md`, `.claude/agents/squad.md`, `.opencode/agent/squad.md`, `.cursor/rules`, `AGENTS.md`/`.codex`), plus OpenSpec tool ids, RTK hooks (`rtk init -g [--copilot|--opencode|…]`), graphify platforms and skills.sh agents.

### 6. Model per team member, Forge and models.dev
- **Per role:** recommended = Lead/Security/AI/Reviewers → `claude-opus-5.5`, Frontend/Backend/Data/DevOps/Tester → `claude-sonnet-5.5`, Docs/Scribe/Ralph → `claude-haiku-5.5`; or choose per role; or `auto`. Stored as `roleModelOverrides`, copied into `agentModelOverrides` for every member when the team is cast (an explicit per-agent choice always wins), and honoured by the SDK resolver from the charter's `**Role:**`.
- **OpenCode ids:** a translated copy `roleModelOverridesOpencode` uses `provider/model` (`github-copilot/…`, `anthropic/…`, `forge/…`).
- **Forge:** `--provider forge` adds Plain Concepts' OpenAI-compatible gateway to `opencode.json` (`provider.forge`, `@ai-sdk/openai-compatible`, `baseURL https://forge.plainconcepts.com/v1`, `apiKey {env:FORGE_API_KEY}`, default `forge/glm-5-2`).
- **Cost visibility:** `squad optimize usage` and the AIDLC report show each role's model, its relative cost, and real $/Mtok from [models.dev](https://models.dev) when online.

### 7. Icon per member
Every cast member gets an emoji from its role (🏗️ Lead, ⚛️ Frontend, 🔧 Backend, 🧪 Tester, ⚙️ DevOps, 📝 Docs, 📊 Data, 🔒 Security, 🧠 AI, 📋 Scribe, 🔄 Ralph, 🔍 Reviewer, 👤 others), stored in `agentIcons` and in the charter (`- **Icon:**`), and used in spawn messages.

### 8. Token optimization
- **Repo map** (`.squad/context/repomap.md`): Aider-style outline of files and top-level symbols for TS/JS, C#, Python, Go, Java/Kotlin and Rust, ranked by how many other files reference each file's symbols, cut to a token budget. **Incremental** (per-file cache keyed by size + mtime in `repomap.cache.json`) and **cache-stable** (no timestamps, so identical code gives byte-identical output and prompt caches keep hitting).
- **`squad-context` MCP server**: `repo_map`, `project_stack`, `aidlc_assessment`, `find_symbol` on demand instead of agents exploring the tree.
- **RTK**: hooks compact `git`, test and build output (60–90% fewer tokens on those commands); `rtk gain` shows savings and feeds the usage report.
- **graphify**: knowledge graph (`graphify-out/GRAPH_REPORT.md`, `graphify query`) for large repos.
- **Coordinator rules**: small spawns (paths, not file contents), prompt-cache ordering (charter → AGENTS.md → decisions → task, same order every time), fast-tier models for mechanical roles, `token-economy` skill.

### 9. Speed
One cached stack scan shared by every step; local generators in milliseconds; network installs in parallel; skills installed with a timeout; incremental repo map; `--fast` skips animations.

### 10. CI guardrails (`squad optimize gates`)

| File | Jobs / behavior |
|---|---|
| `.github/workflows/pc-quality-gates.yml` | **Secrets** (TruffleHog, verified only) · **Vulnerabilities** (Trivy fs, CRITICAL/HIGH, fixed only) · **SAST** (Semgrep `--error`) · **SBOM** (Syft CycloneDX, uploaded as `engineering-excellence-sbom`) · **Tests & coverage floor** with stack-specific setup (Node+Vitest/Jest lcov, .NET XPlat Coverage, Python pytest-cov, Go). Tools run from their official Docker images; every GitHub action is pinned to a commit SHA (version in a comment), as Semgrep's supply-chain rules require. A generated `.semgrepignore` keeps Squad state, skills and agent folders out of SAST so it scans the product. |
| `.github/workflows/pc-pr-guardrails.yml` | **Spec gate**: app-code changes must touch `openspec/`, `docs/decisions/`, `docs/adr/`, `.squad/decisions` or `features/`, and update docs or include `Docs-impact: none - <reason>` in the PR body. **Diff check**: fails when comment lines exceed 10% of added code, test lines exceed code lines, more than 40 test cases per 1k lines, or tests are skipped/focused, assertion-less, snapshot-only or mock-only. **AIDLC trend**: fails if the committed AIDLC level or any practice regresses versus the base branch. |
| `.github/workflows/pc-merge-gate.yml` | For bot/agent PRs (`[bot]`, `copilot`, `squad`, or label `squad:auto`): enables auto-merge when outside the human checkpoints; otherwise labels `human-review` with the reason. **Auto-merge is refused (with one explanatory comment) unless the base branch has a ruleset with required status checks**, because without them GitHub would merge immediately, even while gates are still running. Checkpoints: `.github/` changes, secrets/key files, >10,000 changed lines, migrations, labels `low-confidence`/`security`/`breaking-change`. |
| `.github/workflows/pc-weekly-quality.yml` | Weekly (Sunday) and on demand: **Mutation** (Stryker for JS/TS with the detected Vitest/Jest runner and a generated `stryker.config.json`; `dotnet stryker --break-at` for .NET; mutmut for Python) · **Complexity** (lizard, CC ≤ 15 per function on your app paths) · **DAST** (OWASP ZAP passive baseline against the `DAST_TARGET_URL` repository variable; skipped when unset). |
| `.github/workflows/pc-squad-labels.yml`, `pc-metrics.yml` | Label every Squad PR and compute delivery metrics weekly (see [Delivery metrics](#delivery-metrics-squad-metrics)). |
| `.github/scripts/pc-*.mjs` | Zero-dependency Node scripts used by the jobs (refreshed on every run). |
| `quality.config.json` | `appPaths`, `specPaths`, `docsPaths`, `coverage.lines` floor, `mutation.break` (.NET), diff thresholds, merge-gate limits. **Floors only ratchet up**; the coverage job prints a notice when you can raise the floor. |

After generating: make every `pc-quality-gates` and `pc-pr-guardrails` job a **required status check** (Settings → Rules → Rulesets), enable **Allow auto-merge**, and set `coverage.lines` from your first CI baseline.

### 11. Plain Concepts Platform & Maintenance mode
- `squad optimize platform`: `.platform/contract.yml` (`project`, `type` detected as back-front / static-site / ml / other, `owned`, `reuse`, `sync`) and the command to register the repo in Project Health: `gh workflow run discover.yml --repo PlainConceptsPlatform/Project-Health-Platform -f repo=<owner>/<repo>`.
- `squad optimize intake`: `PRODUCT_SCOPE.md` (what the business may request vs. what needs a maintainer, 8+ point stories split into 3–5) and `.github/ISSUE_TEMPLATE/business-request.yml` (labels `business-request`, `needs-triage`). The `business-intake` skill triages those issues with 10 checks, up to 3 question rounds and the verdicts **pass / needs-info / needs-maintainer / block**; on *pass* it creates the OpenSpec change and labels the issue `squad`.

## Delivery metrics (`squad metrics`)

Every PR produced by the agent team is **labelled**, so delivery can be measured from GitHub alone.

**How PRs get labelled**

1. The coordinator opens every PR from a `squad/{agent}/{slug}` branch, with the labels `squad`, `squad:agent:{name}`, `squad:role:{role}`, `squad:model:{model}`, and the body trailers `Squad-Agent:`, `Squad-Role:`, `Squad-Model:`.
2. The `pc-squad-labels` workflow (`pull_request_target`, base-branch checkout only, so PR code never runs) re-applies the labels on every PR event. A PR counts as a Squad PR when its branch starts with `squad/`, its author is a bot/agent (`quality.config.json` → `mergeGate.botAuthors`) or its body has a `Squad-Agent:` trailer. Missing labels are created on the fly.
3. The merge gate adds `squad:auto-merged` when it enables auto-merge, and `human-review` when a human checkpoint is hit.

Run `squad metrics labels` once to create the base label set with colours and descriptions.

**What is measured** (over PRs labelled `squad` created in the window, default 30 days)

| Metric | Definition |
|---|---|
| Throughput | PRs opened, merged, closed unmerged, still open |
| Merge rate | merged / (merged + closed unmerged) |
| Lead time p50 / p90 | PR opened → merged, in hours |
| Time to first human review p50 / p90 | PR opened → first review by a non-bot, non-author |
| **Merged by the gate** | merged PRs with `squad:auto-merged` or no human review — the Platform's key autonomy metric |
| Human checkpoints | PRs labelled `human-review` by the merge gate |
| Median PR size | additions + deletions of merged PRs |
| AI share | Squad PRs merged / all PRs merged in the window, with the Platform AI-usage bucket (1–5 at 10/25/50/75%) |
| Breakdowns | the same metrics by agent, role, model and week |

**Where it runs**

- Locally: `squad metrics --since 90d` (token from `GITHUB_TOKEN`, `GH_TOKEN` or `gh auth token`; repo from `--repo`, `GITHUB_REPOSITORY` or the `origin` remote) → `.squad/metrics/report.md`, `metrics.json` (no per-PR data) and `prs.csv` (one row per PR for spreadsheets / Power BI).
- In CI: `pc-metrics.yml` runs weekly (Monday) and on demand with a `since` input, writes the report to the job summary and uploads the `squad-metrics` artifact.
- Both use the same engine, `.github/scripts/pc-metrics.mjs` (GitHub GraphQL search, up to 1,000 PRs per window), so the numbers match.

## Files the optimizer generates

| Path | Owner | Regenerated by |
|---|---|---|
| `.squad/config.json` → `plainConcepts`, `roleModelOverrides`, `roleModelOverridesOpencode`, `agentIcons` | squad | wizard / `optimize models` / casting |
| `.squad/context/repomap.md`, `repomap.cache.json` | squad | `optimize repomap`, MCP `repo_map` |
| `.squad/aidlc/assessment.md`, `assessment.json` | squad (commit them) | `squad aidlc` |
| `.squad/metrics/report.md`, `metrics.json`, `prs.csv` | squad | `squad metrics` |
| `stryker.config.json` (JS/TS) | you (generated once) | `optimize gates --force` |
| `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` (managed block) | shared | `optimize instructions` |
| `.github/instructions/*.instructions.md` | squad until you remove the marker | `optimize instructions` |
| `.github/workflows/pc-*.yml`, `quality.config.json` | you (generated once) | `optimize gates --force` |
| `.github/scripts/pc-*.mjs` | squad | `optimize gates` |
| `features/*.feature` (with marker) | squad | `optimize specs` |
| `.platform/contract.yml`, `PRODUCT_SCOPE.md`, `.github/ISSUE_TEMPLATE/business-request.yml` | you | `optimize platform` / `optimize intake` `--force` |
| `.mcp.json` → `squad-context`, `opencode.json` → `provider.forge` | merged | `optimize mcp` / `optimize models --provider forge` |

## `.squad/config.json` keys

```jsonc
{
  "roleModelOverrides": { "lead": "claude-opus-5.5", "tester": "claude-sonnet-5.5", "scribe": "claude-haiku-5.5" },
  "roleModelOverridesOpencode": { "lead": "forge/claude-opus-5.5" },
  "agentModelOverrides": { "neo": "claude-opus-5.5" },   // filled at casting; explicit entries win
  "agentIcons": { "neo": "🏗️" },
  "plainConcepts": {
    "hosts": ["copilot", "claude", "opencode"], "provider": "github-copilot",
    "openspec": true, "rtk": true, "graphify": false, "repomap": true,
    "gates": true, "platform": true, "mcp": true,
    "skills": ["pc-onboard", "find-skills", "tdd"], "optimizedAt": "…"
  }
}
```

Role categories: `lead`, `frontend`, `backend`, `tester`, `devops`, `docs`, `data`, `security`, `ai`, `scribe`, `monitor`, `reviewer`, `default`.

## Maintaining the fork

- **Upstream sync:** `.github/workflows/pc-sync-upstream.yml` runs weekly (and on demand): fast-forwards `dev` to `bradygaster/squad@dev` and opens a PR from `dev` into `squad-optimized-plainconcepts`. Enable Actions on the fork for it to run.
- **Templates:** edit `.squad-templates/` (including `.squad-templates/pc/` for gate workflows/scripts and platform files), then run `npm run sync-templates`.
- **Code:** the optimizer lives in `packages/squad-cli/src/cli/core/pc/` (`optimize.ts` wizard, `stack.ts`, `repomap.ts`, `instructions.ts`, `skills-catalog.ts`, `tools.ts`, `gates.ts`, `specs.ts`, `platform.ts`, `models-catalog.ts`, `context-mcp.ts`, `metrics.ts`, `aidlc.ts`); role models and icons in `packages/squad-sdk/src/config/role-models.ts`; the metrics engine and gate scripts in `.squad-templates/pc/scripts/`.
- **Tests:** `npx vitest run test/pc-optimizer.test.ts test/pc-guardrails.test.ts test/pc-metrics.test.ts`.
- **Distribution:** GitHub Releases built by `pc-release.yml` (see [Install](#install)). Publishing to the npm registry under a Plain Concepts scope would need the packages renamed and an npm org token; it is not done.

## Known limitations

- The 0–5 AIDLC scale is this fork's mapping of the Plain Concepts Platform levels and practices; the Platform docs themselves define L0–L3 engineering levels, not "AIDLC 0–5".
- AIDLC checks are heuristics over files and CI content; they detect that a practice is configured, not that its last run was green.
- Repo map symbols come from regular expressions, not tree-sitter; unusual syntax can be missed.
- Only `find-skills` and OpenSpec installs were exercised end to end; other skill identifiers come from skills.sh listings and may move.
- Validated live in [juan-manga/squad-pc-playground](https://github.com/juan-manga/squad-pc-playground): quality gates green on `main`, Squad labels applied by the workflow, spec/diff/AIDLC guardrails, merge gate auto-merge, refusal without required checks, `human-review` on `.github/` changes, and the weekly metrics report. The .NET, Python and Go toolchain branches of the generated workflows have not been run live yet.
- Mutation, complexity and DAST run weekly and report; they are not required PR checks. DAST needs a deployed URL in `DAST_TARGET_URL`.
- `squad metrics` only sees PRs that carry the `squad` label: PRs opened before the labelling workflow existed must be labelled by hand (or opened from `squad/*` branches). GitHub search caps a window at 1,000 PRs.
- The AI share counts PRs, not commits as the Platform's AI-usage metric does; treat the bucket as an approximation.
- The local `squad metrics` command needs a token (`GITHUB_TOKEN`, `GH_TOKEN` or `gh auth login`); the `pc-metrics` workflow uses the built-in Actions token.

---

<!-- markdownlint-disable-next-line MD025 -->
# Squad

[English](README.md) | [中文](README.zh.md)

**Human-led AI agent teams for any project.** One command. A team that helps you move faster with your code.

[![Platform](https://img.shields.io/badge/platform-GitHub%20Copilot-blue)](#what-is-squad)

Breaking changes are documented in [CHANGELOG.md](CHANGELOG.md).

---

## What is Squad?

Squad gives you a human-directed AI development team through GitHub Copilot. Describe what you're building. Get a team of specialists — frontend, backend, tester, lead — that live in your repo as files. They persist across sessions, learn your codebase, share decisions, and help you move faster without giving up oversight.

Squad is a productivity tool for humans, not a replacement for engineers, reviewers, or decision-makers. People stay accountable for priorities, approvals, and final changes; Squad helps with coordination, repetition, and parallel execution.

It's not a chatbot wearing hats. Each team member runs in its own context, reads only its own knowledge, and writes back what it learned so the work stays inspectable.

> **Responsible AI stance** — Squad is built to amplify a human operator with GitHub Copilot, not to remove humans from the loop. Use it to delegate faster, review better, and keep governance close to the code.

---

## Quick Start

### 1. Create your project

```bash
mkdir my-project && cd my-project
git init
```

**✓ Validate:** Run `git status` — you should see "No commits yet".

### 2. Install Squad

Choose the install method for your platform:

| Method | Command |
|--------|---------|
| npm (all platforms, Node.js 22.5+) | `npm install -g @bradygaster/squad-cli` |
| Homebrew (macOS) | `brew install --cask bradygaster/squad/squad` |
| WinGet (Windows) | `winget install --id bradygaster.Squad --exact` |
| Install script (macOS/Linux, no npm) | See [Standalone Install](https://bradygaster.github.io/squad/docs/features/standalone-install/) |

Preview and insider builds are available as `squad-preview` and
`squad-insider` Homebrew casks, or as `bradygaster.Squad.Preview` and
`bradygaster.Squad.Insider` WinGet packages.

Direct archives for macOS, Linux, and Windows are also available from
[GitHub Releases](https://github.com/bradygaster/squad/releases/latest).

```bash
squad init
```

All methods install the same CLI. Standalone installs vendor Node.js, so they do
not require Node.js or access to the npm registry. See the
[complete installation guide](https://bradygaster.github.io/squad/docs/get-started/installation/)
for prerequisites and platform details.

> **⚡ Want to be up and running in under a second?** Use `squad init --preset default` to start with a fully-configured squad — complete with members, charters, and routing rules — ready to go immediately. The default `squad init` (without the flag) walks you through setup step by step, ideal if you prefer to build and customize your squad deliberately.

**✓ Validate:** Check that `.squad/team.md` was created in your project.

### 3. Authenticate with GitHub (for Issues, PRs, and Ralph)

```bash
gh auth login
```

**✓ Validate:** Run `gh auth status` — you should see "Logged in to github.com".

### 4. Open Copilot and go

```
copilot --agent squad --yolo
```

> **Why `--yolo`?** Squad makes many tool calls in a typical session. Without it, Copilot will prompt you to approve each one.

**In VS Code**, open Copilot Chat and select the **Squad** agent.

Then:

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
```

**✓ Validate:** Squad responds with team member proposals. Type `yes` to confirm — they're ready to work.

Squad proposes a team — each member named from a persistent thematic cast. You say **yes**. They're ready.

---

## .NET package

Building a .NET app that should call a Squad team as a Microsoft Agent Framework agent? `Squad.Agents.AI` is a NuGet package under [`src/Squad.Agents.AI`](src/Squad.Agents.AI/README.md). Version **1.0.0** targets .NET 8, 9, and 10 and registers a Squad-backed `AIAgent` in DI. See the package README for installation and local validation before publication.

## Upgrading

Upgrading Squad is a two-step process.

**Step 1: Update the CLI binary**

Use the same channel you installed from:

| Installed with | Update command |
|----------------|----------------|
| npm | `npm install -g @bradygaster/squad-cli@latest` |
| Homebrew | `brew upgrade --cask squad` |
| WinGet | `winget upgrade --id bradygaster.Squad --exact` |
| Install script | Re-run the [install script](https://bradygaster.github.io/squad/docs/features/standalone-install/#macos-and-linux) |
| Direct archive | Download the newer archive from [GitHub Releases](https://github.com/bradygaster/squad/releases/latest) |

**Step 2: Update Squad-owned files in your project**

```bash
squad upgrade
```

`squad upgrade` updates `squad.agent.md`, `.github/skills`, Squad workflows and `.squad/templates/` to the latest versions, comparing content first so a re-run (or a CRLF checkout) changes nothing, and backing up any file you customized to `<file>.local-backup` before overwriting it. It never touches your `.squad/` team state — your agents, decisions, and history are always preserved.

Use `--force` to re-apply updates even when your installed version already matches the latest.

### Use Squad in other AI hosts

Squad is not tied to one client. Add `--client` to project the same team and the `squad_state` backend into Claude Code, Kiro, OpenCode, Cursor, OpenAI Codex or Google Antigravity (alongside Copilot):

```bash
squad init --client claude,opencode      # or: --client all
squad upgrade --client codex             # add a host later; refreshes every configured host
```

Each host gets a native coordinator file plus MCP wiring; your own settings in `.mcp.json`, `opencode.json` and the like are never clobbered. See [Using Squad across clients](docs/src/content/docs/scenarios/using-squad-across-clients.md), [Squad 2.0 architecture](docs/src/content/docs/concepts/squad-2-0-architecture.md), and the [multi-client quickstart](docs/tutorials/multi-client-quickstart.md).

---

## Local Development Installation

To install and run Squad from source for development:

```bash
# Clone the repository
git clone https://github.com/bradygaster/squad.git
cd squad

# Install dependencies (npm workspaces)
npm install

# Build the project (SDK first, then CLI)
npm run build

# Run the CLI directly
node ./packages/squad-cli/dist/cli-entry.js init

# Or link it globally for convenience
npm run dev:link
```

After `npm run dev:link`, the `squad` command will be available globally and will use your local build. To update after code changes, re-run `npm run build` to recompile.

---

## Quick Commands

Say **"squad commands"** in chat to see a categorized menu of common operations — install & upgrade, team management, issues & PRs, plugins, model settings, and session state. You can also ask naturally: *"how do I switch state backends?"* or *"how do I add a team member?"* — Squad matches your intent and walks you through it. The `squad-commands` skill ships out of the box with every `squad init` and `squad upgrade`.

---

## All Commands (17 commands)

| Command | What it does |
|---------|-------------|
| `squad init` | **Init** — scaffold Squad in the current directory (idempotent — safe to run multiple times); alias: `cast`; `--client <list>` also projects Claude Code, Kiro, OpenCode, Cursor, Codex and Antigravity; use `--mode remote <path>` for dual-root mode |
| `squad upgrade` | Update Squad-owned files to latest; never touches your team state; `--client <list>` adds hosts and refreshes every configured projection; use `--migrate-directory` to rename `.ai-team/` → `.squad/` |
| `squad upgrade --self` | Update the Squad CLI package itself on its own channel (prerelease installs follow `@insider`, stable follows `@latest`); `--dry-run` prints the command without installing; `--insider` forces the prerelease channel; a downgrade is refused unless `--force` |
| `squad client list` | Show the client hosts configured in `.squad/config.json` and whether their projected files are present; `squad client add <list>` projects more hosts |
| `squad update-check` | Report cached CLI update status for tooling/CI; use `--json` for structured output, `--refresh` to bypass the cache |
| `squad status` | Show which squad is active and why |
| `squad triage` | **Watch mode** — poll for issues and auto-triage to team (aliases: `watch`, `loop`); use `--interval <minutes>` to set polling frequency (default: 10); with `--execute` dispatch Copilot agents; use `--agent-cmd`, `--copilot-flags`, `--auth-user` to customize agent execution; `--health` shows watch status; `--log-file` for diagnostics |
| `squad copilot` | Add/remove the Copilot coding agent (@copilot); use `--off` to remove, `--auto-assign` to enable auto-assignment |
| `squad doctor` | Check your setup and diagnose issues (alias: `heartbeat`) |
| `squad link <team-repo-path>` | Connect to a remote team |
| `squad externalize` | Move `.squad/` state outside the working tree; survives branch switches; use `--key <name>` for custom project key |
| `squad internalize` | Move externalized state back into `.squad/` |
| `squad shell` | **Deprecated** — Launch interactive shell explicitly. Use `copilot --agent squad` instead. |
| `squad export` | Export squad to a portable JSON snapshot |
| `squad import <file>` | Import squad from an export file |
| `squad plugin marketplace add\|remove\|list\|browse` | Manage plugin marketplaces |
| `squad upstream add\|remove\|list\|sync` | Manage upstream Squad sources |
| `squad nap` | Context hygiene — compress, prune, archive; use `--deep` for aggressive compression, `--dry-run` to preview changes |
| `squad aspire` | Open Aspire dashboard for observability |
| `squad scrub-emails [directory]` | Remove email addresses from Squad state files (default: `.squad/`) |

---

## Watch Mode — Ralph's Automated Polling

Ralph continuously polls for work and dispatches agents to handle it. Watch mode helps a human team stay responsive — Ralph automates triage, execution handoffs, and monitoring, then escalates back to people when judgment or approval is needed.

### Quick Start

```bash
# Monitor for issues (triage mode — no execution)
squad watch

# Monitor and auto-execute against actionable issues
squad watch --execute --interval 5

# With a custom agent runner that uses --task instead of -p
squad watch --execute \
  --agent-cmd "custom-agent run --task {prompt} --autopilot" \
  --auth-user myaccount

# Run watch with diagnostics
squad watch --execute --log-file ./watch.log --verbose

# Check health of running watch process
squad watch --health
```

### Key Flags

| Flag | Description |
|------|-------------|
| `--execute` | Enable agent execution (spawn Copilot sessions for actionable issues) |
| `--interval N` | Poll every N minutes (default: 10) |
| `--agent-cmd` | Custom agent command; use one standalone `{prompt}` token to place the prompt, or Squad appends `-p <prompt>` |
| `--copilot-flags` | Flags passed to the default Copilot runner (e.g., `--yolo --autopilot`) |
| `--auth-user` | GitHub/Azure DevOps account to use for agent auth |
| `--log-file` | Mirror output to file for later review and diagnostics |
| `--verbose` | Show extra diagnostic output (auth probes, callbacks, pulls) |
| `--health` | Show status of running watch: PID, uptime, auth readiness, capabilities |
| `--overnight-start HH:MM` | Pause watch during off-hours (e.g., `--overnight-start 18:00`) |
| `--overnight-end HH:MM` | Resume watch at this time (e.g., `--overnight-end 08:00`) |
| `--notify-level` | Control output verbosity (`all` / `important` / `none`, default: `important`) |
| `--state-backend` | Persistence strategy (`git-notes` or `orphan-branch`, default: in-memory) |

### How Watch Decides What to Execute

Ralph uses an **agent-delegated selection pattern**:

1. Ralph scans for triage-eligible issues (unassigned, labeled, etc.)
2. Ralph builds a context snapshot: issue list, squad state, recent decisions
3. Ralph writes this context to a **temp file** using the `-p <path>` flag
4. Ralph invokes the agent with that file: `gh copilot -p context.md`
5. The agent **decides which issue to work on** and **how**
6. Ralph monitors execution, logs results, updates issue status

This design keeps the polling loop lean while letting agents handle issue selection automatically under the team's rules, review gates, and escalation policy.

### Issue Selection & Escalation

Ralph provides a rich prompt scaffold to the agent:

```
## Work Context

### Available Issues (prioritized)
- #42 Urgent bug in auth (P0)
- #89 Performance review pending (P1)
- #123 Docs update (P2)

### Why These Issues Matter
...context from decision archive...

### Success Criteria
- Tests pass
- Changes match team conventions
- PR linked to issue

### When to Escalate
If blocker detected → pause, log, notify humans
```

Agents see **full context** and can decide intelligently rather than blindly executing random work.

### Error Recovery (4-Tier Escalation)

Watch includes a tiered remediation strategy:

1. **Tier 1 — Circuit Breaker Reset**: Clear and retry
2. **Tier 2 — Auth Reprobe**: Re-verify credentials
3. **Tier 3 — Git Pull**: Update local state
4. **Tier 4 — Pause 30m**: Back off for human intervention

This prevents watch from spamming the same failure endlessly.

### State Backends

Watch can persist its state in different ways:

```bash
# Default: in-memory (loses state on restart)
squad watch --execute

# Persist to git-notes (survives restarts, no new branches)
squad watch --execute --state-backend git-notes

# Persist to orphan branch (isolated history, easy to prune)
squad watch --execute --state-backend orphan-branch
```

### Graceful Shutdown

To stop a running watch process gracefully:

```bash
# Create sentinel file
touch .squad/ralph-stop

# Watch will finish current round and exit cleanly
# Logs final state, cleans scratch dirs
```

### Cleanup

Watch automatically prunes stale artifacts:
- Scratch directories older than 7 days
- Log files older than 30 days
- Orphaned orchestration state

### Monitoring Watch

Check on a running watch:

```bash
squad watch --health
```

Output example:
```
Ralph Watch Status

PID: 12345
Uptime: 2h 15m
Last Poll: 2 minutes ago

Auth: Ready (account: myaccount@github.com)
Capabilities: Issue triage, PR review, ADO sync

Next Poll: 14:35 (in 3 minutes)
Round: 42 / 1200
```

---

## Interactive Shell

> ⚠️ **Deprecated:** The interactive shell (`squad` with no arguments) has been deprecated. For the best Squad experience, use the [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) instead.
>
> ```bash
> copilot --agent squad
> ```
>
> See [Choose your interface](docs/src/content/docs/get-started/choose-your-interface.md) for current options.

Tired of typing `squad` followed by a command every time? Enter the interactive shell.

### Entering the Shell

```bash
squad
```

No arguments. Just `squad`. You'll get a prompt:

```
squad >
```

You're now connected to your team. Talk to them.

### Shell Commands

All shell commands start with `/`:

| Command | What it does |
|---------|-------------|
| `/status` | Check your team and what's happening |
| `/history` | See recent messages |
| `/agents` | List all team members |
| `/sessions` | List saved sessions |
| `/resume <id>` | Restore a past session |
| `/version` | Show version |
| `/clear` | Clear the screen |
| `/help` | Show all commands |
| `/quit` | Exit the shell (or Ctrl+C) |

### Talking to Agents

Use `@AgentName` (case-insensitive) or natural language with a comma:

```
squad > @Keaton, analyze the architecture of this project
squad > McManus, write a blog post about our new feature
squad > Build the login page
```

The coordinator routes messages to the right agents. Multiple agents can work in parallel—you'll see progress in real-time.

### What the Shell Does

- **Real-time visibility:** See agents working, decisions being recorded, blockers as they happen
- **Message routing:** Describe what you need; the coordinator figures out who should do it
- **Parallel execution:** Multiple agents work simultaneously on independent tasks
- **Session persistence:** If an agent crashes, it resumes from checkpoint; you never lose context
- **Decision logging:** Every decision is recorded in `.squad/decisions.md` for the whole team to see

For more details on shell usage, see the commands table above.

## Samples

Eight working examples from beginner to advanced — casting, governance, streaming, Docker. See [samples/README.md](samples/README.md).

---

## Agents Work in Parallel — You Stay in Control

Squad helps one human coordinate more work at once. When you give a task, the coordinator launches every agent that can usefully start — simultaneously — while you keep priorities, review, and final decisions.

```
You: "Team, build the login page"

  🏗️ Lead — analyzing requirements...          ⎤
  ⚛️ Frontend — building login form...          ⎥ all launched
  🔧 Backend — setting up auth endpoints...     ⎥ in parallel
  🧪 Tester — writing test cases from spec...   ⎥
  📋 Scribe — logging everything...             ⎦
```

When agents finish, the coordinator records follow-up work and leaves a breadcrumb trail so you can review what happened with full context:

- **`decisions.md`** — every decision any agent made
- **`orchestration-log/`** — what was spawned, why, and what happened
- **`log/`** — full session history, searchable

**Knowledge compounds across sessions.** Every time an agent works, it writes lasting learnings to its `history.md`. After a few sessions, agents know your conventions, your preferences, your architecture. They stop asking questions they've already answered.

**And it's all in git.** Anyone who clones your repo gets the team — with all their accumulated knowledge.

**Each agent gets the right model.** Squad picks models quality-first by default: premium for architecture, research and review, standard for code and docs, fast for mechanical work. Opt in to the `balanced` or `economy` profile, or to the `hydrafusion` research preview with `"modelProfile": "hydrafusion"` in `.squad/config.json`. Per-agent selection works in the Copilot CLI and app; VS Code runs every agent on the one session model. See [Model Selection](https://bradygaster.github.io/squad/docs/features/model-selection/).

---

## What Gets Created

```
.squad/
├── team.md              # Roster — who's on the team
├── routing.md           # Routing — who handles what
├── decisions.md         # Shared brain — team decisions
├── ceremonies.md        # Sprint ceremonies config
├── casting/
│   ├── policy.json      # Casting configuration
│   ├── registry.json    # Persistent name registry
│   └── history.json     # Universe usage history
├── agents/
│   ├── {name}/
│   │   ├── charter.md   # Identity, expertise, voice
│   │   └── history.md   # What they know about YOUR project
│   └── scribe/
│       └── charter.md   # Silent memory manager
├── skills/              # Compressed learnings from work
├── identity/
│   ├── now.md           # Current team focus
│   └── wisdom.md        # Reusable patterns
└── log/                 # Session history (searchable archive)
```

**Commit this folder.** Your team persists. Names persist. Anyone who clones gets the team — with the same cast.

### SDK-First Mode (New in Phase 1)

> ⚠️ **Experimental.** SDK-first mode is under active development and has known bugs. Use markdown-first (the default) for production teams.

Prefer TypeScript? You can define your team in code instead of markdown. Create a `squad.config.ts` with builder functions, run `squad build`, and the `.squad/` files are generated automatically.

```typescript
// squad.config.ts
import { defineSquad, defineTeam, defineAgent } from '@bradygaster/squad-sdk';

export default defineSquad({
  team: defineTeam({ name: 'Platform Squad', members: ['@edie', '@mcmanus'] }),
  agents: [
    defineAgent({ name: 'edie', role: 'TypeScript Engineer', model: 'claude-sonnet-5' }),
    defineAgent({ name: 'mcmanus', role: 'DevRel', model: 'claude-haiku-4.5' }),
  ],
});
```

Run `squad build` to generate all the markdown. See the [SDK-First Mode Guide](docs/src/content/docs/sdk-first-mode.md) for full documentation.

---

## Monorepo Development

Squad is a monorepo with two packages:
- **`@bradygaster/squad-sdk`** — Core runtime and library for programmable agent orchestration
- **`@bradygaster/squad-cli`** — Command-line interface that depends on the SDK

### Building

```bash
# Install dependencies (npm workspaces)
npm install

# Build TypeScript to dist/
npm run build

# Build CLI bundle (dist/ + esbuild → cli.js)
npm run build:cli

# Watch mode for development
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Linting

```bash
# Type check (no emit)
npm run lint
```

### Publishing

Squad uses [changesets](https://github.com/changesets/changesets) for independent versioning across packages:

```bash
# Add a changeset
npx changeset add

# Validate changesets
npm run changeset:check
```

Changesets are resolved on the `main` branch; releases happen independently per package.

---

## SDK documentation

The SDK provides programmatic control over agent orchestration — custom tools, hook pipelines, file-write guards, PII scrubbing, reviewer lockout, and event-driven monitoring.

- [SDK API reference](docs/src/content/docs/reference/sdk.md)
- [Custom tools and hooks guide](docs/src/content/docs/reference/tools-and-hooks.md)
- [Extensibility guide](docs/src/content/docs/guide/extensibility.md)
- [Samples](samples/README.md) — eight working examples from beginner to advanced

For SDK installation: `npm install @bradygaster/squad-sdk`

---

## GitHub Agentic Workflows

Cast a Squad for any repo — right from a GitHub issue.

If you use [GitHub Agentic Workflows](https://github.blog/changelog/2025-05-19-github-agentic-workflows-public-preview/), you can install Squad as a reusable workflow and manage your team with slash commands in issue comments.

### Install

<!-- cspell:ignore agentics -->

Squad requires GitHub Issues: slash commands are issue comments, and the merged
bootstrap creates a research/proposals issue. Follow the
[supported seven-step quick start](docs/src/content/docs/guide/gh-aw.md#quick-start),
which checks and enables Issues before installation when the authenticated user
has repository administration permission, and stops before creating a bootstrap
PR when an administrator must enable them.

```bash
set -euo pipefail

owner_repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
issues_enabled="$(gh api "repos/${owner_repo}" --jq '.has_issues')"
if [ "${issues_enabled}" != "true" ]; then
  if ! gh api --method PATCH "repos/${owner_repo}" \
    -F has_issues=true --silent; then
    echo "STOP: A repository administrator must enable Settings > General > Features > Issues." >&2
    exit 1
  fi
fi

test "$(gh api "repos/${owner_repo}" --jq '.has_issues')" = "true" || {
  echo "STOP: GitHub Issues must be enabled before installing Squad workflows." >&2
  exit 1
}

SQUAD_SHA="<40-character-commit-sha>"  # explicit, maintainer-approved; never `commits/dev`
gh aw add "bradygaster/squad/workflows@${SQUAD_SHA}"
rm -f .github/skills/agentic-workflows/SKILL.md
git add -- \
  .github/aw/ \
  .github/skills/ \
  .github/workflows/ \
  .gitattributes
git commit -m "Add Squad workflow"
git push
```

`gh aw add` compiles the workflows automatically. If it reports unapproved
safe-update changes, review them and run `gh aw compile --approve`.

Review the complete generated diff before you commit:

| Path | What gh-aw writes | Commit? |
|------|-------------------|---------|
| `.github/workflows/` | The Squad workflow sources, shared imports, compiled lock files, and `agentics-maintenance.yml` | Yes |
| `.github/aw/` | Supporting gh-aw state, including pinned action versions and SHAs | Yes |
| `.github/skills/` | The exact Squad-owned `gh-aw-enlistment` skill; remove gh-aw's generated mutable `agentic-workflows` router before staging | Yes |
| `.gitattributes` | Marks compiled `.lock.yml` workflows as generated | Yes |
| `.vscode/` | Workspace settings that enable GitHub Copilot for Markdown files in VS Code | Optional — commit only if you want to share this workspace setting |

`agentics-maintenance.yml` is a second installed workflow. Squad configures its created pull request safe output to expire after 14 days, so this workflow runs scheduled expiration cleanup and also exposes manual maintenance operations. To omit it, create `.github/workflows/aw.json` with `{"maintenance": false}` before installing. gh-aw then warns that expiration is disabled and removes the maintenance workflow.

Unlike the mutable router skill, `agentics-maintenance.yml` is compiled runtime
output required for the configured 14-day safe-output expiration behavior. Keep
it unless you explicitly disable maintenance before installation.

#### Retrospective auto-implementation (opt-in behavior)

`squad-improvement-worker` installs as part of the standard seven-workflow
`gh aw add` command above — it is not a separate add-on. The two activation
policies are separate: `squad-retro` can auto-dispatch `squad-implement-worker` on its
own ordinary (non-proposal) action issues once you set
`"squadRetroAutoImplement": "allow"` in `.squad/config.json` (only
bot-authored retrospective issues with a valid `Action-Key:` qualify), and a
maintainer can approve a governance-scoped retrospective proposal (paths
under `.squad/skills/**` or `.squad/decisions/inbox/**` only) for automated
implementation by commenting `/squad approve-improvement`, an
`Approved-Revision:` content hash and one `Approved-Path:` line per approved
file. The dispatcher forwards the issue and exact comment ID; the worker
revalidates the human's permission, revision, revocations and actual patch.
`/squad revoke-improvement` withdraws
that authorization at any time — it is a reserved, read-only command open to
any actor, and it emits no output of its own.

Report/proposal-only remains the default. Ordinary opt-in dispatch is capped at
three per wake-up (five action issues per report), with one delayed retry and a
durable human handoff after exhaustion. Both workers produce drafts only;
open, merged and closed-unmerged linked PRs suppress automatic duplicates.
Human review and merge are always required.

See [the gh-aw guide](https://bradygaster.github.io/squad/docs/guide/gh-aw/#retrospective-auto-implementation-opt-in) for the full authority model.

### Slash commands

| Command | What it does |
|---------|-------------|
| `/squad` | Cast a fresh team from repo analysis |
| `/squad connect org/repo` | Link to an external squad |
| `/squad adopt org/repo` | Fork a squad locally |
| `/squad cast-member <spec>` | Add a team member |
| `/squad retire <name>` | Remove a team member |
| `/squad status` | Check current team |
| `/squad implement` | Implement an issue or dispatch ready tasks from an epic |
| `/squad retro` | Run the shared retrospective now; scheduled and evidence-driven wakeups use the same worker |
| `/squad approve-improvement` | Authorize a governance-scoped retrospective proposal for `squad-improvement-worker` (write/maintain/admin only) |
| `/squad revoke-improvement` | Withdraw a prior approval; reserved, read-only, open to anyone |

### Casting brief tip

Write a detailed team description in the issue body, then comment `/squad cast` — the issue becomes your casting brief. The more context you give, the better Squad tailors your team.

📖 See [GitHub Agentic Workflows guide](https://bradygaster.github.io/squad/docs/guide/gh-aw/) for the complete setup, configuration, and usage reference.

---

## Requirements

- **Node.js** ≥22.5.0
- **npm** ≥10.0.0
- **Git** with SSH agent
- **GitHub CLI** (`gh`) for GitHub integration

## License

This project is licensed under the terms of the MIT open source license. Please refer to the [LICENSE](./LICENSE) file for the full terms.

## Maintainers

- [@bradygaster](https://github.com/bradygaster)
- [@tamirdresher](https://github.com/tamirdresher)

See [CODEOWNERS](.github/CODEOWNERS) for the full list.

## Support

For help or questions about using Squad, please use [GitHub Discussions](https://github.com/github/squad/discussions). See [SUPPORT.md](./SUPPORT.md) for details.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for build setup, monorepo structure, and guidelines.

## Code of Conduct

This project has adopted the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). See the full text for details on expected behavior and reporting.
