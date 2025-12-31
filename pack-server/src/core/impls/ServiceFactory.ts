import * as uWS from 'uWebSockets.js';
import { IAccountService } from 'pack-shared';
import { IServiceFactory } from '../interfaces/IServiceFactory';
import { IVoiceConnection } from '../interfaces/IVoiceConnection';
import { ICheckpointHandler } from '../interfaces/ICheckpointHandler';
import { ZmqService } from './ZmqService';
import { AccountServiceZmq } from './AccountServiceZmq';
import { CheckpointHandler } from './CheckpointHandler';
import { OpenAIConnection } from '../../OpenAIConnection';
import { Orchestrator } from '../../Orchestrator';
import { Config, ConfigKeys } from './Config';

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
      const config = Config.getInstance();
      const socketPath = config.has(ConfigKeys.ZMQ_SOCKET_PATH)
        ? config.get(ConfigKeys.ZMQ_SOCKET_PATH)
        : undefined;
      this.zmqService = new ZmqService(socketPath);
    }
    return this.zmqService;
  }

  getAccountService(): IAccountService {
    if (!this.accountService) {
      this.accountService = new AccountServiceZmq(this.getZmqService());
    }
    return this.accountService;
  }

  getNewVoiceConnection(): IVoiceConnection {
    return new OpenAIConnection();
  }

  getNewCheckpointHandler(accountId: string, sessionId: string): ICheckpointHandler {
    return new CheckpointHandler(accountId, sessionId, this.getAccountService());
  }

  getNewOrchestrator(
    accountId: string,
    sessionId: string,
    sessionData: string,
    credits: number,
    ws: uWS.WebSocket<unknown>
  ): Orchestrator {
    return new Orchestrator(
      accountId,
      sessionId,
      sessionData,
      credits,
      ws,
      this
    );
  }
}
