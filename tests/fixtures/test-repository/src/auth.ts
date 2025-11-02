export interface User {
  id: string;
  username: string;
  email: string;
}

export class AuthService {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  register(user: User): void {
    this.users.set(user.id, user);
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  authenticate(username: string, password: string): boolean {
    // Mock authentication
    return true;
  }
}
