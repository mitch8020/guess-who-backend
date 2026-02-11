import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { API_PREFIX } from './common/constants';
import { AppModule } from './app.module';

async function bootstrap() {
  const frontendOrigins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (frontendOrigins.length === 0) {
    throw new Error(
      'FRONTEND_URL must be configured with one or more allowed origins.',
    );
  }

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: frontendOrigins,
      credentials: true,
    },
  });
  app.setGlobalPrefix(API_PREFIX);
  app.use(
    (
      _req: unknown,
      res: {
        setHeader: (name: string, value: string) => void;
      },
      next: () => void,
    ) => {
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('x-frame-options', 'DENY');
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader(
        'permissions-policy',
        'camera=(), microphone=(), geolocation=()',
      );
      res.setHeader('cross-origin-opener-policy', 'same-origin');
      res.setHeader('cross-origin-resource-policy', 'same-site');
      res.setHeader('origin-agent-cluster', '?1');
      res.setHeader(
        'content-security-policy',
        "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      if (process.env.NODE_ENV === 'production') {
        res.setHeader(
          'strict-transport-security',
          'max-age=31536000; includeSubDomains',
        );
      }
      next();
    },
  );
  app.use(
    (
      req: { headers: Record<string, string>; method: string; url: string },
      res: { setHeader: (name: string, value: string) => void },
      next: () => void,
    ) => {
      const requestId = req.headers['x-request-id'] ?? randomUUID();
      res.setHeader('x-request-id', requestId);
      req.headers['x-request-id'] = requestId;
      next();
    },
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 1000);
  await app.listen(port);
  Logger.log(`Guess Who backend listening on port ${port}`, 'Bootstrap');
}
void bootstrap();
