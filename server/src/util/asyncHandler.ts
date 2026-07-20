import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 does not forward errors thrown in async handlers to the error
// middleware — an unhandled rejection would hang the request. Wrap async
// handlers so their rejections reach next().
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
