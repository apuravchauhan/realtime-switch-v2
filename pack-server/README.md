# pack-server

Server application with OpenAI Realtime API integration.

## Structure

```
pack-server/
├── src/
│   ├── core/
│   │   └── Config.ts          # Static config class (loads .env)
│   ├── OpenAIConnection.ts    # WebSocket connection to OpenAI
│   └── index.ts               # Main exports
│
└── tests/
    ├── Config.test.ts         # Config tests
    ├── OpenAIConnection.test.ts  # Connection tests
    └── simple.test.ts         # Simple example tests
```

## Classes

### Config (Static Singleton)

Loads environment variables and provides type-safe access to configuration.

```typescript
import { Config, ConfigKeys } from './core/Config';

const config = Config.getInstance();
const apiKey = config.get(ConfigKeys.OPENAI_API_KEY);
```

**Features:**
- Singleton pattern
- Loads `.env` from repository root
- Type-safe configuration keys via enum
- Error handling for missing keys

### OpenAIConnection

Manages WebSocket connection to OpenAI Realtime API.

```typescript
import { OpenAIConnection } from './OpenAIConnection';

const connection = new OpenAIConnection();
await connection.connect();

console.log(connection.isConnected()); // true

connection.disconnect();
```

**Features:**
- Promise-based connection
- Automatic API key loading from Config
- Connection state tracking
- Clean disconnect handling

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

## Test Results

```
✓ tests/simple.test.ts (2 tests)
✓ tests/Config.test.ts (5 tests)
✓ tests/OpenAIConnection.test.ts (4 tests)

Test Files  3 passed (3)
     Tests  11 passed (11)
```

## Environment Setup

Create `.env` in repository root:

```env
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=...
```

Config automatically loads these on initialization.
