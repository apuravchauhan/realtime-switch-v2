import * as uWS from 'uWebSockets.js';
import { SessionData, Logger } from 'pack-shared';
import { ServiceFactory } from './core/impls/ServiceFactory';
import { Orchestrator } from './Orchestrator';

const CLASS_NAME = 'Server';

export interface ServerConfig {
  port: number;
  host: string;
  maxPayloadLength: number;
  idleTimeout: number;
}

type UserData = {
  apiStyle: string;
  sessionId: string;
  sessionData: SessionData;
  orchestrator: Orchestrator | null;
};

export class Server {
  private config: ServerConfig;
  private factory: ServiceFactory;

  constructor(config: ServerConfig) {
    this.config = config;
    this.factory = ServiceFactory.getInstance();
  }

  async start(): Promise<void> {
    // Connect to ZMQ service
    await this.factory.getZmqService().connect();
    const accountService = this.factory.getAccountService();

    const app = uWS.App()
      .ws<UserData>('/*', {
        compression: uWS.SHARED_COMPRESSOR,
        maxPayloadLength: this.config.maxPayloadLength,
        idleTimeout: this.config.idleTimeout,

        upgrade: async (res, req, context) => {
          // Handle abort
          res.onAborted(() => {
            (res as any).aborted = true;
          });

          // Extract query parameters
          const apiKey = req.getQuery('rs_key');
          const sessionId = req.getQuery('rs_sessid');
          const apiStyle = req.getQuery('rs_api') || 'OPENAI';

          // Extract WebSocket headers
          const secWebSocketKey = req.getHeader('sec-websocket-key');
          const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
          const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');

          // Validate required parameters
          if (!apiKey || !sessionId) {
            Logger.warn(CLASS_NAME, null, 'Missing required query parameters');
            if (!(res as any).aborted) {
              res.cork(() => {
                res.writeStatus('400 Bad Request').end('Missing parameters: rs_key, rs_sessid required');
              });
            }
            return;
          }

          // Authenticate and load session data
          let authResult: SessionData;
          try {
            authResult = await accountService.validateAndLoad(apiKey, sessionId);
          } catch (error) {
            Logger.error(CLASS_NAME, null, 'Auth service error', error as Error);
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

            Logger.warn(CLASS_NAME, authResult.accountId || null, 'Connection rejected: {}', errorMessage);

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
                  sessionData: authResult,
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
          Logger.debug(CLASS_NAME, userData.sessionData.accountId || null,
            'WebSocket connected - Session: {}', userData.sessionId);

          // Create orchestrator with SessionData
          const orchestrator = this.factory.getNewOrchestrator(userData.sessionData, ws);
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
              Logger.error(CLASS_NAME, userData.sessionData.accountId || null,
                'Error parsing message', error as Error);
            }
          }
        },

        drain: (ws) => {
          const userData = ws.getUserData();
          Logger.debug(CLASS_NAME, userData.sessionData.accountId || null,
            'WebSocket backpressure: {}', ws.getBufferedAmount());
        },

        close: (ws, code, _message) => {
          const userData = ws.getUserData();
          Logger.debug(CLASS_NAME, userData.sessionData.accountId || null,
            'WebSocket closed - Session: {}, Code: {}', userData.sessionId, code);

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
      .listen(this.config.port, (token) => {
        if (token) {
          Logger.debug(CLASS_NAME, null, 'Server listening on {}:{}',
            this.config.host, this.config.port);
        } else {
          Logger.error(CLASS_NAME, null, 'Failed to listen on port {}',
            new Error('Listen failed'), this.config.port);
          process.exit(1);
        }
      });
  }
}
