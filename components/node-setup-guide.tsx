"use client";

import type { ReactNode } from "react";

const COOLIFY_DOCS_URL = "https://coolify.io/docs";
const VERCEL_DOCS_URL = "https://vercel.com/docs";

interface KindGuide {
  heading: string;
  intro: string;
  steps: ReactNode[];
}

const COOLIFY_GUIDE: KindGuide = {
  heading: "Coolify setup checklist",
  intro:
    "Work through this list on the new server first — then register its endpoint below.",
  steps: [
    "Prepare a server with at least 2 vCPU, 4 GB RAM, and 30 GB disk on Ubuntu LTS (check the Coolify docs for current sizing).",
    "Open ports 80 and 443, and create a DNS A record for Coolify itself pointing at the server.",
    <>
      Install Coolify with the official install script — see the{" "}
      <a
        href={COOLIFY_DOCS_URL}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        Coolify docs
      </a>
      .
    </>,
    "Log in to Coolify and set its FQDN (the same hostname as the A record).",
    "In Coolify, create an API token for BYOV with permission to manage applications (under Keys & Tokens / API tokens in the Coolify panel).",
    "Paste the Coolify URL as the endpoint below, paste the API token into Coolify API token, and press Test token — it must pass before the first deploy.",
    "Set a zone (or tailnet host) in Serve URLs and add the wildcard DNS record so Sandbox URLs resolve.",
  ],
};

const VERCEL_GUIDE: KindGuide = {
  heading: "Vercel setup checklist",
  intro:
    "Work through this list in your Vercel team first — then register the project URL below.",
  steps: [
    <>
      Sign in to Vercel and pick the team that will own the project (see the{" "}
      <a
        href={VERCEL_DOCS_URL}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        Vercel docs
      </a>
      ).
    </>,
    "Create a project from the app repo and let the first production deploy finish.",
    "Note the production URL — paste it as the endpoint below and press Test.",
    "Custom domain is optional: set a zone in Serve URLs below and point it at Vercel.",
  ],
};

/**
 * Per-kind setup instructions rendered inside the node form, directly
 * under the type picker, so they always match the selected kind.
 * Public-safe: guidance only, no secrets or credentials.
 */
export function NodeKindInstructions({ kind }: { kind: string }) {
  const guide = kind === "Vercel" ? VERCEL_GUIDE : COOLIFY_GUIDE;
  return (
    <div aria-live="polite">
      <h3 className="text-sm font-semibold">{guide.heading}</h3>
      <p className="hint mt-1">{guide.intro}</p>
      <ol className="mt-2 grid max-w-2xl gap-1.5 text-sm">
        {guide.steps.map((step, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden="true">{index + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
