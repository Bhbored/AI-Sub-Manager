function createClaude(tool) {
  return {
    async refresh(info) {
      let stdout;
      try { ({ stdout } = await tool.invoke(info, ['auth', 'status'])); }
      catch (error) {
        if (error.code !== 1 || typeof error.stdout !== 'string') throw error;
        stdout = error.stdout;
      }
      const status = JSON.parse(stdout);
      if (status.loggedIn !== true || status.authMethod !== 'claude.ai') {
        return { state: 'auth', message: 'Run claude auth login in your terminal to connect a Claude subscription, then refresh.' };
      }
      return { state: 'unsupported', connected: true, message: 'Claude Code only exposes subscription limits in its interactive usage view.' };
    }
  };
}
module.exports = { createClaude };


