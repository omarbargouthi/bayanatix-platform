<#
.SYNOPSIS
  Starts a throwaway local OpenLDAP server (osixia/openldap) seeded with one test
  user, for exercising the LDAP authentication path (lib/auth/ldap.ts) without a
  real Active Directory. Idempotent — safe to re-run.

.NOTES
  Base DN: dc=bayanatix,dc=local
  Admin bind (service account for the app's "Bind DN"): cn=admin,dc=bayanatix,dc=local / AdminPass123!
  Test user: testviewer@bayanatix.local / TestViewer123! (searchable at ou=People,dc=bayanatix,dc=local)

  Point Admin > Configuration > Authentication at this server to test:
    Server URL:    ldap://localhost:3893
    Bind DN:       cn=admin,dc=bayanatix,dc=local
    Bind password: AdminPass123!
    Base DN:       ou=People,dc=bayanatix,dc=local
    User filter:   (mail={{username}})
  Then sign in at /login with testviewer@bayanatix.local / TestViewer123! — first
  sign-in auto-provisions the account into the "External Viewer" role.
#>

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

$existing = docker ps -a --filter "name=^bayanatix_test_ldap$" --format "{{.Names}}"
if ($existing -eq "bayanatix_test_ldap") {
    Write-Output "Container already exists — starting it."
    docker start bayanatix_test_ldap | Out-Null
} else {
    Write-Output "Creating bayanatix_test_ldap..."
    docker run -d --name bayanatix_test_ldap `
        -p 3893:389 `
        -e LDAP_ORGANISATION="Bayanatix Test" `
        -e LDAP_DOMAIN="bayanatix.local" `
        -e LDAP_ADMIN_PASSWORD="AdminPass123!" `
        osixia/openldap:1.5.0 | Out-Null

    Write-Output "Waiting for slapd to be ready..."
    Start-Sleep -Seconds 8

    docker cp (Join-Path $scriptDir "ldap-test\seed.ldif") bayanatix_test_ldap:/tmp/seed.ldif
    docker exec bayanatix_test_ldap ldapadd -x -D "cn=admin,dc=bayanatix,dc=local" -w "AdminPass123!" -f /tmp/seed.ldif
}

Write-Output ""
Write-Output "LDAP test server ready at ldap://localhost:3893"
Write-Output "  Bind DN:  cn=admin,dc=bayanatix,dc=local  /  AdminPass123!"
Write-Output "  Base DN:  ou=People,dc=bayanatix,dc=local"
Write-Output "  Test user: testviewer@bayanatix.local / TestViewer123!"
