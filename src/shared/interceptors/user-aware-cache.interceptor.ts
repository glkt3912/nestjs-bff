import { ExecutionContext, Injectable } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

/**
 * JWT 認証済みリクエストに対してユーザーID をキャッシュキーに含める。
 *
 * デフォルトの CacheInterceptor は URL のみをキーにするため、
 * 認証エンドポイントで異なるユーザーのレスポンスが共有されるリスクがある。
 * このインターセプターは `userId:url` をキーにすることでユーザー間の分離を保証する。
 *
 * - 認証済み（request.user.sub あり）: `{userId}:{url}` をキーとして使用
 * - @Public() エンドポイント（未認証）: 親クラスの trackBy で URL をキーとして使用
 * - 未認証かつ非 @Public(): undefined を返してキャッシュをスキップ
 */
@Injectable()
export class UserAwareCacheInterceptor extends CacheInterceptor {
  protected override trackBy(context: ExecutionContext): string | undefined {
    const request = context
      .switchToHttp()
      .getRequest<{ url: string; user?: { sub?: string } }>();

    const userId = request.user?.sub;

    // 認証情報がある場合はユーザーID をキーに含めて分離
    if (userId) {
      return `${userId}:${request.url}`;
    }

    // @Public() エンドポイントは認証不要のため URL のみでキャッシュ可能
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return super.trackBy(context);
    }

    // 認証情報がなく @Public() でもない場合はキャッシュしない
    return undefined;
  }
}
