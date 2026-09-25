import { describe, expect, it } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expandHome, readConfig, readToken, writeConfig } from '../src/config';
import { useTempDir } from './helpers';

describe('expandHome', () => {
  it('expands a leading ~/ to the user home directory', () => {
    expect(expandHome('~/foo/bar')).toBe(join(homedir(), 'foo/bar'));
  });

  it('leaves absolute paths untouched', () => {
    expect(expandHome('/etc/passwd')).toBe('/etc/passwd');
  });

  it('leaves relative paths untouched', () => {
    expect(expandHome('foo/bar')).toBe('foo/bar');
  });

  it('does not expand ~user form', () => {
    expect(expandHome('~alice/docs')).toBe('~alice/docs');
  });
});

describe('readConfig', () => {
  const tmp = useTempDir('refrain-config-');

  it('returns null when the file does not exist', async () => {
    expect(await readConfig(join(tmp.path, 'missing.json'))).toBeNull();
  });

  it('returns a parsed Config for valid JSON', async () => {
    const path = join(tmp.path, 'config.json');
    writeFileSync(path, JSON.stringify({ endpoint: 'https://e', tokenPath: '~/.t' }));
    expect(await readConfig(path)).toEqual({
      endpoint: 'https://e',
      tokenPath: '~/.t',
    });
  });

  it('throws when endpoint is missing', async () => {
    const path = join(tmp.path, 'config.json');
    writeFileSync(path, JSON.stringify({ tokenPath: '~/.t' }));
    await expect(readConfig(path)).rejects.toThrow(/endpoint/);
  });

  it('throws when tokenPath is an empty string', async () => {
    const path = join(tmp.path, 'config.json');
    writeFileSync(path, JSON.stringify({ endpoint: 'https://e', tokenPath: '' }));
    await expect(readConfig(path)).rejects.toThrow(/tokenPath/);
  });

  it('throws when the JSON root is not an object', async () => {
    const path = join(tmp.path, 'config.json');
    writeFileSync(path, JSON.stringify('a string'));
    await expect(readConfig(path)).rejects.toThrow(/JSON object/);
  });
});

describe('writeConfig', () => {
  const tmp = useTempDir('refrain-config-');

  it('writes parseable JSON', async () => {
    const path = join(tmp.path, 'config.json');
    const config = { endpoint: 'https://example.test/upload', tokenPath: '~/.token' };
    await writeConfig(path, config);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(config);
  });

  it('creates missing parent directories', async () => {
    const path = join(tmp.path, 'a', 'b', 'c', 'config.json');
    const config = { endpoint: 'x', tokenPath: 'y' };
    await writeConfig(path, config);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(config);
  });

  it('roundtrips through readConfig', async () => {
    const path = join(tmp.path, 'config.json');
    const config = { endpoint: 'https://e', tokenPath: '/abs/token' };
    await writeConfig(path, config);
    expect(await readConfig(path)).toEqual(config);
  });
});

describe('readToken', () => {
  const tmp = useTempDir('refrain-token-');

  it('returns the trimmed token', async () => {
    const path = join(tmp.path, 'token');
    writeFileSync(path, '  my-secret-token\n');
    expect(await readToken(path)).toBe('my-secret-token');
  });

  it('throws when the file is missing', async () => {
    await expect(readToken(join(tmp.path, 'nope'))).rejects.toThrow(/not found/);
  });

  it('throws when the file is empty', async () => {
    const path = join(tmp.path, 'token');
    writeFileSync(path, '');
    await expect(readToken(path)).rejects.toThrow(/empty/);
  });

  it('throws when the file is whitespace-only', async () => {
    const path = join(tmp.path, 'token');
    writeFileSync(path, '   \n\t ');
    await expect(readToken(path)).rejects.toThrow(/empty/);
  });
});
