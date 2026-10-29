"use client";

import { useCallback, useEffect, useState } from "react";
import { fleetSummaryFor } from "@/lib/control-plane";
import { useManagedApps } from "@/lib/apps-store";
import { useManagedNodes } from "@/lib/settings-store";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function ControlPlaneShell({
  crumb,
  subnav,
  children,
}: {
  crumb: React.ReactNode;
  subnav?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { nodes } = useManagedNodes();
  const { apps } = useManagedApps();
  const summary = fleetSummaryFor(apps, nodes);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open ]);

  return (
    <div className="min-h-dvh">
      <Sidebar open={open} onClose={close} />
      <div
        aria-hidden={!open}
        onClick={close}
        className={`scrim fixed inset-0 z-[var(--z-dropdown)] lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`flex min-h-dvh flex-col ${
          subnav ? "lg:pl-[448px]" : "lg:pl-[216px]"
        }`}
      >
        <Topbar
          onMenu={() => setOpen(true)}
          crumb={crumb}
          attention={summary.attention}
        />
        <main className="w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {subnav}
          {children}
        </main>
        <footer className="w-full max-w-6xl px-4 pb-6 sm:px-6">
          <p
            className="tnum rule-top flex flex-wrap gap-x-3 gap-y-1 pt-3 text-xs"
            style={{ color: "var(--color-muted)" }}
          >
            <span>BYOV Control Plane</span>
            <span aria-hidden="true">·</span>
            <span>Sample data</span>
            <span aria-hidden="true">·</span>
            <span>
              {summary.apps} apps · {summary.nodes} nodes
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
}
