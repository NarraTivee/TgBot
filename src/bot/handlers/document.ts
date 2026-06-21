import mammoth from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require("pdf-parse");
import { generateResponse, type ChatMessage, type GenerateResult } from "../../lib/ai.js";

export type DocIntent =
  | "explain"
  | "translate"
  | "quiz"
  | "terms"
  | "summary"
  | "outline"
  | "answers"
  | "simplify"
  | "custom";

const PROMPTS: Record<DocIntent, string> = {
  explain: `Ты помощник, который объясняет содержимое документов простым и понятным языком.
Прочитай документ и объясни что в нём написано — максимально просто, без воды.
Выдели самое важное. Если длинный — сделай структурированное резюме.
Отвечай на русском языке.`,

  translate: `Ты переводчик. Переведи весь текст документа на русский язык (если он уже на русском — переведи на английский).
Сохраняй структуру и форматирование оригинала. Переводи полностью, не сокращай.`,

  quiz: `Ты преподаватель. На основе текста документа составь тест для проверки знаний.
Формат каждого вопроса:
**Вопрос N:** [вопрос]
А) [вариант]  Б) [вариант]  В) [вариант]  Г) [вариант]
✅ Правильный ответ: [буква] — [объяснение]

Составь 10–15 вопросов, охватывающих ключевые темы документа.`,

  terms: `Ты составляешь глоссарий. Из текста документа извлеки все ключевые термины, понятия и определения.
Формат:
**Термин** — определение простым языком.

Выдай минимум 10 терминов, отсортированных по алфавиту.`,

  summary: `Ты эксперт по суммаризации. Сделай краткое и чёткое резюме документа.
Формат:
📝 **О чём документ:** (1 предложение)
🔑 **Ключевые моменты:** (5–7 пунктов)
💡 **Главный вывод:** (1–2 предложения)
Будь лаконичен и точен.`,

  outline: `Ты создаёшь структурный план. Проанализируй документ и составь его подробный план/оглавление.
Формат:
1. Раздел
   1.1 Подраздел
   1.2 Подраздел
2. Раздел
...
После плана — 1 абзац о логике и структуре документа.`,

  answers: `Ты репетитор. В документе есть вопросы или задания — найди их все и дай на каждый подробный ответ.
Формат:
**Вопрос [N]:** [текст вопроса]
**Ответ:** [подробный ответ]
---
Отвечай полно и точно, используй информацию из документа.`,

  simplify: `Ты эксперт по упрощению текстов. Перепиши документ максимально простым языком — как будто объясняешь школьнику.
Замени сложные термины на простые слова с пояснением в скобках.
Сохраняй все важные факты, но убирай бюрократические формулировки.`,

  custom: `Ты умный ассистент. Выполни запрос пользователя относительно содержимого документа.
Будь точным, полезным и конкретным. Отвечай на русском языке.`,
};

export function detectIntent(caption: string): DocIntent {
  const lower = caption.toLowerCase();
  if (/перевод|переведи|translate/i.test(lower)) return "translate";
  if (/тест|вопрос|quiz|викторин|проверк/i.test(lower)) return "quiz";
  if (/термин|понятия|глоссарий|ключевые слова/i.test(lower)) return "terms";
  if (/кратко|резюме|summary|перескажи|пересказ|суммаризируй|tl;dr/i.test(lower)) return "summary";
  if (/план|структур|оглавлени|outline/i.test(lower)) return "outline";
  if (/ответ|задани|реши|помоги с/i.test(lower)) return "answers";
  if (/проще|упрости|просто|для новичк|как ребёнку|обезьян/i.test(lower)) return "simplify";
  if (caption.trim().length > 0) return "custom";
  return "explain";
}

export interface DocumentResult extends GenerateResult {
  fileName: string;
  extractedText: string;
  intent: DocIntent;
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (
    mimeType.startsWith("text/") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv")
  ) {
    return buffer.toString("utf-8");
  }

  throw new Error(`Формат файла не поддерживается: ${fileName}`);
}

export async function processDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  userCaption: string,
  history: ChatMessage[]
): Promise<DocumentResult> {
  const text = await extractTextFromBuffer(buffer, mimeType, fileName);

  if (!text.trim()) {
    throw new Error("Файл пустой или не содержит читаемого текста.");
  }

  const MAX_CHARS = 18000;
  const truncated =
    text.length > MAX_CHARS
      ? text.slice(0, MAX_CHARS) + "\n\n[...документ обрезан, показана первая часть]"
      : text;

  const intent = detectIntent(userCaption);
  const systemPrompt = PROMPTS[intent];

  const userPrompt =
    intent === "custom"
      ? `${userCaption}\n\nСодержимое файла "${fileName}":\n\n${truncated}`
      : `Содержимое файла "${fileName}":\n\n${truncated}`;

  const result = await generateResponse(systemPrompt, history, userPrompt);
  return { ...result, fileName, extractedText: truncated, intent };
}

export const explainDocument = processDocument;
