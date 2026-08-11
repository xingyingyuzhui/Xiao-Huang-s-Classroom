/** Stable namespace keys for workspace context resolution (schema-compliant, no slashes). */
export function guestWorkspaceKey(subjectId: string): string {
  return `guest.default.${subjectId}`;
}

export function personalWorkspaceKey(accountId: string, subjectId: string): string {
  return `personal.${accountId}.${subjectId}`;
}

export function classWorkspaceKey(
  accountId: string,
  classId: string,
  subjectId: string,
): string {
  return `class.${accountId}.${classId}.${subjectId}`;
}

export function resolveWorkspaceKey(input: {
  mode: 'guest' | 'authenticated';
  accountId: string | null;
  classId: string | null;
  subjectId: string;
  workspaceId: string;
}): string {
  if (input.mode === 'guest') {
    return guestWorkspaceKey(input.subjectId);
  }
  if (input.classId && input.accountId) {
    return classWorkspaceKey(input.accountId, input.classId, input.subjectId);
  }
  if (input.accountId) {
    return personalWorkspaceKey(input.accountId, input.subjectId);
  }
  return input.workspaceId;
}
