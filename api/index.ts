/**
 * Vercel function entry. The real app lives in ./_bootstrap.ts (underscore =
 * not a route). It is loaded via dynamic import inside try/catch so ANY boot
 * failure — including import-time errors such as a native module missing from
 * the bundle — surfaces as a JSON body instead of an opaque
 * FUNCTION_INVOCATION_FAILED page, making remote diagnosis possible.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

let handler: Handler;
try {
  const mod = await import('./_bootstrap.js');
  handler = (await mod.bootstrap()) as unknown as Handler;
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error('BOOT FAILED:', message);
  handler = (_req, res) => {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'BOOT_FAILED', message }));
  };
}

export default function entry(req: IncomingMessage, res: ServerResponse): unknown {
  return handler(req, res);
}
