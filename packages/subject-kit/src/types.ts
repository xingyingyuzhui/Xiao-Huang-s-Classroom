/** 学科平台协议（spec §10.1 / §10.2 / §9.2）。 */

export type SubjectStatus = 'ready' | 'preview' | 'locked';

export interface SubjectIntro {
  title: string;
  description: string;
  ctaLabel?: string;
}

export interface SubjectCoverSet {
  variants: string[];
}

export interface PanelManifest {
  id: string;
  label: string;
  /** 面板模块 loader（lazy） */
  load: () => Promise<unknown>;
  /** 面板默认可见 */
  defaultVisible?: boolean;
}

export interface ClassroomManifest {
  id: string;
  defaultPanel: string;
  panels: PanelManifest[];
  /** 课堂 mount/dispose 合同 */
  mount: (context: FeatureContext) => Promise<MountableController>;
  settings?: Record<string, unknown>;
  dataVersion?: number;
}

export interface SubjectManifest {
  id: string;
  status: SubjectStatus;
  intro: SubjectIntro;
  cover: SubjectCoverSet;
  classroom: ClassroomManifest;
}

export interface FeatureContext {
  /** 挂载宿主；Node/无 DOM 环境为 null，由调用方决定处理 */
  root: HTMLElement | null;
  subjectId: string;
  panelId: string;
}

/** 对称生命周期合同（spec §4.4）。 */
export interface MountableController {
  mount(): void | Promise<void>;
  show?(): void;
  hide?(): void;
  relayout?(): void;
  syncTheme?(): void;
  dispose(): void | Promise<void>;
}

/** 动态 feature 模块协议（spec §9.2）。 */
export type FeatureModule = {
  preload?: () => Promise<void>;
  mount: (context: FeatureContext) => Promise<MountableController>;
};
