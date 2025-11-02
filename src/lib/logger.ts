/**
 * Logger utility for the GraphRAG application
 * Provides structured logging to both console and file
 */

import { mkdir, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { LogLevel, Logger as ILogger } from '../types/index.js';

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export class Logger implements ILogger {
  private namespace: string;
  private logLevel: LogLevel;
  private logDir: string;
  private logFile: string;
  private minLevel: number;

  constructor(
    namespace: string = 'AppLogger',
    logDir: string = 'logs',
    logFile: string = 'app.log'
  ) {
    this.namespace = namespace;
    this.logDir = logDir;
    this.logFile = logFile;

    // Get log level from environment
    const logLevelEnv = (process.env.LOG_LEVEL?.toUpperCase() || 'INFO') as LogLevel;
    this.logLevel = ['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(logLevelEnv) ? logLevelEnv : 'INFO';
    this.minLevel = LOG_LEVELS[this.logLevel];

    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdir(this.logDir, { recursive: true }).catch((err) => {
        console.error(`Failed to create log directory: ${err}`);
      });
    }
  }

  private formatMessage(level: LogLevel, message: string, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const argsStr =
      args.length > 0
        ? ' ' +
          args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ')
        : '';
    return `${timestamp} - ${this.namespace} - ${level} - ${message}${argsStr}`;
  }

  private async log(level: LogLevel, message: string, args: unknown[]): Promise<void> {
    const levelValue = LOG_LEVELS[level];

    if (levelValue < this.minLevel) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, args);

    // Console output
    const consoleMethod =
      level === 'ERROR'
        ? console.error
        : level === 'WARN'
          ? console.warn
          : level === 'DEBUG'
            ? console.debug
            : console.log;
    consoleMethod(formattedMessage);

    // File output
    try {
      await appendFile(join(this.logDir, this.logFile), formattedMessage + '\n');
    } catch (err) {
      console.error(`Failed to write to log file: ${err}`);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    void this.log('DEBUG', message, args);
  }

  info(message: string, ...args: unknown[]): void {
    void this.log('INFO', message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    void this.log('WARN', message, args);
  }

  error(message: string, ...args: unknown[]): void {
    void this.log('ERROR', message, args);
  }

  getLogger(): ILogger {
    return this;
  }
}
