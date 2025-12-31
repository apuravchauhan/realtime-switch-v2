

export enum ZmqMessageType {
  
  GET_ACCOUNT = 'GET_ACCOUNT',
  CREATE_ACCOUNT = 'CREATE_ACCOUNT',
  VALIDATE_API_KEY = 'VALIDATE_API_KEY',
  GET_CREDITS = 'GET_CREDITS',
  CREATE_API_KEY = 'CREATE_API_KEY',
  REVOKE_API_KEY = 'REVOKE_API_KEY',
  GET_API_KEYS = 'GET_API_KEYS',
  UPDATE_LAST_USED = 'UPDATE_LAST_USED',

  
  LOAD_SESSION = 'LOAD_SESSION',
  SAVE_SESSION = 'SAVE_SESSION',
  APPEND_CONVERSATION = 'APPEND_CONVERSATION',
  UPDATE_USAGE = 'UPDATE_USAGE',

  
  INSERT_USAGE = 'INSERT_USAGE',
}

export interface ZmqRequest {
  id: string;           
  type: ZmqMessageType;
  payload: unknown;
}

export interface ZmqResponse {
  id: string;           
  success: boolean;
  data?: unknown;
  error?: string;
}
