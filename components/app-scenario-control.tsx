"use client";

import { DNS_SCENARIOS, type DnsScenario } from "@/lib/control-plane";
import { useWorkspaceSettings } from "@/lib/settings-store";
import { DNS_SCENARIO_META } from "@/lib/settings";

/** Per-app DNS scenario override; saves straight into settings. */
export function AppScenarioControl({ appSlug }: { appSlug: string }) {
  const { settings, saveSettings } = useWorkspaceSettings();
  const value = settings.appScenarios[appSlug] ?? "";
  const effective = settings.appScenarios[appSlug] ?? settings.defaultScenario;

  function handleChange(next: string) {
    const appScenarios = { ...settings.appScenarios };
    if (!next) {
      delete appScenarios[appSlug];
    } else {
      appScenarios[appSlug] = next as DnsScenario;
    }
    saveSettings({ ...settings, appScenarios });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <label htmlFor={`app-scenario-${appSlug}`} className="font-medium">
        DNS scenario
      </label>
      <select
        id={`app-scenario-${appSlug}`}
        className="input max-w-64 py-1.5 text-sm"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        aria-describedby={`app-scenario-${appSlug}-hint`}
      >
        <option value="">
          Inherit workspace default (
          {DNS_SCENARIO_META[settings.defaultScenario].label})
        </option>
        {DNS_SCENARIOS.map((scenario) => (
          <option key={scenario} value={scenario}>
            {DNS_SCENARIO_META[scenario].label}
          </option>
        ))}
      </select>
      <span id={`app-scenario-${appSlug}-hint`} className="hint">
        Effective: {DNS_SCENARIO_META[effective].label}. Env URLs below
        follow right away.
      </span>
    </div>
  );
}
