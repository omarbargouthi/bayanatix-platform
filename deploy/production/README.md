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

## Rotating the encryption key

Stored source passwords, AI provider keys and sign-in secrets are encrypted with
`LLM_SECRETS_MASTER_KEY`. To replace it:

```bash
openssl rand -hex 32                      # the new key
# in .env: LLM_SECRETS_MASTER_KEY=<new>, LLM_SECRETS_PREVIOUS_KEYS=<old>
docker compose up -d                      # restart with both keys
docker compose exec scheduler node scripts/reseal-secrets.mjs   # or Configuration › Encryption Keys
```

(The scheduler container reaches the app at `http://app:3000` with `CRON_SECRET`.) When
`docker compose exec scheduler node scripts/reseal-secrets.mjs --status` says the old key is no longer used,
empty `LLM_SECRETS_PREVIOUS_KEYS` and restart. Keep a copy of the old key as long as you
keep database backups taken before the rotation.

## Keeping the key in HashiCorp Vault

With `SECRETS_PROVIDER=vault-transit`, Vault's Transit engine holds the key and does the
encryption; Bayanis stores only Vault's ciphertext. The customer's Vault team creates:

```bash
vault secrets enable transit                      # if not already enabled
vault write -f transit/keys/bayanis
vault policy write bayanis - <<'EOF'
path "transit/encrypt/bayanis"     { capabilities = ["update"] }
path "transit/decrypt/bayanis"     { capabilities = ["update"] }
path "transit/rewrap/bayanis"      { capabilities = ["update"] }
path "transit/keys/bayanis"        { capabilities = ["read"] }
path "transit/keys/bayanis/rotate" { capabilities = ["update"] }   # optional: Rotate from Bayanis
EOF
vault auth enable approle                         # or kubernetes / token
vault write auth/approle/role/bayanis token_policies=bayanis token_ttl=20m token_max_ttl=1h
vault read -field=role_id auth/approle/role/bayanis/role-id
vault write -f -field=secret_id auth/approle/role/bayanis/secret-id
```

Then, in `.env` (all settings are in `.env.example`): `SECRETS_PROVIDER=vault-transit`,
`VAULT_ADDR`, `VAULT_AUTH_METHOD=approle`, `VAULT_ROLE_ID` and `VAULT_SECRET_ID` (or
`VAULT_SECRET_ID_FILE`). Keep `LLM_SECRETS_MASTER_KEY` until the move is done. A private CA
is trusted with `NODE_EXTRA_CA_CERTS`.

```bash
docker compose up -d
docker compose exec scheduler node scripts/reseal-secrets.mjs   # or Configuration › Encryption Keys › Move
```

When the status shows no secret left under another provider, `LLM_SECRETS_MASTER_KEY` can
be removed. Rotation is then done in Vault (`vault write -f transit/keys/bayanis/rotate`,
or Rotate key in Vault on the page), followed by a re-encryption, which Vault performs
itself (rewrap). If Vault is unreachable, local sign-in keeps working; crawls, data quality
runs and AI calls fail with "Vault is unreachable" until it is back.

### Passwords kept in Vault (references)

When `VAULT_ADDR` and the sign-in settings are set (with either `SECRETS_PROVIDER`), each
password field in Bayanis also offers **Vault reference**: the admin enters where the
password is kept, as `path#field` (e.g. `secret/bayanis/finance-db#password`). Bayanis
stores only that location and reads the value from Vault on every use, so the customer's
team rotates passwords in Vault alone. KV v1 and v2 both work; the version is detected.
Add read access to the policy, and limit references to the same paths:

```hcl
path "secret/data/bayanis/*" { capabilities = ["read"] }   # KV v2 ("secret/bayanis/...")
```

```bash
VAULT_KV_ALLOWED_PATHS=secret/bayanis/
```

To try it locally: `powershell -ExecutionPolicy Bypass -File scripts\start-vault-dev.ps1`
(a throw-away, in-memory Vault — move the secrets back to the local key before removing it).

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
