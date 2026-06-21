process.stdout.write("=== index.ts загружается ===\n");

import app from "./app.js";
import { logger } from "./lib/logger.js";
import { bot } from "./bot/index.js";

process.stdout.write("=== импорты завершены ===\n");

const rawPort = process.env["PORT"];

if (!rawPort) {
  process.stderr.write("ОШИБКА: PORT не задан\n");
  process.exit(1);
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  process.stderr.write(`ОШИБКА: PORT некорректный: "${rawPort}"\n`);
  process.exit(1);
}

process.stdout.write(`=== слушаем порт ${port} ===\n`);

app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

bot.api.setMyCommands([
  { command: "start", description: "👋 Приветствие" },
  { command: "help", description: "💛 Все возможности бота" },
  { command: "files", description: "📁 Работа с файлами и фото" },
  { command: "tasks", description: "📋 Мои задачи" },
  { command: "status", description: "📊 Статистика и токены" },
  { command: "clear", description: "🗑 Очистить историю чата" },
]).catch((err: unknown) => logger.error({ err }, "Failed to set bot commands"));

bot.api
  .deleteWebhook({ drop_pending_updates: false })
  .then(() =>
    bot.start({
      onStart: (info: { username: string }) => {
        logger.info({ username: info.username }, "Telegram bot started (long-polling)");
      },
    })
  )
  .catch((err: unknown) => logger.error({ err }, "Failed to start bot"));
