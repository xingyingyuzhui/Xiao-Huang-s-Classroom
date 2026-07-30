/**
 * 物理学科教室
 */

import { SUBJECT_ID } from '../../physics/index.js';
import { createShellSubjectClassroom } from './shell-classroom-factory.js';

/** @param {{ select: (sel: string) => Element | null }} deps */
export function createPhysicsClassroom(deps) {
  return createShellSubjectClassroom({ ...deps, subjectId: SUBJECT_ID });
}
