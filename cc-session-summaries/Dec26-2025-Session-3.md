# Claude Code Session 3: Migration System, Encryption, and API Keys
## Evolving pack-db with Enterprise Patterns and Security

This document captures a real engineering session demonstrating effective AI-assisted development with iterative refinement. The focus was on building a scalable migration system, implementing database encryption, and designing API keys schema.

---

## Session Overview

**Project**: pack-db - SQLite database layer for the Realtime Switch v2 monorepo
**Duration**: Single comprehensive session
**Outcome**: Migration system with Liquibase-style preconditions, SQLCipher encryption, API keys table, and 31 passing tests

---

## Key Themes Demonstrated

1. **Provide Reference Examples** - Show patterns you want replicated
2. **Ask Deep Questions** - Understand trade-offs before implementing
3. **Verify AI Research** - Challenge recommendations and verify maintenance status
4. **Request Confirmation Before Implementation** - Prevent wasted work
5. **Consolidate Over-Engineering** - Push back on unnecessary abstractions

---

## The Session

### PHASE 1: Migration System with Liquibase-Style Preconditions

**User**: "lets manage migrations now in a scalable and structured way. You have cluttered migrations inside Dbconnection and have not followed separation of concerns... For enterprise and safe patterns, i would like to use something like liquibase's precondition style execution"

**User Provided Example** (PostgreSQL pattern to adapt):
```typescript
export class PreconditionHelpers {
  static async tableExists(db: Kysely<any>, tableName: string): Promise<boolean> {
    const result = await sql<{ exists: boolean }>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
      )
    `.execute(db);
    return result.rows[0].exists;
  }
}
```

**Implementation Result** (SQLite-adapted):
```typescript
// src/impls/migrations/PreconditionHelpers.ts
export class PreconditionHelpers {
  static async tableExists(db: Kysely<any>, tableName: string): Promise<boolean> {
    const result = await sql<{ cnt: number }>`
      SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name = ${tableName}
    `.execute(db);
    return result.rows[0].cnt > 0;
  }
  // Also: columnExists, indexExists, triggerExists, tableIsEmpty, rowExists
}

// Migration using preconditions
export async function up(db: Kysely<any>): Promise<MigrationStatus> {
  if (await PreconditionHelpers.tableExists(db, 'accounts')) {
    console.log('✅ SKIPPED: accounts table already exists');
    return 'skipped';
  }
  // ... create table
  return 'executed';
}
```

> **HIGHLIGHT**: The user provided a complete example of the pattern they wanted. This eliminates ambiguity and ensures the implementation matches expectations. Showing > Telling.

---

### PHASE 2: SQLite Timestamp Pattern Correction

**User**: "also sharing an example from Kysely just to confirm for SQLite"

```typescript
// User's reference (from Kysely docs)
.addColumn('created_at', 'text', (col) =>
  col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
)
```

**Issue Found**: Claude had used `integer` with Unix timestamps. SQLite with Kysely should use `text` with ISO8601.

```typescript
// BEFORE (wrong for SQLite)
.addColumn('created_at', 'integer', (col) => col.notNull())
// In repo: const now = Math.floor(Date.now() / 1000);

// AFTER (correct pattern)
.addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
// In repo: const now = new Date().toISOString();
```

> **HIGHLIGHT**: User shared official documentation to correct AI assumptions. Reference docs > AI memory.

---

### PHASE 3: API Keys Design Discussion

**User**: "technically a single account can create many api keys. how should we structure this?"

Claude proposed options:
1. Separate `api_keys` table (recommended)
2. Keep `api_key` on Account
3. JSON array in Account

**User**: "should we have id as the api key itself uuid instead of separate id and api key column? how does security come to play in this choice?"

Claude's analysis:
| Concern | Separate id + key | id = key |
|---------|-------------------|----------|
| Key rotation | Keep id, update key | Delete + insert, loses history |
| Audit trail | Stable reference | FK breaks on rotation |
| Defense in depth | ID in logs, key separate | ID leak = key leak |

**User Challenge**: "can u elaborate what u mean by audit trail, we can just have accID and keyindicator suffice the need for audit trail and status can be skipped since expiredAt can be used for that"

**Final Schema** (user-refined):
```typescript
api_keys
--------
key_hash (PK, text)       // SHA256 of plain key
account_id (FK, text)     // owner
key_indicator (text)      // "rsliv...8fe3a"
label (text, max 30)      // user-defined name
created_at (text)
expires_at (text|null)    // null = never, set to now = revoked
last_used_at (text|null)
```

> **HIGHLIGHT**: User pushed back on complexity (separate `status` field), proposing `expires_at` serve dual purpose. Simpler is better when it meets requirements.

---

### PHASE 4: Encryption at Rest Deep Dive

**User**: "how does encryption at rest play as a concept when working with sqlite? example 2moro i need to go for Soc2Type2?"

Claude explained three levels:
```
Level 1: Disk (LUKS, BitLocker) → Transparent to app, protects stolen drives
Level 2: DB (SQLCipher)         → Key at connection, transparent queries
Level 3: Column (App-level)     → Encrypt/decrypt in code, can't search
```

**User**: "in aws rds, when we enabled encryption at rest, does it enabled disk level or db level?"

**Answer**: Disk level (Level 1) - EBS encryption via KMS. Protects backups/snapshots, but NOT against SQL injection or credential theft.

**User Deep Dive**: "elaborate how iamrole works vizualize as api calls that must be going from the machine"

Claude visualized IMDS flow:
```
EC2 Instance
    ↓ GET http://169.254.169.254/... (magic IP, no auth)
    ↓ Returns temp credentials (6-hour rotation)
    ↓
AWS KMS
    ↓ Validates signature, checks IAM policy
    ↓ Logs to CloudTrail
    ↓ Returns decrypted value
```

**User**: "so if he gets the access to ec2 instance, he would by default get the imds access and get the 6 hour token and get do anything from there. correct?"

**Answer**: "Yes, correct. IAM role doesn't protect a compromised instance - it protects everything else (backups, git, audit, revocation, blast radius)."

> **HIGHLIGHT**: User asked increasingly specific questions to understand the full security model, not just accept "KMS is secure." Understanding > blind trust.

---

### PHASE 5: Package Selection and Verification

**User**: "https://github.com/m4heshd/better-sqlite3-multiple-ciphers how about this one and how does this compare?"

**User**: "why did u recommend a less maintained library?"

**Claude's Admission**:
> "You're right to call that out. I made a mistake. When I first listed options, I put @journeyapps/sqlcipher first without having checked maintenance status - it was just the more commonly mentioned one historically. I should have researched both properly before suggesting anything."

**Final Choice**: `better-sqlite3-multiple-ciphers` - more active, latest SQLite version

> **HIGHLIGHT**: User asked for comparison and caught that Claude recommended a less-maintained package. Always verify AI package recommendations.

---

### PHASE 6: Preventing Premature Implementation

**User**: "dont implement without confirming"

Before implementation, Claude confirmed:
1. Fresh start or migrate existing DBs? → Fresh (still dev)
2. Key management: Just .env for now? → Yes
3. Confirm package choice

**User**: "yes, go ahead and i hope u have read the documentation of the right way to use"

Implementation:
```typescript
import SQLite from 'better-sqlite3-multiple-ciphers';

constructor(config: Config) {
  const dbPath = config.get(ConfigKeys.DB_PATH);
  const encryptionKey = config.get(ConfigKeys.DB_ENCRYPTION_KEY);
  const sqlite = new SQLite(dbPath);
  sqlite.pragma(`cipher='sqlcipher'`);
  sqlite.pragma(`legacy=4`);  // Compatible with DB Browser for SQLite
  sqlite.pragma(`key='${encryptionKey}'`);
  this.db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}
```

> **HIGHLIGHT**: User established a gate: "don't implement without confirming." This prevents wasted work on wrong approaches.

---

### PHASE 7: Visual Verification of Encryption

**User**: "good. comment the cleanup for a moment and I want to see it myself. run the test again now after commenting"

Claude commented out `cleanup()`, ran tests, showed DB file exists.

**User**: "ok done. i can see before i connect now it asks for encryption key. good. u can revert the change now"

> **HIGHLIGHT**: User insisted on visual verification rather than trusting test assertions. Seeing is believing.

---

### PHASE 8: Consolidating Over-Engineering

**User**: "u can avoid API key separate repo. in IAccountRepo we can have the methods needed for operations."

Claude had created:
- `IApiKeyRepo.ts` (interface)
- `SQLiteApiKeyRepo.ts` (implementation)

User wanted consolidation into existing `IAccountRepo`:
```typescript
export interface IAccountRepo {
  // Account methods
  createAccount(input: CreateAccountInput): Promise<Account>;
  getAccount(accountId: string): Promise<Account | null>;

  // API Key methods (consolidated)
  createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult>;
  validateApiKey(plainKey: string): Promise<ApiKey | null>;
  getApiKeysByAccountId(accountId: string): Promise<ApiKey[]>;
  revokeApiKey(keyHash: string): Promise<boolean>;
  updateLastUsed(keyHash: string): Promise<void>;
}
```

**User**: "You have created many methods around keys that might not be an immediate need... Please add a TODO.txt file... and add a point 1. Review the needed methods in IAccountRepo"

> **HIGHLIGHT**: User identified over-engineering and requested deferred review rather than immediate refactoring. Track tech debt, don't block on it.

---

### PHASE 9: Test Case Pattern for Visibility

**User**: "Now I am following a style for testcases where i list all testcases in 1 place and then refer these only to have a unified vision of what all have we covered."

Pattern from `pack-server`:
```typescript
// OpenAITestCases.ts
export enum OpenAITestCases {
  EXPECT_SESSION_CREATED = 'OpenAI session should be created with valid config',
  // ...
}

// Usage in test
expect(session, OpenAITestCases.EXPECT_SESSION_CREATED).toBeDefined();
```

Applied to `pack-db`:
```typescript
// AccountTestCases.ts
export enum AccountTestCases {
  EXPECT_ACCOUNT_ID_DEFINED = 'Account ID should be defined',
  EXPECT_EMAIL_MATCHES = 'Email should match input',
  EXPECT_DEFAULT_PLAN_FREE = 'Default plan should be Free',
  // ...
}
```

> **HIGHLIGHT**: User established a project-wide convention for test visibility. Consistency across packages.

---

## Summary: Effective Prompt Engineering Patterns

| Pattern | Example from Session |
|---------|---------------------|
| **Provide Reference Examples** | User shared Liquibase pattern + Kysely docs |
| **Ask Deep Questions** | "how does IAM role work as API calls?" |
| **Challenge AI Research** | "why did u recommend a less maintained library?" |
| **Gate Implementation** | "dont implement without confirming" |
| **Visual Verification** | "comment cleanup, I want to see it myself" |
| **Push Back on Complexity** | "status can be skipped since expiredAt can be used" |
| **Consolidate Abstractions** | "avoid API key separate repo" |
| **Track Tech Debt** | "add a TODO.txt" instead of immediate refactor |
| **Establish Conventions** | TestCases pattern across packages |

---

## Final Architecture

```
pack-db/src/
├── interfaces/
│   ├── entities/
│   │   ├── Account.ts          # Account entity, Database schema
│   │   └── ApiKey.ts           # ApiKey entity, CreateApiKeyInput, CreateApiKeyResult
│   ├── IAccountRepo.ts         # Combined account + API key operations
│   └── IServiceFactory.ts
├── impls/
│   ├── Config.ts               # DB_PATH, DB_ENCRYPTION_KEY
│   ├── DatabaseConnection.ts   # SQLCipher encrypted connection
│   ├── SQLiteAccountRepo.ts    # Account + API key implementation
│   ├── ServiceFactory.ts
│   └── migrations/
│       ├── PreconditionHelpers.ts  # SQLite-specific checks
│       ├── Migrator.ts             # runAll(), runMigration(), rollback()
│       └── scripts/
│           ├── 2025-01-01T001-CreateAccountsTable.ts
│           └── 2025-01-02T001-CreateApiKeysTable.ts
└── index.ts

tests/
├── AccountTestCases.ts
├── MigratorTestCases.ts
├── EncryptionTestCases.ts
├── ApiKeyTestCases.ts
├── SQLiteAccountRepo.test.ts
├── Migrator.test.ts
├── Encryption.test.ts
└── ApiKey.test.ts
```

**Key Design Decisions**:
1. **Liquibase-style migrations**: Each migration returns `'executed' | 'skipped'` status
2. **SQLCipher encryption**: DB-level encryption satisfies SOC2, transparent to queries
3. **Hashed API keys**: SHA256 stored, plain key returned only once at creation
4. **Consolidated repo**: API key methods live in IAccountRepo, not separate interface
5. **ISO8601 timestamps**: Text format for SQLite, lexicographic = chronological order

**Test Results**: 31 tests passing across 4 test files

---

## Encryption at Rest Concepts (Session Reference)

```
Level 1: Disk (OS/LUKS/BitLocker)
├── Transparent to app and DB
├── Protects stolen drives
└── Attacker with OS login can read

Level 2: DB (SQLCipher)
├── Key provided at connection
├── Transparent to app queries
├── Protects file/backup theft
└── Attacker with DB credentials can read

Level 3: Column (Application)
├── Encrypt/decrypt in code
├── Can't search/index encrypted data
└── Protects even against credential theft
```

AWS RDS "encryption at rest" = Level 1 (disk). SOC2 compliant but doesn't protect against SQL injection or credential theft.

---

*This session demonstrates that effective AI-assisted development requires active engagement: providing examples, asking clarifying questions, challenging recommendations, and pushing back on unnecessary complexity. The human's role is to guide the AI toward simpler, well-researched solutions rather than accepting the first proposal.*
