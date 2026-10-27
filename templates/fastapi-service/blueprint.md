# Python API blueprint

File tree and configs a scaffolded service starts from. Container
output, same gates as every BYOV template.

## File tree

```text
app/
  __init__.py       # package marker
  main.py           # FastAPI app + first route
  settings.py       # env-driven config (no values)
tests/
  __init__.py       # package marker
  test_health.py    # first endpoint test
.env.example        # documented env vars, no values
.gitignore          # venv, caches, env files
Dockerfile          # production container build
requirements.txt    # locked versions per manifest.json
ruff.toml           # lint + format rules
pytest.ini          # test paths and options
```

## Required commands

```text
dev:       uvicorn app.main:app --reload
test:      pytest
lint:      ruff check .
format:    ruff format --check .
typecheck: mypy app
build:     docker build .
```

## Required configs

- `ruff.toml`: pycodestyle + pyflakes rules, line length 100.
- `pytest.ini`: `testpaths = tests`, asyncio auto mode.
- `.env.example`: every variable documented, zero values.
- `Dockerfile`: slim Python base, non-root user, no secrets baked in.
- `.gitignore`: `.venv/`, `__pycache__/`, `.env`, caches.

## Definition of done

A scaffolded service is template-compliant when all of these hold:

- `pytest` green, with suites for endpoint behavior.
- `ruff check .` and `ruff format --check .` green.
- `docker build .` produces a production container.
- DLP scan and dependency audit pass in the Control Plane.
- Deploys only to admin-approved nodes.
