# Sample TypeScript Application

This is a sample TypeScript application demonstrating authentication and API gateway patterns.

## Features

- **Authentication Module**: User authentication with session management
- **User Service**: User account management and credential validation
- **API Gateway**: Central routing and middleware support
- **Session Management**: Secure session handling with timeout
- **Utility Functions**: Common helpers for validation and formatting

## Architecture

The application follows a modular architecture:

### Authentication Layer

The `AuthModule` provides core authentication functionality:
- User credential validation
- Session creation and management
- Logout and session invalidation

### API Layer

The `ApiGateway` handles all HTTP requests:
- Route registration and resolution
- Middleware pipeline execution
- Authentication middleware
- Request/response handling

### Service Layer

The `UserService` manages user data:
- User account creation
- Credential storage and validation
- Profile management

## Usage

```typescript
import { AuthModule } from './auth/AuthModule.js';
import { ApiGateway } from './api/ApiGateway.js';

// Initialize authentication
const authModule = new AuthModule({
  sessionTimeout: 3600000,
  maxLoginAttempts: 3,
  enableTwoFactor: false,
});

// Create API gateway
const gateway = new ApiGateway(authModule);

// Register routes
gateway.route('POST', '/login', async (req) => {
  const { username, password } = req.body as { username: string; password: string };
  const token = await authModule.authenticate(username, password);

  return {
    status: token ? 200 : 401,
    headers: {},
    body: token ? { token } : { error: 'Invalid credentials' },
  };
});
```

## Security Features

- Password hashing for secure credential storage
- Session timeout for automatic logout
- Authentication middleware for protected routes
- Input sanitization for XSS prevention

## API Endpoints

### POST /login
Authenticate user and create session.

### POST /logout
Invalidate user session.

### GET /verify
Verify active session token.
