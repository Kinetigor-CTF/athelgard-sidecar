// Athelgard Tools — the operator suite. Every action is operator-initiated:
// you type the command, she executes. No autonomous acting. Send gate for behavior.
// Requires manifest v2 permissions (tabs, alarms, notifications, downloads).


(function () {
  async function bg(msg) {
    const r = await chrome.runtime.sendMessage({ type: 'TOOL', ...msg });
    return r || { text: '(stubbed in demo — needs the real extension)', bytes: 0 }; // demo hub has no background fetch
  }


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
