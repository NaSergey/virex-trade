#!/usr/bin/env bash
# Пересборка прод-стека на VPS. Один скрипт на два входа:
#
#   deploy/deploy.sh          — собрать то, что лежит в дереве. Зовёт хук
#                               post-receive после `git push` прямо на сервер.
#   deploy/deploy.sh --pull   — сначала подтянуть main с GitHub fast-forward'ом.
#                               Это forced command ключа GitHub Actions
#                               (.github/workflows/deploy.yml): других команд
#                               этим ключом не выполнить.
#
# Настройка — docs/deploy/auto-deploy.md.
set -euo pipefail

DIR=/opt/virex-trader
GITHUB=https://github.com/NaSergey/virex-trade.git

# Хук и Actions приходят одновременно на каждый `git push origin main`
# (у origin два push-адреса): без замка две сборки одного стека шли бы
# параллельно. Второй ждёт первого и находит всё уже собранным.
if [ -z "${VIREX_DEPLOY_LOCKED:-}" ]; then
  exec env VIREX_DEPLOY_LOCKED=1 flock /run/lock/virex-deploy "$0" "$@"
fi

# Хук запускается с GIT_DIR от receive-pack; git ниже должен видеть дерево.
unset GIT_DIR GIT_WORK_TREE
cd "$DIR"

if [ "${1:-}" = "--pull" ]; then
  git fetch --quiet "$GITHUB" main
  # Только fast-forward: разошедшаяся история валит деплой, а не затирается.
  # Сервер впереди GitHub (пушнули только сюда) — «Already up to date».
  git merge --ff-only FETCH_HEAD
  # Скрипт мог прийти новым — дальше идёт уже он.
  exec "$0"
fi

echo "deploy $(git rev-parse --short HEAD)"
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

# Кэш сборки сам не чистится: каждая сборка оставляет слои npm ci по ~0,8 ГБ
# (2026-10-21 набралось 51 ГБ). Держим только свежее за трое суток; сбой
# очистки деплой не роняет.
docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true

docker compose --env-file .env.prod -f docker-compose.prod.yml ps
