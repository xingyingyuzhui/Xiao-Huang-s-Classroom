# Cloud Deployment Guide

Server: Ubuntu 22.04, project dir `/opt/xiaohuang-classroom`.

Topology: Host Nginx → cloud-server container (`127.0.0.1:3000`) → postgres:16 (internal only). Lab Express is loopback `:3001` and is **not** on the public `/api/` path.

**Compose authority:** `deploy/compose.yml` + `deploy/compose.prod.yml`. Do not maintain a third handwritten compose on the host.

**HTTPS GATE:** IP+HTTP is test-only. Real passwords, keys, rosters, WeChat, avatars, and auto-update need a domain + TLS. See `docs/operations/deploy-rollback-runbook.md`.

## First-Time Setup

1. **Server preparation**

```bash
sudo mkdir -p /opt/xiaohuang-classroom/{releases,secrets,backups/postgres,backups/lab-sqlite}
sudo chown -R xiaohuang:xiaohuang /opt/xiaohuang-classroom
```

2. **Install dependencies**

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin nginx
sudo usermod -aG docker xiaohuang
```

3. **Configure secrets**

```bash
cp deploy/env.example /opt/xiaohuang-classroom/secrets/.env
# Edit .env with real passwords and keys
chmod 600 /opt/xiaohuang-classroom/secrets/.env
```

4. **Install compose + scripts (same paths as CI)**

```bash
rsync -a deploy/ /opt/xiaohuang-classroom/deploy/
```

5. **Install Nginx config** (root provisioning; not part of a normal release)

```bash
sudo cp /opt/xiaohuang-classroom/deploy/nginx/xiaohuang.conf /etc/nginx/sites-available/xiaohuang
sudo ln -sf /etc/nginx/sites-available/xiaohuang /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

6. **Daily backup timer**

```bash
sudo cp /opt/xiaohuang-classroom/deploy/systemd/xiaohuang-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now xiaohuang-backup.timer
```

7. **Initial deploy**

```bash
export GIT_SHA=<sha> CLOUD_IMAGE_TAG=<sha> LAB_IMAGE_TAG=<sha>
/opt/xiaohuang-classroom/deploy/scripts/deploy.sh <git-sha>
```

## Subsequent Releases

```bash
# Upload SHA-tagged images + web tree to releases/<sha>/web
/opt/xiaohuang-classroom/deploy/scripts/deploy.sh <sha>
/opt/xiaohuang-classroom/deploy/scripts/verify-release.sh
```

Migrate is `node dist/migrate.js` inside the cloud image. Do not pass `--migrate-only` to `server.js`.

## Rollback

```bash
/opt/xiaohuang-classroom/deploy/scripts/rollback.sh <web-sha> <cloud-sha> <lab-sha>
```

No automatic database down-migration. See the runbook.

## Maintenance

```bash
compose() {
  docker compose --env-file /opt/xiaohuang-classroom/secrets/.env \
    -p deploy \
    -f /opt/xiaohuang-classroom/deploy/compose.yml \
    -f /opt/xiaohuang-classroom/deploy/compose.prod.yml "$@"
}
compose logs -f cloud-server
compose restart cloud-server
```
