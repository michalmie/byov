// Live DNS + TLS probing from the server's network vantage. Stage logic
// stays pure over injectable deps so unit tests run offline; nodeDeps
// wires the real node:dns/tls/https implementations with timeouts.

import { promises as nodeDns } from "node:dns";
import https from "node:https";
import tls from "node:tls";

/** Per-stage network timeout for probes. */
export const PROBE_TIMEOUT_MS = 8000;

export interface TlsCert {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
}

export interface TlsCheck {
  authorized: boolean;
  authorizationError?: string;
  cert?: TlsCert;
}

export interface ProbeDeps {
  resolve4(host: string): Promise<string[]>;
  checkTls(host: string, port: number, timeoutMs: number): Promise<TlsCheck>;
  fetchStatus(host: string, port: number, timeoutMs: number): Promise<number>;
}

export interface DnsStage {
  ok: boolean;
  addresses?: string[];
  error?: string;
}

export interface TlsStage {
  ok: boolean;
  authorized?: boolean;
  authorizationError?: string;
  cert?: TlsCert;
  error?: string;
}

export interface HttpStage {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface ProbeResult {
  host: string;
  port: number;
  dns: DnsStage;
  tls: TlsStage | null;
  http: HttpStage | null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} timed out after ${PROBE_TIMEOUT_MS}ms`)),
      PROBE_TIMEOUT_MS,
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
): Promise<TlsCheck> {
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
  host: string,
  port: number,
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        host,
        port,
        servername: host,
        path: "/",
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

const nodeDeps: ProbeDeps = {
  resolve4: (host) => withTimeout(nodeDns.resolve4(host), "DNS lookup"),
  checkTls: checkTlsLive,
  fetchStatus: fetchStatusLive,
};

/**
 * Probe a hostname through DNS, TLS, and HTTP stages. Later stages run
 * only when earlier ones pass; every failure carries its evidence.
 */
export async function probeHost(
  host: string,
  port: number,
  deps: ProbeDeps = nodeDeps,
): Promise<ProbeResult> {
  let dns: DnsStage;
  try {
    const addresses = await deps.resolve4(host);
    dns = { ok: true, addresses, error: undefined };
  } catch (error) {
    dns = { ok: false, addresses: undefined, error: message(error) };
    return { host, port, dns, tls: null, http: null };
  }
  let tls: TlsStage;
  try {
    const check = await deps.checkTls(host, port, PROBE_TIMEOUT_MS);
    tls = {
      ok: check.authorized,
      authorized: check.authorized,
      authorizationError: check.authorizationError,
      cert: check.cert,
      error: check.authorized
        ? undefined
        : (check.authorizationError ?? "TLS is not authorized"),
    };
    if (!tls.ok) {
      return { host, port, dns, tls, http: null };
    }
  } catch (error) {
    tls = {
      ok: false,
      authorized: undefined,
      authorizationError: undefined,
      cert: undefined,
      error: message(error),
    };
    return { host, port, dns, tls, http: null };
  }
  let http: HttpStage;
  try {
    const status = await deps.fetchStatus(host, port, PROBE_TIMEOUT_MS);
    http = { ok: true, status, error: undefined };
  } catch (error) {
    http = { ok: false, status: undefined, error: message(error) };
  }
  return { host, port, dns, tls, http };
}
