# SurfacePin — locked ground rules (2026-09-24 kickoff)

## Mission
Exceed Ideation ASSUMPTION P(reach)~0.22. Reach play, not cash desk. MIT. Global English.

## Design philosophy
Be the boring primitive Anthropic/Cursor would rather adopt than reinvent.
- Exact hash, not fuzzy/LLM drift (pass/fail is deterministic)
- Spec-first: lockfile format + canonicalization are the product; CLI/Action are reference clients
- Generic *surface descriptor* core; MCP `tools/list` is first adapter
- Fail-closed CI; offline verify; near-zero deps on critical path
- Stay out of their product UX (no hosted required path)

## v1 scope (ONLY)
- `lock` / `verify` / `diff` over MCP tools surface: name, description, inputSchema
- Canonicalization spec + golden vectors
- Lean CLI + GitHub Action (fail-closed)
- MIT LICENSE, public repo under yellowgram when ready to push

## Explicitly NOT v1
resources/prompts, signed lockfiles, proxy gate, hosted, semantic/embedding scores, India-local, cold outreach, cash cut

## Kill gates (still live)
(a) official MCP / Anthropic / Cursor ships surface integrity as default
(b) swarm tool ~2k★ with Action+docs we cannot beat
(c) clear user shrug at tool drift

## Founder gates
Founder approves naming changes, public posts, spend/accounts. CoS builds and pushes code.
