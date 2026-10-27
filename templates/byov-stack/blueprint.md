# BYOV Stack blueprint

File tree and configs a scaffolded app starts from. Mirrors the BYOV
repo layout minus the Control Plane domain code.

## File tree

```text
app/
  layout.tsx        # root layout, metadata
  page.tsx          # first route
  globals.css       # tailwind import + theme
components/         # UI building blocks
lib/                # domain logic (pure, unit-tested)
tests/unit/         # Vitest suites mirroring lib/
public/             # static assets
.env.example        # documented env vars, no values
.gitignore          # node, build output, env files
eslint.config.mjs   # eslint-config-next
next.config.ts      # minimal Next config
postcss.config.mjs  # @tailwindcss/postcss
tsconfig.json       # strict, bundler resolution, @/* alias
vitest.config.ts    # jsdom + @ alias + setup file
vitest.setup.ts     # testing-library matchers
package.json        # scripts below, versions per manifest.json
tokens.css          # design tokens (optional, recommended)
```

## Required scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test:unit": "vitest run",
  "test:unit:watch": "vitest"
}
```

## Required configs

- `tsconfig.json`: `strict: true`, `noEmit`, `@/*` path alias.
- `eslint.config.mjs`: `eslint-config-next` core-web-vitals + typescript.
- `vitest.config.ts`: `jsdom`, `globals`, `@` alias, setup file.
- `.env.example`: every variable documented, zero values.
- `.gitignore`: dependencies, build output, local env files.

## Definition of done

A scaffolded app is template-compliant when all of these hold:

- `npm run test:unit` green, with suites for `lib/` behavior.
- `npm run lint` and `npm run typecheck` green.
- `npm run build` produces a production build.
- DLP scan and dependency audit pass in the Control Plane.
- Deploys only to admin-approved nodes.
