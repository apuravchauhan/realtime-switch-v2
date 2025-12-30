# Claude Code Session 5: IUsageRepo and Simplified IPC Architecture
## Building Business Logic Layer with ZeroMQ Communication

This document captures a real engineering session demonstrating effective AI-assisted development with iterative refinement. The focus was on implementing a usage tracking repository and consolidating multiple IPC calls into a single business logic operation.

---

## Session Overview

**Project**: Realtime Switch v2 - Pack Architecture (pack-core, pack-db, pack-server)
**Duration**: Two-part session
**Outcome**:
- IUsageRepo with INSERT-only pattern for usage metrics
- Simplified IAccountService with single `validateAndLoad()` operation replacing 5 round trips

---

## Key Themes Demonstrated

1. **Design for Simplicity** - One interface, one operation, one round trip
2. **Separate Data Layer from Business Logic** - AccountRepo (pure CRUD) vs AccountService (orchestration)
3. **Avoid Premature Parsing** - Challenge JSON.parse/stringify when string operations suffice
4. **Understand Production Patterns** - Trace existing code before redesigning
5. **Sum Don't Separate** - Simplify data structures (credits as single number vs object)

---

## The Session

### PART 1: IUsageRepo Implementation

**User**: "create the IUsageRepo with INSERT-only operation"

**Claude's implementation**:
```
pack-core/
├── IUsageRepo.ts        # Interface with insertUsage() only
├── ZmqMessages.ts       # Added INSERT_USAGE enum

pack-db/
├── SQLiteUsageRepo.ts   # SQLite implementation
├── migrations/          # CreateUsageMetricsTable migration
├── ZmqHandler.ts        # Added INSERT_USAGE case

pack-server/
├── UsageRepoZmq.ts      # Fire-and-forget ZMQ client
├── ServiceFactory.ts    # Added getUsageRepo()
```

**Key Design Decision**: INSERT-only - no reads, no updates. Usage metrics are write-once logs.

> **HIGHLIGHT**: User specified INSERT-only upfront, preventing Claude from adding unnecessary CRUD operations. Simple requirements lead to simple implementations.

---

### PART 2: Simplifying Session Connect Flow

**User**: "on socket connect in realtime app, i need to do multiple operations:
1. authenticate key
2. check if credit remains
3. load session config
4. read existing conv log
5. if conv log is too big, summarize and overwrite"

**User's insight**: "realtime app can be left free of all this and db app becomes business logic app"

**Claude's analysis**:
```
Current Design: 5 round trips
realtime-app                          db-app
    |-- VALIDATE_KEY ------------------>|
    |-- GET_CREDITS ------------------->|
    |-- LOAD_SESSION ------------------>|
    |-- (summarize locally) ----------->|
    |-- SAVE_SESSION ------------------>|

Proposed Design: 1 round trip
realtime-app                          logic-app
    |-- CONNECT_SESSION --------------->|
    |<-- SessionData -------------------|
```

> **HIGHLIGHT**: User recognized that moving business logic to db-app isn't "db app becoming bloated" — it's the right separation. Realtime app stays lightweight (WebSocket handling only).

---

### PART 3: Single SQL Query for Multi-Table Join

**User**: "AccountRepoSQLite impl with 1 method loadSessionbyKeyAndId(key,sessionId) it runs the query which says selects accID for this key where key is not expired, and joins it with session row"

**Claude's implementation**:
```sql
SELECT
  a.account_id,
  s.type,
  s.data,
  acc.token_remaining,
  acc.topup_remaining
FROM api_keys a
JOIN sessions s ON s.account_id = a.account_id AND s.session_id = ?
JOIN accounts acc ON acc.id = a.account_id
WHERE a.key_hash = ?
  AND (a.expires_at IS NULL OR a.expires_at > ?)
```

**Result interpretation**:
- 0 rows → INVALID_AUTH
- 1 row (SESSION type) → Valid key, no conversation history
- 2 rows (SESSION + CONV) → Valid key, has conversation history

> **HIGHLIGHT**: Single query replaces multiple separate lookups. Database is optimized for JOINs — use them.

---

### PART 4: Challenging Data Structures

**User**: "credits: instead of separate token: just sum the two and simply check if they are non negative"

**Before** (Claude's initial approach):
```typescript
credits: {
  tokenRemaining: number;
  topupRemaining: number;
}
if (credits.tokenRemaining <= 0 && credits.topupRemaining <= 0)
```

**After** (User's simplification):
```typescript
credits: number  // Sum of both
if (totalCredits < 0)
```

> **HIGHLIGHT**: User questioned the object structure. If the consumer only needs "are credits available?", return a single number. Don't expose internal structure unnecessarily.

---

### PART 5: String Injection Without JSON.parse

**User**: "could we do this by slice or similar operations to keep cpu and event loop load minimal?"

**Challenge**: Session data is JSON like `{"instructions":"Be helpful","voice":"alloy"}`. Need to inject conversation into `instructions` field.

**Claude's initial approach** (User rejected):
```typescript
// Wrong - string concat on JSON breaks format
sessionData = sessionData + CONTEXT_PREFIX + contextToInject;
// Result: '{"instructions":"Be helpful"}\n\nHere is...'  // Invalid!
```

**User**: "how would this work. internally session is a json string. why did u just concat?"

**Claude's corrected approach** (Regex):
```typescript
private injectIntoInstructions(sessionData: string, context: string): string {
  // Escape for JSON string
  const escapedContext = context
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');

  // Find "instructions":"..." and append before closing quote
  const regex = /("instructions"\s*:\s*")([^"]*(?:\\.[^"]*)*?)(")/;
  return sessionData.replace(regex, `$1$2${escapedContext}$3`);
}
```

**Result**: JSON remains valid, no parse/stringify overhead.

> **HIGHLIGHT**: User pushed back on naive string concat, forcing Claude to think through the actual data structure. Then suggested regex as lighter than JSON.parse — meeting in the middle.

---

## Summary: Effective Prompt Engineering Patterns

| Pattern | Example from Session |
|---------|---------------------|
| **Specify Constraints Upfront** | "INSERT-only operation" |
| **Question Round Trips** | "db app can do this in one call" |
| **Simplify Return Values** | "just sum the two credits" |
| **Verify Data Formats** | "i think we were just having simple string" |
| **Minimize CPU Operations** | "slice or similar to keep event loop minimal" |
| **Challenge Incorrect Code** | "how would this work...why concat?" |

---

## Final Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  pack-shared (Interfaces)                                   │
│                                                             │
│  IAccountService                                            │
│  └── validateAndLoad(apiKey, sessionId): SessionData        │
│                                                             │
│  SessionData { success, error?, accountId?, sessionId?,     │
│                sessionData?, credits? }                     │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
          ▼                                       ▼
┌─────────────────────┐               ┌─────────────────────┐
│  pack-server        │               │  pack-db            │
│                     │               │                     │
│  AccountServiceZmq  │──VALIDATE──►  │  AccountServiceImpl │
│  (ZMQ client)       │  AND_LOAD     │  (Business logic)   │
│                     │               │       │             │
│                     │               │       ▼             │
│                     │               │  SQLiteAccountRepo  │
│                     │               │  (Pure data layer)  │
└─────────────────────┘               └─────────────────────┘
```

**Key Design Decisions**:
1. **Single operation** - `validateAndLoad()` replaces 5 separate calls
2. **Business logic in pack-db** - Summarization, injection, validation all in AccountServiceImpl
3. **Pure data layer** - AccountRepo only does SQL, no business logic
4. **String passthrough** - CONV stored and returned as plain string
5. **Regex injection** - Avoids JSON.parse/stringify for instructions modification
6. **Sum credits** - Single number instead of object with two fields

**Data Flow** (Single Round Trip):
```
pack-server                           pack-db
    │                                    │
    │── VALIDATE_AND_LOAD ──────────────►│
    │   { apiKey, sessionId }            │
    │                                    ├── loadSessionByKeyAndId() [SQL JOIN]
    │                                    ├── Check credits (sum >= 0)
    │                                    ├── Extract SESSION + CONV rows
    │                                    ├── Summarize if conv > 32K (async)
    │                                    ├── Inject via regex (no JSON.parse)
    │                                    │
    │◄── SessionData ────────────────────┤
    │   { success: true,                 │
    │     accountId: "...",              │
    │     sessionData: "...",            │
    │     credits: 50000 }               │
```

---

## Files Created/Modified

### New Files
- `pack-shared/src/IAccountService.ts` - Single interface
- `pack-shared/src/index.ts` - Exports
- `pack-db/src/impls/AccountServiceImpl.ts` - Business logic layer
- `pack-server/src/core/impls/AccountServiceZmq.ts` - ZMQ client

### Modified Files
- `pack-db/src/impls/SQLiteAccountRepo.ts` - Added `loadSessionByKeyAndId()`
- `pack-core/src/interfaces/ZmqMessages.ts` - Added message types

---

*This session demonstrates the value of questioning every abstraction and data structure. The user's challenges — "why two credits fields?", "why JSON.parse?", "why multiple round trips?" — each led to significant simplifications. The final design achieves the same functionality with less code, fewer operations, and clearer separation of concerns.*
