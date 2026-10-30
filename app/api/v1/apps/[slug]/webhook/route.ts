import type { NextRequest } from "next/server";
import { apiDbError, requireApiAuth } from "@/lib/api-auth";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import { handlePush, type PushPayload } from "@/lib/pipeline";

/**
 * Push webhook: gates run over the reported change; deploys only on
 * pass. Auth is a machine token/session, or the shared webhook
 * secret (`x-byov-webhook-secret` vs `BYOV_WEBHOOK_SECRET`).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const secret = (process.env.BYOV_WEBHOOK_SECRET ?? "").trim();
  const presented = (request.headers.get("x-byov-webhook-secret") ?? "").trim();
  let actor = "webhook";
  if (!(secret && presented && presented === secret)) {
    const auth = await requireApiAuth(request);
    if (auth instanceof Response) {
      return auth;
    }
    actor = auth.kind === "token" ? auth.token.name : auth.email;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiBadJson();
  }
  const input = (body ?? {}) as PushPayload;
  let result;
  try {
    result = await handlePush(
      slug,
      {
        branch: typeof input.branch === "string" ? input.branch : undefined,
        env: typeof input.env === "string" ? input.env : undefined,
        files: Array.isArray(input.files) ? input.files : [],
        reported:
          input.reported && typeof input.reported === "object"
            ? input.reported
            : undefined,
      },
      actor,
    );
  } catch {
    return apiDbError();
  }
  if (!result.ok) {
    return apiError(404, result.error);
  }
  return apiOk({
    blocked: result.gates.blocked,
    summary: result.gates.summary,
    dlpFindings: result.gates.dlpFindings,
    checks: result.gates.checks,
    deployed: result.deployed,
  });
}
