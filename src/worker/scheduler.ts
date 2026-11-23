import type { ProviderId, ProviderStatus } from '../shared/contracts.js';

export interface SchedulerTimers {
  setInterval(callback: () => void, delay: number): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
}

type Refresh = () => ProviderStatus | null | Promise<ProviderStatus | null>;

export class Scheduler<Key extends string = ProviderId> {
  private readonly running = new Map<Key, Promise<ProviderStatus | null>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  constructor(
    private readonly providers: Record<Key, { refresh: Refresh }>,
    private readonly report: (id: Key, result: ProviderStatus | null) => void,
    private readonly timers: SchedulerTimers = globalThis
  ) {}

  configure(minutes: number) {
    if (![0, 1, 5, 10, 15, 30, 60].includes(minutes)) throw Error('Invalid refresh interval');
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = minutes ? this.timers.setInterval(() => void this.refresh(), minutes * 60000) : null;
  }

  refresh(id?: Key) {
    if (this.stopped) return Promise.resolve([]);
    const ids = id ? [id] : Object.keys(this.providers) as Key[];
    return Promise.all(ids.map(key => this.refreshProvider(key)));
  }

  refreshProvider(id: Key): Promise<ProviderStatus | null> {
    if (!Object.hasOwn(this.providers, id)) return Promise.reject(Error('Unknown provider'));
    const running = this.running.get(id);
    if (running) return running;
    const task = Promise.resolve().then(() => this.providers[id].refresh()).then(
      value => { this.report(id, value); return value; },
      () => {
        const failure = { state: 'error', message: 'Refresh failed. Try again.' } as const;
        this.report(id, failure);
        return failure;
      }
    ).finally(() => this.running.delete(id));
    this.running.set(id, task);
    return task;
  }

  stop() {
    this.stopped = true;
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
  }
}
