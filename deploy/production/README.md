# Bayanis demo server — runbook

One Linux server runs everything in Docker: the app, its two schedulers, PostgreSQL
and Caddy (HTTPS). A release is a version tag pushed to GitHub.

## One-time server setup

On a fresh Ubuntu 24.04 server (as root):

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# A non-root user the release workflow logs in as
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh /opt/bayanis/sources /opt/bayanis/backups
cp ~/.ssh/authorized_keys /home/deploy/.ssh/      # or paste a dedicated deploy key
chown -R deploy:deploy /home/deploy/.ssh /opt/bayanis

# Firewall: web and SSH only
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

Then, as `deploy`, create `/opt/bayanis/.env` from `.env.example` in this folder
and fill in every value. DNS for `APP_DOMAIN` must already
point at the server, or Caddy cannot obtain the certificate.

GitHub repository secrets (Settings › Secrets and variables › Actions):
`DEPLOY_HOST`, `DEPLOY_USER` (= `deploy`), `DEPLOY_SSH_KEY` (the private key).

## First deployment: load the data

The first release starts an empty database. Load a copy of a prepared database into it
once, then record where its schema stands.

On the machine that has the prepared database:

```bash
docker exec test_postgres pg_dump -U postgres -Fc bayanatix > bayanatix.dump
docker exec test_postgres pg_dump -U postgres -Fc crmdb     > crmdb.dump
scp bayanatix.dump crmdb.dump deploy@<server>:/opt/bayanis/backups/
```

On the server:

```bash
cd /opt/bayanis
docker compose up -d db
docker compose exec -T db pg_restore -U postgres -d bayanatix --no-owner /backups/bayanatix.dump
docker compose exec -T db pg_restore -U postgres -d crmdb     --no-owner /backups/crmdb.dump
docker compose run --rm app node scripts/migrate-tracked.mjs --baseline
docker compose up -d
```

After the restore, in Bayanis (Administration › Data Sources):

- point the demo CRM connection at host `db`, port `5432` (it was `localhost:5431`);
- change file-source paths to `/data/sources/<folder>` and copy the files into
  `/opt/bayanis/sources/<folder>` on the server;
- re-enter stored source passwords unless `LLM_SECRETS_MASTER_KEY` is the same key the
  dump was created with;
- change the demo accounts' passwords.

## Releasing

```bash
git tag v1.4.0
git push origin v1.4.0
```

The workflow builds the image, publishes it to GitHub's registry, copies the compose
files, takes a database backup (`backups/bayanatix-before-<tag>.dump`, last 10 kept),
applies new migrations and restarts the services.

New migrations are plain `db/NNN_name.sql` files, as before; the release applies each
one exactly once (`bayanat.schema_migrations`). Locally they can still be applied by
hand — run `npm run db:migrate:tracked -- --baseline` afterwards (or apply them with
`npm run db:migrate:tracked` in the first place) so the local history stays in step.

## Rolling back

Code only (the release added no migration): re-run the previous tag's workflow from
GitHub › Actions › Release › Re-run, or on the server:

```bash
cd /opt/bayanis
sed -i 's/^APP_VERSION=.*/APP_VERSION=v1.3.0/' .env && docker compose up -d
```

Code and data (the release changed the schema):

```bash
docker compose stop app scheduler pbix-scheduler
docker compose exec -T db pg_restore -U postgres -d bayanatix --clean --if-exists --no-owner /backups/bayanatix-before-v1.4.0.dump
sed -i 's/^APP_VERSION=.*/APP_VERSION=v1.3.0/' .env && docker compose up -d
```

## Day to day

```bash
docker compose ps                     # what is running
docker compose logs -f app            # application log
docker compose logs -f scheduler      # scheduled crawls / DQ / retention
docker compose exec db psql -U postgres -d bayanatix
```
