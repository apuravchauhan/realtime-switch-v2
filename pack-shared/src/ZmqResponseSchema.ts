import { SessionData } from './IAccountService';
import { ZmqMessageType } from './ZmqRequestSchema';

// Response for GET_CREDITS
export interface CreditsData {
  error: string;
  credits: number;
}

// Response schema: defines response fields per message type (error is always first, implicit)
// Fire-and-forget types don't need entries here
export const ZMQ_RESPONSE_SCHEMA: Partial<Record<ZmqMessageType, { name: string; type: 'string' | 'number' }[]>> = {
  [ZmqMessageType.VALIDATE_AND_LOAD]: [
    { name: 'accountId', type: 'string' },
    { name: 'sessionData', type: 'string' },  // JSON string, parse on demand
    { name: 'credits', type: 'number' },
  ],
  [ZmqMessageType.GET_CREDITS]: [
    { name: 'credits', type: 'number' },
  ],
};

// TypeScript response types per message type (reuses domain types)
export type ZmqResponseData = {
  [ZmqMessageType.VALIDATE_AND_LOAD]: SessionData;
  [ZmqMessageType.GET_CREDITS]: CreditsData;
};
