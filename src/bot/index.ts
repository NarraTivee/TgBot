import { Bot, type Context } from "grammy";
import { db, usersTable, tokenUsageTable } from "../db/index.js";
import { eq } from "drizzle-orm";
import { getHistory, saveMessage, clearHistory } from "./history.js";
import { handleTaskIntent } from "./handlers/tasks.js";
import { summarizeText } from "./handlers/summarize.js";
import { chat } from "./handlers/chat.js";
import { getStatusMessage } from "./handlers/status.js";
import { processDocument } from "./handlers/document.js";
import { analyzePhoto } from "./handlers/photo.js";
import { RateLimitError, type GenerateResult } from "../lib/ai.js";
import { logger } from "../lib/logger.js";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN must be set");
}

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

async function safeReply(ctx: Context, text: string): Promise<void> {
  const chunks = text.length > 4096 ? (text.match(/[\s\S]{1,4096}/g) ?? []) : [text];
  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    } catch {
      await ctx.reply(chunk);
    }
  }
}

async function ensureUser(ctx: Context): Promise<number | null> {
  const from = ctx.from;
  if (!from) return null;

  await db
    .insert(usersTable)
    .values({
      id: from.id,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      username: from.username ?? null,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        username: from.username ?? null,
        updatedAt: new Date(),
      },
    });

  return from.id;
}

async function trackTokens(userId: number, usage: GenerateResult): Promise<void> {
  if (usage.totalTokens === 0) return;
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(tokenUsageTable).values({
    userId,
    promptTokens: usage.promptTokens,
    candidateTokens: usage.candidateTokens,
    totalTokens: usage.totalTokens,
    usageDate: today,
  });
}

bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name ?? "друг";
  await ctx.reply(
    `Привет, ${name}\\! ☁️\n\n` +
      `Я — твой личный помощник\\. Всегда рядом, всегда рад тебя слышать 🌸\n\n` +
      `✨ *Для души*\n\n` +
      `Пиши — я отвечу тепло и по\\-человечески\n\n` +
      `Могу начать или подхватить диалог на любую тему\n\n` +
      `Расскажу что\\-нибудь уютное\n\n` +
      `📝 *Заботы\\-помощники*\n\n` +
      `«добавь задачу» — запомню\n\n` +
      `«покажи мои задачи» — напомню\n\n` +
      `«задача 3 выполнена» — отмечу\n\n` +
      `«удали задачу 2» — уберу\n\n` +
      `📖 *Если устала*\n\n` +
      `Пришли текст или переписку — я сделаю короткий пересказ\n\n` +
      `Команды:\n` +
      `/tasks — 📋 мои дела\n` +
      `/status — 📊 мой статус\n` +
      `/clear — 🧹 очистить чат\n` +
      `/help — 💛 что я умею\n\n` +
      `_P\\.S\\. Здесь всё для тебя\\. Можешь называть меня как хочешь — я откликнусь 😌_`,
    { parse_mode: "MarkdownV2" }
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    `*Как пользоваться ботом:*\n\n` +
      `📁 *Работа с файлами (DOCX, PDF, TXT, CSV):*\n` +
      `Просто пришли файл — объясню что в нём.\n` +
      `Или пришли файл с подписью:\n` +
      `• «переведи» → переведёт документ\n` +
      `• «составь тест» → сделает тест с ответами\n` +
      `• «термины» → извлечёт ключевые понятия\n` +
      `• «кратко» → резюме по пунктам\n` +
      `• «план» → структура документа\n` +
      `• «ответы на задания» → решит задачи из файла\n` +
      `• «объясни проще» → упростит язык\n` +
      `• любой свой вопрос → ответит по содержимому\n\n` +
      `🖼 *Фото и картинки:*\n` +
      `Пришли фото — опишу что на нём. Можно добавить подпись:\n` +
      `• «прочитай текст» → распознает надписи\n` +
      `• «что это?» → определит объект\n` +
      `• любой вопрос по фото\n\n` +
      `📋 *Управление задачами:*\n` +
      `• «добавь задачу позвонить врачу»\n` +
      `• «покажи все задачи» / «задача 5 выполнена»\n` +
      `• «удали задачу 3»\n\n` +
      `📝 *Суммаризация текста:*\n` +
      `Пришли текст + «кратко», «перескажи» или «tl;dr»\n\n` +
      `💬 *Свободное общение:*\n` +
      `Просто напиши что угодно!\n\n` +
      `⚙️ *Команды:*\n` +
      `/tasks — задачи | /status — статистика | /clear — очистить чат`,
    { parse_mode: "Markdown" }
  );
});

bot.command("tasks", async (ctx) => {
  const userId = await ensureUser(ctx);
  if (!userId) return;
  const history = await getHistory(userId);
  const result = await handleTaskIntent(userId, "покажи мои задачи", history);
  await trackTokens(userId, result);
  await ctx.reply(result.responseText, { parse_mode: "Markdown" });
});

bot.command("status", async (ctx) => {
  const userId = await ensureUser(ctx);
  if (!userId) return;
  const message = await getStatusMessage(userId);
  await ctx.reply(message, { parse_mode: "Markdown" });
});

bot.command("clear", async (ctx) => {
  const userId = await ensureUser(ctx);
  if (!userId) return;
  await clearHistory(userId);
  await ctx.reply("🗑 История разговора очищена.");
});

bot.command("files", async (ctx) => {
  await ctx.reply(
    `📁 *Работа с файлами и фото*\n\n` +
      `*Поддерживаемые форматы:* DOCX, PDF, TXT, MD, CSV\n\n` +
      `Просто пришли файл — я объясню что в нём.\n` +
      `Или пришли файл *с подписью* — и я сделаю именно то, о чём ты попросишь:\n\n` +
      `📝 «*переведи*» — переведёт весь документ\n` +
      `📋 «*составь тест*» — тест с вариантами и правильными ответами\n` +
      `🔑 «*термины*» — глоссарий ключевых понятий\n` +
      `📌 «*кратко*» — структурированное резюме\n` +
      `🗂 «*план*» — структура и оглавление документа\n` +
      `✅ «*ответы на задания*» — решит все задачи из файла\n` +
      `🧒 «*объясни проще*» — упростит язык до понятного\n` +
      `💬 *любой вопрос* — ответит по содержимому\n\n` +
      `📷 *Фотографии и картинки:*\n` +
      `Пришли любое фото — опишу что на нём.\n` +
      `С подписью — отвечу на твой вопрос по картинке:\n` +
      `• «прочитай текст» — распознает надписи и текст\n` +
      `• «что это?» — определит объект или место\n` +
      `• *любой вопрос* по фото — отвечу!\n\n` +
      `_После отправки файла можно задавать любые вопросы по его содержимому — я запомню текст._`,
    { parse_mode: "Markdown" }
  );
});

bot.on("message:text", async (ctx) => {
  const userId = await ensureUser(ctx);
  if (!userId) return;

  const text = ctx.message.text;
  const history = await getHistory(userId);

  await ctx.replyWithChatAction("typing");

  let response: string;
  let usage: GenerateResult | null = null;

  try {
    const lowerText = text.toLowerCase();

    const summarizeKeywords = ["суммаризируй", "суммаризировать", "кратко", "перескажи", "tl;dr", "tldr", "summarize", "summary"];
    const isSummarize = summarizeKeywords.some((kw) => lowerText.includes(kw));

    const taskKeywords = [
      "задач", "задание", "todo", "to-do", "сделать", "добавь", "покажи", "удали",
      "выполнен", "отметь", "список дел", "напомни", "приоритет",
    ];
    const isTask = taskKeywords.some((kw) => lowerText.includes(kw));

    if (isSummarize && text.length > 100) {
      const result = await summarizeText(text);
      response = result.text;
      usage = result;
    } else if (isTask) {
      const result = await handleTaskIntent(userId, text, history);
      response = result.responseText;
      usage = result;
    } else {
      const result = await chat(text, history);
      response = result.text;
      usage = result;
    }

    await saveMessage(userId, "user", text);
    await saveMessage(userId, "assistant", response);
    if (usage) await trackTokens(userId, usage);
  } catch (err) {
    const isRateLimit =
      err instanceof RateLimitError ||
      (err instanceof Error && err.name === "RateLimitError") ||
      (typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 429);

    if (isRateLimit) {
      await ctx.reply(
        "⏳ *Лимит запросов в минуту исчерпан*\n\n" +
          "Подожди 1–2 минуты — и сможешь продолжить общение в обычном режиме 🙂\n\n" +
          "_Это ограничение бесплатного тарифа Gemini AI, не мой каприз 😌_",
        { parse_mode: "Markdown" }
      );
      return;
    }
    logger.error({ err }, "Bot handler error");
    response = "😔 Произошла ошибка. Попробуй ещё раз.";
  }

  await safeReply(ctx, response);
});

bot.on("message:document", async (ctx) => {
  const userId = await ensureUser(ctx);
  if (!userId) return;

  const doc = ctx.message.document;
  const caption = ctx.message.caption ?? "";
  const mimeType = doc.mime_type ?? "";
  const fileName = doc.file_name ?? "document";

  const lowerName = fileName.toLowerCase();

  const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff"];
  const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".tif", ".heic", ".heif"];
  const isImage =
    imageTypes.some((t) => mimeType.startsWith(t)) ||
    imageExts.some((e) => lowerName.endsWith(e));

  const docTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
  ];
  const docExts = [".docx", ".pdf", ".txt", ".md", ".csv"];
  const isDoc =
    docTypes.some((t) => mimeType.includes(t)) ||
    docExts.some((e) => lowerName.endsWith(e));

  if (!isImage && !isDoc) {
    await ctx.reply(
      `😕 Я умею работать с:\n• *Картинки:* PNG, JPG, WEBP, GIF, BMP...\n• *Документы:* DOCX, PDF, TXT, MD, CSV\n\nТы прислал: \`${fileName}\``,
      { parse_mode: "Markdown" }
    );
    return;
  }

  await ctx.replyWithChatAction("typing");

  try {
    const fileInfo = await ctx.api.getFile(doc.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

    const httpResp = await fetch(fileUrl);
    if (!httpResp.ok) throw new Error(`Не удалось скачать файл: ${httpResp.status}`);

    const buffer = Buffer.from(await httpResp.arrayBuffer());

    if (isImage) {
      const imageMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
      const result = await analyzePhoto(buffer, imageMime, caption);

      await saveMessage(userId, "user", caption ? `[Изображение: ${fileName}] ${caption}` : `[Изображение: ${fileName}]`);
      await saveMessage(userId, "assistant", result.text);
      await trackTokens(userId, result);
      await safeReply(ctx, result.text);
    } else {
      const history = await getHistory(userId);
      const result = await processDocument(buffer, mimeType, fileName, caption, history);

      const userHistoryMsg = caption
        ? `${caption}\n\n[Файл: ${fileName}]\n${result.extractedText}`
        : `[Файл: ${fileName}]\n${result.extractedText}`;
      await saveMessage(userId, "user", userHistoryMsg);
      await saveMessage(userId, "assistant", result.text);
      await trackTokens(userId, result);
      await safeReply(ctx, result.text);
    }
  } catch (err) {
    const isRateLimit =
      err instanceof RateLimitError ||
      (err instanceof Error && err.name === "RateLimitError") ||
      (typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 429);

    if (isRateLimit) {
      await ctx.reply(
        "⏳ *Лимит запросов в минуту исчерпан*\n\nПодожди 1–2 минуты и попробуй снова 🙂",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
    logger.error({ err }, "Document handler error");
    await ctx.reply(`😔 Не удалось обработать файл: ${msg}`);
  }
});

bot.on("message:photo", async (ctx) => {
  const userId = await ensureUser(ctx);
  if (!userId) return;

  const caption = ctx.message.caption ?? "";
  const photos = ctx.message.photo;
  const largest = photos[photos.length - 1];

  await ctx.replyWithChatAction("typing");

  try {
    const fileInfo = await ctx.api.getFile(largest.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Не удалось скачать фото: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = fileInfo.file_path?.endsWith(".png") ? "image/png" : "image/jpeg";

    const result = await analyzePhoto(buffer, mimeType, caption);

    await saveMessage(userId, "user", caption ? `[Фото] ${caption}` : "[Фото]");
    await saveMessage(userId, "assistant", result.text);
    await trackTokens(userId, result);

    await safeReply(ctx, result.text);
  } catch (err) {
    const isRateLimit =
      err instanceof RateLimitError ||
      (err instanceof Error && err.name === "RateLimitError") ||
      (typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 429);

    if (isRateLimit) {
      await ctx.reply("⏳ *Лимит запросов исчерпан*\n\nПодожди 1–2 минуты 🙂", { parse_mode: "Markdown" });
      return;
    }
    logger.error({ err }, "Photo handler error");
    await ctx.reply("😔 Не удалось обработать фото. Попробуй ещё раз.");
  }
});

bot.catch(async (err) => {
  logger.error({ err: err.error }, "Grammy error");
  try {
    const isRateLimit =
      (err.error instanceof Error && err.error.name === "RateLimitError") ||
      (typeof err.error === "object" && err.error !== null && "status" in err.error && (err.error as { status: number }).status === 429);

    if (isRateLimit) {
      await err.ctx.reply(
        "⏳ *Лимит запросов в минуту исчерпан*\n\n" +
          "Подожди 1–2 минуты — и сможешь продолжить общение в обычном режиме 🙂\n\n" +
          "_Это ограничение бесплатного тарифа Gemini AI, не мой каприз 😌_",
        { parse_mode: "Markdown" }
      );
    } else {
      await err.ctx.reply("😔 Что-то пошло не так. Попробуй ещё раз.");
    }
  } catch {
    // ignore reply errors
  }
});
