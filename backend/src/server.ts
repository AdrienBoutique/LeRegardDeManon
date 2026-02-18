import "dotenv/config";
import { app } from "./app";
import { startReminders24hScheduler } from "./jobs/reminders24h";
import { ensureBootstrapAdmin } from "./lib/bootstrapAdmin";

const port = Number(process.env.PORT || 3000);

async function main(): Promise<void> {
  await ensureBootstrapAdmin();
  startReminders24hScheduler();

  app.listen(port, "0.0.0.0", () => {
    console.log(`[backend] listening on port ${port}`);
  });
}

main().catch((error) => {
  console.error("[backend] startup failed", error);
  process.exit(1);
});
