import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { RequestWithPrincipal } from '../decorators/current-principal.decorator';

@Injectable()
export class PlayerTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const authorizationHeader = request.headers['authorization'];
    const token = this.authService.extractBearerToken(authorizationHeader);
    if (!token) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A valid player token is required.',
        details: {},
      });
    }

    request.principal = this.authService.verifyPlayerToken(token);
    return true;
  }
}
