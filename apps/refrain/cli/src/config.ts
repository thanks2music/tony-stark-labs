import { chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Config {
  endpoint: string;
  tokenPath: string;
}

export const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'refrain');
export const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, 'config.json');
export const DEFAULT_TOKEN_PATH = join(DEFAULT_CONFIG_DIR, 'token');

/**
 * Environment variable that overrides the configured upload endpoint.
 *
 * The Worker URL is deliberately absent from this repository, so there is no
 * compiled-in default: the endpoint comes from this variable, from the config
 * file, or from an interactive prompt (see `src/index.ts`).
 */
export const ENDPOINT_ENV_VAR = 'REFRAIN_ENDPOINT';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Validates the upload endpoint and returns it unchanged.
 *
 * It must be an `https:` URL, because the upload token travels in the request
 * header. `http:` is allowed only for `localhost` and `127.0.0.1`, so that
 * `wrangler dev` still works. URL parsing accepts `{DOMAIN}` as a hostname, so the
 * placeholder left from the docs is rejected by an explicit brace check.
 */
export function parseEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`endpoint is not a valid URL: ${raw}`);
  }
  if (url.hostname.includes('{') || url.hostname.includes('}')) {
    throw new Error(`endpoint still contains a placeholder: ${raw}`);
  }
  const isLocalHttp = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error(
      `endpoint must use https (http is allowed only for localhost and 127.0.0.1): ${raw}`,
    );
  }
  return raw;
}

/**
 * Resolves the upload endpoint from the environment, then the config file.
 *
 * Returns `null` when neither source supplies one, leaving the caller to prompt.
 * Prompting stays in `src/index.ts` so that importing this module never blocks
 * on stdin.
 */
export function resolveEndpoint(
  env: Record<string, string | undefined>,
  configEndpoint: string | undefined,
): string | null {
  for (const candidate of [env[ENDPOINT_ENV_VAR], configEndpoint]) {
    const trimmed = candidate?.trim();
    if (trimmed !== undefined && trimmed !== '') return parseEndpoint(trimmed);
  }
  return null;
}

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
