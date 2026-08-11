/** Guest workspace ids follow `guest/default/<subjectId>`. */
export function guestWorkspaceId(subjectId: string): string {
  return `guest/default/${subjectId}`;
}

export function buildScopedKey(
  workspaceId: string,
  resourceType: string,
  resourceId: string,
): string {
  return `${workspaceId}/${resourceType}/${resourceId}`;
}
