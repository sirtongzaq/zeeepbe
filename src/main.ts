import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  const prisma = app.get(PrismaService);
  await prisma.$connect();
  console.log('DB Connected ✅');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`HTTP Server running on http://localhost:${port} 🚀`);
  console.log(`WebSocket ready at ws://localhost:${port} 🔌`);
}
void bootstrap();
