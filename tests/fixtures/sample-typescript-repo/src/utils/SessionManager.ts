/**
 * Session Manager
 *
 * Manages user sessions with timeout and validation.
 */

export interface Session {
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export class SessionManager {
  private sessions: Map<string, Session>;
  private timeout: number; // milliseconds

  constructor(timeout: number = 3600000) { // 1 hour default
    this.sessions = new Map();
    this.timeout = timeout;
  }

  /**
   * Create a new session
   */
  async createSession(userId: string): Promise<string> {
    const token = this.generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.timeout);

    const session: Session = {
      token,
      userId,
      createdAt: now,
      expiresAt,
    };

    this.sessions.set(token, session);
    return token;
  }

  /**
   * Validate session token
   */
  async isValid(token: string): Promise<boolean> {
    const session = this.sessions.get(token);

    if (!session) {
      return false;
    }

    const now = new Date();
    if (now > session.expiresAt) {
      this.sessions.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Invalidate session
   */
  async invalidateSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  /**
   * Get session data
   */
  getSession(token: string): Session | undefined {
    return this.sessions.get(token);
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpired(): void {
    const now = new Date();

    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(token);
      }
    }
  }

  private generateToken(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }
}
