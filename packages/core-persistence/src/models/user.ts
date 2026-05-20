import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';

/**
 * Single-user record for the local web UI. Password is stored as a
 * bcryptjs hash; the plain-text password never touches disk. The
 * schema is deliberately minimal — the local UI does not need RBAC,
 * organisations, or audit trails.
 */
export interface UserDocument {
  _id?: string;
  email: string;
  passwordHash: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true, collection: 'users' },
);

export function getUserModel(connection: Connection): Model<UserDocument> {
  const existing = connection.models.User as Model<UserDocument> | undefined;
  if (existing) return existing;
  return connection.model<UserDocument>('User', UserSchema);
}
