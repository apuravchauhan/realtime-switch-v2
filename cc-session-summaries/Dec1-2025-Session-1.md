# Claude Code Session 1: Effective Prompt Engineering for AI-Assisted Development
## Building Realtime Switch v2 - A WebSocket-based AI Voice Provider Abstraction Layer

This document captures a real engineering session demonstrating effective human-AI collaboration patterns. The goal was to build a WebSocket-based system for seamless switching between AI voice providers (OpenAI, Gemini) using TDD principles.

---

## Session Overview

**Project**: Realtime Switch v2 - AI voice provider abstraction layer
**Duration**: Single comprehensive session
**Outcome**: Clean architecture with interfaces, Orchestrator implementation, 23 test cases, and first commit ready

---

## Key Themes Demonstrated

1. **Scope Control** - Build incrementally, exclude features for later
2. **Dependency Injection** - Ask "why" before accepting patterns
3. **Interface Simplification** - Reduce complexity through consolidation
4. **Non-Blocking Patterns** - Critical for realtime applications
5. **Race Condition Prevention** - Anticipate concurrency issues

---

## The Session

### PHASE 1: Context Building and Scope Control

**User**: "Are you able to read @rs-mono-v2/plan-rs-app.pdf"

**User**: "Now read the existing application... @realtime-switch-db/ which is the db app and @realtime-switch-prod/ which is the ws realtime app. I will pick elements from these two and implement the above plan with TDD in new @rs-mono-v2/"

**Claude-Code**: Launched 3 parallel exploration agents, analyzed all projects, created mapping table showing what exists vs what needs building.

**User**: "For now, lets keep Gemini and converters out of the picture for now. Rest lets create all interfaces first. Then I will review it and then proceed towards TDD in next phase."

**Claude-Code**: Created 4 interfaces with callback-based async methods.

**CLAUDE'S INITIAL INTERFACE DESIGN**:
```typescript
// ISessionService.ts - 6 methods with callbacks
export interface ISessionService {
  getSessionConfig(accountId: string, sessionId: string, callback: (config: SessionConfig | null) => void): void;
  saveSessionConfig(accountId: string, sessionId: string, config: SessionConfig): void;
  getConversationHistory(accountId: string, sessionId: string, callback: (history: string | null) => void): void;
  appendConversation(accountId: string, sessionId: string, content: string): void;
  summarize(accountId: string, sessionId: string, callback: (summary: string) => void): void;
  sessionExists(accountId: string, sessionId: string, callback: (exists: boolean) => void): void;
}
```

> **HIGHLIGHT**: User provided context upfront (existing code, plans, goals) enabling AI to understand the full picture. Then deliberately reduced scope by excluding Gemini and converters. Better to build incrementally than attempt everything at once.

---

### PHASE 2: Dependency Injection - Understanding Tradeoffs

**User**: "accountService: IAccountService... all this should come from factory using factory pattern"

**Claude-Code**: Created IServiceFactory interface.

**User**: "question: why did u create IServiceFactory instead of static factory that can just be called inside the methods to load the instances?"

**Claude-Code**: Explained tradeoffs between static and DI-based factory.

**User**: "In case of mocks what would u do? Show me example"

**CLAUDE SHOWED BOTH PATTERNS**:
```typescript
// OPTION 1: Static Factory (simpler but global state)
describe('Orchestrator', () => {
  beforeEach(() => {
    // Global mock setup - shared across tests
    ServiceFactory.register(new MockAccountService(), new MockSessionService(), new MockPersistence());
  });

  it('should connect when credits available', () => {
    const orchestrator = new Orchestrator('acc-1', 'sess-1');
    orchestrator.connect(VoiceProvider.OPENAI);
  });
});

// OPTION 2: DI Factory (more verbose but isolated)
describe('Orchestrator', () => {
  it('should connect when credits available', () => {
    // Per-test mock - isolated, no shared state
    const mockFactory: IServiceFactory = {
      getAccountService: () => new MockAccountService(),
      getSessionService: () => new MockSessionService(),
      getPersistence: () => new MockPersistence(),
      getNewOAIVoiceConnection: () => new MockVoiceConnection()
    };

    const orchestrator = new Orchestrator('acc-1', 'sess-1', mockFactory);
  });
});
```

**User**: "lets stick with DI based"

**FINAL IMPLEMENTATION**:
```typescript
// IServiceFactory.ts
export interface IServiceFactory {
  getAccountService(): IAccountService;
  getSessionService(): ISessionService;
  getPersistence(): IPersistenceRepo;
  getNewOAIVoiceConnection(): IVoiceConnection;  // Always returns new instance per session
}

// Orchestrator.ts - receives factory via constructor
export class Orchestrator implements IConnectionHandler {
  private readonly factory: IServiceFactory;
  private readonly accountService: IAccountService;
  private readonly sessionService: ISessionService;
  private readonly persistence: IPersistenceRepo;

  constructor(accountId: string, sessionId: string, factory: IServiceFactory) {
    this.accountId = accountId;
    this.sessionId = sessionId;
    this.factory = factory;
    this.accountService = factory.getAccountService();
    this.sessionService = factory.getSessionService();
    this.persistence = factory.getPersistence();
  }
}
```

> **HIGHLIGHT**: User asked "why" before accepting. Understanding tradeoffs (static = simpler but global state, DI = more verbose but testable/isolated) led to informed decision. The method name `getNewOAIVoiceConnection()` makes it explicit that a new instance is returned each time.

---

### PHASE 3: Callback to Promise - Flexibility Without Blocking

**User**: "i see u r doing sessionExists(accountId: string, sessionId: string, callback: (exists: boolean) => void): void;
i.e taking callback, cant u return promise from the method?"

**Claude-Code**: Explained plan said "DON'T USE AWAIT" but Promise with .then() is non-blocking too.

**User**: "yes, and if i need to await a Promise in any case, i can still do it. right"

**User**: "across the code, dont use callback, just return promises"

**BEFORE (Callback-based - inflexible)**:
```typescript
export interface IAccountService {
  getCredits(accountId: string, callback: (credits: number) => void): void;
  hasEnoughCredits(accountId: string, callback: (hasCredits: boolean) => void): void;
}

// Usage - callback hell
this.accountService.hasEnoughCredits(accountId, (hasCredits) => {
  if (hasCredits) {
    this.sessionService.sessionExists(accountId, sessionId, (exists) => {
      // More nesting...
    });
  }
});
```

**AFTER (Promise-based - flexible)**:
```typescript
export interface IAccountService {
  getCredits(accountId: string): Promise<number>;
  hasEnoughCredits(accountId: string): Promise<boolean>;
}

// Usage - can chain with .then() (non-blocking) or await (when needed)
this.accountService.hasEnoughCredits(accountId).then((hasCredits) => {
  // Non-blocking
});

// Or in tests/initialization
const hasCredits = await this.accountService.hasEnoughCredits(accountId);
```

> **HIGHLIGHT**: Promises are cleaner than callbacks - no callback hell, can chain `.catch()`, and caller chooses whether to await or use `.then()`. The realtime constraint ("don't block") is about HOW you use promises, not whether to use them.

---

### PHASE 4: Interface Consolidation - Reducing Complexity

**User**: "this.sessionService.sessionExists(...).then((exists) => {
  if (exists) {
    this.sessionService.getSessionConfig(...).then((config) => {
      this.sessionService.getConversationHistory(...).then((history) => {
        if (history) {
          this.sessionService.summarize(...).then((summary) => {
we dont need 3 methods, lets have just 1 method"

**User**: "we can just have getSessionData method and internally when we implement it, it will merge/summarize inside so in Orchestrator will just get sessionData and just call send() method"

**BEFORE (6 methods, nested async calls in Orchestrator)**:
```typescript
// ISessionService.ts - too many methods
export interface ISessionService {
  sessionExists(accountId: string, sessionId: string): Promise<boolean>;
  getSessionConfig(accountId: string, sessionId: string): Promise<SessionConfig | null>;
  getConversationHistory(accountId: string, sessionId: string): Promise<string | null>;
  summarize(accountId: string, sessionId: string): Promise<string>;
  saveSessionConfig(accountId: string, sessionId: string, config: SessionConfig): Promise<void>;
  appendConversation(accountId: string, sessionId: string, content: string): Promise<void>;
}

// Orchestrator.ts - complex nested logic
onConnect(): void {
  this.accountService.hasEnoughCredits(this.accountId).then((hasCredits) => {
    if (!hasCredits) {
      this.connection?.disconnect();
      return;
    }
    this.sessionService.sessionExists(this.accountId, this.sessionId).then((exists) => {
      if (exists) {
        this.sessionService.getSessionConfig(this.accountId, this.sessionId).then((config) => {
          this.sessionService.getConversationHistory(this.accountId, this.sessionId).then((history) => {
            if (history) {
              this.sessionService.summarize(this.accountId, this.sessionId).then((summary) => {
                const sessionConfig = this.buildSessionConfigWithSummary(config, summary);
                this.sendSessionUpdate(sessionConfig);
                this.markConnectedAndFlush();
              });
            } else {
              this.sendSessionUpdate(config);
              this.markConnectedAndFlush();
            }
          });
        });
      } else {
        this.sendSessionUpdate(null);
        this.markConnectedAndFlush();
      }
    });
  });
}
```

**AFTER (3 methods, clean Orchestrator)**:
```typescript
// ISessionService.ts - simplified, summarization is internal concern
export interface ISessionService {
  getSessionData(accountId: string, sessionId: string): Promise<SessionConfig | null>;
  saveSessionConfig(accountId: string, sessionId: string, config: SessionConfig): Promise<void>;
  appendConversation(accountId: string, sessionId: string, content: string): Promise<void>;
}

// Orchestrator.ts - clean and simple
onConnect(): void {
  this.checkAndScheduleCreditsCheck();
  this.sessionService.getSessionData(this.accountId, this.sessionId).then((sessionConfig) => {
    if (sessionConfig) {
      this.replaySession(sessionConfig);
    }
    this.isVoiceProviderConnected = true;
    this.flushBuffer();
  });
}

private replaySession(config: SessionConfig): void {
  const sessionMessage = { type: 'session.update', session: config };
  this.connection?.send(sessionMessage);
}
```

> **HIGHLIGHT**: Three rounds of refinement reduced 6 nested async calls to 1 clean call. The key insight: summarization logic belongs in SessionService implementation, not Orchestrator. Orchestrator just needs ready-to-use data. Interface design should hide implementation complexity.

---

### PHASE 5: Non-Blocking Realtime Pattern - Critical Architecture Decision

**User**: "Now if u see here u are blocking the realtime processing where you are making it dependent on external call:
  this.hasTokenCredits().then((hasCredits) => {
      if (!hasCredits) {...}
      this.connection.send(message)  // <-- BLOCKED inside .then()
  });

Instead connection.send should be outside the then block"

**BEFORE (Blocking pattern - BAD for realtime)**:
```typescript
send(message: unknown): void {
  if (this.isVoiceProviderConnected) {
    // PROBLEM: connection.send() is INSIDE .then() - blocked by DB call!
    this.hasTokenCredits().then((hasCredits) => {
      if (!hasCredits) {
        this.connection?.disconnect();
        throw new Error('NO_CREDITS');
      }
      this.connection?.send(message);  // Waits for DB response before sending
    });
  } else {
    this.messageBuffer.push(message);
  }
}

private hasTokenCredits(): Promise<boolean> {
  if (Date.now() - this.lastCreditsCheckedAt > CREDITS_CHECK_INTERVAL_MS) {
    return this.accountService.getCredits(this.accountId).then((credits) => {
      this.availableCredits = credits;
      this.lastCreditsCheckedAt = Date.now();
      return this.availableCredits > 0;
    });
  }
  return Promise.resolve(this.availableCredits > 0);
}
```

**AFTER (Fire-and-forget pattern - CORRECT for realtime)**:
```typescript
send(message: unknown): void {
  if (this.isVoiceProviderConnected) {
    this.checkAndScheduleCreditsCheck();  // Fire-and-forget - schedules async, doesn't wait
    // Synchronous check of current state
    if (this.availableCredits !== null && this.availableCredits <= 0) {
      this.connection?.disconnect();
      throw new Error('NO_CREDITS');
    }
    this.connection?.send(message);  // NEVER BLOCKED - always executes immediately
  } else {
    if (this.messageBuffer.length >= MAX_BUFFER_SIZE) {
      throw new Error('RECON_TIMED_OUT_RETRYING');
    }
    this.messageBuffer.push(message);
  }
}

// Fire-and-forget: schedule the call, update state when done, never block caller
private checkAndScheduleCreditsCheck(): void {
  if (this.creditsCheckInProgress) return;
  if (this.availableCredits !== null && this.responseCount < MAX_RESPONSES_BEFORE_CREDIT_CHECK) return;

  this.creditsCheckInProgress = true;
  this.accountService.getCredits(this.accountId).then((credits) => {
    this.availableCredits = credits;  // Update state asynchronously
    this.responseCount = 0;
    this.creditsCheckInProgress = false;
  });
  // Execution continues immediately - doesn't wait for DB
}
```

**User also improved: Time-based → Response-count based**:
```typescript
// BEFORE: Time-based check (Date.now() on every send() adds overhead)
const CREDITS_CHECK_INTERVAL_MS = 5 * 60 * 1000;
if (Date.now() - this.lastCreditsCheckedAt > CREDITS_CHECK_INTERVAL_MS) {
  // check credits
}

// AFTER: Response-count based (simpler, no time overhead)
const MAX_RESPONSES_BEFORE_CREDIT_CHECK = 50;
private responseCount = 0;

// In onMsgReceived - count responses from provider
this.responseCount++;

// In checkAndScheduleCreditsCheck - check after N responses
if (this.responseCount < MAX_RESPONSES_BEFORE_CREDIT_CHECK) return;
```

> **HIGHLIGHT**: User caught a blocking pattern that AI missed. In realtime apps, `connection.send()` must NEVER be inside a `.then()` block. The pattern: check state synchronously, update state asynchronously via fire-and-forget. This was formalized as coding guideline #4.

---

### PHASE 6: Race Condition Prevention - Anticipating Concurrency Issues

**User**: "Also scheduleCredit check will bombard in case max responses have reached and send is happening frequently, should we not have something like scheduleInProgress check?"

**BEFORE (Race condition - multiple concurrent DB calls)**:
```typescript
private scheduleCreditsCheck(): void {
  // BUG: 100 rapid send() calls would trigger 100 DB queries!
  this.accountService.getCredits(this.accountId).then((credits) => {
    this.availableCredits = credits;
    this.responseCount = 0;
  });
}
```

**AFTER (Protected with inProgress flag)**:
```typescript
private creditsCheckInProgress = false;

private checkAndScheduleCreditsCheck(): void {
  // Guard 1: Don't start new check if one is already running
  if (this.creditsCheckInProgress) return;

  // Guard 2: Don't check if we have recent data and haven't hit threshold
  if (this.availableCredits !== null && this.responseCount < MAX_RESPONSES_BEFORE_CREDIT_CHECK) return;

  this.creditsCheckInProgress = true;  // Lock
  this.accountService.getCredits(this.accountId).then((credits) => {
    this.availableCredits = credits;
    this.responseCount = 0;
    this.creditsCheckInProgress = false;  // Unlock after completion
  });
}
```

> **HIGHLIGHT**: User anticipated a race condition before it became a bug. Without the `creditsCheckInProgress` guard, 100 rapid `send()` calls would trigger 100 DB queries instead of 1. This is a common pattern for debouncing async operations.

---

### PHASE 7: Test-Driven Development - Comprehensive Coverage

**User**: Listed 11 test cases covering credits, sessions, buffering, then asked "Did I miss any other test cases?"

**Claude-Code**: Added 12 more covering edge cases.

**FINAL TEST CASES (23 total)**:
```typescript
export enum OrchestratorTestCases {
  // Credits lifecycle
  CREDITS_LOADED_ON_CONNECT = 'Credits loaded from DB within 2 seconds after connect when initially null',
  CREDITS_DEDUCTED_AFTER_RESPONSE = 'Available credits reduced after full response cycle',
  NO_CREDITS_ERROR_WHEN_DEPLETED = 'NO_CREDITS error thrown when credits depleted after multiple responses',
  CREDITS_CHECK_AFTER_X_RESPONSES = 'Credits check triggered only after X response count threshold',
  NEGATIVE_CREDITS_DISCONNECT = 'Disconnect triggered when credits go negative mid-session',
  NO_DUPLICATE_CREDITS_CHECK = 'Rapid scheduleCreditsCheck calls do not cause duplicate requests',

  // Message buffering
  MESSAGES_BUFFERED_BEFORE_CONNECT = 'Messages buffered successfully when sent immediately after connect',
  BUFFER_OVERFLOW_ERROR = 'RECON_TIMED_OUT_RETRYING error when buffer limit reached',
  BUFFER_ORDER_PRESERVED = 'Multiple buffered messages maintain FIFO order',
  FLUSH_BUFFER_ON_CONNECT = 'Buffered messages flushed in order on connect',

  // Session management
  NEW_SESSION_SAVED = 'New session created and conv log saved when no existing session',
  EXISTING_SESSION_REPLAYED = 'Existing session loaded and replayed on connect',
  LARGE_CONV_SUMMARIZED = 'Large conversation history summarized before replay',
  SESSION_UPDATE_MERGED = 'Session update merges with existing session config',
  RECONNECT_WITH_MERGED_SESSION = 'Reconnect loads merged session with existing conv log',
  NULL_SESSION_NO_REPLAY = 'No replay when getSessionData returns null for new session',
  REPLAY_SESSION_FORMAT = 'replaySession sends correct session.update message format',

  // Connection lifecycle
  ON_ERROR_DISCONNECTS = 'onError sets isVoiceProviderConnected to false',
  ON_CLOSE_DISCONNECTS = 'onClose sets isVoiceProviderConnected to false',
  RECONNECT_SAME_SESSION = 'Reconnect uses same accountId and sessionId',
  SEND_WHEN_CONNECTED = 'Send passes message directly without buffering when connected',

  // Edge cases
  NON_RESPONSE_DONE_IGNORED = 'onMsgReceived ignores non-response.done messages',
  MISSING_USAGE_HANDLED = 'onMsgReceived handles missing usage field gracefully'
}
```

**User**: "should they pass in TDD or fail in TDD initially till impls are written"

**Claude-Code**: Explained tests pass because Orchestrator is already implemented. For truly new features (reconnect, session merge), tests would fail first.

> **HIGHLIGHT**: User and AI collaboratively built comprehensive test coverage. User provided core scenarios, AI added edge cases. The enum pattern makes test intent clear and serves as living documentation.

---

### PHASE 8: Security Review - Pre-Commit Verification

**User**: "ok clone the repo... prepare our first commit. Before committing, review it from security aspects"

**SECURITY CHECKS PERFORMED**:
```bash
# Check for hardcoded API keys
grep -r "sk-" --include="*.ts" --include="*.json" ./pack-server
# Result: Only placeholder in README (sk-proj-...)

grep -r "AIza" --include="*.ts" .
# Result: None found

grep -r "password|secret|credential" --include="*.ts" -i ./pack-server
# Result: None in source files
```

**FILES REMOVED BEFORE COMMIT**:
```bash
rm -rf node_modules     # Dependencies - reinstall via npm install
rm -f plan.pdf          # Internal planning document
rm -rf pack-*/dist      # Build artifacts
rm -f *.tsbuildinfo     # TypeScript incremental build cache
```

**.gitignore VERIFIED**:
```
node_modules
dist
.env           # API keys protected - not committed
.env.local
*.log
.DS_Store
*.tsbuildinfo
pack-server/tests/temp
```

> **HIGHLIGHT**: User requested security review before commit. AI scanned for hardcoded secrets (API key patterns), verified .gitignore protects sensitive files, removed build artifacts. 32 clean files ready for commit.

---

## Summary: Effective Prompt Engineering Patterns

| Pattern | Example from Session |
|---------|---------------------|
| **Context First** | Provided existing code, plans before asking for implementation |
| **Scope Control** | "Keep Gemini out for now" - build incrementally |
| **Ask "Why"** | "Why IServiceFactory instead of static?" - understand tradeoffs |
| **Apply Domain Expertise** | Caught blocking pattern AI missed in realtime code |
| **Simplify Relentlessly** | Reduced 6 interface methods to 3, 6 nested calls to 1 |
| **Anticipate Issues** | Identified race condition before it became a bug |
| **Formalize Learnings** | Converted discussions into coding guidelines |
| **Verify Security** | Requested pre-commit security review |

---

## Final Architecture

```typescript
// Clean interfaces - each with single responsibility
IVoiceConnection      // WebSocket connection contract
IPersistenceRepo      // Database operations
IAccountService       // Credits and validation
ISessionService       // Session data (summarization internal)
IServiceFactory       // DI container
IConnectionHandler    // Event callbacks

// Orchestrator - the coordinator
export class Orchestrator implements IConnectionHandler {
  // State
  private isVoiceProviderConnected = false;
  private messageBuffer: unknown[] = [];
  private availableCredits: number | null = null;
  private responseCount = 0;
  private creditsCheckInProgress = false;

  // Public API
  connect(): void;
  send(message: unknown): void;  // Non-blocking, fire-and-forget credits check

  // Event handlers (called by VoiceConnection)
  onConnect(): void;
  onError(error: Error): void;
  onClose(code: number, reason: string): void;
  onMsgReceived(message: unknown): void;

  // Private helpers
  private checkAndScheduleCreditsCheck(): void;  // Fire-and-forget with guard
  private flushBuffer(): void;
  private replaySession(config: SessionConfig): void;
}
```

**Key Design Decisions**:
- DI-based factory for testability
- Promise-based async (caller chooses .then() or await)
- Fire-and-forget for external calls (never block realtime path)
- Response-count based credit checks (not time-based)
- `creditsCheckInProgress` flag prevents race conditions
- `connection.send()` NEVER inside `.then()` block

---

*This session demonstrates that effective AI-assisted development is a collaboration. The AI provides implementation speed and comprehensive coverage, while the human brings domain expertise, system design thinking, and quality control. The human's role is to guide, correct, simplify, and ensure the solution is production-ready.*
