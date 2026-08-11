export type RuntimeConfig = {
  cloudBaseUrl: string;
  features: {
    accountCloudProgram: boolean;
    publicGuestAi: boolean;
  };
  releaseChannel: 'stable' | 'beta';
};

const DEFAULT_CONFIG: RuntimeConfig = {
  cloudBaseUrl: '',
  features: {
    accountCloudProgram: false,
    publicGuestAi: false,
  },
  releaseChannel: 'stable',
};

let cached: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  try {
    const res = await fetch('/runtime-config.json');
    if (!res.ok) return DEFAULT_CONFIG;
    const raw = await res.json();
    cached = {
      cloudBaseUrl: typeof raw.cloudBaseUrl === 'string' ? raw.cloudBaseUrl : '',
      features: {
        accountCloudProgram: raw.features?.accountCloudProgram === true,
        publicGuestAi: raw.features?.publicGuestAi === true,
      },
      releaseChannel: raw.releaseChannel === 'beta' ? 'beta' : 'stable',
    };
    return cached;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  return cached ?? DEFAULT_CONFIG;
}

export function isFeatureEnabled(feature: keyof RuntimeConfig['features']): boolean {
  return getRuntimeConfig().features[feature];
}
