import * as uWS from 'uWebSockets.js';
import { IAccountService, SessionData, Config, ConfigKeys } from 'pack-shared';
import { IServiceFactory } from '../interfaces/IServiceFactory';
import { ICheckpointHandler } from '../interfaces/ICheckpointHandler';
import { IUsageHandler } from '../interfaces/IUsageHandler';
import { ZmqService } from './ZmqService';
import { AccountServiceZmq } from './AccountServiceZmq';
import { CheckpointHandler } from './CheckpointHandler';
import { UsageHandler } from './UsageHandler';
import { Orchestrator } from '../../Orchestrator';

export class ServiceFactory implements IServiceFactory {
  private static instance: ServiceFactory | null = null;

  private zmqService: ZmqService | null = null;
  private accountService: AccountServiceZmq | null = null;

  private constructor() {}

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  static reset(): void {
    if (ServiceFactory.instance?.zmqService) {
      ServiceFactory.instance.zmqService.destroy();
    }
    ServiceFactory.instance = null;
    Config.reset();
  }

  getZmqService(): ZmqService {
    if (!this.zmqService) {
      let socketPath: string | undefined;
      let timeoutMs: number | undefined;
      try {
        socketPath = Config.get(ConfigKeys.ZMQ_SOCKET_PATH);
      } catch (error) {
        // ZMQ_SOCKET_PATH is optional, will use default if not provided
        socketPath = undefined;
      }
      try {
        timeoutMs = parseInt(Config.get(ConfigKeys.ZMQ_TIMEOUT_MS), 10);
      } catch (error) {
        // ZMQ_TIMEOUT_MS is optional, will use default if not provided
        timeoutMs = undefined;
      }
      this.zmqService = new ZmqService(socketPath, timeoutMs);
    }
    return this.zmqService;
  }

  getAccountService(): IAccountService {
    if (!this.accountService) {
      this.accountService = new AccountServiceZmq(this.getZmqService());
    }
    return this.accountService;
  }

  getNewCheckpointHandler(accountId: string, sessionId: string): ICheckpointHandler {
    return new CheckpointHandler(accountId, sessionId, this.getAccountService());
  }

  getNewUsageHandler(accountId: string, sessionId: string): IUsageHandler {
    return new UsageHandler(accountId, sessionId, this.getAccountService());
  }

  getNewOrchestrator(
    sessionData: SessionData,
    ws: uWS.WebSocket<unknown>
  ): Orchestrator {
    return new Orchestrator(
      sessionData,
      ws,
      this
    );
  }
}
