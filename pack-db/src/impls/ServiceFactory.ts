import { IAccountService, Config } from 'pack-shared';
import { ILLMService } from '../interfaces/ILLMService';
import { IServiceFactory } from '../interfaces/IServiceFactory';
import { IAccountRepo } from '../interfaces/IAccountRepo';
import { IUsageRepo } from '../interfaces/IUsageRepo';
import { ISessionRepo } from '../interfaces/ISessionRepo';
import { DatabaseConnection } from './DatabaseConnection';
import { SQLiteAccountRepo } from './SQLiteAccountRepo';
import { SQLUsageRepo } from './SQLUsageRepo';
import { SQLSessionRepo } from './SQLSessionRepo';
import { AccountServiceImpl } from './AccountServiceImpl';
import { LLMServiceGemini } from './LLMServiceGemini';
import { ZmqHandler } from './ZmqHandler';
import { Migrator } from './migrations/Migrator';

export class ServiceFactory implements IServiceFactory {
  private static instance: ServiceFactory | null = null;
  private dbConnection: DatabaseConnection | null = null;
  private accountRepo: SQLiteAccountRepo | null = null;
  private usageRepo: SQLUsageRepo | null = null;
  private sessionRepo: SQLSessionRepo | null = null;
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
    Config.reset();
    ServiceFactory.instance = null;
  }

  getDatabaseConnection(): DatabaseConnection {
    if (!this.dbConnection) {
      this.dbConnection = new DatabaseConnection();
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

  getUsageRepo(): IUsageRepo {
    if (!this.usageRepo) {
      this.usageRepo = new SQLUsageRepo(this.getDatabaseConnection().getDb());
    }
    return this.usageRepo;
  }

  getSessionRepo(): ISessionRepo {
    if (!this.sessionRepo) {
      this.sessionRepo = new SQLSessionRepo(this.getDatabaseConnection().getDb());
    }
    return this.sessionRepo;
  }

  getLLMService(): ILLMService {
    if (!this.llmService) {
      this.llmService = new LLMServiceGemini();
    }
    return this.llmService;
  }

  getAccountService(): IAccountService {
    if (!this.accountService) {
      this.accountService = new AccountServiceImpl(
        this.getAccountRepo(),
        this.getSessionRepo(),
        this.getUsageRepo(),
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
