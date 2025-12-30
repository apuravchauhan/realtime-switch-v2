import * as uWS from 'uWebSockets.js';
import { SessionData } from 'pack-shared';
import { ServiceFactory } from './core/impls/ServiceFactory';
import { Orchestrator } from './Orchestrator';

const CLASS_NAME = 'Server';

// Types
type UserData = {
  apiStyle: string;
  sessionId: string;
  accountId: string;
  sessionData: string;
  credits: number;
  orchestrator: Orchestrator | null;
};

// Global Error Handlers
process.on('uncaughtException', (error) => {
  console.error(`[${CLASS_NAME}] Uncaught Exception:`, error);
});

process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  console.error(`[${CLASS_NAME}] Unhandled Promise Rejection:`, error);
});

process.on('SIGTERM', async () => {
  console.log(`[${CLASS_NAME}] Received SIGTERM, shutting down gracefully...`);
  await gracefulShutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log(`[${CLASS_NAME}] Received SIGINT (Ctrl+C), shutting down gracefully...`);
  await gracefulShutdown();
  process.exit(0);
});

async function gracefulShutdown(): Promise<void> {
  try {
    console.log(`[${CLASS_NAME}] Starting graceful shutdown...`);
    ServiceFactory.reset();
    console.log(`[${CLASS_NAME}] Graceful shutdown completed`);
  } catch (error) {
    console.error(`[${CLASS_NAME}] Error during graceful shutdown:`, error);
  }
}

export async function startServer(port: number = 3000, host: string = 'localhost'): Promise<void> {
  // Initialize services
  const factory = ServiceFactory.getInstance();
  await factory.getZmqService().connect();
  const accountService = factory.getAccountService();

  const app = uWS.App()
    .ws<UserData>('/*', {
      compression: uWS.SHARED_COMPRESSOR,
      maxPayloadLength: 2 * 1024 * 1024,
      idleTimeout: 120,

      upgrade: async (res, req, context) => {
        // Set abort handler FIRST
        res.onAborted(() => {
          (res as any).aborted = true;
        });

        // Capture request data BEFORE any await
        const apiKey = req.getQuery('rs_key');
        const sessionId = req.getQuery('rs_sessid');
        const apiStyle = req.getQuery('rs_api') || 'OPENAI';

        // Capture WebSocket headers before async operations
        const secWebSocketKey = req.getHeader('sec-websocket-key');
        const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
        const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');

        // Validate required parameters
        if (!apiKey || !sessionId) {
          console.warn(`[${CLASS_NAME}] Missing required query parameters`);
          if (!(res as any).aborted) {
            res.cork(() => {
              res.writeStatus('400 Bad Request').end('Missing parameters: rs_key, rs_sessid required');
            });
          }
          return;
        }

        // Validate and load session via ZMQ to pack-db
        let authResult: SessionData;
        try {
          authResult = await accountService.validateAndLoad(apiKey, sessionId);
        } catch (error) {
          console.error(`[${CLASS_NAME}] Auth service error:`, error);
          if (!(res as any).aborted) {
            res.cork(() => {
              res.writeStatus('503 Service Unavailable').end('Authentication service unavailable');
            });
          }
          return;
        }

        if (authResult.error) {
          const statusCode = authResult.error === 'NO_CREDITS' ? '402 Payment Required' : '403 Forbidden';
          const errorMessage = authResult.error === 'NO_CREDITS'
            ? `Insufficient credits. Remaining: ${authResult.credits}`
            : authResult.error;

          console.warn(`[${CLASS_NAME}] Connection rejected: ${errorMessage}`);

          if (!(res as any).aborted) {
            res.cork(() => {
              res.writeStatus(statusCode).end(errorMessage);
            });
          }
          return;
        }

        // Upgrade to WebSocket
        if (!(res as any).aborted) {
          res.cork(() => {
            res.upgrade(
              {
                apiStyle,
                sessionId,
                accountId: authResult.accountId,
                sessionData: authResult.sessionData,
                credits: authResult.credits,
                orchestrator: null,
              } as UserData,
              secWebSocketKey,
              secWebSocketProtocol,
              secWebSocketExtensions,
              context
            );
          });
        }
      },

      open: (ws: uWS.WebSocket<UserData>) => {
        const userData = ws.getUserData();
        console.log(`[${CLASS_NAME}] WebSocket connected - Account: ${userData.accountId}, Session: ${userData.sessionId}`);

        // Create orchestrator and connect to voice provider
        const orchestrator = factory.getNewOrchestrator(
          userData.accountId,
          userData.sessionId,
          userData.sessionData,
          userData.credits,
          ws
        );
        userData.orchestrator = orchestrator;
        orchestrator.connect();
      },

      message: (ws: uWS.WebSocket<UserData>, message, isBinary) => {
        if (!isBinary) {
          try {
            const jsonString = Buffer.from(message).toString('utf-8');
            const event = JSON.parse(jsonString);
            ws.getUserData().orchestrator?.send(event);
          } catch (error) {
            const userData = ws.getUserData();
            console.error(`[${CLASS_NAME}] Error parsing message for ${userData.accountId}:`, error);
          }
        }
      },

      drain: (ws) => {
        const userData = ws.getUserData();
        console.log(`[${CLASS_NAME}] WebSocket backpressure for ${userData.accountId}: ${ws.getBufferedAmount()}`);
      },

      close: (ws, code, _message) => {
        const userData = ws.getUserData();
        console.log(`[${CLASS_NAME}] WebSocket closed - Account: ${userData.accountId}, Session: ${userData.sessionId}, Code: ${code}`);

        // Cleanup orchestrator
        if (userData.orchestrator) {
          userData.orchestrator.cleanup();
          userData.orchestrator = null;
        }
      },
    })
    .any('/*', (res) => {
      res.writeStatus('404').end('Realtime Switch v2 - Connect via WebSocket');
    })
    .listen(port, (token) => {
      if (token) {
        console.log(`[${CLASS_NAME}] Server listening on ${host}:${port}`);
      } else {
        console.error(`[${CLASS_NAME}] Failed to listen on port ${port}`);
        process.exit(1);
      }
    });
}

// Run if executed directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000');
  const host = process.env.HOST || 'localhost';
  startServer(port, host);
}
