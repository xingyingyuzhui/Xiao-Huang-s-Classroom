# Cloud Deployment Guide

Server: Ubuntu 22.04, `xiaohuang@111.228.54.224`, project dir `/opt/xiaohuang-classroom`.

Topology: Host Nginx → cloud-server container (port 3000) → postgres:16 (internal only).

## First-Time Setup

1. **Server preparation**

```bash
ssh xiaohuang@111.228.54.224
sudo mkdir -p /opt/xiaohuang-classroom/{releases,current,secrets,backups/postgres}
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

4. **Copy compose file**

```bash
cp deploy/compose.yml /opt/xiaohuang-classroom/compose.yml
```

5. **Install Nginx config**

```bash
sudo cp deploy/nginx/xiaohuang.conf /etc/nginx/sites-available/xiaohuang
sudo ln -sf /etc/nginx/sites-available/xiaohuang /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

6. **Initial deploy**

```bash
cd /opt/xiaohuang-classroom
./deploy/scripts/deploy.sh <git-sha>
```

## Subsequent Releases

```bash
# Upload release artifacts to /opt/xiaohuang-classroom/releases/<sha>/
./deploy/scripts/deploy.sh <sha>

# Verify
./deploy/scripts/verify-release.sh
```

## Rollback

```bash
./deploy/scripts/rollback.sh <previous-sha>
```

## Maintenance

- Logs: `docker compose -f /opt/xiaohuang-classroom/compose.yml logs -f cloud-server`
- Restart: `docker compose -f /opt/xiaohuang-classroom/compose.yml restart cloud-server`
- DB shell: `docker compose -f /opt/xiaohuang-classroom/compose.yml exec postgres psql -U xiaohuang_cloud xiaohuang_classroom`
