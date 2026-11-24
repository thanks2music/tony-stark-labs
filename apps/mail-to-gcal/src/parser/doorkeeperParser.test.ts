import { describe, it, expect } from 'vitest';
import { parseDoorkeeperEmail } from './doorkeeperParser.js';
import {
  DOORKEEPER_SAMPLE_1,
  DOORKEEPER_SAMPLE_2_OFFLINE,
} from './__fixtures__/doorkeeperSamples.js';

const MESSAGE_ID = 'doorkeeper-test-msg';

describe('parseDoorkeeperEmail', () => {
  it('オンラインイベントのタイトル・日時・URL・durationを正しく抽出する', () => {
    const result = parseDoorkeeperEmail(
      DOORKEEPER_SAMPLE_1.subject,
      DOORKEEPER_SAMPLE_1.body,
      MESSAGE_ID,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe(DOORKEEPER_SAMPLE_1.expected.title);
    expect(result[0]!.startDateTime).toBe(DOORKEEPER_SAMPLE_1.expected.startDateTime);
    expect(result[0]!.durationMinutes).toBe(DOORKEEPER_SAMPLE_1.expected.durationMinutes);
    expect(result[0]!.url).toBe(DOORKEEPER_SAMPLE_1.expected.url);
    expect(result[0]!.source).toBe('doorkeeper');
  });

  it('「」からイベント名を抽出する', () => {
    const result = parseDoorkeeperEmail(
      DOORKEEPER_SAMPLE_1.subject,
      DOORKEEPER_SAMPLE_1.body,
      MESSAGE_ID,
    );

    expect(result[0]!.title).toBe(
      '【CeeBeeDee】Claude Codeとフロントエンド開発 ──全社員がAIエージェントを活用するUbieの実践事例／鹿野 壮',
    );
  });

  it('開始・終了時刻からdurationMinutesを計算する（120分）', () => {
    const result = parseDoorkeeperEmail(
      DOORKEEPER_SAMPLE_1.subject,
      DOORKEEPER_SAMPLE_1.body,
      MESSAGE_ID,
    );

    expect(result[0]!.durationMinutes).toBe(120);
  });

  it('オフラインイベントではURLがundefinedになる', () => {
    const result = parseDoorkeeperEmail(
      DOORKEEPER_SAMPLE_2_OFFLINE.subject,
      DOORKEEPER_SAMPLE_2_OFFLINE.body,
      MESSAGE_ID,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe(DOORKEEPER_SAMPLE_2_OFFLINE.expected.title);
    expect(result[0]!.url).toBeUndefined();
    expect(result[0]!.durationMinutes).toBe(180);
  });

  it("sourceが'doorkeeper'、messageIdが正しくセットされる", () => {
    const result = parseDoorkeeperEmail(
      DOORKEEPER_SAMPLE_1.subject,
      DOORKEEPER_SAMPLE_1.body,
      MESSAGE_ID,
    );

    expect(result[0]!.source).toBe('doorkeeper');
    expect(result[0]!.messageId).toBe(MESSAGE_ID);
    expect(result[0]!.originalSubject).toBe(DOORKEEPER_SAMPLE_1.subject);
  });
});
