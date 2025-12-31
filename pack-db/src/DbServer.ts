import { Logger, Config, ConfigKeys } from 'pack-shared';
import { ServiceFactory } from './impls/ServiceFactory';

const CLASS_NAME = 'Server';

export interface ServerConfig {
  socketPath: string;
}

export class Server {
  private config: ServerConfig;
  private factory: ServiceFactory;

  constructor(config?: ServerConfig) {
    this.config = config || {
      socketPath: Config.has(ConfigKeys.ZMQ_SOCKET_PATH)
        ? Config.get(ConfigKeys.ZMQ_SOCKET_PATH)
        : 'ipc:///tmp/rs-pack-db.sock'
    };
    this.factory = ServiceFactory.getInstance();
  }

  async start(): Promise<void> {
    const zmqHandler = this.factory.getZmqHandler();

    await zmqHandler.start(this.config.socketPath);

    Logger.debug(CLASS_NAME, null, 'Database service ready and listening for requests');
    Logger.debug(CLASS_NAME, null, 'Socket: {}', this.config.socketPath);
  }
}
