export function activitySyncKey(userId: string, clientId: string) {
  return { userId_clientId: { userId, clientId } };
}

export function profileOwnerKey(userId: string) {
  return { userId };
}

export function ownedCommentScope(
  userId: string,
  activityId: string,
  commentId: string,
) {
  return { id: commentId, activityId, userId };
}
