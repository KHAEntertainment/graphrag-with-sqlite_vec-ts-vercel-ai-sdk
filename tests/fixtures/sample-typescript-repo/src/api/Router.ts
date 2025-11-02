/**
 * HTTP Router
 *
 * Manages route registration and resolution for API endpoints.
 */

import type { ApiRequest, ApiResponse } from './ApiGateway.js';

export type RouteHandler = (req: ApiRequest) => Promise<ApiResponse>;

interface RouteEntry {
  method: string;
  path: string;
  handler: RouteHandler;
}

export class Router {
  private routes: RouteEntry[];

  constructor() {
    this.routes = [];
  }

  /**
   * Register a new route
   */
  register(method: string, path: string, handler: RouteHandler): void {
    this.routes.push({
      method: method.toUpperCase(),
      path,
      handler,
    });
  }

  /**
   * Resolve route handler for request
   */
  resolve(method: string, path: string): RouteHandler | null {
    const route = this.routes.find(
      r => r.method === method.toUpperCase() && this.matchPath(r.path, path)
    );

    return route ? route.handler : null;
  }

  /**
   * Match path with pattern (supports basic wildcards)
   */
  private matchPath(pattern: string, path: string): boolean {
    // Simple exact match for now
    if (pattern === path) {
      return true;
    }

    // Support wildcard matching
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    return patternParts.every((part, i) => {
      return part.startsWith(':') || part === pathParts[i];
    });
  }

  /**
   * Extract path parameters
   */
  extractParams(pattern: string, path: string): Record<string, string> {
    const params: Record<string, string> = {};
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    patternParts.forEach((part, i) => {
      if (part.startsWith(':')) {
        const paramName = part.slice(1);
        params[paramName] = pathParts[i];
      }
    });

    return params;
  }
}
