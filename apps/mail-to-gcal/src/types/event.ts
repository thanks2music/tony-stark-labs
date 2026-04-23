import * as z from "zod";

export const ParsedEventSchema = z.object({
  title: z.string().min(1),
  startDateTime: z.string().datetime(),
  durationMinutes: z.number().int().positive().default(60),
  url: z.string().url().optional(),
  source: z.enum(["findy", "doorkeeper", "qiita", "ai"]),
  originalSubject: z.string(),
  messageId: z.string(),
});

export type ParsedEvent = z.infer<typeof ParsedEventSchema>;

export const SOURCE_LABELS: Record<ParsedEvent["source"], string> = {
  findy: "Findy",
  doorkeeper: "Doorkeeper",
  qiita: "Qiita",
  ai: "Event",
};
