import morgan, { StreamOptions } from 'morgan';
import { logger } from '../utils';
import { env } from '../config';

// Morgan stream for Winston
const stream: StreamOptions = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Skip logging in test environment
const skip = (): boolean => {
  return env.NODE_ENV === 'test';
};

// Request logger middleware
export const requestLogger = morgan(
  env.NODE_ENV === 'production' ? 'combined' : 'dev',
  { stream, skip }
);

export default requestLogger;

