import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface PixelInfo {
  pixelWidth: number;
  pixelHeight: number;
  dpiWidth: number;
  dpiHeight: number;
}

export interface NormalizedSize {
  width: number;
  height: number;
}

export function parseSipsValue(output: string, property: string): number {
  const match = new RegExp(`${property}:\\s*([0-9.]+)`).exec(output);
  if (match === null || match[1] === undefined) {
    throw new Error(`failed to parse ${property} from sips output`);
  }
  return parseFloat(match[1]);
}

export function computeNormalizedSize(info: PixelInfo): NormalizedSize | null {
  if (info.dpiWidth <= 72 || info.dpiHeight <= 72) return null;
  return {
    // sips -z takes whole pixels and rejects 0.
    width: Math.max(1, Math.round((info.pixelWidth * 72) / info.dpiWidth)),
    height: Math.max(1, Math.round((info.pixelHeight * 72) / info.dpiHeight)),
  };
}

/** Runs a command and throws if it exits non-zero. Output is discarded. */
async function run(cmd: string[]): Promise<void> {
  await spawnChecked(cmd, 'ignore').checked;
}

/** Runs a command, throws if it exits non-zero, and returns its stdout. */
async function runCapture(cmd: string[]): Promise<string> {
  const proc = spawnChecked(cmd, 'pipe');
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.checked]);
  return stdout;
}

function spawnChecked<S extends 'pipe' | 'ignore'>(cmd: string[], stdout: S) {
  const proc = Bun.spawn(cmd, { stdout, stderr: 'ignore' });
  const checked = proc.exited.then((code) => {
    if (code !== 0) {
      throw new Error(`${cmd[0] ?? 'command'} exited with code ${code}`);
    }
  });
  return Object.assign(proc, { checked });
}

type CaptureOutcome = 'captured' | 'cancelled';

/**
 * Classifies a finished `screencapture -i`.
 *
 * Pressing Esc (or clicking away) ends it with exit code 0 and no file, which is
 * a normal cancel, not an error. Only a non-zero exit is a failure.
 */
export function interpretCapture(exitCode: number, fileExists: boolean): CaptureOutcome {
  if (exitCode !== 0) {
    throw new Error(`screencapture exited with code ${exitCode}`);
  }
  return fileExists ? 'captured' : 'cancelled';
}

/** Captures a region interactively. Returns `null` when the user cancels. */
export async function captureInteractive(): Promise<string | null> {
  const tmpfile = join(tmpdir(), `refrain-${process.pid}-${Date.now()}.png`);
  const exitCode = await Bun.spawn(['screencapture', '-i', tmpfile]).exited;
  const fileExists = await Bun.file(tmpfile).exists();
  try {
    return interpretCapture(exitCode, fileExists) === 'captured' ? tmpfile : null;
  } catch (err) {
    // A failed run may still have written the screenshot; do not leave it behind.
    if (fileExists) await unlink(tmpfile).catch(() => undefined);
    throw err;
  }
}

export async function normalizeDpi(path: string): Promise<void> {
  await run(['sips', '-d', 'profile', '--deleteColorManagementProperties', path]);
  const info = await readPixelInfo(path);
  const normalized = computeNormalizedSize(info);
  if (normalized === null) return;
  await run([
    'sips',
    '-s',
    'dpiWidth',
    '72',
    '-s',
    'dpiHeight',
    '72',
    '-z',
    String(normalized.height),
    String(normalized.width),
    path,
  ]);
}

async function readPixelInfo(path: string): Promise<PixelInfo> {
  const output = await runCapture([
    'sips',
    '-g',
    'pixelWidth',
    '-g',
    'pixelHeight',
    '-g',
    'dpiWidth',
    '-g',
    'dpiHeight',
    path,
  ]);
  return {
    pixelWidth: parseSipsValue(output, 'pixelWidth'),
    pixelHeight: parseSipsValue(output, 'pixelHeight'),
    dpiWidth: parseSipsValue(output, 'dpiWidth'),
    dpiHeight: parseSipsValue(output, 'dpiHeight'),
  };
}
