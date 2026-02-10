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

  const app = await NestFactory.create(AppModule, {
    cors:
      frontendOrigins.length > 0
        ? {
            origin: frontendOrigins,
            credentials: true,
          }
        : true,
  });
  app.setGlobalPrefix(API_PREFIX);
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
