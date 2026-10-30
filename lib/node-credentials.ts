/**
 * Per-node provider credentials: Coolify API tokens saved in
 * Settings → Nodes, kept apart from public node documents.
 *
 * Tokens are encrypted at rest (AES-256-GCM, key derived from
 * AUTH_SECRET) and only decrypted server-side when the adapter
 * calls the node. The browser only ever sees `hasApiToken`.
 * Resolution order: saved node token → per-node env token →
 * shared COOLIFY_API_TOKEN (operator fallback).
 *
 * Node-only: never import from middleware (Edge) or client code.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import "@/db/migrations/0007_node_credentials";
import { query, queryOne } from "@/lib/db";
import { coolifyTokenFor } from "./coolify-adapter";

function encryptionKey(): Buffer {
  const secret = (process.env.AUTH_SECRET ?? "").trim() || "dev-only-insecure-secret";
  return createHash("sha256").update(`byov-node-credentials:${secret}`).digest();
}

/** Encrypt a token for storage. Format: iv.tag.cipher (base64). */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, body].map((b) => b.toString("base64")).join(".");
}

/** Decrypt a stored token; null when corrupt or key changed. */
export function decryptToken(stored: string): string | null {
  try {
    const [ivB64, tagB64, bodyB64] = stored.split(".");
    if (!ivB64 || !tagB64 || !bodyB64) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(bodyB64, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/** Save (or replace) the token for one node slug. */
export async function saveNodeToken(slug: string, token: string): Promise<void> {
  await query(
    `INSERT INTO workspace_node_credentials (slug, ciphertext) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = now()`,
    [slug, encryptToken(token.trim())],
  );
}

/** Remove the saved token for one node slug. */
export async function deleteNodeToken(slug: string): Promise<void> {
  await query("DELETE FROM workspace_node_credentials WHERE slug = $1", [slug]);
}

/** Saved token for a node, decrypted; null when none/corrupt. */
export async function getSavedNodeToken(slug: string): Promise<string | null> {
  const row = await queryOne<{ ciphertext: string }>(
    "SELECT ciphertext FROM workspace_node_credentials WHERE slug = $1",
    [slug],
  );
  return row ? decryptToken(row.ciphertext) : null;
}

/** Slugs that have a saved token (for hasApiToken enrichment). */
export async function listTokenSlugs(): Promise<Set<string>> {
  try {
    const rows = await query<{ slug: string }>(
      "SELECT slug FROM workspace_node_credentials",
    );
    return new Set(rows.map((r) => r.slug));
  } catch {
    // Older fakes/deployments without the table: no saved tokens.
    return new Set();
  }
}

/**
 * Effective Coolify token for a node: Settings-saved wins, then the
 * env fallbacks (per-node, then shared). Empty string means none.
 */
export async function resolveNodeToken(slug: string): Promise<string> {
  try {
    const saved = await getSavedNodeToken(slug);
    if (saved) return saved;
  } catch {
    // Fall through to env tokens when the store is unavailable.
  }
  return coolifyTokenFor(slug);
}
