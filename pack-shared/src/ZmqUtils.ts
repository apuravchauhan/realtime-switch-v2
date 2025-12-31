import { ZMQ_DELIMITER, ZMQ_REQUEST_SCHEMA, ZmqMessageType } from './ZmqRequestSchema';
import { ZMQ_RESPONSE_SCHEMA, ZmqResponseData } from './ZmqResponseSchema';

export class ZmqUtils {
  
  static decodeRequest(raw: string): {
    id: string;
    type: ZmqMessageType;
    args: Record<string, string | number>;
  } | null {
    const parts = raw.split(ZMQ_DELIMITER);
    if (parts.length < 2) return null;

    const [id, typeStr, ...argStrings] = parts;
    const type = typeStr as ZmqMessageType;

    const schema = ZMQ_REQUEST_SCHEMA[type];
    if (!schema) return null;
    if (argStrings.length !== schema.length) return null;

    const args: Record<string, string | number> = {};
    for (let i = 0; i < schema.length; i++) {
      const field = schema[i];
      const val = argStrings[i];
      args[field.name] = field.type === 'number' ? parseInt(val, 10) : val;
    }

    return { id, type, args };
  }

  
  static encodeResponse<T extends ZmqMessageType>(
    id: string,
    _type: T,
    error: string,
    ...fields: (string | number)[]
  ): string {
    return [id, error, ...fields.map(String)].join(ZMQ_DELIMITER);
  }

  
  static decodeResponse<T extends keyof ZmqResponseData>(
    raw: string,
    type: T
  ): { id: string } & ZmqResponseData[T] | null {
    const parts = raw.split(ZMQ_DELIMITER);
    if (parts.length < 2) return null;

    const [id, error, ...fieldStrings] = parts;
    const schema = ZMQ_RESPONSE_SCHEMA[type];

    if (!schema) return null;
    if (fieldStrings.length !== schema.length) return null;

    const result: Record<string, string | number> = { error };
    for (let i = 0; i < schema.length; i++) {
      const field = schema[i];
      const val = fieldStrings[i];
      result[field.name] = field.type === 'number' ? (val ? parseInt(val, 10) : 0) : val;
    }

    return { id, ...result } as { id: string } & ZmqResponseData[T];
  }
}
