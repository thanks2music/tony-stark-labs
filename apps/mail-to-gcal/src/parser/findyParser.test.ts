import { describe, it, expect } from 'vitest';
import { parseFindyEmail } from './findyParser.js';
import { FINDY_SAMPLE_1, FINDY_SAMPLE_2, FINDY_SAMPLE_3 } from './__fixtures__/findySamples.js';

describe('parseFindyEmail', () => {
  const messageId = 'test-message-id';

  it('サンプル1: オンボーディングイベントを正しくパースする', () => {
    const result = parseFindyEmail(FINDY_SAMPLE_1.subject, FINDY_SAMPLE_1.body, messageId);

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe(FINDY_SAMPLE_1.expected.title);
    expect(result[0]!.startDateTime).toBe(FINDY_SAMPLE_1.expected.startDateTime);
    expect(result[0]!.url).toBe(FINDY_SAMPLE_1.expected.url);
    expect(result[0]!.source).toBe('findy');
    expect(result[0]!.durationMinutes).toBe(60);
    expect(result[0]!.messageId).toBe(messageId);
  });

  it('サンプル2: Claude Code Skillsイベントを正しくパースする', () => {
    const result = parseFindyEmail(FINDY_SAMPLE_2.subject, FINDY_SAMPLE_2.body, messageId);

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe(FINDY_SAMPLE_2.expected.title);
    expect(result[0]!.startDateTime).toBe(FINDY_SAMPLE_2.expected.startDateTime);
    expect(result[0]!.url).toBe(FINDY_SAMPLE_2.expected.url);
    expect(result[0]!.source).toBe('findy');
  });

  it('サンプル3: dotfilesイベントを正しくパースする', () => {
    const result = parseFindyEmail(FINDY_SAMPLE_3.subject, FINDY_SAMPLE_3.body, messageId);

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe(FINDY_SAMPLE_3.expected.title);
    expect(result[0]!.startDateTime).toBe(FINDY_SAMPLE_3.expected.startDateTime);
    expect(result[0]!.url).toBe(FINDY_SAMPLE_3.expected.url);
    expect(result[0]!.source).toBe('findy');
  });

  it('開催日時がない場合はエラーを投げる', () => {
    const bodyWithoutDate = `■ イベント名
テストイベント
■ 視聴用URL
https://example.com`;

    expect(() => parseFindyEmail('テスト件名', bodyWithoutDate, messageId)).toThrow(
      '開催日時セクションが見つかりませんでした',
    );
  });

  it('視聴用URLがない場合はurl=undefinedで成功する', () => {
    const bodyWithoutUrl = `■ イベント名
テストイベント
■ 開催日時
2026年04月01日 19:00〜`;

    const result = parseFindyEmail('テスト件名', bodyWithoutUrl, messageId);

    expect(result[0]!.title).toBe('テストイベント');
    expect(result[0]!.url).toBeUndefined();
  });

  it('イベント名セクションがない場合は件名からフォールバック抽出する', () => {
    const bodyWithoutTitle = `■ 開催日時
2026年04月01日 19:00〜
■ 視聴用URL
https://example.com`;

    const result = parseFindyEmail(
      'イベントに関するメッセージ「フォールバックイベント」【Findy】',
      bodyWithoutTitle,
      messageId,
    );

    expect(result[0]!.title).toBe('フォールバックイベント');
  });

  it('イベント名が本文にも件名にもない場合はエラーを投げる', () => {
    const bodyWithoutTitle = `■ 開催日時
2026年04月01日 19:00〜`;

    expect(() => parseFindyEmail('件名にイベント名なし', bodyWithoutTitle, messageId)).toThrow(
      'イベント名を抽出できませんでした',
    );
  });
});
