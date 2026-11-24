import { describe, expect, it } from 'bun:test';
import { computeNormalizedSize, interpretCapture, parseSipsValue } from '../src/capture';

describe('parseSipsValue', () => {
  it('parses an integer value', () => {
    expect(parseSipsValue('pixelWidth: 1280', 'pixelWidth')).toBe(1280);
  });

  it('parses a decimal value', () => {
    expect(parseSipsValue('dpiWidth: 144.0', 'dpiWidth')).toBe(144);
  });

  it('parses from a multiline sips block', () => {
    const output = [
      '/tmp/image.png',
      '  pixelWidth: 2560',
      '  pixelHeight: 1440',
      '  dpiWidth: 144.000',
      '  dpiHeight: 144.000',
    ].join('\n');
    expect(parseSipsValue(output, 'pixelWidth')).toBe(2560);
    expect(parseSipsValue(output, 'pixelHeight')).toBe(1440);
    expect(parseSipsValue(output, 'dpiWidth')).toBe(144);
    expect(parseSipsValue(output, 'dpiHeight')).toBe(144);
  });

  it('throws when the property is absent', () => {
    expect(() => parseSipsValue('only: 42', 'pixelWidth')).toThrow(/pixelWidth/);
  });
});

describe('computeNormalizedSize', () => {
  it('returns null when both DPIs are exactly 72', () => {
    expect(
      computeNormalizedSize({
        pixelWidth: 1280,
        pixelHeight: 720,
        dpiWidth: 72,
        dpiHeight: 72,
      }),
    ).toBeNull();
  });

  it('returns null when any DPI is below 72', () => {
    expect(
      computeNormalizedSize({
        pixelWidth: 800,
        pixelHeight: 600,
        dpiWidth: 50,
        dpiHeight: 50,
      }),
    ).toBeNull();
  });

  it('scales a 2x Retina capture (144 dpi) to logical pixels', () => {
    expect(
      computeNormalizedSize({
        pixelWidth: 2560,
        pixelHeight: 1440,
        dpiWidth: 144,
        dpiHeight: 144,
      }),
    ).toEqual({ width: 1280, height: 720 });
  });

  it('scales a 3x Retina capture (216 dpi)', () => {
    const result = computeNormalizedSize({
      pixelWidth: 3240,
      pixelHeight: 2160,
      dpiWidth: 216,
      dpiHeight: 216,
    });
    expect(result).toEqual({ width: 1080, height: 720 });
  });

  it('rounds fractional sizes to whole pixels for sips -z', () => {
    expect(
      computeNormalizedSize({
        pixelWidth: 1235,
        pixelHeight: 801,
        dpiWidth: 144,
        dpiHeight: 144,
      }),
    ).toEqual({ width: 618, height: 401 });
  });

  it('never rounds a side down to 0 pixels, which sips -z rejects', () => {
    expect(
      computeNormalizedSize({
        pixelWidth: 1,
        pixelHeight: 400,
        dpiWidth: 216,
        dpiHeight: 216,
      }),
    ).toEqual({ width: 1, height: 133 });
  });

  it('handles asymmetric DPI on each axis', () => {
    expect(
      computeNormalizedSize({
        pixelWidth: 2560,
        pixelHeight: 1440,
        dpiWidth: 144,
        dpiHeight: 96,
      }),
    ).toEqual({ width: 1280, height: 1080 });
  });
});

describe('interpretCapture', () => {
  it('is captured when screencapture exits 0 and wrote the file', () => {
    expect(interpretCapture(0, true)).toBe('captured');
  });

  it('is cancelled when screencapture exits 0 without a file (Esc or a click away)', () => {
    expect(interpretCapture(0, false)).toBe('cancelled');
  });

  it('throws when screencapture exits non-zero', () => {
    expect(() => interpretCapture(1, false)).toThrow(/screencapture exited with code 1/);
  });
});
