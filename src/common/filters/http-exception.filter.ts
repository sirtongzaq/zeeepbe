import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponse } from '../interfaces/response.interface';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.getStatus();

    const exceptionResponse = exception.getResponse();

    let message: string | string[] = exception.message;
    let errorCode = 'UNKNOWN_ERROR';

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const res = exceptionResponse as {
        message?: string | string[];
        error?: string;
      };

      message = res.message ?? message;
      errorCode = res.error ?? errorCode;
    }

    const errorResponse: ErrorResponse = {
      status: 'error',
      message,
      errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}
