import { configure as serverlessExpress } from "@vendia/serverless-express";
import { createApp } from "../server/app.js";

// projectRoot is /var/task on Lambda, where handler.cjs, dist/, and the prompt
// pack all live.
const app = createApp(process.env.LAMBDA_TASK_ROOT ?? ".");

// @vendia/serverless-express adapts the Express app to API Gateway events
// (HTTP API v2 here) — the Node equivalent of the gym's Mangum adapter.
const proxy = serverlessExpress({ app }) as unknown as (
  event: unknown,
  context: unknown
) => Promise<unknown>;

function isWarmup(event: unknown) {
  return typeof event === "object"
    && event !== null
    && (event as { warmup?: unknown }).warmup === true;
}

// Keep-warm invocations arrive as { warmup: true } from the EventBridge rule;
// short-circuit them so they don't hit Express routing.
export const handler = async (event: unknown, context: unknown) => {
  if (isWarmup(event)) {
    return { statusCode: 200, body: "warm" };
  }
  return proxy(event, context);
};
