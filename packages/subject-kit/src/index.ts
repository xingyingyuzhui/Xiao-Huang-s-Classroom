/**
 * subject-kit 公共入口：显式具名导出（禁止裸 export *）。
 */
export { createFeatureLoader } from './loader.js';
export type { FeatureLoader, FeatureLoaderOptions, FeatureLoaderStatus } from './loader.js';
export type {
  SubjectStatus,
  SubjectIntro,
  SubjectCoverSet,
  PanelManifest,
  ClassroomManifest,
  SubjectManifest,
  FeatureContext,
  MountableController,
  FeatureModule,
} from './types.js';
