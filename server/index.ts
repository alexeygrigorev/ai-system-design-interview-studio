import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { createApp } from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Local dev only: load .env into process.env. In production (Lambda) the
// environment is provided directly, so this module is never imported there.
const env = loadEnv(process.env.NODE_ENV ?? "development", projectRoot, "");
for (const [key, value] of Object.entries(env)) {
  process.env[key] ??= value;
}

const port = Number(process.env.PORT ?? 5173);
const isProduction = process.env.NODE_ENV === "production";

const app = createApp(projectRoot);

if (!isProduction) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, host: "0.0.0.0" },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`AI System Design Trainer running at http://localhost:${port}`);
});
