export async function computeObjectKey(bytes: ArrayBuffer | ArrayBufferView): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 32);
}
