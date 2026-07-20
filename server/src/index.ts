import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import { authRouter } from './auth/routes.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

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

// Terminal error handler — turns unexpected errors into a 500 instead of a
// hung request. Must be registered after the routes.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ember] unhandled error', err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`[ember] server listening on http://localhost:${PORT}`);
});
