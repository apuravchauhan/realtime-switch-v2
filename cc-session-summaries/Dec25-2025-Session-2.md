# Claude Code Session 2: Service-Oriented Architecture and Factory Patterns
## Building pack-db - SQLite Database Layer with Kysely ORM

This document captures a real engineering session demonstrating how to guide AI toward clean architecture. The goal was to build a SQLite database package using Kysely ORM with proper service factory patterns.

---

## Session Overview

**Project**: pack-db - SQLite database layer for the Realtime Switch v2 monorepo
**Duration**: Single comprehensive session
**Outcome**: Clean service factory architecture with Config, DatabaseConnection, AccountRepo, and 5 passing tests

---

## Key Themes Demonstrated

1. **Reject Over-Engineering** - Start simple, add complexity only when needed
2. **Service Factory Pattern** - One factory creates ALL singletons
3. **Dependency Injection** - Pass dependencies via constructor, not global state
4. **Follow Existing Patterns** - Reference existing codebase structure
5. **Iterative Correction** - Don't accept poor designs, keep refining

---

## The Session

### PHASE 1: Initial Approach Rejected - Service-First, Not Transport-First

**User**: "Now we will use Zeromq for unix based ipc communication. We will create a new repo named pack-db..."

**Claude-Code**: Created ZeroMQ server with handlers, routes, protocol types, full message format - 17 tests passing.

**User**: "actually what u created is shit! Follow the same service oriented approach! First just create IAccountRepo.ts that exposes two createAccount(fields) and getAccount(accountId). Then implement SQLiteAccountRepo.ts which uses Kysely for queries. Don't worry first about zeromq, thats just a transport we will think later. just focus on services first. remove everything else"

**CLAUDE'S INITIAL APPROACH (Over-engineered)**:
```typescript
// Created ZeroMQ REP server, handlers, protocol types
// src/types/protocol.ts
export enum Method {
  CREATE_ACCOUNT = 'account.create',
  READ_ACCOUNT = 'account.read',
  PING = 'ping'
}

// src/handlers/AccountHandler.ts
export class CreateAccountHandler implements Handler<CreateAccountParams, CreateAccountResult> { ... }

// src/DBServer.ts - ZeroMQ server
export class DBServer {
  private router: Map<Method, (params: any) => Response<any>>;
  async start() { ... }
}
```

**CORRECTED APPROACH (Service-oriented)**:
```typescript
// src/IAccountRepo.ts - Interface only
export interface IAccountRepo {
  createAccount(input: CreateAccountInput): Promise<Account>;
  getAccount(accountId: string): Promise<Account | null>;
}

// src/SQLiteAccountRepo.ts - Simple implementation
export class SQLiteAccountRepo implements IAccountRepo {
  async createAccount(input: CreateAccountInput): Promise<Account> { ... }
  async getAccount(accountId: string): Promise<Account | null> { ... }
}
```

> **HIGHLIGHT**: User rejected the over-engineered solution. Transport (ZeroMQ) is a separate concern from business logic (services). Build services first, add transport layer later. This is single responsibility principle in action.

---

### PHASE 2: Kysely Learning and Over-Engineering Rejection

**User**: Shared Kysely tutorial showing proper type definitions with `Generated`, `ColumnType`, `Selectable`, `Insertable`, `Updateable`.

**Claude-Code**: Implemented all the advanced type patterns from the tutorial.

**User**: "columntypes, selectables, insertable is an overkill to begin with"

**CLAUDE'S INITIAL KYSELY TYPES (Over-engineered)**:
```typescript
import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface AccountTable {
  id: Generated<string>;
  email: string;
  api_key: string;
  created_at: ColumnType<number, number, never>;  // Can't update
  updated_at: ColumnType<number, number, number>; // Can update
}

export type Account = Selectable<AccountTable>;
export type NewAccount = Insertable<AccountTable>;
export type AccountUpdate = Updateable<AccountTable>;
```

**CORRECTED APPROACH (Simple)**:
```typescript
export interface Account {
  id: string;
  email: string;
  api_key: string;
  plan_name: string;
  token_remaining: number;
  topup_remaining: number;
  status: number;
  created_at: number;
  updated_at: number;
}

export interface Database {
  accounts: Account;
}

export interface CreateAccountInput {
  email: string;
  planName?: string;
  tokenRemaining?: number;
  topupRemaining?: number;
}
```

> **HIGHLIGHT**: Just because a library offers advanced features doesn't mean you need them. Start with the simplest approach. Add `Generated`, `ColumnType`, etc. only when you actually need their benefits (compile-time safety for specific insert/update scenarios).

---

### PHASE 3: Shared Database Instance - Avoiding Anti-Patterns

**User**: "we will also have many other repos and i see u have made the design where new instance of db is created in every repo which is anti pattern"

**BEFORE (Anti-pattern - new DB per repo)**:
```typescript
export class SQLiteAccountRepo implements IAccountRepo {
  private db: Kysely<Database>;

  constructor(dbPath: string) {
    this.db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new Database(dbPath) })
    });
  }
}
// Each repo creates its own connection - wasteful and inconsistent
```

**AFTER (Shared connection)**:
```typescript
// Db.ts - Shared instance
let db: Kysely<DB> | null = null;

export function initDb(dbPath: string): Kysely<DB> {
  if (db) return db;
  db = new Kysely<DB>({ dialect: new SqliteDialect({ database: new Database(dbPath) }) });
  return db;
}

export function getDb(): Kysely<DB> {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// SQLiteAccountRepo.ts - Uses shared instance
export class SQLiteAccountRepo implements IAccountRepo {
  async createAccount(input: CreateAccountInput): Promise<Account> {
    await getDb().insertInto('accounts').values(row).execute();
    return row;
  }
}
```

> **HIGHLIGHT**: Database connections should be shared across repositories. Creating new connections per repo wastes resources and can cause issues with connection limits, transactions, and caching.

---

### PHASE 4: Following Existing Patterns - Reference the Codebase

**User**: "follow the same org structure interfaces and impls like u see in @rs-mono-v2/pack-server/. Have a folder inside interfaces named entities..."

**BEFORE (Flat structure)**:
```
pack-db/src/
├── IAccountRepo.ts
├── SQLiteAccountRepo.ts
├── Db.ts
├── Migrations.ts
└── index.ts
```

**AFTER (Following pack-server structure)**:
```
pack-db/src/
├── interfaces/
│   ├── entities/
│   │   └── Account.ts         # Account, Database, CreateAccountInput
│   ├── IAccountRepo.ts        # Repository interface
│   └── IServiceFactory.ts     # Factory interface
├── impls/
│   ├── Config.ts              # Environment configuration
│   ├── DatabaseConnection.ts  # Kysely connection wrapper
│   ├── SQLiteAccountRepo.ts   # Repository implementation
│   └── ServiceFactory.ts      # Singleton factory
└── index.ts
```

> **HIGHLIGHT**: Consistency across packages in a monorepo is crucial. When a pattern exists in one package, follow it in others. This makes the codebase predictable and easier to navigate.

---

### PHASE 5: Service Factory Evolution - Iterative Refinement

The ServiceFactory went through multiple iterations based on user feedback:

**Iteration 1: DatabaseConnection has its own singleton**
```typescript
// DatabaseConnection.ts
export class DatabaseConnection {
  private static instance: DatabaseConnection | null = null;

  static getInstance(dbPath?: string): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection(dbPath);
    }
    return DatabaseConnection.instance;
  }
}
```

**User**: "In servicefactory itself u can create singleton of Databaseconnection. why are u cluttering the creation inside Databaseconnection"

**Iteration 2: ServiceFactory creates DatabaseConnection**
```typescript
export class ServiceFactory {
  private dbConnection: DatabaseConnection;

  private constructor(dbPath: string) {
    this.dbConnection = new DatabaseConnection(dbPath);
  }
}
```

**User**: "what stupidity is this! IServiceFactory should have getDatabaseConnection() method"

**Iteration 3: IServiceFactory interface with getter**
```typescript
export interface IServiceFactory {
  getDatabaseConnection(): DatabaseConnection;
  getAccountRepo(): IAccountRepo;
}

export class ServiceFactory implements IServiceFactory {
  private dbConnection: DatabaseConnection | null = null;

  getDatabaseConnection(): DatabaseConnection {
    if (!this.dbConnection) this.dbConnection = new DatabaseConnection(this.config);
    return this.dbConnection;
  }
}
```

**User**: "even for Config instance, it should be created from servicefactory instead of getInstance method inside it"

**FINAL PATTERN**:
```typescript
// IServiceFactory.ts - Interface defines contract
export interface IServiceFactory {
  getDatabaseConnection(): DatabaseConnection;
  getAccountRepo(): IAccountRepo;
}

// ServiceFactory.ts - ONE factory creates ALL singletons
export class ServiceFactory implements IServiceFactory {
  private static instance: ServiceFactory | null = null;
  private config: Config | null = null;
  private dbConnection: DatabaseConnection | null = null;
  private accountRepo: SQLiteAccountRepo | null = null;

  private constructor() {}

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

  getAccountRepo(): IAccountRepo {
    if (!this.accountRepo) this.accountRepo = new SQLiteAccountRepo(this.getDatabaseConnection().getDb());
    return this.accountRepo;
  }
}

// Config.ts - Simple class, NO singleton logic
export class Config {
  private config: Map<ConfigKeys, string>;

  constructor() {  // Public constructor - ServiceFactory creates it
    dotenv.config({ path: envPath });
    this.config = new Map();
    // Load config...
  }

  get(key: ConfigKeys): string { ... }
}

// DatabaseConnection.ts - Simple class, receives Config
export class DatabaseConnection {
  constructor(config: Config) {  // DI via constructor
    const dbPath = config.get(ConfigKeys.DB_PATH);
    this.db = new Kysely<Database>({ dialect: new SqliteDialect({ database: new SQLite(dbPath) }) });
  }
}
```

> **HIGHLIGHT**: The Service Factory pattern should be the ONLY singleton in the system. All other classes (Config, DatabaseConnection, repos) are simple classes with public constructors. The factory creates and manages their lifecycle. This centralizes singleton logic in one place.

---

### PHASE 6: Config Pattern - Environment Variables

**User**: "You need to have Config that holds env variable. db path should be a db variable. In DBConnection, you pass in the Config instance and it can fetch whatever it wants"

```typescript
// Config.ts
export enum ConfigKeys {
  DB_PATH = 'DB_PATH',
}

export class Config {
  private config: Map<ConfigKeys, string>;

  constructor() {
    const envPath = path.resolve(__dirname, '../../../../.env');
    dotenv.config({ path: envPath });
    this.config = new Map();
    for (const key of Object.values(ConfigKeys)) {
      const value = process.env[key];
      if (value) this.config.set(key, value);
    }
  }

  get(key: ConfigKeys): string {
    const value = this.config.get(key);
    if (!value) throw new Error(`Configuration key '${key}' not found`);
    return value;
  }
}

// DatabaseConnection.ts - Receives Config
export class DatabaseConnection {
  constructor(config: Config) {
    const dbPath = config.get(ConfigKeys.DB_PATH);
    this.db = new Kysely<Database>({ dialect: new SqliteDialect({ database: new SQLite(dbPath) }) });
  }
}

// Test setup
beforeAll(async () => {
  process.env[ConfigKeys.DB_PATH] = TEST_DB_PATH;  // Set test path
  factory = ServiceFactory.getInstance();
  await factory.getDatabaseConnection().runMigrations();
});
```

> **HIGHLIGHT**: Configuration should be centralized in a Config class. Dependencies receive Config via constructor and fetch what they need. This makes testing easy (just set process.env before creating factory) and keeps configuration concerns separate.

---

## Summary: Effective Prompt Engineering Patterns

| Pattern | Example from Session |
|---------|---------------------|
| **Reject Bad Designs** | "what u created is shit! Follow service oriented approach" |
| **Start Simple** | "columntypes, selectables is overkill to begin with" |
| **Fix Anti-Patterns** | "new db instance per repo is anti pattern" |
| **Reference Existing Code** | "follow the same org structure as pack-server" |
| **Iterate Until Correct** | Multiple rounds of ServiceFactory refinement |
| **Centralize Singletons** | "Config singleton should be created from ServiceFactory" |

---

## Final Architecture

```
pack-db/src/
├── interfaces/
│   ├── entities/
│   │   └── Account.ts              # Account entity, Database schema, CreateAccountInput DTO
│   ├── IAccountRepo.ts             # Repository interface
│   └── IServiceFactory.ts          # Factory interface
├── impls/
│   ├── Config.ts                   # Env config (simple class)
│   ├── DatabaseConnection.ts       # Kysely wrapper (simple class)
│   ├── SQLiteAccountRepo.ts        # Repository implementation
│   └── ServiceFactory.ts           # THE singleton that creates everything
└── index.ts
```

**Key Design Principles**:
1. **One Singleton**: Only ServiceFactory has static getInstance()
2. **Lazy Initialization**: getConfig(), getDatabaseConnection(), getAccountRepo() create on first call
3. **Constructor Injection**: DatabaseConnection receives Config, repos receive db via constructor
4. **Interface Segregation**: IServiceFactory, IAccountRepo define contracts
5. **Simple Entities**: Plain interfaces without Kysely type helpers (add when needed)

**Usage Pattern**:
```typescript
// App startup
const factory = ServiceFactory.getInstance();
await factory.getDatabaseConnection().runMigrations();

// Get repos (singletons, created on first call)
const accountRepo = factory.getAccountRepo();
const account = await accountRepo.createAccount({ email: 'user@example.com' });

// Cleanup
ServiceFactory.reset();
```

---

*This session demonstrates that effective AI-assisted development requires active correction and iteration. The AI may propose over-engineered or inconsistent solutions - the human's role is to recognize these issues, reject them clearly, and guide toward simpler, more consistent patterns. Don't accept "good enough" when "correct" is achievable with a few more iterations.*
