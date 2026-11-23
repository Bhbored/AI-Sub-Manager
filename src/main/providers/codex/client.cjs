const readline = require('node:readline');
class CodexClient {
  constructor(start, version) {
    this.startProcess = start;
    this.version = version;
    this.pending = new Map();
    this.id = 0;
  }
  async start() {
    this.child = this.startProcess();
    this.child.stdin.on('error', () => this.fail());
    this.child.on('error', () => this.fail());
    this.child.on('exit', () => this.fail());
    this.lines = readline.createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); }
      catch { return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(Error('Codex request failed.'));
      else pending.resolve(message.result);
    });
    await this.request('initialize', { clientInfo: { name: 'ai_usage_monitor', title: 'AI Usage Monitor', version: this.version } });
    this.child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.child?.stdin.writable) return reject(Error('Codex is not running.'));
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error('Codex request timed out.'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  fail() {
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
module.exports = { CodexClient };

