import { createInterface, type Interface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { asRecord } from '../../shared/validation.js';

export interface AppServerProcess {
  stdin: Writable;
  stdout: Readable;
  on(event: 'error' | 'exit', listener: () => void): unknown;
  kill(): boolean;
}
interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export class CodexClient {
  private child?: AppServerProcess;
  private lines?: Interface;
  private pending = new Map<number, PendingRequest>();
  private id = 0;

  constructor(private readonly startProcess: () => AppServerProcess, private readonly version: string) {}

  async start() {
    const child = this.child = this.startProcess();
    child.stdin.on('error', () => this.fail());
    child.on('error', () => this.fail());
    child.on('exit', () => this.fail());
    this.lines = createInterface({ input: child.stdout });
    this.lines.on('line', line => {
      let message;
      try { message = asRecord(JSON.parse(line)); }
      catch { return; }
      if (typeof message.id !== 'number') return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(Error('Codex request failed.'));
      else pending.resolve(message.result);
    });
    await this.request('initialize', { clientInfo: { name: 'ai_usage_monitor', title: 'AI Usage Monitor', version: this.version } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  }

  request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = this.child;
      if (!child?.stdin.writable) return reject(Error('Codex is not running.'));
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error('Codex request timed out.'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }

  private fail() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error('Codex process stopped.'));
    }
    this.pending.clear();
  }

  stop() {
    this.lines?.close();
    this.child?.kill();
    this.fail();
  }
}
