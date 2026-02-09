import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestPrincipal } from '../types/domain.types';

export interface RequestWithPrincipal extends Request {
  principal?: RequestPrincipal;
}

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, context: ExecutionContext): RequestPrincipal | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    return request.principal;
  },
);
