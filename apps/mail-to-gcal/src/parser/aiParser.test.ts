import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWithAI } from './aiParser.js';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

describe('parseWithAI', () => {
  const messageId = 'test-ai-msg';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('単一イベントを正しくパースする', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              title: 'テストイベント',
              startDateTime: '2026-04-07T19:00:00+09:00',
              durationMinutes: 90,
              url: 'https://example.com/event',
            },
          ]),
        },
      ],
    });

    const result = await parseWithAI('テスト件名', 'テスト本文', messageId);

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('テストイベント');
    expect(result[0]!.durationMinutes).toBe(90);
    expect(result[0]!.url).toBe('https://example.com/event');
    expect(result[0]!.source).toBe('ai');
    expect(result[0]!.messageId).toBe(messageId);
  });

  it('複数イベント（マルチDay）を正しくパースする', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              title: 'カンファレンス Day1',
              startDateTime: '2026-04-23T17:00:00+09:00',
              durationMinutes: 180,
              url: 'https://example.com/day1',
            },
            {
              title: 'カンファレンス Day2',
              startDateTime: '2026-04-24T17:00:00+09:00',
              durationMinutes: 180,
              url: 'https://example.com/day2',
            },
          ]),
        },
      ],
    });

    const result = await parseWithAI('カンファレンス', '本文', messageId);

    expect(result).toHaveLength(2);
    expect(result[0]!.title).toBe('カンファレンス Day1');
    expect(result[1]!.title).toBe('カンファレンス Day2');
    expect(result[0]!.source).toBe('ai');
    expect(result[1]!.source).toBe('ai');
  });

  it('イベントが見つからない場合は空配列を返す', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[]' }],
    });

    const result = await parseWithAI('通常のメール', '特にイベントなし', messageId);

    expect(result).toHaveLength(0);
  });

  it('URLがない場合はurl=undefinedで成功する', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              title: 'オフラインイベント',
              startDateTime: '2026-05-01T13:00:00+09:00',
              durationMinutes: 120,
            },
          ]),
        },
      ],
    });

    const result = await parseWithAI('オフライン', '本文', messageId);

    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBeUndefined();
  });

  it('durationMinutesが未指定の場合はデフォルト60分になる', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              title: '時間不明イベント',
              startDateTime: '2026-05-01T13:00:00+09:00',
            },
          ]),
        },
      ],
    });

    const result = await parseWithAI('件名', '本文', messageId);

    expect(result[0]!.durationMinutes).toBe(60);
  });

  it('```json ... ``` でラップされたレスポンスを正しくパースする', async () => {
    const json = JSON.stringify([
      {
        title: 'ラップされたイベント',
        startDateTime: '2026-05-01T19:00:00+09:00',
        durationMinutes: 60,
      },
    ]);
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: `\`\`\`json\n${json}\n\`\`\`` }],
    });

    const result = await parseWithAI('件名', '本文', messageId);

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('ラップされたイベント');
  });
});
