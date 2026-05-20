import { connectMongo } from '@audithex/core-persistence';
import type { Connection } from 'mongoose';
import { loadWebEnv } from './env';

/**
 * Returns the (cached) Mongoose connection for the web UI. Every server
 * action / route handler grabs the connection through this helper — no
 * one calls `connectMongo` directly.
 */
export function getConnection(): Promise<Connection> {
  const env = loadWebEnv();
  return connectMongo(env.MONGODB_URI, { silent: true });
}
