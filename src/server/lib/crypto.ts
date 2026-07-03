import crypto from "crypto";
import { env } from "./env";

/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 * Key comes from TOKEN_ENCRYPTION_KEY (32 chars). Output format:
 *   base64(iv).base64(authTag).base64(ciphertext)
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  // Accept a 32-char/32-byte key directly, otherwise derive 32 bytes via sha256.
  if (Buffer.byteLength(raw) === 32) return Buffer.from(raw);
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptToken(payload: string): string {
  if (!payload) return "";
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  const decipher = crypto.createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
