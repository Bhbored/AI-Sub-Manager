/** Single-flight refresh per provider. Different providers run independently. */
export class Scheduler {
  constructor(providers, report, timers = globalThis) {
    this.providers = providers;
    this.report = report;
    this.timers = timers;
    this.running = new Map();
    this.timer = null;
    this.stopped = false;
  }
  configure(minutes) {
    if (![0, 1, 5, 10, 15, 30, 60].includes(minutes)) throw new Error('Invalid refresh interval');
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = minutes ? this.timers.setInterval(() => void this.refresh(), minutes * 60000) : null;
  }
  refresh(id) {
    if (this.stopped) return Promise.resolve([]);
    const ids = id ? [id] : Object.keys(this.providers);
    return Promise.all(ids.map(key => this.refreshProvider(key)));
  }
  refreshProvider(id) {
    if (!Object.hasOwn(this.providers, id)) return Promise.reject(new Error('Unknown provider'));
    if (this.running.has(id)) return this.running.get(id);
    const task = Promise.resolve().then(() => this.providers[id].refresh()).then(
      value => { this.report(id, value); return value; },
      () => { const value = {state:'error', message:'Refresh failed. Try again.'}; this.report(id, value); return value; }
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
