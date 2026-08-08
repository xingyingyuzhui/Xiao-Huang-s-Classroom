/**
 * 生物学科教室
 */

import { SUBJECT_ID } from '../../biology/index.js';
import { createShellSubjectClassroom } from './shell-classroom-factory.js';
import type { SubjectClassroom } from './types.js';

export interface ShellClassroomDeps {
  select: (sel: string) => Element | null;
}

export function createBiologyClassroom(deps: ShellClassroomDeps): SubjectClassroom {
  return createShellSubjectClassroom({ ...deps, subjectId: SUBJECT_ID });
}
