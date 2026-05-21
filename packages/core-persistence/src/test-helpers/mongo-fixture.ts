import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll } from 'vitest';
import { connectMongo, disconnectAll } from '../connect.js';

/**
 * Shared in-memory MongoDB lifecycle for the persistence test suites.
 * Calls `vitest`'s beforeAll / afterAll behind the scenes so each spec
 * file just does:
 *
 *   const { getConn } = setupMongoFixture();
 *
 * and then uses `getConn()` inside `it(...)` bodies. Keeps the lifecycle
 * boilerplate out of every suite.
 */
export interface MongoFixtureHandle {
  getConn(): Connection;
}

export function setupMongoFixture(): MongoFixtureHandle {
  let mongo: MongoMemoryServer | null = null;
  let conn: Connection | null = null;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    conn = await connectMongo(mongo.getUri());
  }, 60_000);

  afterAll(async () => {
    await disconnectAll();
    if (mongo) await mongo.stop();
    mongo = null;
    conn = null;
  });

  return {
    getConn() {
      if (!conn) {
        throw new Error('Mongo fixture not started yet — call inside it() / afterEach().');
      }
      return conn;
    },
  };
}
