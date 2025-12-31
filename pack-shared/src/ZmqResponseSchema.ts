import { SessionData } from './IAccountService';
import { ZmqMessageType } from './ZmqRequestSchema';


export interface CreditsData {
  error: string;
  credits: number;
}



export const ZMQ_RESPONSE_SCHEMA: Partial<Record<ZmqMessageType, { name: string; type: 'string' | 'number' }[]>> = {
  [ZmqMessageType.VALIDATE_AND_LOAD]: [
    { name: 'accountId', type: 'string' },
    { name: 'sessionData', type: 'string' },  
    { name: 'credits', type: 'number' },
  ],
  [ZmqMessageType.GET_CREDITS]: [
    { name: 'credits', type: 'number' },
  ],
};


export type ZmqResponseData = {
  [ZmqMessageType.VALIDATE_AND_LOAD]: SessionData;
  [ZmqMessageType.GET_CREDITS]: CreditsData;
};
