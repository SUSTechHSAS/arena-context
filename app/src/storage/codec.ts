/** Public upstream client-side format key, NOT authentication or a private credential. */
export const CLIENT_INTEGRITY_KEY = 'f_SECRET_KEY_FOR_CHINESE_DUNGEON';
export type DecodeWarning = (message: string, value: unknown, failure: unknown) => void;

/** Preserve native encodeURIComponent coercion/errors, including lone surrogates/Symbols. */
export function safeEncode(value: unknown): string {
  return btoa(unescape(encodeURIComponent(value as string)));
}

/** Main-game decoding warns and returns the original value/identity on failure. */
export function safeDecode(value: unknown, warn: DecodeWarning | null = (...args) => console.warn(...args)): unknown {
  try { return decodeURIComponent(escape(atob(value as string))); }
  catch (failure) {
    warn?.('Base64解码失败，返回原始字符串:', value, failure);
    return value;
  }
}

/** The standalone manager uses the same fallback but intentionally no warning. */
export function safeDecodeQuiet(value: unknown): unknown { return safeDecode(value, null); }

/** Exact original SHA-256(dataString + key), not HMAC or canonicalized JSON.
 * This establishes format compatibility only, never server-side trust.
 */
export async function generateSignature(value: unknown,
  subtle: Pick<SubtleCrypto, 'digest'> = globalThis.crypto.subtle): Promise<string> {
  const text = (value as string) + CLIENT_INTEGRITY_KEY;
  const bytes = new TextEncoder().encode(text);
  const hash = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
