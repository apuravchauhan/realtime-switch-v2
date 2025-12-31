

export interface User {
  id: string;
  name: string;
}

export interface Config {
  apiKey: string;
  endpoint: string;
}


export * from './interfaces/IAccountRepo';
export * from './interfaces/ISessionRepo';
export * from './interfaces/IUsageRepo';
export * from './interfaces/ZmqMessages';
