import { IServiceFactory } from '../interfaces/IServiceFactory';
import { IAccountRepo } from '../interfaces/IAccountRepo';
import { Config } from './Config';
import { DatabaseConnection } from './DatabaseConnection';
import { SQLiteAccountRepo } from './SQLiteAccountRepo';
import { Migrator } from './migrations/Migrator';

export class ServiceFactory implements IServiceFactory {
  private static instance: ServiceFactory | null = null;
  private config: Config | null = null;
  private dbConnection: DatabaseConnection | null = null;
  private accountRepo: SQLiteAccountRepo | null = null;
  private migrator: Migrator | null = null;

  private constructor() { }

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) ServiceFactory.instance = new ServiceFactory();
    return ServiceFactory.instance;
  }

  static reset(): void {
    if (ServiceFactory.instance?.dbConnection) ServiceFactory.instance.dbConnection.destroy();
    ServiceFactory.instance = null;
  }

  getConfig(): Config {
    if (!this.config) this.config = new Config();
    return this.config;
  }

  getDatabaseConnection(): DatabaseConnection {
    if (!this.dbConnection) this.dbConnection = new DatabaseConnection(this.getConfig());
    return this.dbConnection;
  }

  getMigrator(): Migrator {
    if (!this.migrator) this.migrator = new Migrator(this.getDatabaseConnection().getDb());
    return this.migrator;
  }

  getAccountRepo(): IAccountRepo {
    if (!this.accountRepo) this.accountRepo = new SQLiteAccountRepo(this.getDatabaseConnection().getDb());
    return this.accountRepo;
  }
}
