import { ErrorReporting } from '@google-cloud/error-reporting';
import { Logging } from '@google-cloud/logging';

const isProduction = process.env.NODE_ENV === 'production';
const errors = isProduction ? new ErrorReporting() : null;
const logging = isProduction ? new Logging() : null;
const log = logging?.log('api');

export const logger = {
  info: (message: string, metadata?: any) => {
    if (isProduction && log) {
      log.info({ message, ...metadata });
    } else {
      console.log(`[INFO] ${message}`, metadata || '');
    }
  },
  
  error: (error: Error | string, metadata?: any) => {
    if (isProduction && errors && error instanceof Error) {
      errors.report(error);
    }
    
    if (isProduction && log) {
      log.error({ 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        ...metadata 
      });
    } else {
      console.error(`[ERROR]`, error, metadata || '');
    }
  },
  
  warn: (message: string, metadata?: any) => {
    if (isProduction && log) {
      log.warning({ message, ...metadata });
    } else {
      console.warn(`[WARN] ${message}`, metadata || '');
    }
  }
};