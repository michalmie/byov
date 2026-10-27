# Python API tech stack

FastAPI (async) + Uvicorn + typed Python 3.12 starter for automations
and data APIs. pytest + httpx tests, Ruff lint, container build —
Control Plane gates from the first commit.

## Scaffold

1. Copy the file tree in [blueprint.md](blueprint.md) into a new repo.
2. `python -m venv .venv && .venv/bin/pip install -r requirements.txt`
3. `cp .env.example .env` and fill in local values.
4. `.venv/bin/uvicorn app.main:app --reload --port 8000` — pick a free
   port; the Control Plane uses `3014`.

## Gates

Every change must pass:

| Check | Command |
|---|---|
| Unit tests | `pytest` |
| Lint | `ruff check .` |
| Production build | `docker build .` |
| DLP scan | BYOV gate, every change |
| Dependency audit | BYOV gate, nightly |

Run the local three together:

```bash
pytest && ruff check . && docker build .
```

## Ship

1. Register the app in the BYOV Control Plane.
2. Connect from your coding tool (Muse, Codex, Claude).
3. Deploy the container to an admin-approved node
   (self-hosted Coolify first).

Keep the repo public-safe: no secrets, env values, logs or real data.
