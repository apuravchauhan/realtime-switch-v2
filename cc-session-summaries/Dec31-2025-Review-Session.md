# Claude Code Review Session 2: Production-Quality Code Review & Refactoring
## Systematic Code Review with Parallel Agent Architecture

This document captures a comprehensive code review session demonstrating how to guide AI toward production-quality code through systematic reviews, catching over-engineering, and leveraging parallel agents for productivity.

---

## Session Overview

**Project**: realtime-switch-v2/pack-server and pack-db - Full monorepo refactoring
**Duration**: Extended review session with 2 rounds of comprehensive feedback
**Outcome**: Production-ready architecture with proper separation of concerns, centralized error handling, optimized performance, and clean code patterns
**Key Innovation**: Parallel agent execution for 4x productivity boost

---

## Key Themes Demonstrated

1. **Systematic Code Review** - Review with specific, actionable feedback points
2. **Catch Over-Engineering** - Reject unnecessary abstractions and helper functions
3. **Data-Driven Decisions** - Benchmark different approaches before choosing
4. **Parallel Agent Architecture** - Run 4 agents simultaneously for independent tasks
5. **Avoid Premature Abstractions** - Start simple, add complexity only when needed
6. **Separation of Concerns** - Move logic to appropriate handlers
7. **Static vs Singleton** - Choose the right pattern for the use case

---

## The Session

### PHASE 1: Initial Architecture Review - 8 Review Comments

**User**: "now lets review it and improve the code. read and understand it first and then lets discuss the below review comments"

**Review Comments Provided**:
1. Create Startup.ts with process handlers and gracefulShutdown
2. Server.ts should be a class with proper config
3. Replace console.log with Logger (reference @realtime-switch-prod)
4. Use SessionData object directly instead of separate fields
5. Fix Orchestrator onError - don't mark connection as false
6. Use indexOf instead of startsWith for JSON type checking
7. Benchmark trackUsage approaches (indexOf vs JSON.parse with reviver)
8. Create UsageHandler like CheckpointHandler for better separation

**User's Strategy**: "can't u run multiple agents to handle this list and parallelize the work example Benchmark thing can run in parallel"

> **HIGHLIGHT #1**: The user caught that Claude was working sequentially on independent tasks. When tasks have no dependencies, run agents IN PARALLEL for massive productivity gains. This is the difference between 30 minutes and 8 minutes of work.

---

### PHASE 2: Parallel Agent Architecture - 4x Productivity Boost

**CLAUDE'S APPROACH**: Launched 4 agents simultaneously:

```typescript
// 4 Task agents launched
├─ Replace console calls with Logger · Running in background
├─ Create UsageHandler class · Running in background
├─ Benchmark trackUsage approaches · Running in background
└─ Fix Orchestrator ws check · Running in background
```

**Result**: All 4 tasks completed in parallel, saving ~20 minutes of sequential work.

> **HIGHLIGHT #2**: When given 8 review comments, identify which are independent (no dependencies) and spawn multiple agents to work in parallel. This is the key to staying productive with AI assistance - don't wait for sequential execution when parallel is possible.

---

### PHASE 3: Benchmarking for Data-Driven Decisions

**User's Review**: "review trackUsageMethod which is having logic to calculate input and output token, i am considering just use Json.parse with reviver on only usage key instead of doing indexOf calculations that u r doing. can u benchmark after 100 runs which one is faster."

**CLAUDE'S BENCHMARK AGENT**: Created benchmark comparing 3 approaches:

```typescript
// Approach 1 (Current - indexOf)
const inputIdx = message.indexOf('"input_tokens":');
// ... manual parsing

// Approach 2 (Reviver)
JSON.parse(message, (key, value) => {
  if (key === "usage") usageData = value;
  return value;
});

// Approach 2 Optimized (indexOf + JSON.parse)
if (message.indexOf('"type":"response.done"') === -1) return null;
const parsed = JSON.parse(message);
```

**Initial Results**:
- Approach 1 (indexOf): ~52ms → 0.52 μs/op ✓ WINNER
- Approach 2 (reviver): ~946ms → 9.46 μs/op (18x slower)
- Approach 2 (optimized): ~166ms → 1.66 μs/op (3x slower)

**User Catches Issue**: "i meant in reviver if key is usage that do the parsing other return undefined. also in benchmark skip the first type check of response.done in both comparison"

> **HIGHLIGHT #3**: The user caught that the benchmark wasn't fair - it included the type check in one approach but not the other, and didn't use the optimized reviver pattern (returning undefined for unwanted keys). Always ensure benchmarks compare apples to apples.

**IMPROVED BENCHMARK**:
```typescript
// Approach 2 (reviver with undefined)
JSON.parse(message, function(key, value) {
  if (key === "usage" && value && typeof value === "object") {
    inputTokens = value.input_tokens;
    outputTokens = value.output_tokens;
  }
  return value; // Can't return undefined - breaks JSON.parse
});
```

**Final Results** (fair comparison, no type check):
- Approach 1 (indexOf): 49.42 ms (0.494 μs/op) ✓ WINNER
- Approach 2 (reviver): 894.49 ms (8.945 μs/op) - 18.1x slower

**Conclusion**: Keep indexOf - it's 18x faster even with optimized reviver.

> **HIGHLIGHT #4**: Don't assume your intuition is correct. Benchmark! The reviver approach SEEMS cleaner, but indexOf is 18x faster because it avoids JSON parsing entirely. V8-optimized string operations beat object construction every time for simple extraction tasks.

---

### PHASE 4: Catching Over-Engineering - Round 1

**User**: "1. This is overengineeering again. I just asked to create string enum and in usage just throw normal throw Error(ErrorCode.xxx)"

**CLAUDE'S OVER-ENGINEERED APPROACH**:
```typescript
// Errors.ts - TOO MANY HELPERS
export function createError(code: ErrorCode, message?: string): Error
export function createConfigError(key: string): Error
export function createZmqTimeoutError(type: string): Error
export function isErrorCode(error: Error, code: ErrorCode): boolean
export function getErrorCode(error: Error): string | null

// Usage
throw createError(ErrorCode.EXTERNAL_NO_CREDITS);
throw createConfigError(ConfigKeys.DB_PATH);
```

**CORRECTED SIMPLE APPROACH**:
```typescript
// Errors.ts - SIMPLE ENUM
export enum ErrorCode {
  EXTERNAL_NO_CREDITS = 'EXTERNAL_NO_CREDITS',
  EXTERNAL_BUFFER_OVERFLOW = 'EXTERNAL_BUFFER_OVERFLOW',
  INTERNAL_ENV_KEY_NOT_FOUND = 'INTERNAL_ENV_KEY_NOT_FOUND',
  // ... etc
}

// Usage - Direct and clear
throw new Error(ErrorCode.EXTERNAL_NO_CREDITS);
throw new Error(ErrorCode.INTERNAL_ENV_KEY_NOT_FOUND);
```

> **HIGHLIGHT #5**: The user asked for a "string enum" but Claude created 5 helper functions. This is classic over-engineering - adding abstractions before they're needed. A simple enum is enough. Add helpers later if you find yourself repeating complex error creation logic.

---

### PHASE 5: Removing Unnecessary Factory Patterns

**User's Review**: "Actually non singleton objects can skip being initialized from servicefactory. example OpenAiConnection should have a constructor which takes the handler and in connect just created the ws. remove the construction of this getnewvoice method from service factory and have it initialized directly inside Orchestrator"

**BEFORE (Unnecessary factory abstraction)**:
```typescript
// ServiceFactory.ts
getNewVoiceConnection(): IVoiceConnection {
  return new OpenAIConnection();
}

// Orchestrator.ts
this.voiceConnection = this.factory.getNewVoiceConnection();
this.voiceConnection.connect(this); // Pass handler after creation
```

**AFTER (Direct instantiation)**:
```typescript
// Orchestrator.ts - Direct instantiation
this.voiceConnection = new OpenAIConnection(this);
this.voiceConnection.connect(); // No parameters needed

// OpenAIConnection.ts - Constructor takes handler
constructor(private handler: IConnectionHandler) {}
```

> **HIGHLIGHT #6**: Not everything needs a factory. Use factories for SINGLETONS (Config, DatabaseConnection) or when you need runtime strategy selection. For simple object creation where the type is known at compile time, just use `new`. The dependency (handler) should be in the constructor, not passed later in connect().

---

### PHASE 6: Removing Redundant Methods

**User's Review**: "is connected method is redundant in OpenAiconnection as disconnect internally checks it anyway. no?"

**BEFORE (Redundant check)**:
```typescript
// Orchestrator cleanup
if (this.voiceConnection?.isConnected()) {
  this.voiceConnection.disconnect();
}

// OpenAIConnection
isConnected(): boolean {
  return this.ws !== null;
}

disconnect(): void {
  if (this.ws) { // Already checks internally!
    this.ws.close();
    this.ws = null;
  }
}
```

**AFTER (Simplified)**:
```typescript
// Orchestrator cleanup
this.voiceConnection?.disconnect(); // Let it handle the check

// OpenAIConnection - no isConnected() method needed
disconnect(): void {
  if (this.ws) {
    this.ws.close();
    this.ws = null;
  }
}
```

> **HIGHLIGHT #7**: If a method internally checks a condition before acting, you don't need a separate method to check that condition. This is defensive programming gone wrong - it creates API surface area without adding value. Trust your methods to handle their own guard conditions.

---

### PHASE 7: Moving Logic to Appropriate Handlers

**User's Review**: "All of your tracklogic should move inside Usagehandler saveusage method. Orchestrator need not know this."

**BEFORE (Orchestrator knows too much)**:
```typescript
// Orchestrator.ts - 33 lines of parsing logic
private trackUsage(message: string): void {
  if (message.indexOf('"type":"response.done"') === -1) return;

  const inputIdx = message.indexOf('"input_tokens":');
  if (inputIdx === -1) return;
  const inputStart = inputIdx + 15;
  const inputEnd = message.indexOf(',', inputStart);
  const inputTokens = parseInt(message.slice(inputStart, inputEnd), 10);

  // ... 20 more lines of indexOf parsing ...

  this.usageHandler.saveUsage(inputTokens, outputTokens);

  const totalTokens = inputTokens + outputTokens;
  this.credits -= totalTokens;
  this.responseCount++;
}
```

**AFTER (Logic moved to UsageHandler)**:
```typescript
// Orchestrator.ts - 11 lines, delegated parsing
private trackUsage(message: string): void {
  const tokens = this.usageHandler.saveUsage(message);
  if (tokens) {
    const totalTokens = tokens.inputTokens + tokens.outputTokens;
    this.credits -= totalTokens;
    this.responseCount++;
    if (this.credits <= 0) {
      this.voiceConnection?.disconnect();
      throw new Error(ErrorCode.EXTERNAL_NO_CREDITS);
    }
  }
}

// UsageHandler.ts - All parsing logic here
saveUsage(message: string): { inputTokens: number, outputTokens: number } | null {
  if (message.indexOf('"type":"response.done"') === -1) return null;

  const inputIdx = message.indexOf('"input_tokens":');
  // ... all parsing logic ...

  // Batch and flush internally
  this.inputTokens += inputTokens;
  this.outputTokens += outputTokens;
  this.currentBatchSize++;
  if (this.currentBatchSize >= USAGE_BATCH_SIZE) this.flush();

  return { inputTokens, outputTokens };
}
```

> **HIGHLIGHT #8**: Single Responsibility Principle in action. Orchestrator should coordinate, not parse. UsageHandler should parse usage messages, batch them, and flush them. This makes testing easier (test parsing separate from orchestration) and improves cohesion.

---

### PHASE 8: Optimizing Data Structures

**User's Review**: "private usageBatch: UsageData[] = []; No need to unnecessarily create object and then have reduce function to sum it. Just have 3 fields inputTokens, outputToken, and currentBatchSize"

**BEFORE (Inefficient array + reduce)**:
```typescript
interface UsageData {
  inputTokens: number;
  outputTokens: number;
}

class UsageHandler {
  private usageBatch: UsageData[] = [];

  saveUsage(inputTokens: number, outputTokens: number) {
    this.usageBatch.push({ inputTokens, outputTokens }); // Array allocation
  }

  flush() {
    // O(n) reduce operations
    const totalInputTokens = this.usageBatch.reduce((sum, u) => sum + u.inputTokens, 0);
    const totalOutputTokens = this.usageBatch.reduce((sum, u) => sum + u.outputTokens, 0);
    this.accountService.updateUsage(..., totalInputTokens, totalOutputTokens);
    this.usageBatch = [];
  }
}
```

**AFTER (Running totals)**:
```typescript
class UsageHandler {
  private inputTokens: number = 0;
  private outputTokens: number = 0;
  private currentBatchSize: number = 0;

  saveUsage(inputTokens: number, outputTokens: number) {
    this.inputTokens += inputTokens;      // O(1)
    this.outputTokens += outputTokens;    // O(1)
    this.currentBatchSize++;              // O(1)
  }

  flush() {
    // Direct access - no reduce needed
    this.accountService.updateUsage(..., this.inputTokens, this.outputTokens);
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.currentBatchSize = 0;
  }
}
```

**Performance Gains**:
- ✅ No array allocations
- ✅ No object creation per entry
- ✅ O(1) operations instead of O(n) reduce
- ✅ Better memory efficiency

> **HIGHLIGHT #9**: Question your data structures. Why store an array of objects when you just need two running totals? Every push creates an object, every flush does O(n) iteration. Running totals are O(1) for both operations. This is a 10-100x performance improvement for high-throughput scenarios.

---

### PHASE 9: Static vs Singleton Pattern

**User's Review**: "Should Config be static, Such that Config.getKey can be done instead of Config.getInstance.getkey?"

**BEFORE (Singleton pattern)**:
```typescript
export class Config {
  private static instance: Config | null = null;

  static getInstance(): Config {
    if (!Config.instance) Config.instance = new Config();
    return Config.instance;
  }

  get(key: ConfigKeys): string { ... }
}

// Usage - verbose
const config = Config.getInstance();
const apiKey = config.get(ConfigKeys.OPENAI_API_KEY);
```

**AFTER (Static methods)**:
```typescript
export class Config {
  private static config: Map<ConfigKeys, string> | null = null;

  private static loadConfig(): void {
    if (Config.config) return;
    dotenv.config({ path: envPath });
    Config.config = new Map();
    // Load config...
  }

  static get(key: ConfigKeys): string {
    Config.loadConfig();
    const value = Config.config!.get(key);
    if (!value) throw new Error(ErrorCode.INTERNAL_ENV_KEY_NOT_FOUND);
    return value;
  }
}

// Usage - cleaner
const apiKey = Config.get(ConfigKeys.OPENAI_API_KEY);
```

> **HIGHLIGHT #10**: When a class has no instance state that varies between "instances", use static methods. Config is conceptually a namespace for configuration access, not an object with behavior. Static methods make this clear: `Config.get(key)` is cleaner than `Config.getInstance().get(key)`.

---

### PHASE 10: Removing Defensive Programming

**User's Review**: "Here in all classes no need to check or have a has method, just do direct get and if not there, get method should throw Error KEY_NOT_FOUND"

**BEFORE (Defensive with has() method)**:
```typescript
class Config {
  has(key: ConfigKeys): boolean {
    return this.config.has(key);
  }

  get(key: ConfigKeys): string | undefined {
    return this.config.get(key);
  }
}

// Usage - verbose check-then-get pattern
const socketPath = config.has(ConfigKeys.ZMQ_SOCKET_PATH)
  ? config.get(ConfigKeys.ZMQ_SOCKET_PATH)
  : undefined;
```

**AFTER (Fail-fast)**:
```typescript
class Config {
  static get(key: ConfigKeys): string {
    const value = this.config!.get(key);
    if (!value) throw new Error(ErrorCode.INTERNAL_ENV_KEY_NOT_FOUND);
    return value;
  }
}

// Usage - try-catch for optional values
let socketPath: string;
try {
  socketPath = Config.get(ConfigKeys.ZMQ_SOCKET_PATH);
} catch (error) {
  socketPath = DEFAULT_SOCKET_PATH; // Optional, has default
}

// Or just let it throw for required values
const dbPath = Config.get(ConfigKeys.DB_PATH); // Required, no try-catch
```

**User's Clarification**: "There is no default path for zmq and it should only come from env as pack-db also need to use the same. So dont catch the error"

**FINAL PATTERN**:
```typescript
// Required config - no try-catch, let it fail fast
const socketPath = Config.get(ConfigKeys.ZMQ_SOCKET_PATH);
const dbPath = Config.get(ConfigKeys.DB_PATH);
```

> **HIGHLIGHT #11**: Don't add `has()` methods and optional returns when configuration should be required. If a config value is required for the system to work, fail fast with a clear error. Use try-catch only for truly optional values with sensible defaults. In this case, both services need the same ZMQ path, so it must be configured - no defaults.

---

### PHASE 11: Second Review Round - Moving Shared Code

**User's Review Round 2**: "In pack-db, have Error file moved to pack-shared and refer the same in pack-db. Have the Logger also moved to pack-shared and on second thought could we also have same Config moved to pack-shared and use it in pack-db package?"

**REFACTORING STRATEGY**: Launch 4 parallel agents:
1. Explore pack-db structure and entity usage
2. Move Errors.ts to pack-shared
3. Move Logger.ts to pack-shared
4. Move Config.ts to pack-shared

**RESULT**: All 3 classes now in pack-shared:
```typescript
// pack-shared/src/index.ts
export { ErrorCode } from './Errors';
export { Logger } from './Logger';
export { Config, ConfigKeys } from './Config';
export { SessionData, IAccountService, ZmqResponseSchema } from './';

// pack-server imports
import { ErrorCode, Logger, Config, ConfigKeys } from 'pack-shared';

// pack-db imports
import { ErrorCode, Logger, Config, ConfigKeys } from 'pack-shared';
```

**Merged ConfigKeys**:
```typescript
export enum ConfigKeys {
  // pack-server keys
  OPENAI_API_KEY = 'OPENAI_API_KEY',
  GEMINI_API_KEY = 'GEMINI_API_KEY',
  ZMQ_SOCKET_PATH = 'ZMQ_SOCKET_PATH',
  ZMQ_TIMEOUT_MS = 'ZMQ_TIMEOUT_MS',

  // pack-db keys
  DB_PATH = 'DB_PATH',
  DB_ENCRYPTION_KEY = 'DB_ENCRYPTION_KEY',
}
```

> **HIGHLIGHT #12**: In a monorepo, identify truly shared code and extract it to a shared package. Errors, Logger, and Config are used identically in both packages - they belong in pack-shared. This is DRY (Don't Repeat Yourself) at the package level.

---

### PHASE 12: Repository Separation of Concerns

**User's Review**: "in pack-db, we should have 2 more repo IUsageRepo and SQLUsageRepo that houses updateUsage method from SQLAccountRepo and similarly ISessionRepo and move upsertSession and appendConversation method here"

**BEFORE (God object - SQLAccountRepo)**:
```typescript
class SQLiteAccountRepo implements IAccountRepo {
  // Account operations
  async createAccount(...) { }
  async getAccount(...) { }
  async validateApiKey(...) { }

  // Usage operations - DOESN'T BELONG HERE
  async insertUsage(accountId, sessionId, provider, inputTokens, outputTokens) { }

  // Session operations - DOESN'T BELONG HERE
  async upsertSession(accountId, sessionId, sessionData) { }
  async appendConversation(accountId, sessionId, conversationData) { }
  async loadSessionByKeyAndId(apiKey, sessionId) { }
}
```

**AFTER (Separated concerns)**:
```typescript
// IAccountRepo - ONLY account operations
interface IAccountRepo {
  createAccount(input: CreateAccountInput): Promise<Account>;
  getAccount(accountId: string): Promise<Account | null>;
  validateApiKey(apiKey: string): Promise<ValidateApiKeyResult>;
  getCredits(accountId: string): Promise<number>;
}

// IUsageRepo - ONLY usage operations
interface IUsageRepo {
  insertUsage(
    accountId: string,
    sessionId: string,
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void>;
}

// ISessionRepo - ONLY session operations
interface ISessionRepo {
  upsertSession(accountId: string, sessionId: string, sessionData: string): Promise<void>;
  appendConversation(accountId: string, sessionId: string, conversationData: string): Promise<void>;
  loadSessionByKeyAndId(apiKey: string, sessionId: string): Promise<SessionRow[]>;
  overwriteConversation(accountId: string, sessionId: string, content: string): Promise<void>;
}

// ServiceFactory provides all three
class ServiceFactory {
  getAccountRepo(): IAccountRepo { }
  getUsageRepo(): IUsageRepo { }
  getSessionRepo(): ISessionRepo { }
}
```

> **HIGHLIGHT #13**: Repositories should follow Single Responsibility Principle. One repo per aggregate root: AccountRepo for accounts/API keys, UsageRepo for usage tracking/credits, SessionRepo for sessions/conversations. This makes testing easier (mock only what you need) and respects bounded contexts.

---

## Summary: Effective Code Review Patterns

| Pattern | Example from Session |
|---------|---------------------|
| **Parallel Agents for Productivity** | "can't u run multiple agents to handle this list and parallelize the work" → 4 agents running simultaneously |
| **Benchmark Don't Assume** | User insisted on benchmarking indexOf vs JSON.parse, catching unfair comparison |
| **Reject Over-Engineering** | "This is overengineerinering again. I just asked to create string enum" - removed 5 helper functions |
| **Remove Unnecessary Factories** | "non singleton objects can skip being initialized from servicefactory" |
| **Remove Redundant Methods** | "isConnected method is redundant as disconnect internally checks it anyway" |
| **Move Logic to Appropriate Handler** | "All of your tracklogic should move inside Usagehandler" - 33 lines → 11 lines in Orchestrator |
| **Optimize Data Structures** | "No need to unnecessarily create object and then have reduce" - array + reduce → running totals |
| **Static vs Singleton** | "Should Config be static" - getInstance().get() → Config.get() |
| **Fail Fast, Not Defensive** | "no need to check or have a has method" - removed has(), throw on missing required keys |
| **Extract Shared Code** | "Have Error/Logger/Config moved to pack-shared" - DRY at package level |
| **Separate Repository Concerns** | "have IUsageRepo and ISessionRepo" - split God object into focused repos |

---

## Technical Improvements Summary

### Performance Optimizations
✅ **18x faster** token parsing (indexOf vs JSON.parse with reviver)
✅ **O(1) running totals** instead of O(n) array + reduce in UsageHandler
✅ **Removed redundant checks** (isConnected, has())

### Code Quality Improvements
✅ **Parallel agent execution** - 4 agents working simultaneously
✅ **Removed 5 helper functions** from Errors.ts (over-engineering)
✅ **Moved 33 lines of parsing** from Orchestrator to UsageHandler
✅ **Static Config pattern** - cleaner API (Config.get vs getInstance().get)
✅ **Removed defensive programming** - fail fast on required config

### Architecture Improvements
✅ **Created Startup.ts** - process handlers, graceful shutdown centralized
✅ **Server class** with config pattern (maxPayloadLength, idleTimeout)
✅ **Logger throughout** - no console.log/error in production code
✅ **Centralized error codes** - INTERNAL_* and EXTERNAL_* prefixes
✅ **UsageHandler** - separate concern like CheckpointHandler
✅ **Removed factory for non-singletons** - OpenAIConnection direct instantiation
✅ **Repository separation** - AccountRepo, UsageRepo, SessionRepo (SRP)
✅ **Shared package code** - Errors, Logger, Config in pack-shared

---

## Final Monorepo Architecture

```
realtime-switch-v2/
├── pack-shared/
│   ├── Errors.ts          # ErrorCode enum (INTERNAL_* / EXTERNAL_*)
│   ├── Logger.ts          # Centralized logging
│   ├── Config.ts          # Static config (all env variables)
│   ├── IAccountService.ts
│   └── ZmqResponseSchema.ts
│
├── pack-server/
│   ├── src/
│   │   ├── Startup.ts                  # Process handlers, graceful shutdown
│   │   ├── Server.ts                   # Server class with config
│   │   ├── Orchestrator.ts             # Simplified (logic moved to handlers)
│   │   ├── OpenAIConnection.ts         # Constructor receives handler (no factory)
│   │   ├── core/
│   │   │   ├── interfaces/
│   │   │   │   ├── IUsageHandler.ts
│   │   │   │   └── ICheckpointHandler.ts
│   │   │   └── impls/
│   │   │       ├── UsageHandler.ts     # Token parsing + batching
│   │   │       ├── CheckpointHandler.ts
│   │   │       └── ServiceFactory.ts   # Creates singletons only
│
└── pack-db/
    ├── src/
    │   ├── Startup.ts                  # Process handlers (matches pack-server)
    │   ├── DbServer.ts                 # Server class (matches pack-server)
    │   ├── interfaces/
    │   │   ├── IAccountRepo.ts         # Accounts + API keys
    │   │   ├── IUsageRepo.ts           # Usage tracking + credits
    │   │   └── ISessionRepo.ts         # Sessions + conversations
    │   └── impls/
    │       ├── SQLiteAccountRepo.ts    # Focused on accounts only
    │       ├── SQLUsageRepo.ts         # Focused on usage only
    │       ├── SQLSessionRepo.ts       # Focused on sessions only
    │       └── ServiceFactory.ts       # Creates all repos
```

---

## Key Lessons: Production-Quality Code

### 1. Parallel Agent Strategy
When reviewing code with multiple independent issues, spawn parallel agents:
```bash
# DON'T: Sequential (30 minutes)
Agent 1 → Agent 2 → Agent 3 → Agent 4

# DO: Parallel (8 minutes)
Agent 1 ↓
Agent 2 ↓  All running simultaneously
Agent 3 ↓
Agent 4 ↓
```

### 2. Benchmark, Don't Assume
```typescript
// ASSUMPTION: "JSON.parse with reviver seems cleaner"
// REALITY: indexOf is 18x faster

// Always benchmark hot paths with realistic data:
// - 100,000 iterations
// - Real message sizes (~730 bytes)
// - Fair comparisons (same preprocessing)
```

### 3. Avoid Premature Abstractions
```typescript
// ❌ PREMATURE: 5 helper functions for errors
createError(), createConfigError(), isErrorCode(), getErrorCode()

// ✅ START SIMPLE: String enum
throw new Error(ErrorCode.EXTERNAL_NO_CREDITS);

// Add helpers later if you see repeated patterns
```

### 4. Question Every Factory
```typescript
// ❌ UNNECESSARY: Factory for non-singletons
factory.getNewVoiceConnection()

// ✅ DIRECT: Known type, use constructor
new OpenAIConnection(handler)

// Use factories for: Singletons, runtime strategy selection, complex creation
// Don't use for: Simple objects with known types
```

### 5. One Repo Per Aggregate
```typescript
// ❌ GOD OBJECT: One repo doing everything
SQLiteAccountRepo { accounts, usage, sessions }

// ✅ FOCUSED: One aggregate per repo
AccountRepo { accounts, apiKeys }
UsageRepo { usageMetrics, credits }
SessionRepo { sessions, conversations }
```

### 6. Static for Namespaces, Singleton for State
```typescript
// ❌ SINGLETON: No instance state
Config.getInstance().get(key)

// ✅ STATIC: Pure namespace
Config.get(key)

// Use singleton when: Shared mutable state, lifecycle management
// Use static when: Stateless utilities, configuration access
```

---

*This session demonstrates that production-quality code requires systematic review, catching over-engineering, data-driven decisions through benchmarking, and leveraging parallel agents for productivity. The developer must actively reject unnecessary complexity, question abstractions, and ensure proper separation of concerns. Don't accept AI's first solution - iterate until it's correct, simple, and performant.*
