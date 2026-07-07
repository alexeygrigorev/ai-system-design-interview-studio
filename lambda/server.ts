import { createApp } from "../server/app.js";

// Production HTTP server entry for AWS Lambda + the Lambda Web Adapter (LWA).
// LWA runs this as a long-lived process inside the function's execution
// environment and proxies Function URL invocations (InvokeMode: RESPONSE_STREAM)
// to it over HTTP on AWS_LWA_PORT. That is what makes /api/interview/turn/stream
// flush token-by-token instead of buffering the whole body (the limit we hit
// with @vendia/serverless-express + API Gateway).
//
// The local dev server lives in server/index.ts (vite middleware); this entry
// stays lean — no vite import — so the bundled artifact is small.
const port = Number(process.env.AWS_LWA_PORT ?? process.env.PORT ?? 8080);
const projectRoot = process.env.LAMBDA_TASK_ROOT ?? ".";
const app = createApp(projectRoot);

app.listen(port, "0.0.0.0", () => {
  console.log(`AI System Design Studio listening on :${port}`);
});
