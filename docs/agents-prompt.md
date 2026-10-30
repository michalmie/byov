---
title: "Per-app AGENTS.md prompt"
description: "Where to find the proposed AGENTS.md for an app, what it covers, and how to install it in the repo."
---

# Per-app AGENTS.md prompt

Every BYOV app gets a proposed `AGENTS.md`: the initial instructions a
coding agent reads when it works on the app. It makes the agent aware
of the app, the BYOV harness around it, and the gates every change must
pass. Copy it into the repo, commit it, and adjust it as the app grows.

Overview:

1. [What it is](#what-it-is)
2. [Where to find it](#where-to-find-it)
3. [What it covers](#what-it-covers)
4. [Install it in your repo](#install-it-in-your-repo)
5. [When the stack or URL is missing](#when-the-stack-or-url-is-missing)
6. [Keep it fresh](#keep-it-fresh)

## What it is

`AGENTS.md` is a convention coding agents (Claude, Codex, OpenCode, …)
already follow: instructions at the repo root that the agent reads
before every change. BYOV generates a starting version per app from the
single source in `lib/agents-prompt.ts`, pre-filled with the app's
identity, harness, stack commands, and house rules — so owners do not
start from a blank page and every app teaches its agent the same gates.

A short excerpt of a generated prompt:

```md
# Rota Planner — agent instructions

This app is managed by BYOV (Bring Your Own Vibe): a governed home for
vibe-coded apps at work. You build the app; BYOV watches it. Read this
file before every change.

- Name: Rota Planner
- Slug: `rota-planner`
- Tech stack: BYOV Stack (`byov-stack`)

## Required gates — keep them green

1. Unit tests
2. Lint
3. Production build
4. DLP scan (BYOV gate, every change)
5. Dependency audit (BYOV gate, nightly)
```

The full file continues with the copy-paste gate command for the app's
stack and the house rules below.

## Where to find it

- **Existing apps:** open the app in [your apps](/apps) and scroll to
  the **Agent instructions** section. It shows the generated prompt for
  that app with a Copy button.
- **New apps:** the Sandbox setup guide's agent mode includes the
  prompt as its own step — save it into the repo *before* starting the
  coding agent, so the agent's very first change already follows it.

Both surfaces render the same generated text; pick whichever you are
looking at.

## What it covers

| Section | What's inside |
|---------|---------------|
| **The app** | Name, slug, description, and assigned tech stack — identity the agent quotes back in commits and pull requests. |
| **The BYOV harness around you** | Control Plane, Sandbox environment and its node, Sandbox URL, and nodes — where the app runs and where changes show up. |
| **Stack** | The stack's layers and key scripts (`dev`, `test:unit`, `lint`, `typecheck`, `build`, `start`) plus the starter it was scaffolded from. Present only when the app has a stack. |
| **Required gates** | The five gates — unit tests, lint, production build, DLP scan, dependency audit — with the one-line local gate command for the app's stack. |
| **House rules** | No secrets in git, the dev server stays off the Control Plane's port, small shippable changes, fix the cause when a gate fails, and review generated code like your own. |

> The prompt never contains secrets or environment values — only names,
> commands, and URLs that are already visible in the Control Plane.

## Install it in your repo

1. Copy the prompt from the **Agent instructions** section (or the
   Sandbox setup guide step) with the Copy button.
2. Save it as `AGENTS.md` at the **repo root** — next to the
   README, not in a subdirectory. That is where coding agents look.
3. Commit it on its own or with the change it governs:

   ```sh
   git add AGENTS.md
   git commit -m "Add agent instructions"
   ```

4. Adjust freely afterwards: project-specific conventions, extra test
   commands, and lessons learned all belong in this file. The generated
   text is a starting point, not a locked template.

## When the stack or URL is missing

The prompt always renders — missing pieces degrade to guidance instead
of blanks:

| Missing piece | What the prompt says | How to fix it |
|---------------|----------------------|---------------|
| Tech stack | "none assigned yet — keep the repo's own setup"; no Stack section; gates say to run whatever tests, lint, and build the project uses. | Assign a stack to the app; the Stack section and gate command appear on the next render. |
| Sandbox URL | "not assigned yet"; points the owner at node setup. | Finish the node setup in **Settings → Nodes**; the URL fills in once the environment resolves. |
| Node name | Falls back to the Sandbox environment's node, or "its assigned node". | Register the node in **Settings → Nodes** and attach the environment to it. |

If the prompt looks generic, compare it against this table — the fix is
usually one setup step away, not an edit to the text.

## Keep it fresh

Regenerate the prompt (re-open the **Agent instructions** section or
the setup guide) after stack, node, or URL changes, and copy the new
parts into the repo's `AGENTS.md`. Anything you added by hand —
project conventions, extra commands — stays yours; BYOV only proposes
the starting text.
