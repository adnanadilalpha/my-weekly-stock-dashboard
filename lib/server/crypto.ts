import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/crypto.ts imported from a browser context.');
}

/**
 * AES-256-GCM encryption for API keys.
 * Master key lives in APP_ENCRYPTION_KEY env var (base64, 32 raw bytes).
 * Never log or expose the master key; never return plaintext to clients.
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;         // 96-bit IV, recommended for GCM
const TAG_LEN = 16;
const KEY_LEN = 32;

let cachedKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('APP_ENCRYPTION_KEY env var is required for API key encryption.');
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `APP_ENCRYPTION_KEY must be base64 of ${KEY_LEN} raw bytes; got ${buf.length} bytes.`
    );
  }
  cachedKey = buf;
  return buf;
}

export type EncryptedBlob = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

export function encrypt(plaintext: string): EncryptedBlob {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  if (authTag.length !== TAG_LEN) {
    throw new Error('Unexpected auth tag length from GCM cipher.');
  }
  return { ciphertext, iv, authTag };
}

export function decrypt(blob: EncryptedBlob): string {
  const key = getMasterKey();
  const decipher = createDecipheriv(ALGO, key, blob.iv);
  decipher.setAuthTag(blob.authTag);
  const plain = Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

/** UI-safe fingerprint hint: first 3 + last 4 of the key, middle masked. */
export function fingerprint(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (trimmed.length <= 8) return '•'.repeat(trimmed.length);
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`;
}
