# RealtimeSwitch Monorepo

Clean, standard monorepo structure for the RealtimeSwitch project.

## Structure

```
rs-mono-v2/
├── pack-core/         # Shared types and utilities
│   └── src/
│       └── index.ts   # Core exports
│
└── pack-server/       # Server application
    ├── src/
    │   └── index.ts   # Server code
    └── tests/
        └── simple.test.ts  # Tests
```

## Getting Started

Install all dependencies:
```bash
npm install
```

Build all packages:
```bash
npm run build
```

## pack-core

Shared types and utilities used across all packages.

```bash
cd pack-core
npm run build
```

## pack-server

Server application with Vitest testing framework.

```bash
cd pack-server

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build
npm run build
```

## Adding New Packages

To add a new package (e.g., `pack-worker`):

1. Create directory: `mkdir -p pack-worker/src`
2. Add `package.json` with name `@rs/worker`
3. Add dependency on `@rs/core` if needed
4. Run `npm install` at root

The `pack-*` pattern in root `package.json` will automatically include it in the workspace.
