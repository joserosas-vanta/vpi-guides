# Repo Agent Context

<!-- BEGIN MANAGED GUIDE HEADER -->
This repository uses the pi guide system.

## Guide Activation Contract

Active guides for this repository are defined in:

- `.pi/guides.json` — canonical machine-readable guide selection
- installed pi guide package extension — resolves and injects active guides into the system prompt

The pi guide package can be made available either:

- globally from `~/.pi/agent/settings.json`, or
- repo-locally from `.pi/settings.json`

Repo-local `AGENTS.md` supplements the guide system with repository-specific context.
It does not define the canonical active guide set.

## Authoring Rules for This File

Use this file for:

- repository architecture facts
- build, test, and validation commands
- local workflow expectations
- repository-specific constraints
- durable notes that help future tasks in this repo

Do not use this file for:

- reusable cross-repo guide content
- large generic policy documents
- secrets, tokens, or credentials
- machine-readable guide selection state

If a rule should apply across multiple repositories, promote it into the guide package instead of only documenting it here.
<!-- END MANAGED GUIDE HEADER -->

## Repo-Specific Context

<!-- BEGIN REPO CONTEXT -->
- Purpose: source-of-truth pi package repository for a registry-driven guide activation system.
- Primary languages: TypeScript, JSON, Markdown.
- Key directories:
  - `extensions/` — pi extension runtime and commands.
  - `files/` — guide markdown content currently limited to base TigerStyle.
  - `registry/` — machine-readable guide and profile registries.
  - `templates/` — repo bootstrap templates for consumers.
  - `schemas/` — JSON schemas for repo guide configuration and profiles.
  - `bin/` — validation tooling.
- Architectural constraints:
  - keep activation deterministic and package-local;
  - keep repo `AGENTS.md` focused on repo facts, not guide selection;
  - keep runtime registry-driven so file layout can evolve without breaking repo configs.
<!-- END REPO CONTEXT -->

## Build / Test / Validation

- Install: no package install step is currently required for pi runtime loading.
- Build: none.
- Test: `node --test`
- Lint: none yet.
- Typecheck: none yet.
- Validation: `./bin/validate-pi-guides`
- Run one test: `node --test tests/guide-system-commands.test.js`

## Local Workflow Notes

- Preferred commands:
  - `pi`
  - `/guides`
  - `/guide-init`
  - `/guide-sync`
  - `/guide-profile`
  - `/guide-mode`
  - `./bin/validate-pi-guides`
- Safe-to-edit areas:
  - `README.md`
  - `registry/`
  - `templates/`
  - `schemas/`
  - `extensions/`
- Areas requiring extra care:
  - guide file paths referenced by the registry;
  - managed marker contracts in `templates/repo-AGENTS.md`;
  - extension prompt composition semantics.
- Review expectations:
  - preserve registry stability;
  - document any contract changes in `README.md`;
  - validate after changing registry, templates, schemas, or extension behavior.

## Repository-Specific Constraints

- Compatibility expectations:
  - keep repo config format stable at `version: 1` until explicitly revised.
- Migration / rollout constraints:
  - start with base TigerStyle only; language-specific TigerStyle variants can be added later.
- Performance constraints:
  - default-mode changes must account for prompt size and preserve explicit compact selection.
- Security / privacy constraints:
  - do not store secrets or credentials in guide configs, templates, or repo context files.
