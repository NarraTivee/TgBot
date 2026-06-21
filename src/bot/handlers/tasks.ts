import { db, tasksTable } from "../../db/index.js";
import { eq, and } from "drizzle-orm";
import { generateResponse, type ChatMessage, type GenerateResult } from "../../lib/ai.js";

const TASK_SYSTEM_PROMPT = `Ты умный ассистент для управления задачами. Когда пользователь хочет что-то сделать с задачами, ты должен распознать намерение и вернуть JSON-ответ в следующем формате:
{
  "action": "add" | "list" | "done" | "delete" | "update" | "chat",
  "task": { "title": "...", "description": "...", "priority": "low"|"medium"|"high" },
  "taskId": 123,
  "message": "текст ответа пользователю"
}

Примеры:
- "добавь задачу купить молоко" → action: "add", task: { title: "Купить молоко", priority: "medium" }
- "покажи мои задачи" → action: "list"
- "задача 3 выполнена" → action: "done", taskId: 3
- "удали задачу 2" → action: "delete", taskId: 2
- "это не про задачи" → action: "chat"

Отвечай только валидным JSON, без markdown-блоков.`;

export async function handleTaskIntent(
  userId: number,
  userText: string,
  history: ChatMessage[]
): Promise<GenerateResult & { responseText: string }> {
  const result = await generateResponse(TASK_SYSTEM_PROMPT, history, userText);

  let parsed: {
    action: string;
    task?: { title: string; description?: string; priority?: "low" | "medium" | "high" };
    taskId?: number;
    message?: string;
  };

  let responseText: string;

  try {
    const cleaned = result.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { ...result, responseText: result.text };
  }

  switch (parsed.action) {
    case "add": {
      if (!parsed.task?.title) {
        responseText = "Не понял, что добавить. Уточни задачу.";
        break;
      }
      const [inserted] = await db
        .insert(tasksTable)
        .values({
          userId,
          title: parsed.task.title,
          description: parsed.task.description ?? null,
          priority: parsed.task.priority ?? "medium",
          done: false,
        })
        .returning();
      responseText = `✅ Задача добавлена (#${inserted.id}): *${inserted.title}*\nПриоритет: ${priorityLabel(inserted.priority)}`;
      break;
    }
    case "list": {
      const tasks = await db
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.userId, userId))
        .orderBy(tasksTable.createdAt);

      if (tasks.length === 0) {
        responseText = "📋 Задач пока нет. Добавь что-нибудь!";
        break;
      }
      const pending = tasks.filter((t) => !t.done);
      const done = tasks.filter((t) => t.done);
      let text = "📋 *Твои задачи:*\n\n";
      if (pending.length > 0) {
        text += "*Активные:*\n";
        text += pending.map((t) => `  ${priorityEmoji(t.priority)} #${t.id} ${t.title}`).join("\n");
      }
      if (done.length > 0) {
        text += `\n\n*Выполнены (${done.length}):*\n`;
        text += done.map((t) => `  ✅ #${t.id} ~~${t.title}~~`).join("\n");
      }
      responseText = text;
      break;
    }
    case "done": {
      if (!parsed.taskId) {
        responseText = "Укажи номер задачи, например: «задача 3 выполнена»";
        break;
      }
      const [updated] = await db
        .update(tasksTable)
        .set({ done: true, updatedAt: new Date() })
        .where(and(eq(tasksTable.id, parsed.taskId), eq(tasksTable.userId, userId)))
        .returning();
      responseText = updated
        ? `✅ Задача #${updated.id} *«${updated.title}»* отмечена как выполненная!`
        : `Задача #${parsed.taskId} не найдена.`;
      break;
    }
    case "delete": {
      if (!parsed.taskId) {
        responseText = "Укажи номер задачи для удаления.";
        break;
      }
      const [deleted] = await db
        .delete(tasksTable)
        .where(and(eq(tasksTable.id, parsed.taskId), eq(tasksTable.userId, userId)))
        .returning();
      responseText = deleted
        ? `🗑 Задача #${deleted.id} *«${deleted.title}»* удалена.`
        : `Задача #${parsed.taskId} не найдена.`;
      break;
    }
    default:
      responseText = parsed.message ?? result.text;
  }

  return { ...result, responseText };
}

function priorityLabel(p: string): string {
  return { low: "🟢 Низкий", medium: "🟡 Средний", high: "🔴 Высокий" }[p] ?? p;
}

function priorityEmoji(p: string): string {
  return { low: "🟢", medium: "🟡", high: "🔴" }[p] ?? "⬜";
}
