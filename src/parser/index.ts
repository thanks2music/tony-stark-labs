import { parseFindyEmail } from "./findyParser.js";
import { parseDoorkeeperEmail } from "./doorkeeperParser.js";
import { parseWithAI } from "./aiParser.js";
import type { ParsedEvent } from "../types/event.js";

type EmailParser = (
  subject: string,
  body: string,
  messageId: string,
) => ParsedEvent[];

const PARSER_MAP: Record<string, EmailParser> = {
  "support@findy-code.io": parseFindyEmail,
  "info@doorkeeper.jp": parseDoorkeeperEmail,
};

/**
 * 送信元アドレスに対応するパーサーでメールをパースする。
 * 未対応の送信元の場合は null を返す（エラーではなくスキップ）。
 * AIフォールバックが有効な場合は、未対応の送信元でもAIパーサーを試行する。
 */
export async function parseEmail(
  from: string,
  subject: string,
  body: string,
  messageId: string,
): Promise<ParsedEvent[] | null> {
  // "Name <email>" 形式からメールアドレスを抽出
  const emailMatch = from.match(/<(.+?)>/);
  const email = (emailMatch?.[1] ?? from).toLowerCase().trim();

  const parser = PARSER_MAP[email];
  if (parser) {
    return parser(subject, body, messageId);
  }

  // AIフォールバック（ANTHROPIC_API_KEY が設定されている場合のみ）
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`AIフォールバックパーサーを使用: ${email}`);
    return parseWithAI(subject, body, messageId);
  }

  return null;
}
