import { IAccountService } from 'pack-shared';
import { ILLMService } from './ILLMService';
import { IAccountRepo } from './IAccountRepo';
import { IUsageRepo } from './IUsageRepo';
import { ISessionRepo } from './ISessionRepo';
import { DatabaseConnection } from '../impls/DatabaseConnection';
import { Migrator } from '../impls/migrations/Migrator';
import { ZmqHandler } from '../impls/ZmqHandler';

export interface IServiceFactory {
  getDatabaseConnection(): DatabaseConnection;
  getMigrator(): Migrator;
  getAccountRepo(): IAccountRepo;
  getUsageRepo(): IUsageRepo;
  getSessionRepo(): ISessionRepo;
  getAccountService(): IAccountService;
  getLLMService(): ILLMService;
  getZmqHandler(): ZmqHandler;
}
