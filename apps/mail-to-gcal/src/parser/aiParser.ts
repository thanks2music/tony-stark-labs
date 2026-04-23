import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config.js';
import { ParsedEventSchema, type ParsedEvent } from '../types/event.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: loadConfig().ANTHROPIC_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `あなたはメールからイベント情報を抽出するアシスタントです。
メールの件名と本文から、以下の情報をJSON配列として抽出してください。
複数のイベント（Day1/Day2等）が含まれる場合は、それぞれ別のオブジェクトとして返してください。

各オブジェクトのフォーマット:
{
  "title": "イベント名",
  "startDateTime": "ISO 8601形式 (例: 2026-04-07T12:00:00+09:00)",
  "durationMinutes": 開始から終了までの分数（不明な場合は60）,
  "url": "視聴URL or イベントURL（あれば）"
}

イベント情報が見つからない場合は空配列 [] を返してください。
JSON以外のテキストは出力しないでください。`;

/**
 * Claude Haiku APIを使ってメールからイベント情報を抽出するフォールバックパーサー。
 * 個別パーサーが存在しない送信元に対して使用される。
 */
export async function parseWithAI(
  subject: string,
  body: string,
  messageId: string,
): Promise<ParsedEvent[]> {
  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `件名: ${subject}\n\n本文:\n${body}`,
      },
    ],
  });

  const firstContent = response.content[0];
  const rawText = firstContent?.type === 'text' ? firstContent.text : '';

  // ```json ... ``` でラップされている場合にJSON部分だけ抽出
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const captured = jsonMatch?.[1];
  const text = captured !== undefined ? captured.trim() : rawText.trim();

  const parsed: unknown[] = JSON.parse(text);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }

  return parsed.map((item: any) =>
    ParsedEventSchema.parse({
      title: item.title,
      startDateTime: new Date(item.startDateTime).toISOString(),
      durationMinutes: item.durationMinutes || 60,
      url: item.url || undefined,
      source: 'ai',
      originalSubject: subject,
      messageId,
    }),
  );
}
