export type ResourceTypeConfig = {
  resourceType: string;
  schemaVersion: number;
  maxPayloadBytes: number;
  supportsDuplicateLocal: boolean;
  summarize: (payload: unknown) => string;
  computeHash: (payload: unknown) => string;
  parse?: (payload: unknown) => unknown;
};

export class ResourceRegistry {
  private readonly types = new Map<string, ResourceTypeConfig>();

  register(config: ResourceTypeConfig): void {
    this.types.set(config.resourceType, config);
  }

  get(resourceType: string): ResourceTypeConfig | undefined {
    return this.types.get(resourceType);
  }

  has(resourceType: string): boolean {
    return this.types.has(resourceType);
  }

  listRegistered(): string[] {
    return [...this.types.keys()];
  }
}
