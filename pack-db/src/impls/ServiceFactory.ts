import { IAccountService } from 'pack-shared';
import { ILLMService } from '../interfaces/ILLMService';
import { IServiceFactory } from '../interfaces/IServiceFactory';
import { IAccountRepo } from '../interfaces/IAccountRepo';
import { Config } from './Config';
import { DatabaseConnection } from './DatabaseConnection';
import { SQLiteAccountRepo } from './SQLiteAccountRepo';
import { AccountServiceImpl } from './AccountServiceImpl';
import { LLMServiceGemini } from './LLMServiceGemini';
import { ZmqHandler } from './ZmqHandler';
import { Migrator } from './migrations/Migrator';

export class ServiceFactory implements IServiceFactory {
  private static instance: ServiceFactory | null = null;
  private config: Config | null = null;
  private dbConnection: DatabaseConnection | null = null;
  private accountRepo: SQLiteAccountRepo | null = null;
  private accountService: AccountServiceImpl | null = null;
  private llmService: LLMServiceGemini | null = null;
  private zmqHandler: ZmqHandler | null = null;
  private migrator: Migrator | null = null;

  private constructor() {}

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  static reset(): void {
    if (ServiceFactory.instance?.zmqHandler) {
      ServiceFactory.instance.zmqHandler.stop();
    }
    if (ServiceFactory.instance?.dbConnection) {
      ServiceFactory.instance.dbConnection.destroy();
    }
    ServiceFactory.instance = null;
  }

  getConfig(): Config {
    if (!this.config) {
      this.config = new Config();
    }
    return this.config;
  }

  getDatabaseConnection(): DatabaseConnection {
    if (!this.dbConnection) {
      this.dbConnection = new DatabaseConnection(this.getConfig());
    }
    return this.dbConnection;
  }

  getMigrator(): Migrator {
    if (!this.migrator) {
      this.migrator = new Migrator(this.getDatabaseConnection().getDb());
    }
    return this.migrator;
  }

  getAccountRepo(): IAccountRepo {
    if (!this.accountRepo) {
      this.accountRepo = new SQLiteAccountRepo(this.getDatabaseConnection().getDb());
    }
    return this.accountRepo;
  }

  getLLMService(): ILLMService {
    if (!this.llmService) {
      this.llmService = new LLMServiceGemini(this.getConfig());
    }
    return this.llmService;
  }

  getAccountService(): IAccountService {
    if (!this.accountService) {
      this.accountService = new AccountServiceImpl(
        this.getAccountRepo() as SQLiteAccountRepo,
        this.getLLMService()
      );
    }
    return this.accountService;
  }

  getZmqHandler(): ZmqHandler {
    if (!this.zmqHandler) {
      this.zmqHandler = new ZmqHandler(this.getAccountService());
    }
    return this.zmqHandler;
  }
}
