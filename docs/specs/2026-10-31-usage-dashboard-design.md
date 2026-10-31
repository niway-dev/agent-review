# Usage and spend by model, without a server

- **Status:** proposed 2026-10-31. Nothing here is implemented.
- **Date:** 2026-10-31
- **Creates:** no ADR. Reuses ADR 0001 (no hosted service), ADR 0002 (zero dependencies) and
  the engine signature from #45.
- **Refs:** #43

## In one minute

**Summary.** An organisation wants to see what Wachi costs, by model, by repository and over
time, the way Pullfrog's console shows spend and runs. Pullfrog builds that console from data
each run sends to its backend. Wachi already writes the model and the cost into every review it
posts, so the data is in the consumer's GitHub. The design reads it from there and sends
nothing anywhere.

**Decisions.**

| # | Decision | Why | ADR |
| --- | --- | --- | --- |
| 1 | Document the provider console as the zero-build answer: a dedicated API key or workspace for Wachi gives spend by model and day, and a spend limit | The user brings their own key, so the provider already meters it | none |
| 2 | Every review carries one hidden, engine-written usage line, for example `<!-- wachi:usage {"v":1,"model":"claude-sonnet-5-5","cost":0.82,"batches":2,"files":14,"ms":95000} -->` | The visible footer is for people and may change. After #45 the model cannot forge a hidden comment, so the line is trustworthy | reuses #45 |
| 3 | `wachi stats` reads usage lines with `gh` and prints spend, runs and cost per model, per repository and per week | Same read path as `precision.ts`; data never leaves GitHub | reuses 0001 |
| 4 | `wachi stats` joins spend with precision: cost per correct finding, by model | The number that decides which model to run. No hosted console offers it | none |
| 5 | Reviews older than the usage line are parsed from the visible footer, with fewer fields | Keeps history without a migration | none |
| 6 | No upload, anonymous or not. No generated install ID | See "Rejected: upload keyed by a generated ID" | reuses 0001 |

**Open questions.**

1. An organisation-wide scheduled report (option 2 below). Default: documented as a recipe,
   built only when an organisation asks for it.
2. Codex cost detail. ADR 0004 requires the Codex adapter to account for its own cost; whether
   it reports dollars or only tokens was not verified. Default: record tokens and leave `cost`
   empty when the provider gives none. Never estimate silently.
3. Product telemetry for the maintainer (coarse, opt-in aggregates). Out of this design; it
   would change the promise that nothing leaves the repository and needs its own ADR.

**Out of scope.** A hosted dashboard. Any data sent to a Wachi server. Real-time charts.

## Options considered

0. **Provider console only.** Nothing to build. Shows spend per key, model and day. Against:
   no per-repository or per-PR split, no link to precision. Kept as decision 1.
1. **`wachi stats` over GitHub data.** Reads the usage lines from reviews. Against: someone has
   to run it; it is not an always-open panel. Chosen.
2. **Scheduled organisation report.** A weekly workflow in a **private** organisation
   repository runs `wachi stats` across the organisation's repositories, writes the result to
   the job summary, and commits a `usage.csv` plus a static HTML page with inline SVG charts (no
   dependencies, ADR 0002). Against: it needs a read-only token that reaches every repository
   (fine-grained PAT or GitHub App), one more credential to maintain. Private GitHub Pages
   exists only on Enterprise Cloud; on other plans publishing to Pages would expose spend, so
   the page is read inside the private repository or downloaded. Open question 1.
3. **Client-side encrypted sync to a Wachi server.** The key lives in the user's GitHub secret,
   the server stores blobs it cannot read, and the browser decrypts. Works, but it is a hosted
   service with availability, breach and GDPR duties, and contradicts ADR 0001's non-goal. Not
   pursued unless a customer requires it.

## Rejected: upload keyed by a generated ID

The idea was to upload spend data keyed by a random install ID, so no user data leaks.

- **A stable ID is a pseudonym, not anonymity.** It links every run of one organisation.
  Timing, repository count and spend pattern can re-identify it.
- **The owner must prove the ID is theirs** to see their own dashboard. At that moment the
  server knows who they are.
- **It is a hosted service**, which ADR 0001 lists as a non-goal. Its reopen condition is not met.

Two needs were mixed in the idea. The user's dashboard needs full detail and can live entirely
in GitHub. The maintainer's product metrics need only coarse, opt-in aggregates; that is open
question 3, not this design.

## Detail

### Usage line

- Written by the engine after posting, never by the model. Rendered after the visible footer and
  before the incremental marker, which stays the final line (#45).
- Versioned (`"v":1`). Fields: `model`, `provider`, `cost` (USD, nullable), `tokens` (input,
  output, cache read, cache write, when the provider reports them), `batches`, `files`, `ms`,
  `partial` (budget or coverage cut).
- `wachi stats` accepts the line only in a review that carries the engine signature
  (`<!-- wachi:review -->`) and only as an engine-written footer line, with the same
  position rule as the marker.

### `wachi stats`

- Input: one repository or a list; a date range; `--json` or a Markdown table.
- Output: runs, spend, cost per run and cost per correct finding, grouped by model, repository
  and ISO week. Precision comes from the existing verdict reader.
- Rate limits: one `gh api` page walk per PR, like `precision.ts`. Large organisations use
  option 2 on a schedule.

## Sources and unverified claims

- Pullfrog's dashboard feed (`PATCH /api/workflow-run/{id}` with model, tokens, `costUsd`) and
  `run-context` call: read in its action source, see the
  [research note](../research/2026-10-30-pullfrog-and-coderabbit.md).
- Private GitHub Pages being Enterprise Cloud only: GitHub documentation, not re-checked for
  this spec.
- Anthropic and OpenAI consoles showing spend per key and model, and supporting spend limits:
  from their consoles; per-workspace limits were not re-checked.
