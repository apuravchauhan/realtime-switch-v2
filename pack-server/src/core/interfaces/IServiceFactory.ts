import * as uWS from 'uWebSockets.js';
import { IAccountService, SessionData } from 'pack-shared';
import { ICheckpointHandler } from './ICheckpointHandler';
import { IUsageHandler } from './IUsageHandler';
import { ZmqService } from '../impls/ZmqService';
import { Orchestrator } from '../../Orchestrator';

export interface IServiceFactory {
  getZmqService(): ZmqService;
  getAccountService(): IAccountService;
  getNewCheckpointHandler(accountId: string, sessionId: string): ICheckpointHandler;
  getNewUsageHandler(accountId: string, sessionId: string): IUsageHandler;
  getNewOrchestrator(
    sessionData: SessionData,
    ws: uWS.WebSocket<unknown>
  ): Orchestrator;
}
