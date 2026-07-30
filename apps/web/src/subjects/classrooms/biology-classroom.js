/**
 * 生物学科教室
 */

import { SUBJECT_ID } from '../../biology/index.js';
import { createShellSubjectClassroom } from './shell-classroom-factory.js';

/** @param {{ select: (sel: string) => Element | null }} deps */
export function createBiologyClassroom(deps) {
  return createShellSubjectClassroom({ ...deps, subjectId: SUBJECT_ID });
}
