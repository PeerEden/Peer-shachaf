import type { UserPrivate, UserPublic } from '../../../shared/src/index.js';
import type { users } from '../db/schema.js';

type UserRow = typeof users.$inferSelect;

export function toUserPublic(user: UserRow): UserPublic {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarPath ? `/uploads/${user.avatarPath}` : null,
    role: user.role,
  };
}

export function toUserPrivate(user: UserRow): UserPrivate {
  return {
    ...toUserPublic(user),
    phone: user.phone,
    createdAt: user.createdAt.getTime(),
  };
}
