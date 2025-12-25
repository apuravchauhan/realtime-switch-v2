import { IAccountService } from './IAccountService';
import { ISessionService } from './ISessionService';
import { IPersistenceRepo } from './IPersistenceRepo';
import { IVoiceConnection } from './IVoiceConnection';

export interface IServiceFactory {
  getAccountService(): IAccountService;
  getSessionService(): ISessionService;
  getPersistence(): IPersistenceRepo;
  getNewOAIVoiceConnection(): IVoiceConnection;
}
