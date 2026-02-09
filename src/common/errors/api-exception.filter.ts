import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RollbarService } from '../rollbar/rollbar.service';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly rollbarService: RollbarService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const responseBody =
      typeof exceptionResponse === 'object' && exceptionResponse
        ? (exceptionResponse as Record<string, unknown>)
        : undefined;

    const code =
      (responseBody?.code as string | undefined) ??
      (responseBody?.error as string | undefined) ??
      (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED');
    const message =
      (responseBody?.message as string | undefined) ??
      (exception instanceof Error ? exception.message : 'Unexpected error');
    const details =
      (responseBody?.details as Record<string, unknown> | undefined) ?? {};

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      this.rollbarService.error(exception, {
        requestId: request.headers['x-request-id'],
        method: request.method,
        path: request.url,
        status,
      });
    }

    response.status(status).json({
      error: {
        code,
        message,
        details,
      },
    });
  }
}
