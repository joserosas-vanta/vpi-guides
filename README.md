# pi-guides

A pi-native guide system packaged as a pi package.

## Status

This repository is an incremental port of the earlier OpenCode guide workflow into pi primitives.

Current v0.1 scope:

- registry-driven guide activation via a pi extension
- repo-local guide config in `.pi/guides.json`
- repo-local prose/context in `AGENTS.md`
- profile registry in `registry/profiles.json`
- guide registry in `registry/guides.json`
- bootstrap and sync commands for consumer repos
- persistent baseline profile and mode switching
- session-scoped overlay activation
- imported language-agnostic foundation guides including:
  - TigerStyle
  - Simplicity-Core
  - Security-Core
  - Contract-Core
  - Robustness-Core
  - Reproducibility-Core
  - UIStyle
  - Observability
  - Change-Risk
  - Epistemics
  - Performance
  - Privacy
  - Operability
  - Maintainability
  - Legacy-Evolution-Mode
  - Incremental-Refactoring-Strategy
  - Compatibility-Evolution
  - Diataxis
  - Testing

Design notes for the next phase live in:

- `docs/context-activation-engine.md`
- `docs/content-placement.md`
- `docs/activation-state-model.md`
- `docs/package-repo-session-model.md`
- `docs/profile-schema-v2.md`
- `docs/guides-config-v2.md`
- `docs/runtime-behavior-flags.md`
- `docs/profile-catalog.md`
- `docs/port-matrix.md`

Not included yet:

- language-specific TigerStyle variants
- framework or library guides
- skills for optional deep guide families
- one-turn task overlays
- custom compaction behavior
- hosted JSON schema URLs

---

## Quick Start

The guide system supports two bootstrap modes.

### Mode A. Personal convenience mode

Use this when the package is already available globally from `~/.pi/agent/settings.json`.

1. Start pi in the target repository.
2. Run:

```text
/guide-init --no-settings
```

3. Inspect the active state:

```text
/guides
```

This creates any missing:

- `.pi/guides.json`
- `AGENTS.md`

It does **not** create `.pi/settings.json`.
Use this for personal repos and quick local setup.

### Mode B. Reproducible repo mode

Use this when the repository should carry its own package pin.

1. Start pi in the target repository.
2. Run one of:

```text
/guide-init git:git@github.com:sillypoise/pi-guides@v0.5.1
```

or later, once published to npm:

```text
/guide-init npm:@sillypoise/pi-guides@0.3.0
```

3. Inspect the active state:

```text
/guides
```

This creates any missing:

- `.pi/guides.json`
- `.pi/settings.json`
- `AGENTS.md`

Use this for shared repos and any repository that needs deterministic package sourcing.

### Local development in this repo

This repository self-hosts its own package during development.

`.pi/settings.json` contains:

```json
{
  "packages": [".."]
}
```

Because `.pi/settings.json` is inside `.pi/`, the relative path `..` resolves to the repository root.
That lets pi load this local package while working in this repository.

To test unreleased package changes in another repo, use:

```text
/guide-init --dev
```

`--dev` resolves a local package path from one of:

- `PI_GUIDES_DEV_SOURCE`
- `.pi/settings.json` field `piGuidesDevSource`
- `~/.pi/agent/settings.json` field `piGuidesDevSource`

This is intended for personal testing only.
The generated `.pi/settings.json` will contain a machine-specific local path.

---

## Why this exists

OpenCode used an instruction-loading model built around a shared selector file, repo overlays, and an `instructions` array in `opencode.json`.

Pi has different native primitives:

- `AGENTS.md` for repo-local context
- extensions for deterministic runtime logic
- prompt templates for reusable task steering
- pi packages for installation and distribution

This repository adopts the pi-native model instead of trying to recreate OpenCode verbatim.

---

## Core architecture

### 1. Repo-local guide config: `.pi/guides.json`

This is the canonical machine-readable activation file.

It defines:

- active profile or direct guide list
- preferred mode (`compact` or `full`)
- explicit additions and removals
- explicit variant overrides

### 2. Repo-local prose/context: `AGENTS.md`

This remains a normal pi context file.

It is for:

- repo facts
- commands
- workflow expectations
- repo-specific constraints

It is **not** the canonical guide-selection manifest.

### 3. Package extension: `extensions/guide-system.ts`

This is the activation engine.

Pi provides the built-in extension hook `before_agent_start`.
This package implements a custom extension that subscribes to that hook.

The extension:

- reads `.pi/guides.json`
- resolves profiles using `registry/profiles.json`
- resolves guide variants using `registry/guides.json`
- loads the selected markdown guide files
- appends the resolved guide content to the effective system prompt
- exposes helper commands
- shows active guide status in the footer
- can persist profile and mode updates back into `.pi/guides.json`

### 4. Package distribution: `package.json`

This repo is a pi package repository.
It is intended to be installed:

- globally via `pi install ...`, or
- project-locally via `.pi/settings.json`

---

## Repository layout

```text
package.json
README.md
AGENTS.md

extensions/
  guide-system.ts

files/
  tigerstyle-strict-compact.md
  tigerstyle-strict-full.md

registry/
  guides.json
  profiles.json

templates/
  repo-AGENTS.md
  guides.json.example
  settings.json.example

schemas/
  guides.schema.json
  profiles.schema.json

prompts/
  guide-review.md

bin/
  validate-pi-guides

.pi/
  settings.json
  guides.json
```

---

## Installation

### Recommended rollout order

1. local path during package development
2. pinned git source during early dogfooding and ansible rollout
3. pinned npm version once publishing is live

### Global install

Global install makes the extension and slash commands available everywhere.
It does **not** activate guides in a repo by itself.
A repo still needs `.pi/guides.json`.

Example global pi settings using a pinned git source:

```json
{
  "packages": [
    "git:git@github.com:sillypoise/pi-guides@v0.5.1"
  ]
}
```

Equivalent npm form once published:

```json
{
  "packages": [
    "npm:@sillypoise/pi-guides@0.3.0"
  ]
}
```

You can place that in `~/.pi/agent/settings.json`, or install through `pi install ...`.

### Project-local install

Project-local install pins the package in the repository itself.
That is the recommended setup for shared repos.

Git example:

```json
{
  "packages": [
    "git:git@github.com:sillypoise/pi-guides@v0.5.1"
  ]
}
```

Npm example once published:

```json
{
  "packages": [
    "npm:@sillypoise/pi-guides@0.3.0"
  ]
}
```

Place that in `.pi/settings.json`, or install through `pi install -l ...`.

### Local path install

For local testing:

```json
{
  "packages": [
    "../path/to/pi-guides"
  ]
}
```

This is most useful while iterating on the package itself.

### Dotfiles / ansible integration

The recommended workstation split is:

- `sp-dotfiles` installs pi and writes `~/.pi/agent/settings.json`
- dotfiles optionally registers this package globally at a pinned source
- repositories opt into guide activation with `.pi/guides.json`
- shared repos can additionally pin the package in `.pi/settings.json`

That means:

- global package install = guide tooling is available
- repo `.pi/guides.json` = guides are active in that repo
- repo `.pi/settings.json` = package source is reproducible in that repo

### Migration from the old OpenCode workflow

Old workflow:

- clone a shared guides repo into the workstation
- point tool config at shared instruction files
- use shell scripts to initialize and sync repo overlays

Pi-native workflow:

- install a pi package globally or per-repo
- let the extension resolve and inject active guides
- keep repo activation in `.pi/guides.json`
- keep repo context in `AGENTS.md`
- use `/guide-init` and `/guide-sync` instead of external shell scripts

This removes the runtime dependency on a manually cloned shared guide directory.

---

## Consumer repo setup walkthrough

A consuming repository should normally have three pieces:

### 1. `.pi/settings.json`

Example:

```json
{
  "packages": [
    "git:git@github.com:sillypoise/pi-guides@v0.5.1"
  ]
}
```

This tells pi to load the package resources, including the extension.

### 2. `.pi/guides.json`

Minimal example:

```json
{
  "version": 1,
  "profile": "core",
  "mode": "full",
  "additions": [],
  "removals": [],
  "variants": {}
}
```

This is the canonical machine-readable guide selection file.

### 3. `AGENTS.md`

Generated from `templates/repo-AGENTS.md` or created manually following the same contract.

Important rule:

- `.pi/guides.json` = machine-readable guide selection
- `AGENTS.md` = human-readable repo context

---

## How activation actually works

This is the most important mental model for using the system.

### Step 1. Pi loads the package

If the package is listed in `.pi/settings.json`, pi loads the package resources declared in this repo's `package.json`.

That includes the extension in:

- `extensions/guide-system.ts`

### Step 2. The extension auto-loads

You do **not** enable the extension separately.

If the package is loaded and the extension is declared in `package.json`, the extension is active automatically.

### Step 3. The extension resolves repo guide config

On each normal agent turn, the extension:

1. reads `.pi/guides.json`
2. expands either:
   - `profile`, or
   - direct `guides`
3. applies `additions`
4. applies `removals`
5. resolves each guide to a concrete variant
6. orders guides by registry precedence
7. appends the active guide content to the effective system prompt in `before_agent_start`

### Step 4. The model sees the active guides

After that, normal prompts should behave as though the active guides are in force for that turn.

Examples:

- “review this file”
- “refactor this function”
- “rewrite this validator”

Those should use the active guide set automatically.

### Important nuance

**Extension loaded** is not exactly the same thing as **guides active**.

The correct mental model is:

- extension loaded = the guide system machinery is available
- guides active = the extension successfully resolved `.pi/guides.json` and injected guides for the current agent turn

So if:

- `/guides` shows a valid active state, and
- your next message is a normal agent prompt,

then the guides should be active for that prompt.

---

## Commands provided by the extension

### `/guides`

Shows the currently resolved guide state in a structured widget and updates footer status.

By default, the always-visible guides widget is a compact one-line summary.
Running `/guides` expands it into the full multi-line detail view.

The expanded widget includes:

- current resolved status
- config path
- active profile and mode
- active session overlay when present
- effective write policy, tool mode, and response contract
- precedence order
- config-level additions, removals, and variant overrides when present
- resolved guide entries with source paths and summaries
- available profile list

### `/guide-init [package-source] [--no-settings] [--dev]`

Scaffolds missing repo files from package templates.

By default, it creates any missing:

- `.pi/guides.json`
- `.pi/settings.json`
- `AGENTS.md`

Current v0.1 behavior:

- it does not overwrite existing files
- if the package is already available globally, plain `/guide-init` skips `.pi/settings.json` automatically
- otherwise, plain `/guide-init` writes `.pi/settings.json` using the package git tag by default
- you can pass an explicit package source, for example:
  - `/guide-init git:git@github.com:sillypoise/pi-guides@v0.5.1`
  - `/guide-init npm:@sillypoise/pi-guides@0.3.0`
- you can use `--dev` to write a configured local package path for testing unreleased changes
- `--dev` resolves from `PI_GUIDES_DEV_SOURCE` or settings field `piGuidesDevSource`
- `--dev` cannot be combined with `--no-settings` or an explicit package source
- you can skip `.pi/settings.json` generation with `--no-settings`
- `-h` and `--help` show usage guidance in the widget
- unknown options are rejected explicitly
- the widget distinguishes global-package, repo-pinned, and local-dev bootstrap modes
- the widget includes next-step hints after scaffolding
- it does not attempt complex AGENTS migrations yet

### `/guide-sync`

Refreshes only the managed header block inside `AGENTS.md`.

It will:

- create `AGENTS.md` from the template if missing
- update the managed header block if the markers are present exactly once
- report `unchanged` when the managed header already matches the package template
- refuse risky rewrites if the marker contract is missing or malformed
- render a widget summarizing the result

### `/guide-profile <profile-id>`

Persists a named profile into `.pi/guides.json` and reloads the runtime.

Current v0.1 behavior:

- profile ids come from `registry/profiles.json`
- baseline examples now include `core`, `coreplus`, `frontend`, `backend`, `docs`, `writing`, and `security-sensitive`
- if the repo currently uses direct `guides`, the command switches to profile-based config
- direct-guide-only fields are dropped during that transition
- invalid profile ids are rejected explicitly
- overlay-only profiles are rejected explicitly
- a no-op write is detected and reported without reloading
- calling without arguments shows available profiles

### `/guide-mode <compact|full>`

Persists the preferred guide mode into `.pi/guides.json` and reloads the runtime.

Current v0.1 behavior:

- accepted values are `compact` and `full`
- invalid values are rejected explicitly
- a no-op write is detected and reported without reloading
- if no mode is provided, the command shows the current guide widget and explains usage

### `/guide-session <profile-id|clear>`

Activates or clears a temporary session overlay without rewriting `.pi/guides.json`.

Current v0.1 behavior:

- overlay profile ids come from `registry/profiles.json`
- baseline-only profiles are rejected explicitly
- `clear` removes the active session overlay
- built-in overlays now include `review`, `migration`, `debug`, `design`, `docs-authoring`, `essay-writing`, `creative-draft`, `left-turn`, `anki-authoring`, `publish-check`, and `release`
- `review` sets read-only write policy and blocks `edit`, `write`, and mutating `bash` tool calls
- a no-op activation is detected and reported without reloading

### `/guide-next <profile-id|clear>`

Queues or clears a one-turn overlay for the next normal agent turn only.

Current v0.1 behavior:

- overlay profile ids come from `registry/profiles.json`
- baseline-only profiles are rejected explicitly
- `clear` removes the pending next-turn overlay
- the next-turn overlay stacks on top of the repo baseline and any active session overlay
- the next-turn overlay is cleared automatically at the end of that turn
- `review` can therefore be used as a read-only one-turn review mode

---

## Guide registry contract

`registry/guides.json` is the machine-canonical guide registry.

The extension reads this file at runtime.
It should not parse `VARIANTS.md`-style prose.

Each guide entry defines:

- stable guide id
- title
- precedence tier
- summary
- defaults for compact and full resolution
- available variants and their file paths

Current v0.1 registry contains multiple language-agnostic guide families.
The minimal core rulebook sequence starts with:

- `tigerstyle`
- `simplicity-core`

---

## TigerStyle normative contract

TigerStyle is an agent-oriented port of upstream, with scoped obligations and explicit package
adaptations for other languages/runtimes. It is maintained by the pi-guides maintainers.

- `files/tigerstyle-strict-full.md` is the authoring source.
- `files/tigerstyle-strict-compact.md` contains the **same normative text**, not a paraphrase.
- Both contain the same application contract, 69 rule IDs, titles, scopes, and exceptions.
- Full adds only sections labeled `Commentary (non-normative)`; these add no obligations.
- MUST requirements are mandatory within scope. SHOULD rules are strong defaults whose material
  departures need concrete reasons. Report unmet requirements and verification gaps explicitly.
- Expected invalid inputs and operating failures use error handling, not assertion crashes.

**Unreleased contract change:** this is a semantic policy revision, including restored upstream
recommendations and deliberate portability adaptations, not just editorial compression. Existing
paths, variant IDs, and `version: 1` configuration remain unchanged. Mode defaults change separately
as described below. Package pins identify the policy version; consumers should review affected
rule references and local exceptions before upgrading. Existing release tags must not be moved
to apply this revision silently.

See [the mapping notes](docs/tigerstyle-mapping.md) for source mappings, adaptation rationale,
provenance limits, cutover details, and manual agent-evaluation cases. The exact upstream commit for
this review's supplied source text has not been established; this is not a latest-upstream claim.

The parity check is `node --test tests/tigerstyle-guides.test.js`. It checks all shared text,
including the preamble, and rejects malformed/missing rules and full-only normative keywords.
It does not prove model adherence. Compact retains more qualifications and is longer;
full/compact equality takes precedence over the old compact word count.

---

## Profile registry contract

`registry/profiles.json` is the machine-canonical profile registry.

Current v0.1 profile set includes baseline and overlay profiles from `registry/profiles.json`.

The minimal coding baseline is `core`.

This currently expands to:

- `tigerstyle`
- `simplicity-core`

`coreplus` includes those two guides plus `security-core`, `contract-core`, and `epistemics`.

Profiles are intentionally simple in v0.1:

- no inheritance
- no dynamic composition rules
- no hidden expansions
- one mode for the profile, not per-guide variant defaults

### Default mode (unreleased change)

**Full** is now the default across all 18 profiles, the bootstrap template, and runtime fallbacks.
The pi-guides maintainers own this default. This repo's `.pi/guides.json` selects full. This uses
the existing mode field; there is no new schema or profile-level variant mechanism.

Resolution keeps the existing precedence:

1. A next-turn overlay's explicit mode wins over a session overlay's mode.
2. An overlay mode wins over the repo baseline mode.
3. Within the baseline, repo `mode` wins over profile `mode`; if both are absent, full is used.
4. Direct guide lists without a mode also use full.
5. Existing repo `variants.<guide-id>` overrides still take precedence for individual guides.

**Compatibility:** changing a semantic default is a behavior change. Package-pinned consumers adopt
it on upgrade; old runtime versions still default to compact when neither repo nor profile gives a
mode. No existing consumer config is rewritten. `/guide-init` uses full for new files and preserves
existing files. `/guide-profile` preserves an existing explicit mode and supplies the selected
profile's mode, or full, only when the repo has no mode.

To keep a compact baseline, set `"mode": "compact"` or run `/guide-mode compact`.
Active overlays can still override it; all shipped overlays now specify full. Unknown mode command
arguments remain errors without configuration writes. Hand-edited invalid repo modes are not yet
rejected at runtime; the schema and validator reject them. That existing gap is unchanged.

Full trades more prompt space for explanation and examples. With the current guide files, coreplus
loads about 90.5 kB of guide text in full versus 42.5 kB in compact, excluding prompt headers.
Those are file-byte counts, not token counts or latency measurements. Only TigerStyle currently has
an enforced full/compact normative-parity contract; this default change does not assert parity for
other guides or prove improved model adherence.

---

## Resolution rules

At runtime the extension resolves guides like this:

1. Load `.pi/guides.json`
2. Expand either:
   - `profile`, or
   - direct `guides`
3. Apply `additions`
4. Apply `removals`
5. Resolve each guide to a concrete variant
6. Order resolved guides by registry precedence
7. Inject the active guide set into the system prompt in `before_agent_start`

### Variant resolution order

If `mode` is `compact`, resolution prefers:

1. `strict-compact`
2. `pragmatic-compact`
3. `strict-full`
4. `pragmatic-full`

If `mode` is `full`, resolution prefers:

1. `strict-full`
2. `pragmatic-full`
3. `strict-compact`
4. `pragmatic-compact`

Explicit `variants.<guide-id>` overrides take precedence over the mode default.

### Direct guides vs profile mode

If `.pi/guides.json` uses direct `guides`, v0.1 rejects non-empty:

- `additions`
- `removals`

That ambiguity is rejected explicitly instead of being silently ignored.

---

## Validation

Run:

```bash
./bin/validate-pi-guides
```

Current validation checks include:

- `package.json` has pi-package metadata and extension registration
- registry files are valid JSON objects using `version: 1`
- guide precedence ids and ranks are well-formed and unique
- guide defaults reference existing variants of the matching size
- guide variant paths exist
- profile guide references are valid
- template managed header markers exist exactly once and in the correct order
- local dogfood `.pi/guides.json` is valid
- local dogfood `.pi/settings.json` is valid
- key runtime files exist

The repository also includes extension command dogfood checks, validator regression checks, and
TigerStyle normative-text parity/content checks. The standalone validator checks registry structure
and paths; the test suite additionally checks TigerStyle content:

```bash
node --test
```

---

## Troubleshooting and FAQ

### I can see `/guides`, but are guides automatically active for prompts?

If `/guides` exists, the extension is loaded.

Guides are active for a normal agent prompt when:

- the extension is loaded,
- `.pi/guides.json` exists and is valid,
- guide resolution succeeds for the current repo,
- and the prompt starts a normal agent turn.

### Why does `/guides` show `guides: off`?

Usually because `.pi/guides.json` does not exist in the current repo.

Run:

```text
/guide-init
```

or create `.pi/guides.json` manually.

### Why does `/guides` show `guides: error`?

Usually because:

- `.pi/guides.json` is invalid,
- the referenced profile does not exist,
- a variant override does not exist,
- a guide file is missing,
- or the config file is inaccessible.

Use `/guides` and inspect the reported reason.

### Do I have to enable the extension separately?

No.

If the package is loaded through `.pi/settings.json` and the package manifest exposes the extension, pi auto-loads it.

### Why would I use `/guide-init` if the package is already loaded?

Because package loading and repo bootstrap are separate concerns.

The package may be available globally, while the repo still lacks:

- `.pi/guides.json`
- `.pi/settings.json`
- `AGENTS.md`

`/guide-init` scaffolds those repo-local files conservatively.

### Does `/guide-profile` create session-only state?

No.

Current v0.1 behavior is persistent repo-local config.
It writes `.pi/guides.json` and reloads the runtime.

Session-scoped overrides are intentionally deferred.

---

## Distribution and ansible expectations

This repository is intended to become the installable pi package source for a broader tooling setup.

The expected distribution model is:

1. this repo publishes the pi package
2. ansible installs the package globally, or ensures it is available
3. consumer repos declare the package in `.pi/settings.json` when they want repo-local reproducibility

Recommended split of responsibility:

- ansible handles package availability and environment setup
- consumer repos handle `.pi/guides.json` and `AGENTS.md`
- the extension handles runtime guide activation

That keeps installation, repo configuration, and runtime behavior cleanly separated.

---

## Why only base TigerStyle for now

This package is being built incrementally.

For the initial pi-native port, only the language-agnostic TigerStyle base has been brought over.
That keeps the contract smaller while the extension, repo activation model, bootstrap flow, and documentation stabilize.

Language-specific TigerStyle variants and broader guide families can be added later without changing the core architecture:

- add guide files
- register them in `registry/guides.json`
- optionally add profiles in `registry/profiles.json`
- document them in this repository

---

## Development notes

When changing any of the following, update the docs and rerun validation:

- `extensions/guide-system.ts`
- `registry/guides.json`
- `registry/profiles.json`
- `templates/repo-AGENTS.md`
- `schemas/*.json`

If you change a contract, document the new behavior in this README.
Keep the template, registry, and runtime logic aligned.
