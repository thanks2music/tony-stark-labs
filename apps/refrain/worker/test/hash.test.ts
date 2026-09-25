import { describe, expect, it } from 'vitest';
import { computeObjectKey } from '../src/hash';

describe('computeObjectKey', () => {
  it('returns the first 32 hex chars of SHA-256', async () => {
    const empty = await computeObjectKey(new ArrayBuffer(0));
    expect(empty).toMatch(/^[0-9a-f]{32}$/);
    expect(empty).toBe('e3b0c44298fc1c149afbf4c8996fb924');
  });

  it('is deterministic for identical input', async () => {
    const bytes = new TextEncoder().encode('hello world');
    const a = await computeObjectKey(bytes);
    const b = await computeObjectKey(bytes);
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it('produces different hashes for different input', async () => {
    const a = await computeObjectKey(new TextEncoder().encode('a'));
    const b = await computeObjectKey(new TextEncoder().encode('b'));
    expect(a).not.toBe(b);
  });
});
