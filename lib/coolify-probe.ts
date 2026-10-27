// Live Coolify node endpoint verification from the server's network
// vantage. Stage logic stays pure over injectable deps so unit tests run
// offline; nodeDeps wires the real node:dns/tls/http/https implementations
// with timeouts.

import { promises as nodeDns } from "node:dns";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

/** Per-stage network timeout for node probes. */
export const NODE_PROBE_TIMEOUT_MS = 8000;

/** Longest endpoint URL the probe accepts. */
export const MAX_ENDPOINT_LENGTH = 2048;

export interface NodeTlsCert {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
}

export interface NodeTlsCheck {
  authorized: boolean;
  authorizationError?: string;
  cert?: NodeTlsCert;
}

export interface NodeProbeDeps {
  resolve4(host: string): Promise<string[]>;
  checkTls(host: string, port: number, timeoutMs: number): Promise<NodeTlsCheck>;
  fetchStatus(endpoint: string, timeoutMs: number): Promise<number>;
}

export interface NodeDnsStage {
  ok: boolean;
  addresses?: string[];
  error?: string;
}

export interface NodeTlsStage {
  ok: boolean;
  authorized?: boolean;
  error?: string;
  cert?: NodeTlsCert;
}

export interface NodeHttpStage {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface NodeProbeResult {
  endpoint: string;
  host: string;
  port: number;
  reachable: boolean;
  stages: {
    dns: NodeDnsStage;
    tls: NodeTlsStage | null;
    http: NodeHttpStage | null;
  };
  guidance: string;
}

interface ParsedEndpoint {
  endpoint: string;
  host: string;
  port: number;
  secure: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse and validate a node endpoint URL. Throws on malformed input. */
export function parseNodeEndpoint(value: unknown): ParsedEndpoint {
  if (typeof value !== "string") {
    throw new Error("Expected an http(s) endpoint URL.");
  }
  const endpoint = value.trim();
  if (endpoint.length === 0) {
    throw new Error("Expected an http(s) endpoint URL.");
  }
  if (endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw new Error(
      `Endpoint is too long (max ${MAX_ENDPOINT_LENGTH} characters).`,
    );
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Expected an http(s) endpoint URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https endpoints can be probed.");
  }
  if (!url.hostname) {
    throw new Error("Expected an http(s) endpoint URL.");
  }
  const secure = url.protocol === "https:";
  const port = url.port ? Number(url.port) : secure ? 443 : 80;
  return { endpoint, host: url.hostname, port, secure };
}

function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error(`${what} timed out after ${NODE_PROBE_TIMEOUT_MS}ms`)),
      NODE_PROBE_TIMEOUT_MS,
    );
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeout,
  ]);
}

function nameString(part: unknown): string {
  if (!part || typeof part !== "object") {
    return "—";
  }
  const entries = Object.entries(part as Record<string, unknown>)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${key}=${value}`);
  return entries.join(", ") || "—";
}

function checkTlsLive(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<NodeTlsCheck> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      () => {
        const peer = socket.getPeerCertificate() as
          | Partial<{
              subject: unknown;
              issuer: unknown;
              valid_from: string;
              valid_to: string;
            }>
          | null;
        const cert =
          peer && peer.subject
            ? {
                subject: nameString(peer.subject),
                issuer: nameString(peer.issuer),
                validFrom: peer.valid_from ?? "—",
                validTo: peer.valid_to ?? "—",
              }
            : undefined;
        const authorized = socket.authorized;
        const authorizationError = socket.authorizationError
          ? message(socket.authorizationError)
          : undefined;
        socket.destroy();
        resolve({ authorized, authorizationError, cert });
      },
    );
    socket.on("timeout", () =>
      socket.destroy(
        new Error(`TLS handshake timed out after ${timeoutMs}ms`),
      ),
    );
    socket.on("error", reject);
  });
}

function fetchStatusLive(
  endpoint: string,
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(
      {
        host: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        servername: url.protocol === "https:" ? url.hostname : undefined,
        path: `${url.pathname}${url.search}` || "/",
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.on("timeout", () =>
      request.destroy(new Error(`HTTP timed out after ${timeoutMs}ms`)),
    );
    request.on("error", reject);
  });
}

const nodeDeps: NodeProbeDeps = {
  resolve4: (host) => withTimeout(nodeDns.resolve4(host), "DNS lookup"),
  checkTls: checkTlsLive,
  fetchStatus: fetchStatusLive,
};

function refusedOrTimedOut(error: string): boolean {
  return (
    /ECONNREFUSED/i.test(error) ||
    /timed?\s?out/i.test(error) ||
    /ETIMEDOUT/i.test(error)
  );
}

/**
 * Probe a Coolify node endpoint through DNS, TLS (https only), and HTTP
 * stages. Any HTTP status counts as reachable; later stages run only when
 * earlier ones pass, and every outcome carries one actionable guidance
 * sentence.
 */
export async function probeNodeEndpoint(
  endpoint: string,
  deps: NodeProbeDeps = nodeDeps,
): Promise<NodeProbeResult> {
  const { endpoint: clean, host, port, secure } = parseNodeEndpoint(endpoint);

  let dns: NodeDnsStage;
  try {
    const addresses = await deps.resolve4(host);
    dns = { ok: true, addresses, error: undefined };
  } catch (error) {
    dns = { ok: false, addresses: undefined, error: message(error) };
    return {
      endpoint: clean,
      host,
      port,
      reachable: false,
      stages: { dns, tls: null, http: null },
      guidance: `Cannot resolve "${host}": check the hostname for typos and make sure its DNS record points at the Coolify server.`,
    };
  }

  let tls: NodeTlsStage | null = null;
  if (secure) {
    try {
      const check = await deps.checkTls(host, port, NODE_PROBE_TIMEOUT_MS);
      tls = {
        ok: check.authorized,
        authorized: check.authorized,
        error: check.authorized
          ? undefined
          : (check.authorizationError ?? "TLS is not authorized"),
        cert: check.cert,
      };
      if (!tls.ok) {
        return {
          endpoint: clean,
          host,
          port,
          reachable: false,
          stages: { dns, tls, http: null },
          guidance: `TLS verification failed for "${host}": check the node's certificate chain and that this server trusts its CA.`,
        };
      }
    } catch (error) {
      const detail = message(error);
      tls = {
        ok: false,
        authorized: undefined,
        error: detail,
        cert: undefined,
      };
      return {
        endpoint: clean,
        host,
        port,
        reachable: false,
        stages: { dns, tls, http: null },
        guidance: `TLS handshake with "${host}" failed (${detail}): check the node's certificate and that the port serves TLS.`,
      };
    }
  }

  let http: NodeHttpStage;
  try {
    const status = await deps.fetchStatus(clean, NODE_PROBE_TIMEOUT_MS);
    http = { ok: true, status, error: undefined };
  } catch (error) {
    const detail = message(error);
    http = { ok: false, status: undefined, error: detail };
    return {
      endpoint: clean,
      host,
      port,
      reachable: false,
      stages: { dns, tls, http },
      guidance: refusedOrTimedOut(detail)
        ? `Connection to "${host}:${port}" was refused or timed out: check that Coolify is listening there and that no firewall blocks it.`
        : `HTTP request to the endpoint failed (${detail}): check that Coolify is listening and serving this URL.`,
    };
  }

  return {
    endpoint: clean,
    host,
    port,
    reachable: true,
    stages: { dns, tls, http },
    guidance: secure
      ? "The Coolify endpoint is reachable."
      : "The endpoint is reachable over plain HTTP; prefer HTTPS so node traffic is encrypted.",
  };
}
