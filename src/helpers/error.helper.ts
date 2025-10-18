export type AppErrorType =
  | 'ValidationError'
  | 'AuthorizationError'
  | 'NotFoundError'
  | 'ConcurrencyError'
  | 'ConflictError'
  | 'ServiceUnavailableError'
  | 'ApiError';

/**
 * Custom error class to allow for specific error handling in controllers.
 */
export class CustomError extends Error {
  name: AppErrorType;

  constructor(name: AppErrorType, message: string) {
    super(message);
    this.name = name;
    
    // This is necessary for TypeScript to correctly extend built-in classes
    Object.setPrototypeOf(this, CustomError.prototype);
  }
}
