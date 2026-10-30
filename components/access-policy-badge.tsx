import { accessScopeLabel, describeAccessPolicy } from "@/lib/access-policy";
import type { AccessPolicy } from "@/lib/control-plane";
import { StatusPill } from "./data-ui";

const scopeTone = {
  public: "warn",
  workspace: "info",
  restricted: "ok",
} as const;

/** Badge for an access policy: Public / Workspace / Restricted · N rules. */
export function AccessPolicyBadge({ policy }: { policy: AccessPolicy }) {
  const count = policy.rules.length;
  return (
    <span title={describeAccessPolicy(policy)}>
      <StatusPill
        tone={scopeTone[policy.scope]}
        label={
          count > 0
            ? `${accessScopeLabel(policy.scope)} · ${count} rule${count === 1 ? "" : "s"}`
            : accessScopeLabel(policy.scope)
        }
      />
    </span>
  );
}
