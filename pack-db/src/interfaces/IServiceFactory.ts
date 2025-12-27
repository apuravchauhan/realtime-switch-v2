import { IAccountRepo } from './IAccountRepo';
import { DatabaseConnection } from '../impls/DatabaseConnection';
import { Migrator } from '../impls/migrations/Migrator';
import { Config } from '../impls/Config';

export interface IServiceFactory {
  getDatabaseConnection(): DatabaseConnection;
  getMigrator(): Migrator;
  getAccountRepo(): IAccountRepo;
  getConfig(): Config;
}
