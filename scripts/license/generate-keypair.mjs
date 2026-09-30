#!/usr/bin/env node
// Vendor-only tool. Generates the ONE ES256 (EC P-256) keypair used to sign
// every customer license -- run this exactly once, ever, not per customer.
//
// The private key must NEVER be committed to this repo, and never copied into
// any project folder that later gets zipped/handed off to a customer -- store
// it somewhere separate and secure (password manager, offline backup). Anyone
// holding it can issue valid licenses for this product.
//
// The public key gets pasted into lib/license/public-key.ts (safe to commit --
// it can only verify signatures, never create them).
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const outPath = process.argv[2] ?? "./bayanatix-license-private-key.pem";
writeFileSync(outPath, privatePem, { mode: 0o600 });

console.log(`Private key written to: ${outPath}`);
console.log("Move this file somewhere secure OUTSIDE this repo, then delete it from here.\n");
console.log("Paste this into lib/license/public-key.ts as LICENSE_PUBLIC_KEY_PEM:\n");
console.log(publicPem);
