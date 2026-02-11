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
      status >= 500
        ? 'Internal server error.'
        : ((responseBody?.message as string | undefined) ??
          (exception instanceof Error
            ? exception.message
            : 'Unexpected error'));
    const details =
      (responseBody?.details as Record<string, unknown> | undefined) ?? {};

    if (status >= 500) {
      const roomId =
        this.readField(request.params, 'roomId') ??
        this.readField(request.body, 'roomId');
      const matchId =
        this.readField(request.params, 'matchId') ??
        this.readField(request.body, 'matchId');
      const memberId =
        this.readField(request.params, 'memberId') ??
        this.readField(request.body, 'memberId');
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      this.rollbarService.error(exception, {
        requestId: request.headers['x-request-id'],
        method: request.method,
        path: request.url,
        status,
        roomId,
        matchId,
        memberId,
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

  private readField(source: unknown, key: string): string | undefined {
    if (!source || typeof source !== 'object') {
      return undefined;
    }
    const value = (source as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
}
