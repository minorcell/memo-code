import { startMemoWebServer } from './server';

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) return parsed;
  return undefined;
}

async function bootstrap() {
  await startMemoWebServer({
    host: process.env.MEMO_WEB_HOST ?? process.env.HOST,
    port: parsePort(process.env.MEMO_WEB_PORT ?? process.env.PORT),
    staticDir: process.env.MEMO_WEB_STATIC_DIR,
  });
}

void bootstrap();
