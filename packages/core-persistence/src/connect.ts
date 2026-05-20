import mongoose, { type Connection } from 'mongoose';

/**
 * Opens (or returns the already-open) Mongoose connection for the given
 * URI. The connection is cached per-URI so multiple callers in the same
 * process share one socket. Pass `{ silent: true }` to suppress the
 * deprecation warnings Mongoose prints on first connect; useful for CLI
 * tooling where stdout is the user-facing report.
 */
export interface ConnectOptions {
  silent?: boolean;
  /** Hard timeout for the initial handshake. Defaults to 5 000 ms. */
  serverSelectionTimeoutMS?: number;
}

const connections = new Map<string, Connection>();

export async function connectMongo(uri: string, options: ConnectOptions = {}): Promise<Connection> {
  const existing = connections.get(uri);
  if (existing && existing.readyState === 1) return existing;
  if (options.silent) mongoose.set('strictQuery', true);
  const connection = await mongoose
    .createConnection(uri, {
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 5_000,
    })
    .asPromise();
  connections.set(uri, connection);
  return connection;
}

export async function disconnectMongo(uri: string): Promise<void> {
  const existing = connections.get(uri);
  if (!existing) return;
  await existing.close();
  connections.delete(uri);
}

export async function disconnectAll(): Promise<void> {
  const all = [...connections.values()];
  connections.clear();
  await Promise.all(all.map((c) => c.close()));
}
