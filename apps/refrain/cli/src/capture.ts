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
    width: (info.pixelWidth * 72) / info.dpiWidth,
    height: (info.pixelHeight * 72) / info.dpiHeight,
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

export async function captureInteractive(): Promise<string> {
  const tmpfile = join(tmpdir(), `refrain-${process.pid}-${Date.now()}.png`);
  const proc = Bun.spawn(['screencapture', '-i', tmpfile]);
  await proc.exited;
  const file = Bun.file(tmpfile);
  if (!(await file.exists())) {
    throw new Error('screencapture cancelled or failed');
  }
  return tmpfile;
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
