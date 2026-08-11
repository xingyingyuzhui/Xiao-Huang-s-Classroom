import type { Request, Response, NextFunction } from 'express';

/** Placeholder principal for Task 3; real JWT validation lands in cloud-auth (Task 4). */
export function authPrincipalMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.header('authorization');
  if (auth?.startsWith('Bearer ')) {
    // Reserved: decode in Task 4; never trust client-supplied account headers.
    req.principal = { accountId: null };
  } else {
    req.principal = { accountId: null };
  }
  next();
}
