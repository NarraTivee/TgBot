import { generateResponse, type GenerateResult } from "../../lib/ai.js";

const SUMMARY_SYSTEM_PROMPT = `Ты эксперт по суммаризации текстов. Твоя задача — создать краткое, структурированное резюме предоставленного текста или чата.

Формат резюме:
📝 **Краткое содержание:** (1-2 предложения)

🔑 **Ключевые моменты:**
• ...
• ...

💡 **Выводы/Решения:** (если есть)

Отвечай на том же языке, что и исходный текст. Будь лаконичен и точен.`;

export async function summarizeText(text: string): Promise<GenerateResult> {
  return generateResponse(
    SUMMARY_SYSTEM_PROMPT,
    [],
    `Пожалуйста, суммаризируй следующий текст:\n\n${text}`
  );
}
