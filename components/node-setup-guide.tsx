"use client";

const DOCS_URL = "https://coolify.io/docs";

/**
 * Prerequisites checklist shown with the Add node form. Public-safe:
 * guidance only, no secrets or credentials.
 */
export function NodeSetupGuide() {
  return (
    <section
      aria-labelledby="node-setup-guide-heading"
      className="card grid gap-3 p-5 sm:p-6"
    >
      <div className="max-w-2xl">
        <h2
          id="node-setup-guide-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Before you add a Coolify node
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-ink-2)" }}>
          Work through this list on the new server first — then register its
          endpoint below.
        </p>
      </div>
      <ol className="grid max-w-2xl gap-2 text-sm">
        <li className="flex gap-2">
          <span aria-hidden="true">1.</span>
          <span>
            Prepare a server with at least 2 vCPU, 4 GB RAM, and 30 GB disk on
            Ubuntu LTS (check the Coolify docs for current sizing).
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">2.</span>
          <span>
            Open ports 80 and 443, and create a DNS A record for Coolify
            itself pointing at the server.
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">3.</span>
          <span>
            Install Coolify with the official install script — see the{" "}
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Coolify docs
            </a>
            .
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">4.</span>
          <span>
            Log in to Coolify and set its FQDN (the same hostname as the A
            record).
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">5.</span>
          <span>
            Paste the Coolify URL as the endpoint below and press Test.
          </span>
        </li>
      </ol>
    </section>
  );
}
