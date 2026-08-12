import type { RequestHandler } from 'express';

export function cookieParser(): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('cookie');
    const cookies: Record<string, string> = {};
    if (header) {
      for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        cookies[key] = decodeURIComponent(value);
      }
    }
    req.cookies = cookies;
    next();
  };
}
