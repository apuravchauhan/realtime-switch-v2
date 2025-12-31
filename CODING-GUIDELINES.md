# Formatting Guidelines

## 1. File Names
File names should be PascalCase: `FileName.ts` not `file.name.ts`

# Coding Guidelines

1. Do not write any code comments while writing any code.
2. Never block realtime operations on async calls. Critical path methods like connection.send() must never be inside a .then() block. Use fire-and-forget pattern for external calls (DB, API) - schedule the call and continue immediately. Check state synchronously, update state in .then() callbacks.
