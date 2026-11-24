import { afterEach, beforeEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function useTempDir(prefix: string): { readonly path: string } {
  const ref = { path: '' };
  beforeEach(() => {
    ref.path = mkdtempSync(join(tmpdir(), prefix));
  });
  afterEach(() => {
    if (ref.path !== '') rmSync(ref.path, { recursive: true, force: true });
  });
  return ref;
}
