---
name: "token-economy"
description: "Token and latency discipline for every agent: repo map first, targeted reads, compact shell output (RTK), graph queries (graphify), small spawn prompts. Use before exploring a codebase or writing a spawn prompt."
domain: "performance"
confidence: "medium"
source: "manual"
---

## SCOPE

✅ THIS SKILL PRODUCES:
- Agents that locate code from `.squad/context/repomap.md` before searching
- Spawn prompts that pass paths, not file contents
- Shell commands whose output is compacted (RTK) or filtered

❌ THIS SKILL DOES NOT:
- Trade correctness for tokens: when a full file is needed, read it

## Rules

1. **Map first.** Read `.squad/context/repomap.md` (ranked files + symbols). If `graphify-out/GRAPH_REPORT.md` exists, use `graphify query "<question>"` for relationship questions instead of repeated greps.
2. **Targeted reads.** Grep for the symbol, then read only the relevant range. Do not open whole directories "to get a feel".
3. **Compact shell output.** With RTK installed, `git status`, test and build output is compacted automatically; use `rtk bypass <cmd>` only when you need raw output. Without RTK, pipe through `tail`/`Select-Object -Last` and use quiet flags (`--silent`, `-q`, `--reporter=dot`).
4. **Small spawns.** Spawn prompts carry: the task, acceptance criteria, file paths, relevant decisions. Never paste whole files, logs or histories.
5. **Right model for the job.** Mechanical work (Scribe, docs, renames) runs on the fast tier; architecture/security on premium (`roleModelOverrides`).
6. **Refresh the map** after large refactors: `squad optimize repomap`. Run `squad nap` when histories grow.
7. **Measure.** `rtk gain` shows token savings; report big wins in decisions.
