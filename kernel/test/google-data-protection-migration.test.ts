import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

test("Google protection upgrade does not classify or change existing customer recipes and chats", async () => {
  const db = new Database(":memory:");
  try {
    db.run(
      "CREATE TABLE tasks (id TEXT PRIMARY KEY, prompt TEXT, model_id TEXT, next_run_at INTEGER, updated_at INTEGER)",
    );
    db.run(
      "CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, updated_at INTEGER)",
    );
    db.run("INSERT INTO tasks VALUES (?, ?, ?, ?, ?)", [
      "github-trending",
      "Find trending public repositories",
      "qwen/qwen3.8-flash",
      1800000000000,
      1700000000000,
    ]);
    db.run("INSERT INTO tasks VALUES (?, ?, ?, ?, ?)", [
      "neon-report",
      "Query Neon usage",
      "qwen/qwen3.8-flash",
      1800000000000,
      1700000000000,
    ]);
    db.run("INSERT INTO chat_sessions VALUES (?, ?)", [
      "existing-chat",
      1700000000000,
    ]);
    const recipesBefore = db.query("SELECT * FROM tasks ORDER BY id").all();
    const chatsBefore = db.query("SELECT * FROM chat_sessions").all();
    const migration = await Bun.file(
      new URL("../../drizzle/0035_google-data-protection.sql", import.meta.url),
    ).text();
    for (const statement of migration.split("--> statement-breakpoint"))
      db.run(statement);
    expect(db.query("SELECT * FROM tasks ORDER BY id").all()).toEqual(
      recipesBefore,
    );
    expect(db.query("SELECT * FROM chat_sessions").all()).toEqual(chatsBefore);
    expect(db.query("SELECT * FROM google_data_protection").all()).toEqual([]);
    expect(db.query("SELECT * FROM google_data_route_audit").all()).toEqual([]);
  } finally {
    db.close();
  }
});
