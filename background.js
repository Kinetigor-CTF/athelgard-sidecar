// Athelgard Sidecar — background service worker
// Owns: side panel lifecycle, shared team state, flag pipeline relay.

const DEFAULTS = {
  brainUrl: "",        // OpenAI-compatible endpoint, e.g. http://localhost:11434/v1/chat/completions
  brainKey: "",        // API key (chrome.storage.local only — never synced)
  brainModel: "athelgard",
  scoreboardUrl: "",   // e.g. https://ctf.hackthebox.com — flags get staged for THIS target
  operatorName: "Captain",
  sendGate: true       // Holmes lesson: nothing submits without operator approval
};

chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const k of Object.keys(DEFAULTS)) if (s[k] === undefined) patch[k] = DEFAULTS[k];
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Relay between content scripts and the side panel (the "squad bus", now durable)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PAGE_CONTEXT") {
    // Athelgard's eyes: stash latest page snapshot for the panel
    chrome.storage.session.set({ lastContext: { ...msg, at: Date.now(), url: sender.tab?.url } });
    return;
  }
  if (msg.type === "STAGE_FLAG") {
    // Explicit send gate: she STAGES, operator APPROVES, then it can go out.
    chrome.storage.local.get({ stagedFlags: [], sendGate: true }).then(({ stagedFlags }) => {
      const flag = { ...msg.flag, stagedAt: Date.now(), status: "STAGED", by: "athelgard" };
      stagedFlags.push(flag);
      chrome.storage.local.set({ stagedFlags });
      broadcast({ type: "FLAGS_UPDATED", flags: stagedFlags });
    });
    return;
  }
  if (msg.type === "APPROVE_FLAG" || msg.type === "DISCARD_FLAG") {
    chrome.storage.local.get({ stagedFlags: [] }).then(({ stagedFlags }) => {
      const f = stagedFlags.find(x => x.flag === msg.flag);
      if (f) f.status = msg.type === "APPROVE_FLAG" ? "APPROVED" : "DISCARDED";
      chrome.storage.local.set({ stagedFlags });
      broadcast({ type: "FLAGS_UPDATED", flags: stagedFlags });
    });
    return;
  }
  // Everything else: forward to the panel
  broadcast(msg);
});

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}
