/**
 * Authentication Module
 *
 * Provides core authentication functionality including user management,
 * session handling, and security features.
 */

import { UserService } from './UserService.js';
import { SessionManager } from '../utils/SessionManager.js';

export interface AuthConfig {
  sessionTimeout: number;
  maxLoginAttempts: number;
  enableTwoFactor: boolean;
}

export class AuthModule {
  private userService: UserService;
  private sessionManager: SessionManager;
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
    this.userService = new UserService();
    this.sessionManager = new SessionManager(config.sessionTimeout);
  }

  /**
   * Authenticate user with credentials
   */
  async authenticate(username: string, password: string): Promise<string | null> {
    const user = await this.userService.validateCredentials(username, password);

    if (!user) {
      return null;
    }

    const sessionToken = await this.sessionManager.createSession(user.id);
    return sessionToken;
  }

  /**
   * Logout user and invalidate session
   */
  async logout(sessionToken: string): Promise<void> {
    await this.sessionManager.invalidateSession(sessionToken);
  }

  /**
   * Verify active session
   */
  async verifySession(sessionToken: string): Promise<boolean> {
    return await this.sessionManager.isValid(sessionToken);
  }
}
