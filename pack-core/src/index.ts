// Core shared types and utilities

export interface User {
  id: string;
  name: string;
}

export interface Config {
  apiKey: string;
  endpoint: string;
}

// Shared interfaces for IPC
export * from './interfaces/IAccountRepo';
export * from './interfaces/ISessionRepo';
export * from './interfaces/IUsageRepo';
export * from './interfaces/ZmqMessages';
