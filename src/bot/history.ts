import { db, messagesTable } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import type { ChatMessage } from "../lib/ai.js";

const MAX_HISTORY = 20;

export async function getHistory(userId: number): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.userId, userId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(MAX_HISTORY);

  return rows
    .reverse()
    .map((r) => ({
      role: r.role === "user" ? "user" : "model",
      parts: [{ text: r.content }],
    }));
}

export async function saveMessage(
  userId: number,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await db.insert(messagesTable).values({ userId, role, content });
}

export async function clearHistory(userId: number): Promise<void> {
  await db.delete(messagesTable).where(eq(messagesTable.userId, userId));
}
