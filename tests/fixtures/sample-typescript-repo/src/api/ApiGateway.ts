/**
 * API Gateway
 *
 * Central routing and request handling for API endpoints.
 * Provides middleware support, rate limiting, and request validation.
 */

import { Router } from './Router.js';
import { AuthModule } from '../auth/AuthModule.js';

export interface ApiRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export type Middleware = (req: ApiRequest, res: ApiResponse) => Promise<void>;

export class ApiGateway {
  private router: Router;
  private authModule: AuthModule;
  private middlewares: Middleware[];

  constructor(authModule: AuthModule) {
    this.authModule = authModule;
    this.router = new Router();
    this.middlewares = [];
  }

  /**
   * Add middleware to the pipeline
   */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Register a route handler
   */
  route(method: string, path: string, handler: (req: ApiRequest) => Promise<ApiResponse>): void {
    this.router.register(method, path, handler);
  }

  /**
   * Handle incoming API request
   */
  async handleRequest(request: ApiRequest): Promise<ApiResponse> {
    let response: ApiResponse = {
      status: 200,
      headers: {},
      body: null,
    };

    // Run middleware pipeline
    for (const middleware of this.middlewares) {
      await middleware(request, response);
    }

    // Route to handler
    const handler = this.router.resolve(request.method, request.path);

    if (handler) {
      response = await handler(request);
    } else {
      response.status = 404;
      response.body = { error: 'Not Found' };
    }

    return response;
  }

  /**
   * Authentication middleware
   */
  async authMiddleware(req: ApiRequest, res: ApiResponse): Promise<void> {
    const token = req.headers['authorization'];

    if (!token) {
      res.status = 401;
      res.body = { error: 'Unauthorized' };
      return;
    }

    const isValid = await this.authModule.verifySession(token);

    if (!isValid) {
      res.status = 401;
      res.body = { error: 'Invalid session' };
    }
  }
}
