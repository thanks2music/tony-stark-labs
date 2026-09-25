import { chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Config {
  endpoint: string;
  tokenPath: string;
}

export const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'refrain');
export const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, 'config.json');
export const DEFAULT_ENDPOINT = 'https://{DOMAIN}/apps/refrain/upload';
export const DEFAULT_TOKEN_PATH = join(DEFAULT_CONFIG_DIR, 'token');

export function expandHome(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

function validateConfig(raw: unknown, source: string): Config {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${source}: expected a JSON object`);
  }
  const { endpoint, tokenPath } = raw as Partial<Config>;
  if (typeof endpoint !== 'string' || endpoint === '') {
    throw new Error(`${source}: missing string field "endpoint"`);
  }
  if (typeof tokenPath !== 'string' || tokenPath === '') {
    throw new Error(`${source}: missing string field "tokenPath"`);
  }
  return { endpoint, tokenPath };
}

export async function readConfig(path: string): Promise<Config | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const raw: unknown = await file.json();
  return validateConfig(raw, path);
}

export async function writeConfig(path: string, config: Config): Promise<void> {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  await Bun.write(path, `${JSON.stringify(config, null, 2)}\n`);
  chmodSync(path, 0o600);
}

export async function readToken(tokenPath: string): Promise<string> {
  const expanded = expandHome(tokenPath);
  const file = Bun.file(expanded);
  if (!(await file.exists())) {
    throw new Error(`token file not found: ${expanded}`);
  }
  const token = (await file.text()).trim();
  if (token === '') {
    throw new Error(`token file is empty: ${expanded}`);
  }
  return token;
}
