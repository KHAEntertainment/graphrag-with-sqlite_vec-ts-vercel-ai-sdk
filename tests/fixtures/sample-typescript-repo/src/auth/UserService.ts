/**
 * User Service
 *
 * Manages user accounts, credentials, and profile data.
 */

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  lastLogin?: Date;
}

export class UserService {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  /**
   * Create a new user account
   */
  async createUser(username: string, email: string, password: string): Promise<User> {
    const id = this.generateUserId();
    const passwordHash = await this.hashPassword(password);

    const user: User = {
      id,
      username,
      email,
      passwordHash,
      createdAt: new Date(),
    };

    this.users.set(id, user);
    return user;
  }

  /**
   * Validate user credentials
   */
  async validateCredentials(username: string, password: string): Promise<User | null> {
    const user = Array.from(this.users.values()).find(u => u.username === username);

    if (!user) {
      return null;
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);
    return isValid ? user : null;
  }

  /**
   * Get user by ID
   */
  getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * Update last login timestamp
   */
  updateLastLogin(userId: string): void {
    const user = this.users.get(userId);
    if (user) {
      user.lastLogin = new Date();
    }
  }

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async hashPassword(password: string): Promise<string> {
    // Simplified hash simulation
    return `hash_${password}`;
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return hash === `hash_${password}`;
  }
}
