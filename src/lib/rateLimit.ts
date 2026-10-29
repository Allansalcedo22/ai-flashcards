// Simple in-memory rate limiter: counts requests per key inside a time window.
// Works fully on a single always-on server (e.g. Render). On serverless hosts
// (e.g. Vercel) each instance keeps its own count, so treat it as a speed bump
// and keep an OpenAI spending limit as the real safety net.

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((time) => now - time < windowMs);

  if (recent.length >= maxRequests) {
    hits.set(key, recent);
    const retryAfterMs = windowMs - (now - recent[0]);
    return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil(retryAfterMs / 60000)) };
  }

  recent.push(now);
  hits.set(key, recent);

  // Keep memory from growing forever by occasionally dropping idle visitors
  if (hits.size > 10000) {
    for (const [k, times] of hits) {
      if (times.every((time) => now - time >= windowMs)) hits.delete(k);
    }
  }

  return { allowed: true, retryAfterMinutes: 0 };
}

export function getClientIp(req: Request) {
  // Hosts put the visitor's real IP first in x-forwarded-for
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}
