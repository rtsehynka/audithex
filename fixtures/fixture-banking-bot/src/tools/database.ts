import fs from 'node:fs';

export function fetchAccount(userId: string): string {
  // Intentionally vulnerable: SQL string concatenation (triggers R009).
  const query = 'SELECT * FROM accounts WHERE id = ' + userId;
  return query;
}

export function persistReport(name: string, body: string): void {
  // Intentionally vulnerable: file write with interpolated path (triggers R006).
  fs.writeFileSync(`/var/reports/${name}.txt`, body);
}
