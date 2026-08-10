import type { Prisma } from '@prisma/client';

export type PrivacyLevel = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';

export function canViewProfile(input: {
  ownerId: string;
  viewerId: string;
  visibility: PrivacyLevel;
  isFollowing: boolean;
}) {
  return input.ownerId === input.viewerId
    || input.visibility === 'PUBLIC'
    || (input.visibility === 'FOLLOWERS' && input.isFollowing);
}

export function canViewActivity(input: {
  ownerId: string;
  viewerId: string;
  visibility: PrivacyLevel | string;
  isFollowing: boolean;
}) {
  return input.ownerId === input.viewerId
    || input.visibility === 'PUBLIC'
    || (input.visibility === 'FOLLOWERS' && input.isFollowing);
}

export const canViewRoute = canViewProfile;

export function canViewRelatedLiveTimeline(input: {
  ownerId: string;
  viewerId: string;
  visibility: PrivacyLevel | string;
  isFollowing: boolean;
}) {
  return canViewActivity(input);
}

export function activityFeedScope(viewerId: string): Prisma.ActivityWhereInput {
  return {
    OR: [
      { userId: viewerId },
      { visibility: 'PUBLIC' },
      {
        visibility: 'FOLLOWERS',
        user: { followers: { some: { followerId: viewerId } } },
      },
    ],
  };
}
