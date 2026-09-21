// Athelgard Tools — the operator suite. Every action is operator-initiated:
// you type the command, she executes. No autonomous acting. Send gate for behavior.
// Requires manifest v2 permissions (tabs, alarms, notifications, downloads).

(function () {
  async function bg(msg) { return chrome.runtime.sendMessage({ type: 'TOOL', ...msg }); }

  const tools = {
    /* ---- navigation & tabs (chrome.tabs) ---- */
    async go(url) {
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      const tab = await chrome.tabs.create({ url });
      return 'Navigated: ' + url + ' (tab ' + tab.id + ')';
    },
    async tabs() {
      const ts = await chrome.tabs.query({});
      return ts.map(t => t.id + ': ' + (t.title || '').slice(0, 50) + ' — ' + (t.url || '').slice(0, 60)).join('\n');
    },
    async focusTab(id) { await chrome.tabs.update(id, { active: true }); return 'Focused tab ' + id; },
    async closeTab(id) { await chrome.tabs.remove(id); return 'Closed tab ' + id; },

    /* ---- page actions (routed to content script in the active tab) ---- */
    async _page(msg) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.tabs.sendMessage(tab.id, { type: 'TOOL_ACTION', ...msg });
    },
    async click(selector) { return this._page({ action: 'CLICK', selector }); },
    async fill(selector, value) { return this._page({ action: 'FILL', selector, value }); },
    async scrollToText(text) { return this._page({ action: 'SCROLL_TEXT', text }); },
    async extract() { return this._page({ action: 'EXTRACT' }); },

    /* ---- network (background fetch: no CORS jail) ---- */
    async fetchText(url) { const r = await bg({ tool: 'FETCH', url }); return r.text; },
    async fetchJSON(url) { const r = await bg({ tool: 'FETCH', url }); try { return JSON.stringify(JSON.parse(r.text), null, 2).slice(0, 3000); } catch (e) { return r.text.slice(0, 3000); } },

    /* ---- eyes ---- */
    async snap(label) {
      const r = await bg({ tool: 'SNAP', label: label || 'snap' });
      return 'Screenshot captured (' + r.bytes + ' bytes) — staged to vault as "' + (label || 'snap') + '"';
    },

    /* ---- time ---- */
    async alarm(name, minutes, message) {
      await bg({ tool: 'ALARM', name, minutes: +minutes, message: message || name });
      return 'Alarm "' + name + '" set for ' + minutes + 'm. I will ping you and resume context.';
    },

    /* ---- memory ---- */
    async export() {
      const all = await chrome.storage.local.get(null);
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      await chrome.downloads.download({ url, filename: 'athelgard-vault-export.json' });
      return 'Vault exported (stagedFlags + memory + config).';
    }
  };

  window.athelgard = Object.assign(window.athelgard || {}, { tools });
})();
