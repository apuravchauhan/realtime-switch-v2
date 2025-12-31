import { Logger } from 'pack-shared';
import { Server } from './DbServer';
import { ServiceFactory } from './impls/ServiceFactory';

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
 * Start the database server
 */
export async function startDbServer(): Promise<void> {
  setupProcessHandlers();

  Logger.debug(CLASS_NAME, null, 'Starting database service...');

  const server = new Server();
  await server.start();
}

// Run server if this file is executed directly
if (require.main === module) {
  startDbServer().catch((error) => {
    Logger.error(CLASS_NAME, null, 'Failed to start database service', error);
    process.exit(1);
  });
}
