import { ApiResponse } from '../interceptors/response.interceptor.js';

export class ApiResponseUtil {
  static success<T>(
    data: T,
    message: string = 'Request successful',
    statusCode: number = 200,
    meta: Record<string, any> = {},
  ): ApiResponse<T> {
    return {
      success: true,
      statusCode,
      message,
      data,
      meta,
    };
  }

  static created<T>(
    data: T,
    message: string = 'Resource created successfully',
    meta: Record<string, any> = {},
  ): ApiResponse<T> {
    return this.success(data, message, 201, meta);
  }

  static error(
    message: string = 'An error occurred',
    statusCode: number = 400,
    errors: any[] = [],
  ): ApiResponse {
    return {
      success: false,
      statusCode,
      message,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  static notFound(message: string = 'Resource not found'): ApiResponse {
    return this.error(message, 404);
  }

  static unauthorized(message: string = 'Unauthorized'): ApiResponse {
    return this.error(message, 401);
  }

  static forbidden(message: string = 'Forbidden'): ApiResponse {
    return this.error(message, 403);
  }

  static badRequest(
    message: string = 'Bad request',
    errors: any[] = [],
  ): ApiResponse {
    return this.error(message, 400, errors);
  }
}
