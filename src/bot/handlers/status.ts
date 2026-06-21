import { db, tasksTable, messagesTable, tokenUsageTable } from "../../db/index.js";
import { eq, and, sql } from "drizzle-orm";

const DAILY_REQUEST_LIMIT = 250;
const DAILY_INPUT_TOKEN_LIMIT = 1_000_000;
const DAILY_OUTPUT_TOKEN_LIMIT = 65_536;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextMidnightUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function formatTimeUntil(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return "уже скоро";
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  if (h > 0) return `через ${h} ч ${m} мин`;
  return `через ${m} мин`;
}

function bar(used: number, total: number, width = 10): string {
  const filled = Math.round((used / total) * width);
  const empty = width - filled;
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, empty));
}

function pct(used: number, total: number): string {
  return `${Math.min(100, Math.round((used / total) * 100))}%`;
}

export async function getStatusMessage(userId: number): Promise<string> {
  const today = todayUTC();

  const [taskStats, messageCount, myTokens, globalTokens] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where done = true)::int`,
      })
      .from(tasksTable)
      .where(eq(tasksTable.userId, userId))
      .then((r) => r[0] ?? { total: 0, done: 0 }),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(and(eq(messagesTable.userId, userId), eq(messagesTable.role, "user")))
      .then((r) => r[0]?.count ?? 0),

    db
      .select({
        promptTokens: sql<number>`coalesce(sum(prompt_tokens), 0)::int`,
        candidateTokens: sql<number>`coalesce(sum(candidate_tokens), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(total_tokens), 0)::int`,
        requests: sql<number>`count(*)::int`,
      })
      .from(tokenUsageTable)
      .where(and(eq(tokenUsageTable.userId, userId), eq(tokenUsageTable.usageDate, today)))
      .then((r) => r[0] ?? { promptTokens: 0, candidateTokens: 0, totalTokens: 0, requests: 0 }),

    db
      .select({
        promptTokens: sql<number>`coalesce(sum(prompt_tokens), 0)::int`,
        candidateTokens: sql<number>`coalesce(sum(candidate_tokens), 0)::int`,
        requests: sql<number>`count(*)::int`,
      })
      .from(tokenUsageTable)
      .where(eq(tokenUsageTable.usageDate, today))
      .then((r) => r[0] ?? { promptTokens: 0, candidateTokens: 0, requests: 0 }),
  ]);

  const pending = taskStats.total - taskStats.done;
  const resetStr = formatTimeUntil(nextMidnightUTC());

  const globalInputLeft = Math.max(0, DAILY_INPUT_TOKEN_LIMIT - globalTokens.promptTokens);
  const globalOutputLeft = Math.max(0, DAILY_OUTPUT_TOKEN_LIMIT - globalTokens.candidateTokens);
  const globalReqLeft = Math.max(0, DAILY_REQUEST_LIMIT - globalTokens.requests);

  return (
    `📊 *Твой статус*\n\n` +
    `📋 *Задачи*\n` +
    `  ✅ Выполнено: ${taskStats.done}\n` +
    `  🕐 Осталось: ${pending}\n` +
    `  📁 Всего: ${taskStats.total}\n\n` +
    `💬 *Сообщений отправлено:* ${messageCount}\n` +
    `🤖 *Твои токены сегодня:* ${myTokens.totalTokens.toLocaleString("ru")} (${myTokens.requests} запросов)\n\n` +
    `─────────────────────\n` +
    `🌐 *Общий лимит бота на сегодня* _(сброс ${resetStr})_\n\n` +
    `  📥 Входящие токены:\n` +
    `  ${bar(globalTokens.promptTokens, DAILY_INPUT_TOKEN_LIMIT)} ${pct(globalTokens.promptTokens, DAILY_INPUT_TOKEN_LIMIT)}\n` +
    `  Использовано: ${globalTokens.promptTokens.toLocaleString("ru")} / ${DAILY_INPUT_TOKEN_LIMIT.toLocaleString("ru")}\n` +
    `  Осталось: ${globalInputLeft.toLocaleString("ru")}\n\n` +
    `  📤 Исходящие токены:\n` +
    `  ${bar(globalTokens.candidateTokens, DAILY_OUTPUT_TOKEN_LIMIT)} ${pct(globalTokens.candidateTokens, DAILY_OUTPUT_TOKEN_LIMIT)}\n` +
    `  Использовано: ${globalTokens.candidateTokens.toLocaleString("ru")} / ${DAILY_OUTPUT_TOKEN_LIMIT.toLocaleString("ru")}\n` +
    `  Осталось: ${globalOutputLeft.toLocaleString("ru")}\n\n` +
    `  🔁 Запросов: ${globalTokens.requests} / ${DAILY_REQUEST_LIMIT} (осталось ${globalReqLeft})\n\n` +
    `🔄 _Лимиты общие для всех пользователей бота_`
  );
}
