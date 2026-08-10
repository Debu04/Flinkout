import 'server-only';
import type { Prisma } from '@prisma/client';

export const publicProfileSelect = {
  displayName: true,
  bio: true,
  photoUrl: true,
  profileVisibility: true,
  routeVisibility: true,
  discoverable: true,
} satisfies Prisma.ProfileSelect;

export const accountUserSelect = {
  id: true,
  email: true,
  username: true,
  profile: { select: publicProfileSelect },
} satisfies Prisma.UserSelect;

export type PublicProfileDto = Prisma.ProfileGetPayload<{
  select: typeof publicProfileSelect;
}>;

export type AccountUserDto = Prisma.UserGetPayload<{
  select: typeof accountUserSelect;
}>;

export function accountUserDto(user: AccountUserDto) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    profile: user.profile,
  };
}
