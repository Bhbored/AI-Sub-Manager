export const providerNames = { codex: 'OpenAI Codex', claude: 'Claude Code' } as const;
export type ProviderId = keyof typeof providerNames;
export const providerIds = ['codex', 'claude'] as const;
export const intervals = [0, 1, 5, 10, 15, 30, 60] as const;

export interface Subscription {
  plan: string;
  cycle: 'monthly' | 'yearly';
  anchor: string;
  reminder: boolean;
}

export interface Preferences {
  interval: (typeof intervals)[number];
  closeToTray: boolean;
  startMinimized: boolean;
  startup: boolean;
  paused: boolean;
  notifications: boolean;
  disabled: Record<ProviderId, boolean>;
  subscriptions: Record<ProviderId, Subscription>;
}

export interface QuotaWindow {
  bucket: string;
  durationMinutes: number;
  usedPercentage: number;
  resetAt: string | null;
}

export interface UsageSnapshot {
  state: 'ready';
  connected: true;
  windows: QuotaWindow[];
  collectedAt: string;
  plan?: string | null;
  version?: string;
}

export type ProviderStatus = UsageSnapshot | {
  state: 'starting' | 'missing' | 'auth' | 'unsupported' | 'unavailable' | 'disabled' | 'error' | 'refreshing';
  version?: string;
  message?: string;
  connected?: boolean;
};

export type StatusLine = 'pending' | 'ok' | 'set' | 'updated' | 'foreign' | 'no-node' | 'error';
export type Page = 'dashboard' | 'settings';

export interface MonitorState {
  settings: Preferences;
  status: Record<ProviderId, ProviderStatus>;
  cached: Partial<Record<ProviderId, UsageSnapshot | null>>;
  storageError: string;
  statusLine: StatusLine;
  worker: boolean;
  version: string;
}

export interface MonitorApi {
  state(): Promise<MonitorState>;
  refresh(): Promise<void>;
  settings(value: Preferences): Promise<void>;
  onUpdate(callback: (state: MonitorState) => void): () => void;
  onNavigate(callback: (page: Page) => void): () => void;
  logs(): Promise<void>;
  reset(): Promise<void>;
  quit(): Promise<void>;
}

export type WorkerRequest =
  | { type: 'refresh'; id?: ProviderId }
  | { type: 'settings'; settings: Preferences; initial?: boolean }
  | { type: 'resume' };
export type WorkerEvent = { type: 'status'; id: ProviderId; value: ProviderStatus };
