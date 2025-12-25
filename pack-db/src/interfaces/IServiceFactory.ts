import { IAccountRepo } from './IAccountRepo';
import { DatabaseConnection } from '../impls/DatabaseConnection';

export interface IServiceFactory {
  getDatabaseConnection(): DatabaseConnection;
  getAccountRepo(): IAccountRepo;
}
