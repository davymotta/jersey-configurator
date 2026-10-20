import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openStore(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, unit_price INTEGER NOT NULL DEFAULT 3500, minimum INTEGER NOT NULL DEFAULT 10, demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, email TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','customer')), UNIQUE(workspace_id,email));
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS designs(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), account_id TEXT NOT NULL REFERENCES accounts(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS patterns(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), account_id TEXT NOT NULL REFERENCES accounts(id), data TEXT NOT NULL, request_key TEXT NOT NULL, UNIQUE(account_id,request_key));
    CREATE TABLE IF NOT EXISTS artwork(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), account_id TEXT NOT NULL REFERENCES accounts(id), data TEXT NOT NULL, pixels INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS garments(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), data TEXT NOT NULL);
    PRAGMA user_version=2;`);
  return db;
}
export type Store = ReturnType<typeof openStore>;
