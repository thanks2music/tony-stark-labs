# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `apps/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is **multi-context**. Each app under `apps/` is its own context with an unrelated domain:

| Context   | Path            | Notes                                          |
| --------- | --------------- | ---------------------------------------------- |
| `refrain` | `apps/refrain/` | One context covering both `worker/` and `cli/` |

```
/
├── GLOSSARY-MAP.md                    ← points at each context's GLOSSARY.md
├── docs/adr/                          ← system-wide decisions (toolchain, CI, monorepo layout)
└── apps/
    └── refrain/
        ├── GLOSSARY.md
        └── docs/adr/                  ← context-specific decisions
```

`archive/` holds retired apps and is not a context; ignore it when exploring.

When a new app is added under `apps/`, it becomes a new context: add its row here and its entry in `GLOSSARY-MAP.md` once it has a glossary.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
