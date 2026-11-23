import { app, flagsmith } from './app.js';

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`GreenGate News Reader on http://localhost:${port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await flagsmith?.close();
}

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
