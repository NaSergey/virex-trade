# Автодеплой: пуш в `main` → обновление VPS

Деплоев два входа, сборка одна — `deploy/deploy.sh` на сервере:

- **Пуш в `main` на GitHub** (merge PR, пуш из облачной сессии, свой пуш) →
  `.github/workflows/deploy.yml` заходит на сервер по SSH → `deploy.sh --pull`:
  fetch `main` с GitHub, `git merge --ff-only`, `docker compose … up -d --build`.
  Вручную — Actions → Deploy → Run workflow (пересоберёт то, что в `main`).
- **Пуш прямо на сервер** (у локального `origin` второй push-адрес —
  `ssh://root@…:3333/opt/virex-trader`) → хук `post-receive` → `deploy.sh`.

`git push origin main` с рабочей машины попадает в оба входа сразу. Сборки не
дерутся: `deploy.sh` держит замок `/run/lock/virex-deploy`, второй ждёт первого
и находит образы уже собранными (сборка из кэша, контейнеры не пересоздаются).

Сборка идёт на самом сервере. Упала — прогон Actions красный, лог сборки в нём.
Для пуша прямо на сервер вывод хука виден в выводе `git push`, но код выхода
хука пуш не отменяет — смотреть глазами.

## Как устроен доступ

Ключ Actions — отдельный ed25519 без пароля, в `/root/.ssh/authorized_keys`
с forced command и `restrict`:

```
command="/opt/virex-trader/deploy/deploy.sh --pull",restrict ssh-ed25519 AAAA… github-actions-deploy
```

Этим ключом нельзя ни войти в шелл, ни выполнить другую команду, ни
пробросить порт — только пересобрать то, что уже лежит в `main` на GitHub.
Утечка секрета даёт «передеплоить main», а не root на сервере. Репозиторий
публичный, поэтому fetch с GitHub идёт без ключа.

Хук сервера (`/opt/virex-trader/.git/hooks/post-receive`, в git не хранится):

```sh
#!/bin/sh
exec /opt/virex-trader/deploy/deploy.sh
```

Прежний хук — `post-receive.bak-2026-10-23`.

## Секреты GitHub (Settings → Secrets and variables → Actions)

| Секрет | Значение |
|---|---|
| `DEPLOY_HOST` | адрес сервера |
| `DEPLOY_PORT` | порт SSH (3333) |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | приватный ключ целиком |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -p 3333 <адрес>` |

Сменить ключ: новый `ssh-keygen -t ed25519 -N ""`, строка выше с новым
публичным ключом в `authorized_keys` вместо старой, `gh secret set
DEPLOY_SSH_KEY < ключ`, приватный файл удалить.

## Что деплой не делает

- **Не гоняет тесты.** Любой merge в `main` уходит на прод.
- **Не применяет ручные шаги выкладки.** Схема БД синхронизируется на старте
  `api` (`prisma db push`) и отказывается удалять колонки с данными и
  добавлять unique-ограничения без `--accept-data-loss` — тогда `api` уходит в
  перезапуск по кругу, а прогон остаётся зелёным (compose поднял контейнеры).
  Такие изменения выкладываются с ручным шагом до пуша.
- **Откат:** `git revert` плохого коммита и пуш в `main`.
