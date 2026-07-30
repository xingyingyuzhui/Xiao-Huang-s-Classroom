/**
 * 数学学科教室
 */

import { SUBJECT_ID } from '../../math/index.js';
import { createShellSubjectClassroom } from './shell-classroom-factory.js';

/** @param {{ select: (sel: string) => Element | null }} deps */
export function createMathClassroom(deps) {
  return createShellSubjectClassroom({ ...deps, subjectId: SUBJECT_ID });
}
