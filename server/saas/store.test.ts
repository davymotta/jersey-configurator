import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "./store";
it("preserves workspace records and constraints after reopening the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "jersey-store-")),
    filename = join(dir, "store.sqlite");
  try {
    const db = openStore(filename);
    db.prepare("INSERT INTO workspaces(id,slug,name) VALUES(?,?,?)").run(
      "one",
      "durable-maker",
      "Durable Maker"
    );
    db.close();
    const reopened = openStore(filename);
    try {
      expect(
        reopened.prepare("SELECT name FROM workspaces WHERE id=?").get("one")
      ).toEqual({ name: "Durable Maker" });
      expect(() =>
        reopened
          .prepare("INSERT INTO workspaces(id,slug,name) VALUES(?,?,?)")
          .run("two", "durable-maker", "Duplicate")
      ).toThrow();
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
