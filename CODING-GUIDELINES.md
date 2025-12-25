# Formatting Guidelines
1. File Names should be InitCaps.ts (Pascalcase) like FileName.ts and not file.name.ts
2. Max line length is 120 chars. Fill lines up to 120 chars before breaking to next line.

# Coding Guidelines

1. Do not write any code comments while writing any code.
2. Never block realtime operations on async calls. Critical path methods like connection.send() must never be inside a .then() block. Use fire-and-forget pattern for external calls (DB, API) - schedule the call and continue immediately. Check state synchronously, update state in .then() callbacks.
