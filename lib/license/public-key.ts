// Verifies signed license tokens issued by scripts/license/issue-license.mjs.
// Safe to commit -- this is the PUBLIC half of the keypair, it can only verify
// signatures, never create them. The private half never lives in this repo;
// see scripts/license/README printed by generate-keypair.mjs for where it's kept.
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEUhUOhvOMb0/OybDFSTmPCyPDX7FV
err6IBGNidI1KpgZSrf1j9ozaL5P7kFABoxrlGtfNI3V26GeWumUJK/QSg==
-----END PUBLIC KEY-----
`;
