#!/usr/bin/env node
// Vendor-only tool. Issues one signed license token for one customer.
//
// Usage:
//   node scripts/license/issue-license.mjs --id acme-corp --name "Acme Corp" --days 365 [--key /path/to/private-key.pem]
//
// The private key path defaults to $LICENSE_PRIVATE_KEY_PATH, then
// ./bayanatix-license-private-key.pem. The printed token is the value the
// customer sets as LICENSE_KEY in their deployment's environment -- give it
// to them, don't run this against their environment.
import { SignJWT, importPKCS8 } from "jose";
import { readFileSync } from "node:fs";

const ISSUER = "bayanatix-license";
const ALG = "ES256";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const customerId = arg("id");
const customerName = arg("name");
const days = Number(arg("days", "365"));
const keyPath = arg("key", process.env.LICENSE_PRIVATE_KEY_PATH ?? "./bayanatix-license-private-key.pem");

if (!customerId || !customerName || !Number.isFinite(days) || days <= 0) {
  console.log('Usage: node scripts/license/issue-license.mjs --id <customer-id> --name "<Customer Name>" [--days 365] [--key <path>]');
  process.exit(1);
}

const privatePem = readFileSync(keyPath, "utf8");
const privateKey = await importPKCS8(privatePem, ALG);

const expiresAt = new Date(Date.now() + days * 86_400_000);

const token = await new SignJWT({ customerId, customerName, licenseExpiresAt: expiresAt.toISOString() })
  .setProtectedHeader({ alg: ALG })
  .setIssuedAt()
  .setIssuer(ISSUER)
  .sign(privateKey);

console.log(`\nLicense for "${customerName}" (${customerId}) -- expires ${expiresAt.toISOString().slice(0, 10)}\n`);
console.log(token);
console.log("\nGive this to the customer as LICENSE_KEY in their deployment's .env.local / environment config.");
