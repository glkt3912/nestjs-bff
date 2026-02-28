import { ExecutionContext, Injectable } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';

/**
 * JWT 認証済みリクエストに対してユーザーID をキャッシュキーに含める。
 *
 * デフォルトの CacheInterceptor は URL のみをキーにするため、
 * 認証エンドポイントで異なるユーザーのレスポンスが共有されるリスクがある。
 * このインターセプターは `userId:url` をキーにすることでユーザー間の分離を保証する。
 *
 * - 認証済み（request.user.sub あり）: `{userId}:{url}` をキーとして使用
 * - 未認証（request.user なし）: undefined を返してキャッシュをスキップ
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

    // 認証情報がない場合はキャッシュしない（@Public() エンドポイントは除外）
    // @Public() エンドポイントで必要なら親クラスの trackBy を呼ぶ
    return undefined;
  }
}
