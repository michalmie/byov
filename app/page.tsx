import { buildSiteTitle, summarizeDatabaseProfile } from "@/lib/site";

const siteName = "BYOV";
const databaseRequired = true;
const databaseProfile = "mysql";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-white/80 px-6 py-8 shadow-[0_30px_100px_rgba(0,0,0,0.08)] backdrop-blur sm:px-10 sm:py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.16),_transparent_30%),radial-gradient(circle_at_left,_rgba(22,163,74,0.12),_transparent_28%)]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-amber-50 px-3 py-1 font-mono text-xs uppercase tracking-[0.24em] text-amber-800">
              Vibe Factory Starter
            </div>
            <div className="space-y-4">
              <p className="font-mono text-sm uppercase tracking-[0.24em] text-zinc-500">
                Your next project
              </p>
              <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.04em] text-balance text-zinc-950 sm:text-5xl">
                {buildSiteTitle("Home", siteName)}
              </h1>
              <p className="max-w-2xl text-base leading-8 text-zinc-600 sm:text-lg">
                This website was scaffolded by the Vibe Factory command center.
                Update the project requirements, shape the product through Codex,
                and keep the unit test suite healthy as the project evolves.
              </p>
            </div>
          </div>
          <aside className="grid gap-4 rounded-[1.5rem] border border-black/10 bg-zinc-950 p-6 text-zinc-50 shadow-inner">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
                Project Snapshot
              </p>
              <p className="mt-3 text-2xl font-semibold">{siteName}</p>
            </div>
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-400">Slug</dt>
                <dd className="font-mono text-zinc-100">byov</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-400">Tech stack</dt>
                <dd className="font-mono text-zinc-100">nextjs-website</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-400">Database</dt>
                <dd className="text-right text-zinc-100">
                  {summarizeDatabaseProfile(databaseRequired, databaseProfile)}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        {[
          {
            title: "Requirements",
            body: "Keep REQUIREMENTS.md current and let Codex evolve the implementation with commit history.",
          },
          {
            title: "Testing",
            body: "Run npm run test:unit before major merges and review the checks in Vibe Factory.",
          },
          {
            title: "Deployment",
            body: "Configure your environment in Vibe Factory and release through its Delivery controls.",
          },
        ].map((item) => (
          <article
            key={item.title}
            className="rounded-[1.5rem] border border-black/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)]"
          >
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-zinc-950">
              {item.title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-600">{item.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
