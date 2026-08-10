import { describe, expect, it } from 'vitest';
import {
  activityFeedScope,
  canViewActivity,
  canViewProfile,
  canViewRelatedLiveTimeline,
  canViewRoute,
} from './privacy';
import {
  activitySyncKey,
  ownedCommentScope,
  profileOwnerKey,
} from './ownership';

const userA = 'user-a';
const userB = 'user-b';

describe('multi-user privacy policies', () => {
  it('does not expose another user private profile or activity', () => {
    expect(canViewProfile({ ownerId: userB, viewerId: userA, visibility: 'PRIVATE', isFollowing: true })).toBe(false);
    expect(canViewActivity({ ownerId: userB, viewerId: userA, visibility: 'PRIVATE', isFollowing: true })).toBe(false);
  });

  it('restricts follower content and routes to actual followers', () => {
    expect(canViewActivity({ ownerId: userB, viewerId: userA, visibility: 'FOLLOWERS', isFollowing: false })).toBe(false);
    expect(canViewActivity({ ownerId: userB, viewerId: userA, visibility: 'FOLLOWERS', isFollowing: true })).toBe(true);
    expect(canViewRoute({ ownerId: userB, viewerId: userA, visibility: 'FOLLOWERS', isFollowing: false })).toBe(false);
  });

  it('always lets an owner see their own private data', () => {
    expect(canViewProfile({ ownerId: userA, viewerId: userA, visibility: 'PRIVATE', isFollowing: false })).toBe(true);
    expect(canViewActivity({ ownerId: userA, viewerId: userA, visibility: 'PRIVATE', isFollowing: false })).toBe(true);
  });

  it('does not let a public finished activity widen a private live timeline', () => {
    expect(canViewActivity({ ownerId: userB, viewerId: userA, visibility: 'PUBLIC', isFollowing: false })).toBe(true);
    expect(canViewRelatedLiveTimeline({
      ownerId: userB,
      viewerId: userA,
      visibility: 'PRIVATE',
      isFollowing: false,
    })).toBe(false);
  });

  it('builds a feed scope from the authenticated user id', () => {
    expect(activityFeedScope(userA)).toEqual({ OR: [
      { userId: userA },
      { visibility: 'PUBLIC' },
      { visibility: 'FOLLOWERS', user: { followers: { some: { followerId: userA } } } },
    ] });
  });
});

describe('multi-user mutation isolation', () => {
  it('scopes activity idempotency to the authenticated user', () => {
    const clientId = '00000000-0000-4000-8000-000000000000';
    expect(activitySyncKey(userA, clientId)).not.toEqual(activitySyncKey(userB, clientId));
  });

  it('scopes profile and comment mutations to their authenticated owner', () => {
    expect(profileOwnerKey(userA)).toEqual({ userId: userA });
    expect(ownedCommentScope(userA, 'activity-b', 'comment-b')).toEqual({
      id: 'comment-b', activityId: 'activity-b', userId: userA,
    });
  });
});
