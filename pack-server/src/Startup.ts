import { Logger } from 'pack-shared';
import { Server } from './Server';
import { ServiceFactory } from './core/impls/ServiceFactory';

const CLASS_NAME = 'Startup';

/**
 * Setup process event handlers for graceful shutdown and error handling
 */
function setupProcessHandlers(): void {
  process.on('uncaughtException', (error) => {
    Logger.error(CLASS_NAME, null, 'Uncaught Exception - consider fixing the root cause', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    Logger.error(CLASS_NAME, null, 'Unhandled Promise Rejection at: {}', error, promise);
  });

  process.on('SIGTERM', async () => {
    Logger.debug(CLASS_NAME, null, 'Received SIGTERM, shutting down gracefully...');
    await gracefulShutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    Logger.debug(CLASS_NAME, null, 'Received SIGINT (Ctrl+C), shutting down gracefully...');
    await gracefulShutdown();
    process.exit(0);
  });
}

/**
 * Perform graceful shutdown of all services
 */
async function gracefulShutdown(): Promise<void> {
  try {
    Logger.debug(CLASS_NAME, null, 'Starting graceful shutdown...');
    ServiceFactory.reset();
    Logger.debug(CLASS_NAME, null, 'Graceful shutdown completed');
  } catch (error) {
    Logger.error(CLASS_NAME, null, 'Error during graceful shutdown', error as Error);
  }
}

/**
 * Start the server
 */
export async function startServer(): Promise<void> {
  setupProcessHandlers();

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || 'localhost';
  const maxPayloadLength = parseInt(process.env.MAX_PAYLOAD_LENGTH || '2097152', 10); // 2MB default
  const idleTimeout = parseInt(process.env.IDLE_TIMEOUT || '120', 10);

  const server = new Server({
    port,
    host,
    maxPayloadLength,
    idleTimeout,
  });

  await server.start();
}

// Run server if this file is executed directly
if (require.main === module) {
  startServer().catch((error) => {
    Logger.error(CLASS_NAME, null, 'Failed to start server', error);
    process.exit(1);
  });
}
