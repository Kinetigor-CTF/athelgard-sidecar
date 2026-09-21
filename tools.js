// Athelgard Tools — operator suite. Operator-initiated only: you type, she acts.
(function () {
  async function bg(msg) {
    const r = await chrome.runtime.sendMessage({ type: 'TOOL', ...msg });
    return r || { text: '(stubbed in demo)', bytes: 0 };
  }
  const tools = {
    async go(url) {
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      const tab = await chrome.tabs.create({ url });
      return 'Navigated: ' + url + ' (tab ' + tab.id + ')';
    },
    async tabs() {
      const ts = await chrome.tabs.query({});
      return ts.map(t => t.id + ': ' + (t.title || '').slice(0, 50)).join('\n');
    },
    async focusTab(id) { await chrome.tabs.update(id, { active: true }); return 'Focused ' + id; },
    async closeTab(id) { await chrome.tabs.remove(id); return 'Closed ' + id; },
    async _page(msg) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.tabs.sendMessage(tab.id, { type: 'TOOL_ACTION', ...msg });
    },
    async click(s) { return this._page({ action: 'CLICK', selector: s }); },
    async fill(s, v) { return this._page({ action: 'FILL', selector: s, value: v }); },
    async scrollToText(t) { return this._page({ action: 'SCROLL_TEXT', text: t }); },
    async extract() { return this._page({ action: 'EXTRACT' }); },
    async fetchText(url) { const r = await bg({ tool: 'FETCH', url }); return r.text; },
    async fetchJSON(url) { const r = await bg({ tool: 'FETCH', url }); try { return JSON.stringify(JSON.parse(r.text), null, 2).slice(0, 3000); } catch (e) { return r.text.slice(0, 3000); } },
    async snap(label) {
      const r = await bg({ tool: 'SNAP', label: label || 'snap' });
      return 'Screenshot captured (' + r.bytes + ' bytes) — vaulted as "' + (label || 'snap') + '"';
    },
    async alarm(name, minutes, message) {
      await bg({ tool: 'ALARM', name, minutes: +minutes, message: message || name });
      return 'Alarm "' + name + '" in ' + minutes + 'm.';
    },
    async export() {
      const all = await chrome.storage.local.get(null);
      const url = URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' }));
      await chrome.downloads.download({ url, filename: 'athelgard-vault-export.json' });
      return 'Vault exported.';
    }
  };
  window.athelgard = Object.assign(window.athelgard || {}, { tools });
})();
