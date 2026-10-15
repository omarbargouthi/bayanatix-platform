# Starts a throw-away HashiCorp Vault (dev mode, in memory) for trying Bayanis's Vault
# Transit provider, and sets it up the way a customer's Vault team would: a Transit key
# "bayanis", a policy limited to that key, and an AppRole for Bayanis to sign in with.
# Prints the lines to add to .env.local.
#
# Dev mode keeps everything in memory: removing or restarting the container loses the
# key, and every secret encrypted with it. Move the secrets back to the local key
# (SECRETS_PROVIDER=local, then Re-encrypt) before stopping it.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\start-vault-dev.ps1

$name = "bayanis_vault_dev"
$running = docker ps --filter "name=^$name$" --format "{{.Names}}"
if (-not $running) {
  docker run -d --name $name --cap-add=IPC_LOCK -p 8200:8200 `
    -e VAULT_DEV_ROOT_TOKEN_ID=dev-root -e VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200 hashicorp/vault:1.17 | Out-Null
  Start-Sleep -Seconds 4
}

# $input forwards piped text (the policy) to the vault CLI inside the container.
function Vault { $input | docker exec -i -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN=dev-root $name vault @args }

if (-not ((Vault secrets list -format=json) -match '"transit/"')) {
  Vault secrets enable transit | Out-Null
  Vault write -f transit/keys/bayanis | Out-Null
  @'
path "transit/encrypt/bayanis"     { capabilities = ["update"] }
path "transit/decrypt/bayanis"     { capabilities = ["update"] }
path "transit/rewrap/bayanis"      { capabilities = ["update"] }
path "transit/keys/bayanis"        { capabilities = ["read"] }
path "transit/keys/bayanis/rotate" { capabilities = ["update"] }
'@ | Vault policy write bayanis - | Out-Null
  Vault auth enable approle | Out-Null
  Vault write auth/approle/role/bayanis token_policies=bayanis token_ttl=20m token_max_ttl=1h | Out-Null
}

$roleId = Vault read -field=role_id auth/approle/role/bayanis/role-id
$secretId = Vault write -f -field=secret_id auth/approle/role/bayanis/secret-id

Write-Host "Vault dev server: http://127.0.0.1:8200 (root token dev-root)"
Write-Host ""
Write-Host "Add to .env.local, then open Configuration > Encryption Keys:"
Write-Host "SECRETS_PROVIDER=vault-transit"
Write-Host "VAULT_ADDR=http://127.0.0.1:8200"
Write-Host "VAULT_AUTH_METHOD=approle"
Write-Host "VAULT_ROLE_ID=$roleId"
Write-Host "VAULT_SECRET_ID=$secretId"
