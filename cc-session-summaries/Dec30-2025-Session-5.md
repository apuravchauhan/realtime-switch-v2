# Claude Code Session 5: Performance-Conscious Design and Separation of Concerns
## Building ZMQ Communication Layer with Custom Protocol

This document captures a real engineering session demonstrating how to guide AI toward performance-conscious architecture. The goal was to build an efficient IPC communication layer using ZeroMQ with proper separation of concerns.

---

## Session Overview

**Project**: pack-server/pack-db ZMQ communication layer for Realtime Switch v2
**Duration**: Single comprehensive session
**Outcome**: Clean ZmqService with custom string protocol, separate LLMService, and 8 passing integration tests

---

## Key Themes Demonstrated

1. **Separation of Concerns** - Business logic separate from transport/infrastructure
2. **Performance Awareness** - Avoid unnecessary serialization in real-time applications
3. **Custom Protocols** - String-based formats over JSON for hot paths
4. **Service Extraction** - Move infrastructure code out of business services

---

## The Session

### PHASE 1: ZMQ Logic Extraction - Separate Transport from Business Logic

**User**: "You created AccountService with cluttered ZMQ dealer code, move the ZMQ logic out of AccountService and create a ZmqService with that logic"

**CLAUDE'S INITIAL APPROACH (Cluttered)**:
```typescript
// AccountServiceZmq.ts - ZMQ logic mixed with business logic
export class AccountServiceZmq implements IAccountService {
  private socket: Dealer;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }>;

  constructor() {
    this.socket = new Dealer();
    this.socket.connect('ipc:///tmp/rs-zmq.sock');
    this.pendingRequests = new Map();

    // ZMQ message handling cluttered here
    this.socket.on('message', (id, type, ...frames) => {
      const request = this.pendingRequests.get(id.toString());
      if (request) {
        // Parse response, resolve promise...
      }
    });
  }

  async validateAndLoad(apiKey: string, sessionId: string): Promise<SessionData> {
    const id = randomUUID();
    // Build message, send, wait for response...
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.socket.send([id, 'VALIDATE_AND_LOAD', JSON.stringify({ apiKey, sessionId })]);
    });
  }
}
```

**CORRECTED APPROACH (Separated)**:
```typescript
// ZmqService.ts - All ZMQ infrastructure here
export class ZmqService {
  private socket: Dealer;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }>;

  async connect(): Promise<void> { ... }

  async send<T extends ZmqMessageType>(
    id: string,
    type: T,
    ...args: ZmqArgs[T]
  ): Promise<ZmqResponseData[T]> {
    // All ZMQ protocol handling here
  }

  sendFireAndForget<T extends ZmqMessageType>(
    id: string,
    type: T,
    ...args: ZmqArgs[T]
  ): void { ... }
}

// AccountServiceZmq.ts - Clean business logic only
export class AccountServiceZmq implements IAccountService {
  private zmqService: ZmqService;

  constructor(zmqService: ZmqService) {
    this.zmqService = zmqService;
  }

  async validateAndLoad(apiKey: string, sessionId: string): Promise<SessionData> {
    const id = randomUUID();
    const { id: _, ...sessionData } = await this.zmqService.send(
      id, ZmqMessageType.VALIDATE_AND_LOAD, apiKey, sessionId
    );
    return sessionData;
  }

  updateUsage(accountId: string, sessionId: string, provider: string,
              inputTokens: number, outputTokens: number): void {
    const id = randomUUID();
    this.zmqService.sendFireAndForget(
      id, ZmqMessageType.UPDATE_USAGE, accountId, sessionId, provider, inputTokens, outputTokens
    );
  }

  async getCredits(accountId: string): Promise<number> {
    const id = randomUUID();
    const response = await this.zmqService.send(id, ZmqMessageType.GET_CREDITS, accountId);
    return response.credits;
  }
}
```

> **HIGHLIGHT**: Transport infrastructure (sockets, protocol handling, connection management) should never be mixed with business logic. AccountService should only know "I need to call updateUsage" - not "I need to create a ZMQ frame, encode the message, send it, wait for response". This separation allows swapping transport (ZMQ → HTTP → gRPC) without touching business code.

---

### PHASE 2: Custom String Protocol - Avoiding JSON in Hot Paths

**User**: "You are sending JSON objects to ZMQ dealer and as part of protocol translation you are then converting JSON object to JSON string before sending. It's a real-time app, we need to be sensitive of performance and CPU impact and avoid unnecessary translation. Can't u just use custom string format without unnecessary parsing/creating JSON objects. Also keep schema for request and response as shared that can be used as validation."

**CLAUDE'S INITIAL APPROACH (JSON overhead)**:
```typescript
// Sending - JSON.stringify on every message
async validateAndLoad(apiKey: string, sessionId: string): Promise<SessionData> {
  const payload = JSON.stringify({ apiKey, sessionId });  // CPU cost
  this.socket.send([id, 'VALIDATE_AND_LOAD', payload]);

  // Receiving - JSON.parse on every response
  const response = JSON.parse(frames[0].toString());  // CPU cost
  return response;
}
```

**CORRECTED APPROACH (Custom string format with schema)**:
```typescript
// pack-shared/ZmqRequestSchema.ts - Schema defines fields and types
export const ZMQ_REQUEST_SCHEMA: Record<ZmqMessageType, { name: string; type: 'string' | 'number' }[]> = {
  [ZmqMessageType.VALIDATE_AND_LOAD]: [
    { name: 'apiKey', type: 'string' },
    { name: 'sessionId', type: 'string' },
  ],
  [ZmqMessageType.UPDATE_USAGE]: [
    { name: 'accountId', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'provider', type: 'string' },
    { name: 'inputTokens', type: 'number' },
    { name: 'outputTokens', type: 'number' },
  ],
  // ...
};

// Type-safe argument types derived from schema
export type ZmqArgs = {
  [ZmqMessageType.VALIDATE_AND_LOAD]: [apiKey: string, sessionId: string];
  [ZmqMessageType.UPDATE_USAGE]: [accountId: string, sessionId: string, provider: string,
                                   inputTokens: number, outputTokens: number];
  // ...
};

// pack-shared/ZmqUtils.ts - Simple string encoding/decoding
export class ZmqUtils {
  static encodeRequest<T extends ZmqMessageType>(
    type: T,
    ...args: ZmqArgs[T]
  ): string {
    // Format: "TYPE|arg1|arg2|arg3" - no JSON parsing
    return `${type}|${args.join('|')}`;
  }

  static decodeRequest(message: string): { type: ZmqMessageType; args: Record<string, string | number> } {
    const parts = message.split('|');
    const type = parts[0] as ZmqMessageType;
    const schema = ZMQ_REQUEST_SCHEMA[type];

    const args: Record<string, string | number> = {};
    schema.forEach((field, index) => {
      const value = parts[index + 1];
      args[field.name] = field.type === 'number' ? Number(value) : value;
    });

    return { type, args };
  }
}
```

> **HIGHLIGHT**: In real-time applications, JSON.stringify/parse on every message adds CPU overhead and GC pressure. A simple pipe-delimited string format is faster to encode/decode. The schema serves dual purpose: defines the protocol AND provides type-safe function signatures. This is especially critical for high-frequency messages like audio buffer appends.

---

### PHASE 3: LLM Service Extraction - Separate External API Calls

**User**: "In pack-db you cluttered Gemini connection logic inside AccountServiceImpl,  keep a separate LLMService and use that for summarization. Also in this, to inject the prompt summary you are again JSON parsing the full thing, could you not do it effectively like simply append this instructions etc."

**CLAUDE'S INITIAL APPROACH (Cluttered)**:
```typescript
// AccountServiceImpl.ts - Gemini logic mixed with account logic
export class AccountServiceImpl implements IAccountService {
  private geminiClient: GoogleGenerativeAI;

  constructor(config: Config) {
    // Gemini setup cluttered here
    this.geminiClient = new GoogleGenerativeAI(config.get(ConfigKeys.GEMINI_API_KEY));
  }

  async summarizeSession(sessionData: string): Promise<string> {
    // Full JSON parse just to inject prompt
    const data = JSON.parse(sessionData);
    const promptWithData = JSON.stringify({
      instructions: SUMMARY_PROMPT,
      session: data
    });

    const model = this.geminiClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(promptWithData);
    return result.response.text();
  }

  // ... other account methods mixed with LLM methods
}
```

**CORRECTED APPROACH (Separated)**:
```typescript
// interfaces/ILLMService.ts - Interface for LLM operations
export interface ILLMService {
  summarize(content: string): Promise<string>;
}

// impls/LLMServiceGemini.ts - All Gemini logic here
export class LLMServiceGemini implements ILLMService {
  private client: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(config: Config) {
    this.client = new GoogleGenerativeAI(config.get(ConfigKeys.GEMINI_API_KEY));
    this.model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async summarize(content: string): Promise<string> {
    // Simple string concatenation - no JSON parsing
    const prompt = SUMMARY_PROMPT + '\n\n---\n\nSession Data:\n' + content;
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}

// prompts/SummaryPrompt.ts - Prompt as simple string constant
export const SUMMARY_PROMPT = `You are a session summarizer. Analyze the following session data and provide a concise summary including:
1. Key actions taken
2. Decisions made
3. Outcomes achieved

Be concise and focus on the most important information.`;

// AccountServiceImpl.ts - Clean, focused on account logic
export class AccountServiceImpl implements IAccountService {
  private llmService: ILLMService;

  constructor(llmService: ILLMService) {
    this.llmService = llmService;  // Injected dependency
  }

  async summarizeSession(sessionData: string): Promise<string> {
    return this.llmService.summarize(sessionData);  // Delegate to LLM service
  }
}

// ServiceFactory.ts - Creates and wires dependencies
export class ServiceFactory {
  getLLMService(): ILLMService {
    if (!this.llmService) {
      this.llmService = new LLMServiceGemini(this.getConfig());
    }
    return this.llmService;
  }

  getAccountService(): IAccountService {
    if (!this.accountService) {
      this.accountService = new AccountServiceImpl(this.getLLMService());
    }
    return this.accountService;
  }
}
```

> **HIGHLIGHT**: External API integrations (Gemini, OpenAI, etc.) deserve their own service layer. This allows: (1) swapping providers without touching business logic, (2) mocking for tests, (3) adding rate limiting/retry logic in one place. Also, string concatenation (`prompt + content`) is simpler and faster than JSON.parse → modify → JSON.stringify.

---

## Summary: Performance and Architecture Patterns

| Pattern | Example from Session |
|---------|---------------------|
| **Extract Transport Layer** | "Move ZMQ logic out of AccountService, create ZmqService" |
| **Avoid JSON in Hot Paths** | "Custom string format without unnecessary parsing" |
| **Schema as Documentation** | "Keep schema for request/response as shared validation" |
| **Extract External APIs** | "Keep separate LLMService for Gemini" |
| **Simple String Operations** | "Simply append instructions, don't JSON parse" |

---

## Final Architecture

```
pack-shared/src/
├── IAccountService.ts          # Shared interface
├── ZmqRequestSchema.ts         # Request schema + ZmqArgs types
├── ZmqResponseSchema.ts        # Response schema + ZmqResponseData types
├── ZmqUtils.ts                 # Encode/decode utilities
└── index.ts

pack-server/src/core/
├── impls/
│   ├── ZmqService.ts           # ZMQ Dealer socket (transport layer)
│   ├── AccountServiceZmq.ts    # Clean business logic, uses ZmqService
│   └── ServiceFactory.ts       # Wires everything together
└── interfaces/
    └── IServiceFactory.ts

pack-db/src/
├── impls/
│   ├── ZmqHandler.ts           # ZMQ Router socket (transport layer)
│   ├── AccountServiceImpl.ts   # Business logic with SQLite
│   ├── LLMServiceGemini.ts     # Gemini API wrapper
│   └── ServiceFactory.ts       # Wires everything together
└── interfaces/
    ├── ILLMService.ts          # LLM abstraction
    └── IServiceFactory.ts
```

**Key Design Principles**:
1. **Transport Separation**: ZmqService/ZmqHandler handle all socket logic
2. **Custom Protocol**: Pipe-delimited strings, no JSON in message encoding
3. **Type-Safe Schema**: ZmqArgs/ZmqResponseData provide compile-time safety
4. **LLM Abstraction**: ILLMService allows provider swapping
5. **String Operations**: Prefer concatenation over JSON for prompt injection

**Performance Considerations**:
- Zero JSON.parse/stringify in ZMQ message path
- Fire-and-forget for usage tracking (no response waiting)
- Schema validation only on receive side (trusted sender)
- String-based token extraction in Orchestrator.trackUsage()

---

*This session demonstrates that real-time applications require performance-conscious design. AI may default to convenient patterns (JSON everywhere) that add unnecessary overhead. Guide toward simpler, faster alternatives: custom string formats, string concatenation, and clear separation between transport and business logic.*
