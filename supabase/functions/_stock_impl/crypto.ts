// AES-256-GCM decryption compatible with Node's createCipheriv output
// (ciphertext, iv, authTag stored separately).
// Deno's WebCrypto expects ciphertext||authTag, so we concatenate before decrypt.

export async function decryptApiKey(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  masterKeyBase64: string
): Promise<string> {
  const rawKey = base64ToBytes(masterKeyBase64);
  if (rawKey.length !== 32) {
    throw new Error(`APP_ENCRYPTION_KEY must be 32 bytes (base64). Got ${rawKey.length}.`);
  }

  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);

  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    combined
  );
  return new TextDecoder().decode(plainBuf);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Supabase returns bytea as "\x" hex-prefixed string over PostgREST JSON.
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('\\x') ? hex.slice(2) : hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Invalid hex length for bytea.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
