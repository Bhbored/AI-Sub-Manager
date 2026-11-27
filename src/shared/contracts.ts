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
export type Page = 'dashboard' | 'settings' | 'explore';
export const windowModes = ['compact', 'expanded', 'widget'] as const;
export type WindowMode = (typeof windowModes)[number];

export interface InventoryProject {
  id?: string;
  name: string;
  /** Working directory recorded in the sessions, when it could be read. */
  path: string | null;
  /** Folder that stores this project's sessions. */
  folder: string;
  sessions: number;
  archived: number;
  bytes: number;
  created: string | null;
  updated: string | null;
}
export interface InventorySkill { name: string; description: string; source: string; path: string; id?: string }
export interface InventoryPlugin { name: string; version: string | null; enabled: boolean | null; source: string; id?: string; selector?: string; scope?: string }
/** Only the launcher name or URL without credentials is kept; arguments and environment values are never read. */
export interface InventoryMcp { name: string; transport: string; target: string; source: string; enabled: boolean | null }
export interface InventoryFile { label: string; path: string; bytes: number; modified: string | null; id?: string }
export interface ExploreDocument {
  label: string;
  language: 'json' | 'toml' | 'markdown';
  text: string;
  revision: string;
  writable: boolean;
  revealLine?: number;
}
export interface ExploreRemoval {
  inventory: Inventory;
  message: string;
}
export interface ExploreConfirmation {
  id: string;
  message: string;
  detail: string;
}
export interface Inventory {
  provider: ProviderId;
  home: string;
  scannedAt: string;
  projects: InventoryProject[];
  skills: InventorySkill[];
  plugins: InventoryPlugin[];
  mcpServers: InventoryMcp[];
  files: InventoryFile[];
  sessionCount: number;
  sessionBytes: number;
  warnings: string[];
}

export interface MonitorState {
  settings: Preferences;
  status: Record<ProviderId, ProviderStatus>;
  cached: Partial<Record<ProviderId, UsageSnapshot | null>>;
  storageError: string;
  statusLine: StatusLine;
  worker: boolean;
  version: string;
  view: { mode: WindowMode; cornerPinAvailable: boolean };
}

export interface MonitorApi {
  state(): Promise<MonitorState>;
  refresh(): Promise<void>;
  settings(value: Preferences): Promise<void>;
  onUpdate(callback: (state: MonitorState) => void): () => void;
  onNavigate(callback: (page: Page) => void): () => void;
  setWindowMode(mode: WindowMode): Promise<void>;
  minimize(): Promise<void>;
  closeWindow(): Promise<void>;
  inventory(id: ProviderId, includePlugins?: boolean): Promise<Inventory>;
  readExploreDocument(provider: ProviderId, id: string): Promise<ExploreDocument>;
  saveExploreDocument(provider: ProviderId, id: string, revision: string, text: string): Promise<ExploreDocument>;
  removeExploreItem(provider: ProviderId, id: string): Promise<ExploreRemoval | null>;
  onExploreConfirmation(callback: (request: ExploreConfirmation) => void): () => void;
  answerExploreConfirmation(id: string, confirmed: boolean): Promise<void>;
  open(path: string): Promise<void>;
  logs(): Promise<void>;
  reset(): Promise<void>;
  quit(): Promise<void>;
}

export type WorkerRequest =
  | { type: 'refresh'; id?: ProviderId }
  | { type: 'settings'; settings: Preferences; initial?: boolean }
  | { type: 'resume' };
export type WorkerEvent = { type: 'status'; id: ProviderId; value: ProviderStatus };
