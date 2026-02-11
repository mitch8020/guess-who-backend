import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Rollbar from 'rollbar';

@Injectable()
export class RollbarService {
  private readonly logger = new Logger(RollbarService.name);
  private readonly client?: Rollbar;

  constructor(private readonly configService: ConfigService) {
    const accessToken = this.configService.get<string>('ROLLBAR_ACCESS_TOKEN');
    if (!accessToken) {
      return;
    }

    this.client = new Rollbar({
      accessToken,
      environment: this.configService.get<string>('ROLLBAR_ENV', 'development'),
      codeVersion: this.configService.get<string>(
        'ROLLBAR_CODE_VERSION',
        'dev',
      ),
      captureUncaught: true,
      captureUnhandledRejections: true,
      payload: {
        client: {
          javascript: {
            source_map_enabled: true,
            guess_uncaught_frames: true,
          },
        },
      },
    });
  }

  error(error: unknown, context?: Record<string, unknown>): void {
    if (!this.client) {
      return;
    }
    try {
      this.client.error(error as Error, this.sanitizeContext(context));
    } catch (reportingError) {
      this.logger.warn(
        `Failed to report Rollbar error: ${String(reportingError)}`,
      );
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.client) {
      return;
    }
    try {
      this.client.info(message, this.sanitizeContext(context));
    } catch (reportingError) {
      this.logger.warn(
        `Failed to report Rollbar info: ${String(reportingError)}`,
      );
    }
  }

  private sanitizeContext(
    context: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!context) {
      return undefined;
    }
    const sanitized = { ...context };
    for (const key of Object.keys(sanitized)) {
      if (/(token|secret|password|authorization|cookie|oauth)/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }
}
