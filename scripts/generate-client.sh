#!/bin/bash
set -e

SPEC="${OPENAPI_INPUT:-}"

if [ -z "$SPEC" ]; then
  echo "🔄 [1/3] swagger.json を取得中..."
  curl -o swagger.json "${BACKEND_SWAGGER_URL:-http://localhost:8080/swagger.json}"
  SPEC="./swagger.json"
else
  echo "📄 [1/3] ローカルファイルを使用: ${SPEC}"
fi

echo "🔄 [2/3] TypeScript クライアントを生成中..."
npx openapi-generator-cli generate --config openapi-config.yaml --input-spec "${SPEC}"

echo "🔄 [3/3] 生成コードを prettier で整形中..."
npx prettier --write src/generated/

echo "🔍 型チェック実行中..."
npx tsc --noEmit

echo "✅ コード生成完了"
