#!/bin/sh

echo "=== start.sh начал выполнение ==="
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
echo "DATABASE_URL присутствует: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "TELEGRAM_BOT_TOKEN присутствует: $([ -n "$TELEGRAM_BOT_TOKEN" ] && echo YES || echo NO)"
echo "GEMINI_API_KEY присутствует: $([ -n "$GEMINI_API_KEY" ] && echo YES || echo NO)"

if [ -z "$PORT" ]; then
  echo "ОШИБКА: PORT не задан!"
  exit 1
fi

echo "=== Запуск сервера ==="
node --enable-source-maps ./dist/index.mjs &
SERVER_PID=$!
echo "Сервер запущен, PID=$SERVER_PID"

# Миграции в фоне — только если DATABASE_URL задан
(
  sleep 3
  if [ -n "$DATABASE_URL" ]; then
    echo "=== Запуск миграций БД ==="
    npm run db:push && echo "=== Миграции выполнены ===" || echo "=== Миграции упали (не критично) ==="
  else
    echo "=== DATABASE_URL не задан, миграции пропущены ==="
  fi
) &

wait $SERVER_PID
