import { describe, it, expect, beforeEach } from 'vitest';
import { parseEmail } from './index.js';
import { resetConfigForTesting } from '../config.js';
import { FINDY_SAMPLE_1 } from './__fixtures__/findySamples.js';
import { DOORKEEPER_SAMPLE_1 } from './__fixtures__/doorkeeperSamples.js';

describe('parseEmail', () => {
  beforeEach(() => {
    resetConfigForTesting();
  });

  it('Findyの送信元アドレスに対してパーサーを実行する', async () => {
    const result = await parseEmail(
      'support@findy-code.io',
      FINDY_SAMPLE_1.subject,
      FINDY_SAMPLE_1.body,
      'msg-1',
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.source).toBe('findy');
    expect(result![0]!.title).toBe(FINDY_SAMPLE_1.expected.title);
  });

  it('Name <email> 形式の送信元にも対応する', async () => {
    const result = await parseEmail(
      'Findy <support@findy-code.io>',
      FINDY_SAMPLE_1.subject,
      FINDY_SAMPLE_1.body,
      'msg-2',
    );

    expect(result).not.toBeNull();
    expect(result![0]!.source).toBe('findy');
  });

  it('Doorkeeperの送信元アドレスに対してパーサーを実行する', async () => {
    const result = await parseEmail(
      'info@doorkeeper.jp',
      DOORKEEPER_SAMPLE_1.subject,
      DOORKEEPER_SAMPLE_1.body,
      'msg-dk-1',
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.source).toBe('doorkeeper');
    expect(result![0]!.title).toBe(DOORKEEPER_SAMPLE_1.expected.title);
  });

  it('Doorkeeper Name <email> 形式の送信元にも対応する', async () => {
    const result = await parseEmail(
      'Doorkeeper <info@doorkeeper.jp>',
      DOORKEEPER_SAMPLE_1.subject,
      DOORKEEPER_SAMPLE_1.body,
      'msg-dk-2',
    );

    expect(result).not.toBeNull();
    expect(result![0]!.source).toBe('doorkeeper');
  });

  it('未対応の送信元にはnullを返す（ANTHROPIC_API_KEY未設定時）', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    resetConfigForTesting();

    const result = await parseEmail('unknown@example.com', '件名', '本文', 'msg-3');

    expect(result).toBeNull();

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
    resetConfigForTesting();
  });
});
