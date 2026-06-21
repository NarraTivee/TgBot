import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  pgTable,
  serial,
  bigint,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  date,
} from "drizzle-orm/pg-core";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool);

export const usersTable = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  username: varchar("username", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tokenUsageTable = pgTable("token_usage", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  candidateTokens: integer("candidate_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  usageDate: date("usage_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
