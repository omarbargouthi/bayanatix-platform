// Helper: generate a bcrypt hash for a new user.
// Usage:  node scripts/hash-password.mjs "MyPassword123!"
import bcrypt from "bcryptjs";

const plain = process.argv[2];
if (!plain) {
  console.error('Usage: node scripts/hash-password.mjs "<password>"');
  process.exit(1);
}
console.log(bcrypt.hashSync(plain, 12));
