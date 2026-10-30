import type { NextRequest } from "next/server";
import { apiDbError, requireScope } from "@/lib/api-auth";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import { isRepoUrl } from "@/lib/apps";
import { findApp } from "@/lib/api-apps";
import { linkRepo } from "@/lib/pipeline";

/** Link the source repo the pipeline watches for one app. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireScope(request, "apps:write");
  if (auth instanceof Response) {
    return auth;
  }
  const { slug } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiBadJson();
  }
  const input = (body ?? {}) as { repoUrl?: unknown; branch?: unknown };
  const repoUrl = typeof input.repoUrl === "string" ? input.repoUrl.trim() : "";
  const branch = typeof input.branch === "string" ? input.branch.trim() : "";
  if (!repoUrl || !isRepoUrl(repoUrl)) {
    return apiError(400, "Enter an https or git repository URL.", {
      errors: { repoUrl: "Enter an https or git repository URL." },
    });
  }
  try {
    if (!(await findApp(slug))) {
      return apiError(404, `No app found for slug "${slug}".`);
    }
    const result = await linkRepo(slug, repoUrl, branch);
    if (!result.ok) {
      return apiError(404, result.error);
    }
    return apiOk({ slug, repoUrl, branch: branch || undefined });
  } catch {
    return apiDbError();
  }
}
