"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ControlPlaneShell } from "@/components/shell";
import { AppForm } from "@/components/app-form";
import { ArrowLeftIcon } from "@/components/icons";
import { useManagedApps } from "@/lib/apps-store";
import { useManagedStacks } from "@/lib/stack-store";
import { useWorkspaceSettings } from "@/lib/settings-store";
import { useSourceControlSettings } from "@/lib/source-control-store";
import { useSession } from "@/lib/use-session";
import { useUsers } from "@/lib/users-store";

function NewAppForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createApp } = useManagedApps();
  const { stacks } = useManagedStacks();
  const { settings, nodes } = useWorkspaceSettings();
  const { settings: sourceControl } = useSourceControlSettings();
  const { users } = useUsers();
  const { user } = useSession();
  const preferredStack = searchParams.get("stack") ?? "";

  return (
    <AppForm
      formId="new-app"
      initial={{ name: "", slug: "", description: "", stack: "", node: "" }}
      stacks={stacks}
      nodes={nodes}
      preferredNode={settings.defaultNode}
      preferredStack={preferredStack}
      sourceControl={sourceControl}
      owners={users}
      currentUserEmail={user?.email ?? ""}
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
  );
}

export default function NewApp() {
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
            Register a vibe-coded app with the control plane. Pick a stack
            and the node hosting the Sandbox — checks and the Sandbox
            environment come along automatically, and the app page then
            guides you from scaffold to first deploy.
          </p>
        </div>

        <Suspense
          fallback={
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Loading form…
            </p>
          }
        >
          <NewAppForm />
        </Suspense>
      </div>
    </ControlPlaneShell>
  );
}
