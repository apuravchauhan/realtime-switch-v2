import { IAccountService } from 'pack-shared';
import { ILLMService } from './ILLMService';
import { IAccountRepo } from './IAccountRepo';
import { DatabaseConnection } from '../impls/DatabaseConnection';
import { Migrator } from '../impls/migrations/Migrator';
import { ZmqHandler } from '../impls/ZmqHandler';
import { Config } from '../impls/Config';

export interface IServiceFactory {
  getConfig(): Config;
  getDatabaseConnection(): DatabaseConnection;
  getMigrator(): Migrator;
  getAccountRepo(): IAccountRepo;
  getAccountService(): IAccountService;
  getLLMService(): ILLMService;
  getZmqHandler(): ZmqHandler;
}
