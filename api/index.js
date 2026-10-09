// Vercel serverless entry: every /api/* request is handled by the same Express app.
import { app } from "../server/app.js";

export default app;
