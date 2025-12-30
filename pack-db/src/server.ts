import * as dotenv from 'dotenv';
import * as path from 'path';
import { ServiceFactory } from './impls/ServiceFactory';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ZMQ_SOCKET_PATH = process.env.ZMQ_SOCKET_PATH || 'ipc:///tmp/rs-pack-db.sock';

async function startDbServer() {
  console.log('[pack-db] Starting database service...');

  const factory = ServiceFactory.getInstance();
  const zmqHandler = factory.getZmqHandler();

  await zmqHandler.start(ZMQ_SOCKET_PATH);

  console.log('[pack-db] ✅ Database service ready and listening for requests');
  console.log(`[pack-db] Socket: ${ZMQ_SOCKET_PATH}`);
}

process.on('SIGTERM', async () => {
  console.log('[pack-db] Received SIGTERM, shutting down...');
  ServiceFactory.reset();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[pack-db] Received SIGINT (Ctrl+C), shutting down...');
  ServiceFactory.reset();
  process.exit(0);
});

startDbServer().catch((error) => {
  console.error('[pack-db] Failed to start:', error);
  process.exit(1);
});
