import { NextResponse } from "next/server";
import { parseNodeEndpoint, probeNodeEndpoint } from "@/lib/coolify-probe";

/**
 * Live Coolify node endpoint probe from the server's network vantage.
 * Accepts only http(s) URLs; never probes other schemes or overlong input.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body." },
      { status: 400 },
    );
  }
  const { endpoint } = (body ?? {}) as {
    endpoint?: unknown;
  };
  let clean: string;
  try {
    clean = parseNodeEndpoint(endpoint).endpoint;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid endpoint URL.",
      },
      { status: 400 },
    );
  }
  const result = await probeNodeEndpoint(clean);
  return NextResponse.json(result);
}
