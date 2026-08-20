import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import { authRouter } from './auth/routes.js';
import { postsRouter } from './posts/routes.js';

// Builds the fully-configured Express app without binding a port, so tests can
// drive it in-process with supertest. index.ts's tail composes this and listens.
export function createApp() {
  const app = express();

  app.use(express.json());

  const SESSION_SECRET = process.env.SESSION_SECRET;
  if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET is not set — copy server/.env.example to server/.env');
  }

  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', authRouter);
  app.use('/api', postsRouter);

  if (process.env.NODE_ENV === 'production') {
    const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
    const serveClient = express.static(clientDist);
    const isApiPath = (path: string) => path === '/api' || path.startsWith('/api/');

    app.use((req, res, next) => {
      if (isApiPath(req.path)) {
        next();
        return;
      }
      serveClient(req, res, next);
    });

    app.get('*', (req, res, next) => {
      if (isApiPath(req.path)) {
        next();
        return;
      }
      res.sendFile('index.html', { root: clientDist }, (err) => {
        if (err) next(err);
      });
    });
  }

  // Terminal error handler — turns unexpected errors into a 500 instead of a
  // hung request. Must be registered after the routes and production serving.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[ember] unhandled error', err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

// Start the server only when run directly (tsx src/index.ts), not when imported
// by tests. ESM has no require.main; compare this module's path to argv[1].
if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const PORT = Number(process.env.PORT ?? 3001);
  createApp().listen(PORT, () => {
    console.log(`[ember] server listening on http://localhost:${PORT}`);
  });
}
