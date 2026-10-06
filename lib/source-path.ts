// A file / folder path (or host) as typed into a connection. Windows' "Copy as path"
// wraps the path in double quotes, and a pasted value often carries stray spaces —
// neither is part of the path, and with them the path is never found on disk.
export function cleanSourcePath(value: string): string {
  let v = value.trim();
  while (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}
