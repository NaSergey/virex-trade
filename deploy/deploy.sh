#!/usr/bin/env bash
# Обновление прод-стека на VPS: подтянуть main и пересобрать контейнеры.
# Запускается на сервере — руками или из .github/workflows/deploy.yml по SSH.
#
#   REPO_DIR=/path/to/virex-trade ./deploy/deploy.sh
#
# Профиль Caddy (вариант A из docs/deploy/vps-domain.md) включается строкой
# COMPOSE_PROFILES=edge в .env.prod — compose читает её сам.
set -euo pipefail

cd "${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

COMPOSE=(docker compose --env-file .env.prod -f docker-compose.prod.yml)

# Только fast-forward: если на сервере остались свои правки или история
# разошлась, деплой падает, а не затирает их молча.
git fetch origin main
git merge --ff-only origin/main

"${COMPOSE[@]}" up -d --build --remove-orphans

# Старые слои пересборок копятся и забивают диск VPS.
docker image prune -f >/dev/null

"${COMPOSE[@]}" ps
echo "deployed $(git rev-parse --short HEAD)"
