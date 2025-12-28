import winston from 'winston';
import chalk from 'chalk';
import { env } from '../config';

const { combine, timestamp, printf, errors } = winston.format;

// Color definitions for different log levels
const levelColors = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.blue,
  http: chalk.magenta,
  debug: chalk.cyan,
};

const levelBrightColors = {
  error: chalk.redBright,
  warn: chalk.yellowBright,
  info: chalk.blueBright,
  http: chalk.magentaBright,
  debug: chalk.cyanBright,
};

const levelIcons = {
  error: '❌',
  warn: '⚠️ ',
  info: 'ℹ️ ',
  http: '🌐',
  debug: '🔍',
};

// Custom colorized format for console output
const colorizedFormat = printf(({ level, message, timestamp: ts, stack }) => {
  const color = levelColors[level as keyof typeof levelColors] || chalk.white;
  const brightColor =
    levelBrightColors[level as keyof typeof levelBrightColors] || chalk.whiteBright;
  const icon = levelIcons[level as keyof typeof levelIcons] || '📝';

  const timestampStr = chalk.gray(`[${ts as string}]`);
  const levelStr = color(`[${level.toUpperCase()}]`);
  const iconStr = icon;

  // Format the message - use bright color for strings
  const formattedMessage = typeof message === 'string' ? brightColor(message) : message;

  // Include stack trace for errors
  const output = stack
    ? `${timestampStr} ${iconStr} ${levelStr}\n${chalk.red(stack as string)}`
    : `${timestampStr} ${iconStr} ${levelStr} ${formattedMessage}`;

  return output;
});

// Simple format for file output (no colors)
const fileFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts as string} [${level.toUpperCase()}]: ${stack || message}`;
});

// Create logger instance
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true })),
  defaultMeta: { service: 'scanpay-backend' },
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        colorizedFormat
      ),
    }),
  ],
});

// Add file transports in production
if (env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        fileFormat
      ),
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        fileFormat
      ),
    })
  );
}

// Custom Logging class similar to the example you showed
export class Logging {
  public static info = (args: unknown): void => {
    const message = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
    logger.info(message);
  };

  public static warn = (args: unknown): void => {
    const message = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
    logger.warn(message);
  };

  public static error = (args: unknown): void => {
    const message = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
    logger.error(message);
  };

  public static debug = (args: unknown): void => {
    const message = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
    logger.debug(message);
  };

  public static http = (args: unknown): void => {
    const message = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
    logger.http(message);
  };

  // Pretty formatted success message
  public static success = (args: unknown): void => {
    const message = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    // eslint-disable-next-line no-console
    console.log(chalk.gray(`[${ts}]`), '✅', chalk.green('[SUCCESS]'), chalk.greenBright(message));
  };

  // Box-styled important message
  public static box = (title: string, message: string): void => {
    const line = '═'.repeat(50);
    // eslint-disable-next-line no-console
    console.log(chalk.cyan(`╔${line}╗`));
    // eslint-disable-next-line no-console
    console.log(chalk.cyan('║') + chalk.bold.cyanBright(` ${title.padEnd(49)}`) + chalk.cyan('║'));
    // eslint-disable-next-line no-console
    console.log(chalk.cyan(`╠${line}╣`));
    // eslint-disable-next-line no-console
    console.log(chalk.cyan('║') + chalk.white(` ${message.padEnd(49)}`) + chalk.cyan('║'));
    // eslint-disable-next-line no-console
    console.log(chalk.cyan(`╚${line}╝`));
  };
}

export default logger;
