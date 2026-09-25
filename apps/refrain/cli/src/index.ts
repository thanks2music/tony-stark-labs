#!/usr/bin/env bun
import { unlink } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { captureInteractive, normalizeDpi } from './capture';
import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_ENDPOINT,
  DEFAULT_TOKEN_PATH,
  readConfig,
  readToken,
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
  if (existing !== null) return existing;

  console.error(`No config found at ${DEFAULT_CONFIG_PATH}. Creating one interactively.\n`);
  const endpoint = (prompt('Worker upload endpoint:', DEFAULT_ENDPOINT) ?? DEFAULT_ENDPOINT).trim();
  if (endpoint.includes('{DOMAIN}')) {
    throw new Error(
      'endpoint still contains the "{DOMAIN}" placeholder — replace it with your actual Worker URL (e.g. https://example.com/apps/refrain/upload).',
    );
  }
  const tokenPath = (prompt('Token file path:', DEFAULT_TOKEN_PATH) ?? DEFAULT_TOKEN_PATH).trim();
  const config: Config = { endpoint, tokenPath };

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
