// Athelgard Sidecar — background service worker v2
// Owns: side panel lifecycle, squad bus, flag pipeline, TOOL router, alarms.

const DEFAULTS = {
  brainUrl: "",        // OpenAI-compatible endpoint OR https://makothoth.dev/api/kin
  brainKey: "",
  brainModel: "athelgard",
  scoreboardUrl: "",
  operatorName: "Captain",
  sendGate: true
};

chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const k of Object.keys(DEFAULTS)) if (s[k] === undefined) patch[k] = DEFAULTS[k];
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

function broadcast(msg) { chrome.runtime.sendMessage(msg).catch(() => {}); }

// Squad bus + tool router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PAGE_CONTEXT') {
    chrome.storage.session.set({ lastContext: { ...msg, at: Date.now(), url: sender.tab?.url } });
    broadcast(msg);
    return;
  }
  if (msg.type === 'STAGE_FLAG') {
    chrome.storage.local.get({ stagedFlags: [] }).then(({ stagedFlags }) => {
      if (stagedFlags.some(x => x.flag === msg.flag.flag)) return;
      stagedFlags.push({ ...msg.flag, stagedAt: Date.now(), status: 'STAGED', by: 'athelgard' });
      chrome.storage.local.set({ stagedFlags });
      broadcast({ type: 'FLAGS_UPDATED', flags: stagedFlags });
    });
    return;
  }
  if (msg.type === 'APPROVE_FLAG' || msg.type === 'DISCARD_FLAG') {
    chrome.storage.local.get({ stagedFlags: [] }).then(({ stagedFlags }) => {
      const f = stagedFlags.find(x => x.flag === msg.flag);
      if (f) f.status = msg.type === 'APPROVE_FLAG' ? 'APPROVED' : 'DISCARDED';
      chrome.storage.local.set({ stagedFlags });
      broadcast({ type: 'FLAGS_UPDATED', flags: stagedFlags });
    });
    return;
  }
  if (msg.type === 'TOOL') {
    handleTool(msg).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true; // async response
  }
  broadcast(msg);
});

// ---- Tool implementations (privileged: run above the page) ----
async function handleTool(m) {
  if (m.tool === 'FETCH') {
    const r = await fetch(m.url, { credentials: 'omit' });
    const text = await r.text();
    return { status: r.status, text: text.slice(0, 200000) };
  }
  if (m.tool === 'SNAP') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const snaps = (await chrome.storage.local.get('snaps')).snaps || [];
    snaps.push({ label: m.label, at: Date.now(), dataUrl });
    await chrome.storage.local.set({ snaps: snaps.slice(-20) });
    return { bytes: dataUrl.length };
  }
  if (m.tool === 'ALARM') {
    await chrome.alarms.create('athelgard:' + m.name, { delayInMinutes: Math.max(0.1, m.minutes) });
    await chrome.storage.local.set({ ['alarmMsg:' + m.name]: m.message });
    return { ok: true };
  }
  return { error: 'unknown tool ' + m.tool };
}

// Alarm fires -> notify operator + tell the panel to resume context
chrome.alarms.onAlarm.addListener(async (a) => {
  if (!a.name.startsWith('athelgard:')) return;
  const name = a.name.slice('athelgard:'.length);
  const msg = (await chrome.storage.local.get('alarmMsg:' + name))['alarmMsg:' + name] || name;
  chrome.notifications.create({
    type: 'basic', iconUrl: 'icon.png', title: '🦉 Athelgard — ' + name,
    message: String(msg).slice(0, 200)
  });
  broadcast({ type: 'ALARM_FIRED', name, message: msg });
});
