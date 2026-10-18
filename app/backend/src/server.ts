import { createServer } from 'node:http';
import { createApiApp } from './http/api';

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const server = createServer(createApiApp());
server.listen(port, '0.0.0.0', () => {
  console.info(`SOAR API listening on 0.0.0.0:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error('SOAR API shutdown failed.');
        process.exitCode = 1;
      }
    });
  });
}
