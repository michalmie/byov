# React SPA blueprint

File tree and configs a scaffolded dashboard starts from. Static
output, same gates as every BYOV template.

## File tree

```text
src/
  main.tsx          # entry point
  App.tsx           # first route
  index.css         # tailwind import + theme
components/         # UI building blocks
lib/                # domain logic (pure, unit-tested)
tests/unit/         # Vitest suites mirroring lib/
public/             # static assets
index.html          # Vite entry
.env.example        # documented env vars, no values
.gitignore          # node, build output, env files
eslint.config.mjs   # eslint + typescript
tsconfig.json       # strict, bundler resolution, @/* alias
vite.config.ts      # react plugin + test setup
vitest.setup.ts     # testing-library matchers
package.json        # scripts below, versions per manifest.json
```

## Required scripts

```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test:unit": "vitest run",
  "test:unit:watch": "vitest"
}
```

## Required configs

- `tsconfig.json`: `strict: true`, `noEmit`, `@/*` path alias.
- `eslint.config.mjs`: typescript + react-hooks rules.
- `vite.config.ts`: react plugin, `jsdom`, `globals`, `@` alias.
- `.env.example`: every variable documented, zero values.
- `.gitignore`: dependencies, `dist/`, local env files.

## Definition of done

A scaffolded app is template-compliant when all of these hold:

- `npm run test:unit` green, with suites for `lib/` behavior.
- `npm run lint` and `npm run typecheck` green.
- `npm run build` produces a static `dist/` build.
- DLP scan and dependency audit pass in the Control Plane.
- Deploys only to admin-approved nodes.
