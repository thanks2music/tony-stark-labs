#!/usr/bin/env bun
import { unlink } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { captureInteractive, normalizeDpi } from './capture';
import {
  assertUsableEndpoint,
  DEFAULT_CONFIG_PATH,
  DEFAULT_TOKEN_PATH,
  ENDPOINT_ENV_VAR,
  readConfig,
  readToken,
  resolveEndpoint,
  writeConfig,
  type Config,
} from './config';
import { uploadImage } from './upload';

const HELP_TEXT = `Usage: refrain [FILE] [options]

Capture a screenshot interactively (or upload FILE if provided),
send it to your configured endpoint, and copy the resulting URL
to the clipboard.

Arguments:
  FILE            Optional path to an existing image to upload.

Options:
  --open          Open the uploaded URL in the default browser.
  --no-copy       Do not copy the URL to the clipboard.
  -h, --help      Show this help message.

Environment:
  REFRAIN_ENDPOINT  Worker upload endpoint. Takes precedence over the
                    config file; set it to skip the first-run prompt.

Config: ~/.config/refrain/config.json (created on first run).`;

interface CliOptions {
  open: boolean;
  noCopy: boolean;
  file: string | undefined;
}

function parseCliArgs(argv: string[]): CliOptions | 'help' {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      open: { type: 'boolean', default: false },
      'no-copy': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  if (values.help) return 'help';
  return {
    open: values.open ?? false,
    noCopy: values['no-copy'] ?? false,
    file: positionals[0],
  };
}

async function loadConfigInteractively(): Promise<Config> {
  const existing = await readConfig(DEFAULT_CONFIG_PATH);
  const endpoint = resolveEndpoint(process.env, existing?.endpoint);

  // An endpoint from the environment wins without rewriting the stored config.
  if (endpoint !== null && existing !== null) return { ...existing, endpoint };
  if (endpoint !== null && existing === null) {
    return { endpoint, tokenPath: DEFAULT_TOKEN_PATH };
  }

  console.error(`No config found at ${DEFAULT_CONFIG_PATH}. Creating one interactively.`);
  console.error(`(set ${ENDPOINT_ENV_VAR} to skip this prompt)\n`);
  const entered = assertUsableEndpoint((prompt('Worker upload endpoint:') ?? '').trim());
  if (entered === '') {
    throw new Error(`no endpoint provided — set ${ENDPOINT_ENV_VAR} or answer the prompt`);
  }
  const tokenPath = (prompt('Token file path:', DEFAULT_TOKEN_PATH) ?? DEFAULT_TOKEN_PATH).trim();
  const config: Config = { endpoint: entered, tokenPath };

  await writeConfig(DEFAULT_CONFIG_PATH, config);
  console.error(`\nConfig saved to ${DEFAULT_CONFIG_PATH}.\n`);
  return config;
}

async function copyToClipboard(text: string): Promise<void> {
  const proc = Bun.spawn(['pbcopy'], { stdin: 'pipe' });
  await proc.stdin.write(text);
  await proc.stdin.end();
  await proc.exited;
}

async function openInBrowser(url: string): Promise<void> {
  const proc = Bun.spawn(['open', url]);
  await proc.exited;
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (parsed === 'help') {
    console.log(HELP_TEXT);
    return 0;
  }

  if (process.platform !== 'darwin') {
    throw new Error('refrain currently supports macOS only');
  }

  const config = await loadConfigInteractively();
  const token = await readToken(config.tokenPath);

  let imagePath: string;
  let captured = false;
  if (parsed.file !== undefined) {
    imagePath = parsed.file;
  } else {
    imagePath = await captureInteractive();
    captured = true;
    await normalizeDpi(imagePath);
  }

  try {
    const url = await uploadImage({
      filePath: imagePath,
      endpoint: config.endpoint,
      token,
    });

    if (!parsed.noCopy) await copyToClipboard(url);
    if (parsed.open) await openInBrowser(url);

    console.log(url);
    return 0;
  } finally {
    if (captured) {
      await unlink(imagePath).catch(() => undefined);
    }
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`refrain: ${message}`);
    process.exit(1);
  },
);
