// Technical support: step-by-step guides for the people who run the Bayanis server.
// Shown only to platform administrators (audience "ADMIN"), in the Help Center and to
// Ask Bayanis. They describe the standard installation (deploy/production): keep them
// in step with its README and docker-compose.yml.
import type { HelpDoc } from "../types";

export const SUPPORT_DOCS: HelpDoc[] = [
  {
    slug: "support-installation",
    group: "support",
    audience: "ADMIN",
    title: "How Bayanis is installed",
    summary: "The services that make up Bayanis, where its settings are kept, and how to reach the server.",
    sections: [
      {
        id: "services",
        title: "The services",
        body: `The standard installation runs Bayanis on one Linux server with Docker Compose. Everything lives in the folder \`/opt/bayanis\` on the server.

| Service | What it does |
|---|---|
| \`app\` | The Bayanis application (web pages and API) |
| \`scheduler\` | Starts scheduled work: crawls, data quality runs, retention, reminders and report snapshots |
| \`pbix-scheduler\` | Starts scheduled Power BI file scans |
| \`db\` | The PostgreSQL database |
| \`caddy\` | HTTPS: receives requests on ports 80 and 443 and obtains the certificate |

> If your organisation installed Bayanis another way (for example on Kubernetes), the same services and settings exist, but the commands in these guides are different. Ask the team that installed it.`,
      },
      {
        id: "settings",
        title: "Where the settings are",
        body: `- **Server settings** are in the file \`/opt/bayanis/.env\`: the web address, database passwords, the encryption key, HashiCorp Vault and the AI provider key. Only server administrators can change them, and Bayanis must be restarted afterwards (see *Restarting Bayanis*).
- **Everything else** is set in Bayanis itself, under Administration › Configuration, Data Sources, AI Providers and User Management.

> Never send the \`.env\` file outside your organisation, and never paste its values into a chat or a ticket: it holds the keys that protect stored passwords.`,
      },
      {
        id: "connect",
        title: "Running commands on the server",
        body: `1. Sign in to the server with SSH, as the user that manages Bayanis (in the standard installation, \`deploy\`).
2. Go to the Bayanis folder. Every command in these guides is run from there.
$ cd /opt/bayanis
3. Check that all services are running. Each should show \`running\` (the database also shows \`healthy\`).
$ docker compose ps`,
      },
    ],
    related: ["support-restart", "support-logs", "support-troubleshooting"],
  },
  {
    slug: "support-restart",
    group: "support",
    audience: "ADMIN",
    title: "Restarting Bayanis",
    summary: "Restart all services or one of them, and apply a change to the server settings.",
    sections: [
      {
        id: "when",
        title: "When to restart",
        body: `- After changing \`/opt/bayanis/.env\` (for example the encryption key or the HashiCorp Vault settings).
- When a page stays blank or every request fails, after checking the logs (see *Finding errors in the logs*).
- When scheduled jobs stopped running.

Settings changed in Bayanis itself (Administration › Configuration and the other administration pages) apply at once and need no restart.`,
      },
      {
        id: "how",
        title: "How to restart",
        body: `1. Connect to the server and go to the Bayanis folder.
$ cd /opt/bayanis
2. Restart what you need:
- **After changing \`.env\`:** recreate the services so they read the new settings. A plain restart keeps the old settings.
$ docker compose up -d
- **Everything, without a settings change:**
$ docker compose restart
- **One service only**, for example the scheduler:
$ docker compose restart scheduler
3. Check that every service is running again:
$ docker compose ps
4. Open Bayanis in the browser and sign in. The application usually answers within a minute.

Users who are signed in stay signed in. Work in progress in a browser form that was not saved is lost, so warn users before restarting during working hours.`,
      },
      {
        id: "stop",
        title: "Stopping and starting",
        body: `To stop Bayanis completely (for example before server maintenance), and to start it again:
$ docker compose stop
$ docker compose up -d

The data stays in the database. Do not run \`docker compose down -v\`: the \`-v\` deletes the database volume.`,
      },
    ],
    related: ["support-installation", "support-logs"],
  },
  {
    slug: "support-logs",
    group: "support",
    audience: "ADMIN",
    title: "Finding errors in the logs",
    summary: "Where Bayanis records errors: first in the application, then in the server logs.",
    sections: [
      {
        id: "in-app",
        title: "Start in Bayanis",
        body: `Many problems are explained without going to the server:
- **Administration › Audit & Logs › Job Logs:** every crawl, bulk download and upload, and other background job, with its console output and error.
- **Administration › Audit & Logs › Audit Log:** who changed which setting, and when.
- **Administration › Data Sources:** open the source and click **Test Connection**.
- **Administration › AI Providers:** **Test Connection** on the provider, and its last health status.
- **Configuration › Encryption Keys:** stored passwords that cannot be opened, and whether HashiCorp Vault answers.`,
      },
      {
        id: "server",
        title: "Read the server logs",
        body: `1. Connect to the server and go to the Bayanis folder.
$ cd /opt/bayanis
2. Pick the service from the symptom:

| Symptom | Service |
|---|---|
| Pages fail, errors when saving, sign-in problems | \`app\` |
| Scheduled crawls, data quality or reminders do not run | \`scheduler\` |
| Scheduled Power BI scans do not run | \`pbix-scheduler\` |
| The site does not open, or certificate errors | \`caddy\` |
| Database errors or the database does not start | \`db\` |

3. Show the latest lines of that service's log, for example the application's:
$ docker compose logs --tail 200 app
4. Follow it live while you repeat what failed in the browser (Ctrl+C to stop):
$ docker compose logs -f app
5. Show only errors from the last day:
$ docker compose logs --since 24h app | grep -i -E "error|fail"

The scheduler writes one line per check, starting with \`[scheduler]\`; a failed check says \`tick failed\` with the reason.`,
      },
      {
        id: "share",
        title: "Sending logs to support",
        body: `1. Save the last day of all services' logs to a file:
$ docker compose logs --since 24h --no-color > bayanis-logs.txt
2. Read the file before sending it outside your organisation, and remove anything you would not share.
3. Send it with the time the problem happened and what the user did.`,
      },
    ],
    related: ["support-troubleshooting", "audit-logs", "support-restart"],
  },
  {
    slug: "support-vault",
    group: "support",
    audience: "ADMIN",
    title: "Using HashiCorp Vault for secrets",
    summary: "Keep the encryption key or the passwords themselves in your HashiCorp Vault, and choose how Bayanis signs in to Vault.",
    sections: [
      {
        id: "options",
        title: "Two ways to use Vault",
        body: `Bayanis stores data source passwords, AI provider keys, LDAP bind passwords and the SSO client secret. With HashiCorp Vault you can:
- **Keep the key in Vault (Transit):** Vault holds the encryption key and encrypts these secrets; Bayanis stores only what Vault returns.
- **Keep the passwords in Vault (references):** a password field holds a location in Vault, such as \`secret/bayanis/finance-db#password\`, and Bayanis reads the password from Vault each time it connects. Your security team then changes passwords in Vault alone.

You can use either or both. Both need the Vault address and a way for Bayanis to sign in to Vault.

> Vault does not sign users in to Bayanis. User sign-in (local accounts, LDAP, SSO) is set in Configuration › Security; Vault can hold the LDAP and SSO secrets it uses.`,
      },
      {
        id: "vault-team",
        title: "1. What the Vault team prepares",
        body: `The team that runs Vault creates a Transit key, a policy for Bayanis and a way for it to sign in. For example, with AppRole:
$ vault secrets enable transit
$ vault write -f transit/keys/bayanis
$ vault policy write bayanis bayanis-policy.hcl
$ vault auth enable approle
$ vault write auth/approle/role/bayanis token_policies=bayanis token_ttl=20m token_max_ttl=1h
$ vault read -field=role_id auth/approle/role/bayanis/role-id
$ vault write -f -field=secret_id auth/approle/role/bayanis/secret-id

The policy allows \`update\` on \`transit/encrypt/bayanis\`, \`transit/decrypt/bayanis\` and \`transit/rewrap/bayanis\`, and \`read\` on \`transit/keys/bayanis\` (plus \`update\` on \`transit/keys/bayanis/rotate\` to rotate from Bayanis). For password references, it also allows \`read\` on the paths that hold them, for example \`secret/data/bayanis/*\`. The full policy is in the installation README.`,
      },
      {
        id: "sign-in",
        title: "2. How Bayanis signs in to Vault",
        body: `Choose the method with \`VAULT_AUTH_METHOD\` in \`/opt/bayanis/.env\`, and fill in its settings:

| Method | Settings |
|---|---|
| \`approle\` (recommended on a server) | \`VAULT_ROLE_ID\`, and \`VAULT_SECRET_ID_FILE\` (a file holding the secret id) or \`VAULT_SECRET_ID\` |
| \`kubernetes\` | \`VAULT_K8S_ROLE\`; the service account token is read automatically |
| \`token\` | \`VAULT_TOKEN_FILE\` (for example written by a Vault Agent) or \`VAULT_TOKEN\` |

Always set \`VAULT_ADDR\` (for example \`https://vault.example.com:8200\`). Also set \`VAULT_NAMESPACE\` with Vault Enterprise, and \`NODE_EXTRA_CA_CERTS\` when Vault uses a private certificate authority. \`VAULT_TRANSIT_MOUNT\` and \`VAULT_TRANSIT_KEY\` default to \`transit\` and \`bayanis\`.

To change the method later, edit these lines, then recreate the services:
$ docker compose up -d

Bayanis signs in to Vault again by itself when its access expires or is revoked.`,
      },
      {
        id: "move",
        title: "3. Move the stored secrets to Vault",
        body: `1. In \`/opt/bayanis/.env\`, set \`SECRETS_PROVIDER=vault-transit\` with the settings above. Keep \`LLM_SECRETS_MASTER_KEY\` for now: the secrets are still encrypted with it.
2. Recreate the services:
$ cd /opt/bayanis
$ docker compose up -d
3. In Bayanis, open Configuration › Encryption Keys and click **Test**. It should say Vault answered.
4. Click **Move … to HashiCorp Vault Transit**. Every stored secret is moved; nobody re-enters a password. (The same can be done on the server with \`docker compose exec scheduler node scripts/reseal-secrets.mjs\`.)
5. When the page shows no secret left under the local key, remove \`LLM_SECRETS_MASTER_KEY\` from \`.env\` and run \`docker compose up -d\` again. Keep a copy of the old key as long as you keep database backups taken before the move.
6. Test the connections in Administration › Data Sources and AI Providers.`,
      },
      {
        id: "references",
        title: "Keeping passwords in Vault",
        body: `1. Make sure \`VAULT_ADDR\` and the sign-in settings are set (with either \`SECRETS_PROVIDER\`), and that the Vault policy allows reading the passwords' paths.
2. Optionally limit which paths may be used, in \`.env\`, then run \`docker compose up -d\`:
$ VAULT_KV_ALLOWED_PATHS=secret/bayanis/
3. In Bayanis, open the password field (a data source, an AI provider, an LDAP directory or SSO), choose **Vault reference**, enter the location as *path#field*, and click **Check**.
4. Save, then click **Test Connection**.

KV version 1 and 2 both work; Bayanis detects which. Configuration › Encryption Keys counts these fields as **Vault reference**.`,
      },
      {
        id: "unreachable",
        title: "When Vault cannot be reached",
        body: `Sign-in with local accounts keeps working. Crawls, data quality runs, AI calls and connection tests fail with **Vault is unreachable** until Vault is back. To find the cause:
1. Configuration › Encryption Keys › **Test** shows Vault's answer.
2. The application log shows the error:
$ docker compose logs --since 1h app | grep -i vault
3. Common causes: the address or certificate authority is wrong, the secret id or token expired, or the policy does not allow the key or path.`,
      },
    ],
    related: ["configuration", "support-key-rotation", "support-restart"],
  },
  {
    slug: "support-key-rotation",
    group: "support",
    audience: "ADMIN",
    title: "Rotating the encryption key",
    summary: "Replace the key that protects stored passwords, without anyone re-entering them.",
    sections: [
      {
        id: "local",
        title: "With the local key",
        body: `1. Connect to the server and create a new key:
$ cd /opt/bayanis
$ openssl rand -hex 32
2. In \`.env\`, put the new key in \`LLM_SECRETS_MASTER_KEY\` and the old one in \`LLM_SECRETS_PREVIOUS_KEYS\`.
3. Recreate the services so they read both keys:
$ docker compose up -d
4. In Bayanis, open Configuration › Encryption Keys and click **Re-encrypt with the current key** (or run it on the server):
$ docker compose exec scheduler node scripts/reseal-secrets.mjs
5. Check that the old key is no longer used:
$ docker compose exec scheduler node scripts/reseal-secrets.mjs --status
6. Empty \`LLM_SECRETS_PREVIOUS_KEYS\` and run \`docker compose up -d\` again.

Keep a copy of the old key as long as you keep database backups taken before the rotation: a restored backup needs it.`,
      },
      {
        id: "vault",
        title: "With HashiCorp Vault",
        body: `When the key is kept in Vault (Transit), rotate it in Vault or with **Rotate key in Vault** on Configuration › Encryption Keys, then click **Re-encrypt**. Vault re-encrypts the secrets itself, so the passwords never pass through Bayanis.`,
      },
    ],
    related: ["support-vault", "configuration"],
  },
  {
    slug: "support-upgrade",
    group: "support",
    audience: "ADMIN",
    title: "Upgrading and rolling back",
    summary: "Install a new version of Bayanis, and go back to the previous one if needed.",
    sections: [
      {
        id: "upgrade",
        title: "Upgrading",
        body: `In the standard installation a new version is released from GitHub: pushing a version tag starts the release.
$ git tag v1.4.0
$ git push origin v1.4.0

The release builds the new version, takes a database backup (\`/opt/bayanis/backups/bayanatix-before-<version>.dump\`; the last 10 are kept), applies the database changes and restarts the services. Check afterwards:
1. On the server: \`docker compose ps\` shows every service running.
2. In Bayanis: sign in, open a few pages, and check Administration › Audit & Logs › Job Logs over the next scheduled runs.`,
      },
      {
        id: "rollback",
        title: "Rolling back",
        body: `**If the new version did not change the database**, run the previous version again: re-run its release from GitHub › Actions › Release, or on the server (replace v1.3.0 with the previous version):
$ cd /opt/bayanis
$ sed -i 's/^APP_VERSION=.*/APP_VERSION=v1.3.0/' .env
$ docker compose up -d

**If it changed the database**, restore the backup taken before the upgrade as well. Changes made in Bayanis since the upgrade are lost.
$ docker compose stop app scheduler pbix-scheduler
$ docker compose exec -T db pg_restore -U postgres -d bayanatix --clean --if-exists --no-owner /backups/bayanatix-before-v1.4.0.dump
$ sed -i 's/^APP_VERSION=.*/APP_VERSION=v1.3.0/' .env
$ docker compose up -d`,
      },
    ],
    related: ["support-backup", "support-restart"],
  },
  {
    slug: "support-backup",
    group: "support",
    audience: "ADMIN",
    title: "Backing up and restoring the database",
    summary: "Take a backup of the Bayanis database on demand, and restore one.",
    sections: [
      {
        id: "backup",
        title: "Taking a backup",
        body: `A backup is taken automatically before every upgrade. To take one now:
1. Connect to the server and go to the Bayanis folder.
$ cd /opt/bayanis
2. Write the backup into the backups folder:
$ docker compose exec -T db pg_dump -U postgres -Fc -f /backups/bayanatix-manual.dump bayanatix
3. Copy \`/opt/bayanis/backups/bayanatix-manual.dump\` to storage outside the server, following your organisation's backup policy.

Stored passwords in the backup stay encrypted. They can only be read with the encryption key in use when it was taken (or with HashiCorp Vault), so keep that key as long as you keep the backup.`,
      },
      {
        id: "restore",
        title: "Restoring a backup",
        body: `Restoring replaces everything in the database with the backup's content. Changes made since the backup are lost.
1. Put the backup file in \`/opt/bayanis/backups\`.
2. Stop the application and schedulers:
$ docker compose stop app scheduler pbix-scheduler
3. Restore it:
$ docker compose exec -T db pg_restore -U postgres -d bayanatix --clean --if-exists --no-owner /backups/bayanatix-manual.dump
4. Start everything again:
$ docker compose up -d
5. In Bayanis, open Configuration › Encryption Keys: secrets that cannot be opened are listed by name and must be entered again.`,
      },
    ],
    related: ["support-upgrade", "support-key-rotation"],
  },
  {
    slug: "support-troubleshooting",
    group: "support",
    audience: "ADMIN",
    title: "Common problems and fixes",
    summary: "What to check when the site does not open, sign-in fails, crawls or scheduled jobs stop, or the assistant does not answer.",
    sections: [
      {
        id: "site",
        title: "The site does not open",
        body: `1. On the server, check the services: \`docker compose ps\`. Start any that are stopped with \`docker compose up -d\`.
2. Certificate or connection errors: read the HTTPS service's log with \`docker compose logs --tail 100 caddy\`. The web address (\`APP_DOMAIN\` in \`.env\`) must point at the server, and ports 80 and 443 must be open.
3. The page opens but shows an error: read the application log with \`docker compose logs --tail 200 app\`.`,
      },
      {
        id: "sign-in",
        title: "Users cannot sign in",
        body: `- **One local user:** an administrator opens the user in Administration › User Management and sets a new password.
- **LDAP or SSO users:** open Configuration › Security and click **Test Connection** for the directory or SSO provider. If the directory password or client secret was changed, enter it again (or update it in HashiCorp Vault when it is a Vault reference).
- **Nobody can sign in:** read the application log while someone tries:
$ docker compose logs -f app`,
      },
      {
        id: "crawl",
        title: "A crawl or data quality run fails",
        body: `1. Open Administration › Audit & Logs › Job Logs and read the job's error.
2. Open the data source in Administration › Data Sources and click **Test Connection**.
3. If the source's password changed, enter the new one, or update it in HashiCorp Vault when the field holds a Vault reference.
4. If the error says a password cannot be decrypted (for example after a restore from another server), enter the password again.`,
      },
      {
        id: "scheduled",
        title: "Scheduled jobs do not run",
        body: `1. Check the scheduler is running: \`docker compose ps scheduler\`.
2. Read its log: \`docker compose logs --tail 100 scheduler\`. A line with \`tick failed\` gives the reason; \`CRON_SECRET not set\` means \`.env\` is missing that value.
3. Check the job's schedule in Configuration › Scheduling.
4. Restart the scheduler: \`docker compose restart scheduler\`.`,
      },
      {
        id: "ai",
        title: "Ask Bayanis or AI suggestions do not answer",
        body: `1. Open Administration › AI Providers and click **Test Connection** on the provider in use.
2. Check that the provider is enabled, and that its daily token budget is not used up.
3. If the error says **Vault is unreachable**, see *Using HashiCorp Vault for secrets*.
4. A self-hosted model must be reachable from the server at its configured address.`,
      },
      {
        id: "disk",
        title: "The server is running out of disk space",
        body: `1. Check the free space, and how much Docker uses:
$ df -h
$ docker system df
2. Old backups are in \`/opt/bayanis/backups\`. Upgrades keep the last 10; move older manual backups to other storage.
3. With every service running, remove images no longer used, such as old Bayanis versions (this does not touch the database):
$ docker image prune -a`,
      },
    ],
    related: ["support-logs", "support-restart", "support-vault"],
  },
];
