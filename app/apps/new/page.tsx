"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ControlPlaneShell } from "@/components/shell";
import { AppForm } from "@/components/app-form";
import { ArrowLeftIcon } from "@/components/icons";
import { useManagedApps } from "@/lib/apps-store";
import { useManagedStacks } from "@/lib/stack-store";
import { useWorkspaceSettings } from "@/lib/settings-store";

export default function NewApp() {
  const router = useRouter();
  const { createApp } = useManagedApps();
  const { stacks } = useManagedStacks();
  const { settings, nodes } = useWorkspaceSettings();

  return (
    <ControlPlaneShell
      crumb={
        <>
          <Link href="/apps" className="hover:underline">
            Apps
          </Link>{" "}
          / New app
        </>
      }
    >
      <div className="grid gap-8">
        <div>
          <Link
            href="/apps"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: "var(--color-muted)" }}
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Apps
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">
            New app
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Register a vibe-coded app with the control plane. It starts with
            one Sandbox environment — the app page then guides you from
            scaffold to first deploy.
          </p>
        </div>

        <AppForm
          formId="new-app"
          heading="Create app"
          lede="Pick a stack and the node hosting the Sandbox. Checks and the Sandbox environment come along automatically."
          initial={{ name: "", description: "", stack: "", node: "" }}
          stacks={stacks}
          nodes={nodes}
          preferredNode={settings.defaultNode}
          submitLabel="Create app"
          onSubmit={(draft) => {
            const result = createApp(draft);
            if (!result.ok) {
              return result.errors;
            }
            router.push(`/apps/${result.slug}`);
            return null;
          }}
          onCancel={() => router.push("/apps")}
        />
      </div>
    </ControlPlaneShell>
  );
}
