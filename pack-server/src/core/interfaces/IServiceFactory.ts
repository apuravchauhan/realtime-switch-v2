import * as uWS from 'uWebSockets.js';
import { IAccountService } from 'pack-shared';
import { IVoiceConnection } from './IVoiceConnection';
import { ICheckpointHandler } from './ICheckpointHandler';
import { ZmqService } from '../impls/ZmqService';
import { Orchestrator } from '../../Orchestrator';

export interface IServiceFactory {
  getZmqService(): ZmqService;
  getAccountService(): IAccountService;
  getNewVoiceConnection(): IVoiceConnection;
  getNewCheckpointHandler(accountId: string, sessionId: string): ICheckpointHandler;
  getNewOrchestrator(
    accountId: string,
    sessionId: string,
    sessionData: string,
    credits: number,
    ws: uWS.WebSocket<unknown>
  ): Orchestrator;
}
