import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY must be set");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    maxOutputTokens: 2048,
  },
});

export interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

export interface GenerateResult {
  text: string;
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

function isRateLimitError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: number }).status === 429
  );
}

export class RateLimitError extends Error {
  constructor() {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

function isOverloadedError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: number }).status === 503
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isRateLimitError(err)) throw new RateLimitError();
      if (isOverloadedError(err) && attempt < retries - 1) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function generateResponse(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string
): Promise<GenerateResult> {
  const trimmedHistory = history.slice(-6);

  return withRetry(async () => {
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Понял." }] },
        ...trimmedHistory,
      ],
    });

    const result = await chat.sendMessage(userMessage);
    const usage = result.response.usageMetadata;

    return {
      text: result.response.text(),
      promptTokens: usage?.promptTokenCount ?? 0,
      candidateTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    };
  });
}

export async function generateVisionResponse(
  imageBase64: string,
  imageMimeType: string,
  userPrompt: string
): Promise<GenerateResult> {
  return withRetry(async () => {
    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: imageMimeType as "image/jpeg" | "image/png" | "image/webp",
        },
      },
      { text: userPrompt },
    ]);

    const usage = result.response.usageMetadata;
    return {
      text: result.response.text(),
      promptTokens: usage?.promptTokenCount ?? 0,
      candidateTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    };
  });
}
