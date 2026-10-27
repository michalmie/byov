# AI Chatbot blueprint

File tree and configs a scaffolded assistant starts from. Same gates as
the BYOV stack, plus a streaming chat route.

## File tree

```text
app/
  layout.tsx        # root layout, metadata
  page.tsx          # chat UI (client component)
  api/chat/route.ts # AI SDK stream route (server only)
  globals.css       # tailwind import + theme
components/         # chat bubbles, input, empty state
lib/                # prompt + tool logic (pure, unit-tested)
tests/unit/         # Vitest suites mirroring lib/
public/             # static assets
.env.example        # provider key name, no value
.gitignore          # node, build output, env files
eslint.config.mjs   # eslint-config-next
next.config.ts      # minimal Next config
postcss.config.mjs  # @tailwindcss/postcss
tsconfig.json       # strict, bundler resolution, @/* alias
vitest.config.ts    # jsdom + @ alias + setup file
vitest.setup.ts     # testing-library matchers
package.json        # scripts below, versions per manifest.json
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
- `.env.example`: provider key name documented, zero values.
- `app/api/chat/route.ts`: the only place that reads the provider key.

## Definition of done

A scaffolded app is stack-compliant when all of these hold:

- `npm run test:unit` green, with suites for `lib/` behavior.
- `npm run lint` and `npm run typecheck` green.
- `npm run build` produces a production build.
- DLP scan and dependency audit pass in the Control Plane.
- The provider key is unreachable from client code.
- Deploys only to admin-approved nodes.
