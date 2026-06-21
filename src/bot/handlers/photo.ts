import { generateVisionResponse, type GenerateResult } from "../../lib/ai.js";

const PHOTO_SYSTEM_PROMPT_DEFAULT = `Опиши что изображено на фото подробно и понятно.
Если на фото есть текст — прочитай и процитируй его полностью.
Если это документ, скриншот, таблица — расшифруй содержимое структурированно.
Отвечай на русском языке.`;

export async function analyzePhoto(
  imageBuffer: Buffer,
  mimeType: string,
  userCaption: string
): Promise<GenerateResult> {
  const base64 = imageBuffer.toString("base64");

  const prompt = userCaption.trim()
    ? userCaption
    : PHOTO_SYSTEM_PROMPT_DEFAULT;

  return generateVisionResponse(base64, mimeType, prompt);
}
