export type OfflineCapability = {
  featureId: string;
  label: string;
  subjectId: string | null;
  dataSource: 'local-only' | 'local-with-sync' | 'cloud-only';
  offlineAvailable: boolean;
};

export class OfflineCapabilityRegistry {
  private capabilities = new Map<string, OfflineCapability>();

  register(capability: OfflineCapability): void {
    this.capabilities.set(capability.featureId, capability);
  }

  isOfflineAvailable(featureId: string): boolean {
    return this.capabilities.get(featureId)?.offlineAvailable ?? false;
  }

  listBySubject(subjectId: string): OfflineCapability[] {
    return [...this.capabilities.values()].filter(c => c.subjectId === subjectId);
  }

  listCloudOnly(): OfflineCapability[] {
    return [...this.capabilities.values()].filter(c => !c.offlineAvailable);
  }

  listAll(): OfflineCapability[] {
    return [...this.capabilities.values()];
  }
}

export function registerDefaultCapabilities(registry: OfflineCapabilityRegistry): void {
  registry.register({ featureId: 'chem.periodic-table', label: '元素周期表', subjectId: 'chemistry', dataSource: 'local-only', offlineAvailable: true });
  registry.register({ featureId: 'chem.molecule', label: '分子模型', subjectId: 'chemistry', dataSource: 'local-only', offlineAvailable: true });
  registry.register({ featureId: 'chem.balance', label: '化学配平', subjectId: 'chemistry', dataSource: 'local-only', offlineAvailable: true });
  registry.register({ featureId: 'chem.electron', label: '电子排布', subjectId: 'chemistry', dataSource: 'local-only', offlineAvailable: true });

  registry.register({ featureId: 'math.graph', label: '函数画布', subjectId: 'math', dataSource: 'local-with-sync', offlineAvailable: true });
  registry.register({ featureId: 'math.plane', label: '平面几何', subjectId: 'math', dataSource: 'local-only', offlineAvailable: true });
  registry.register({ featureId: 'math.trig', label: '三角函数', subjectId: 'math', dataSource: 'local-only', offlineAvailable: true });
  registry.register({ featureId: 'math.sequence', label: '数列', subjectId: 'math', dataSource: 'local-only', offlineAvailable: true });
  registry.register({ featureId: 'math.solid', label: '立体几何', subjectId: 'math', dataSource: 'local-only', offlineAvailable: true });

  registry.register({ featureId: 'cloud.sync', label: '云同步', subjectId: null, dataSource: 'cloud-only', offlineAvailable: false });
  registry.register({ featureId: 'cloud.ai', label: '云端 AI', subjectId: null, dataSource: 'cloud-only', offlineAvailable: false });
}
