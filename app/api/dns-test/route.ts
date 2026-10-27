import { NextResponse } from "next/server";
import { isDomainZone, isTestablePort } from "@/lib/dev-urls";
import { probeHost } from "@/lib/dns-probe";

/**
 * Live DNS + TLS probe from the server's network vantage. Accepts only
 * well-formed multi-label hostnames on the HTTPS or tailnet-env ports;
 * never resolves single labels or arbitrary ports.
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
  const { host, port = 443 } = (body ?? {}) as {
    host?: unknown;
    port?: unknown;
  };
  if (typeof host !== "string" || !isDomainZone(host)) {
    return NextResponse.json(
      { error: "Expected a testable hostname." },
      { status: 400 },
    );
  }
  if (typeof port !== "number" || !isTestablePort(port)) {
    return NextResponse.json(
      { error: "Expected port 443 or 10000–18999." },
      { status: 400 },
    );
  }
  const result = await probeHost(host.trim().toLowerCase(), port);
  return NextResponse.json(result);
}
