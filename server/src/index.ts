import express from 'express';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`[ember] server listening on http://localhost:${PORT}`);
});
