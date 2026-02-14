import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`);
});
