import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: Record<string, any>;
  errors?: any[];
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const response = context.switchToHttp().getResponse();
        let statusCode = response.statusCode || 200;

        // If data is already in the expected format, return it
        if (data && data.success !== undefined) {
          return data;
        }

        // If response contains created flag, set 201 status
        if (data && data.created === true) {
          statusCode = 201;
          response.status(201);
        }

        // Wrap the response in the standard format
        return {
          success: true,
          statusCode,
          message: this.getDefaultMessage(statusCode),
          data: data || null,
          meta: {},
        };
      }),
    );
  }

  private getDefaultMessage(statusCode: number): string {
    switch (statusCode) {
      case 200:
        return 'Request successful';
      case 201:
        return 'Resource created successfully';
      case 204:
        return 'No content';
      default:
        return 'Operation successful';
    }
  }
}
