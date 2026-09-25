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

async function run(cmd: string[], opts: { capture: true }): Promise<string>;
async function run(cmd: string[], opts?: { capture?: false }): Promise<void>;
async function run(cmd: string[], opts?: { capture?: boolean }): Promise<string | void> {
  const proc = Bun.spawn(cmd, {
    stdout: opts?.capture ? 'pipe' : 'ignore',
    stderr: 'ignore',
  });
  const [code, stdout] = await Promise.all([
    proc.exited,
    opts?.capture ? new Response(proc.stdout).text() : Promise.resolve(undefined),
  ]);
  if (code !== 0) {
    throw new Error(`${cmd[0] ?? 'command'} exited with code ${code}`);
  }
  return stdout;
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
  const output = await run(
    ['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'dpiWidth', '-g', 'dpiHeight', path],
    { capture: true },
  );
  return {
    pixelWidth: parseSipsValue(output, 'pixelWidth'),
    pixelHeight: parseSipsValue(output, 'pixelHeight'),
    dpiWidth: parseSipsValue(output, 'dpiWidth'),
    dpiHeight: parseSipsValue(output, 'dpiHeight'),
  };
}
