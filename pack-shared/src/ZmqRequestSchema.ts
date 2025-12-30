export const ZMQ_DELIMITER = '|';

export enum ZmqMessageType {
  VALIDATE_AND_LOAD = 'VALIDATE_AND_LOAD',
  UPDATE_USAGE = 'UPDATE_USAGE',
  GET_CREDITS = 'GET_CREDITS',
}

// Fire-and-forget message types (no response expected)
export const ZMQ_FIRE_AND_FORGET: Set<ZmqMessageType> = new Set([
  ZmqMessageType.UPDATE_USAGE,
]);

// Request schema: defines args with name and type per message type
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
  [ZmqMessageType.GET_CREDITS]: [
    { name: 'accountId', type: 'string' },
  ],
};

// TypeScript request arg types per message type
export type ZmqArgs = {
  [ZmqMessageType.VALIDATE_AND_LOAD]: [apiKey: string, sessionId: string];
  [ZmqMessageType.UPDATE_USAGE]: [accountId: string, sessionId: string, provider: string, inputTokens: number, outputTokens: number];
  [ZmqMessageType.GET_CREDITS]: [accountId: string];
};
