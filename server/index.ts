import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { createApi } from "./saas/api";
import { openStore } from "./saas/store";

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
const production = process.env.NODE_ENV === "production";
if (production && !process.env.APP_ORIGIN)
  throw new Error(
    "APP_ORIGIN is required in production (public HTTPS origin)."
  );
if (production && new URL(process.env.APP_ORIGIN!).protocol !== "https:")
  throw new Error("APP_ORIGIN must use HTTPS in production.");
const db = openStore(
  process.env.SQLITE_PATH || path.resolve("data/jersey.sqlite")
);
app.use(
  "/api",
  createApi(db, {
    aiKey: process.env.OPENAI_API_KEY,
    secureCookies: production,
    origin: process.env.APP_ORIGIN,
  })
);
const server = createServer(app);
if (!production) {
  const { setupVite } = await import("./_core/vite");
  await setupVite(app, server);
} else {
  const publicDir = path.resolve(import.meta.dirname, "public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
}
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log("DreamTeam running on port " + (process.env.PORT || 3000))
);
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
