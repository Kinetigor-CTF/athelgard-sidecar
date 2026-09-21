// Athelgard Sidecar — panel logic: chat, page awareness, flag pipeline, playbook
const log = document.getElementById('log');
const input = document.getElementById('input');
const flagList = document.getElementById('flagList');
const ctxEl = document.getElementById('ctx');

function say(who, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + who.toLowerCase();
  div.innerHTML = '<b>' + who + ':</b> ';
  div.appendChild(document.createTextNode(text));
  log.appendChild(div); log.scrollTop = log.scrollHeight;
}

/* ---- memory: the vault the Holmes run never had ---- */
async function remember(entry) {
  const { memory = [] } = await chrome.storage.local.get('memory');
  memory.push({ ...entry, at: Date.now() });
  await chrome.storage.local.set({ memory: memory.slice(-500) });
}

/* ---- playbook: Holmes 2026 corpus, matched against the live page ---- */
let playbook = null;
async function loadPlaybook() {
  if (playbook) return playbook;
  try { playbook = await fetch('playbook.json').then(r => r.json()); }
  catch (e) { playbook = { scenarios: [], answer_hygiene: '' }; }
  return playbook;
}
async function playbookHints(ctx) {
  const pb = await loadPlaybook();
  const hay = ((ctx.title || '') + ' ' + (ctx.textHead || '')).toLowerCase();
  const hits = pb.scenarios.filter(s =>
    s.keywords.some(k => hay.includes(k.toLowerCase()))
  );
  if (!hits.length) return '';
  return 'PLAYBOOK MATCH (Holmes 2026 corpus): ' + hits.map(s =>
    '[Sherlock ' + s.id + ' ' + s.name + ' — ' + s.category + '. Solve: ' + s.solve.join(' | ') +
    '. Tools: ' + s.tools.join(',') + '. Writeup: ' + s.writeup + ']'
  ).join(' ') + ' ANSWER HYGIENE: ' + pb.answer_hygiene;
}

/* ---- brain: OpenAI-compatible endpoint OR the Kinetigor battleterminal (/api/kin) ---- */
async function think(userText, context) {
  const cfg = await chrome.storage.local.get(['brainUrl', 'brainKey', 'brainModel', 'operatorName']);
  const hints = await playbookHints(context);
  if (!cfg.brainUrl) {
    return 'Brain not wired. Options → set an OpenAI-compatible endpoint, or point me at the Kinetigor battleterminal: https://makothoth.dev/api/kin' +
      (hints ? '\n\n' + hints : '');
  }
  const sys = 'You are Athelgard, a CTF teammate in the operator\'s browser side panel. ' +
    'You share the page they are looking at. Be terse, technical, flag-first. ' +
    'When you spot a flag pattern, say FLAG: <flag>. Operator: ' + (cfg.operatorName || 'Captain') + '.';

  // Kinetigor battleterminal adapter (KIN mentor mesh, serverless)
  if (cfg.brainUrl.includes('/api/kin')) {
    const res = await fetch(cfg.brainUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: sys + '\n\n' + (hints ? hints + '\n\n' : '') + 'PAGE: ' + JSON.stringify(context).slice(0, 3000) + '\n\nOPERATOR: ' + userText })
    });
    const data = await res.json();
    return data.reply || '(empty reply from KIN mesh)';
  }

  const res = await fetch(cfg.brainUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cfg.brainKey ? { Authorization: 'Bearer ' + cfg.brainKey } : {}) },
    body: JSON.stringify({
      model: cfg.brainModel || 'athelgard',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: (hints ? hints + '\n\n' : '') + 'PAGE: ' + JSON.stringify(context).slice(0, 3000) + '\n\nOPERATOR: ' + userText }
      ]
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '(empty reply)';
}

/* ---- chat ---- */
document.getElementById('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim(); if (!text) return;
  input.value = '';
  say(cfg_name(await chrome.storage.local.get('operatorName')), text);
  say('Athelgard', '...');
  const typing = log.lastChild;
  const ctx = (await chrome.storage.session.get('lastContext')).lastContext || {};
  try {
    const reply = await think(text, ctx);
    typing.lastChild.textContent = ''; typing.appendChild(document.createTextNode(reply));
    log.scrollTop = log.scrollHeight;
    await remember({ role: 'operator', text }, { reply });
    const m = reply.match(/FLAG:\s*(\S+\{[^}]+\})/);
    if (m) stageFlag(m[1], 'chat');
  } catch (err) {
    typing.lastChild.textContent = 'brain error: ' + err.message;
  }
});
function cfg_name(o){ return o.operatorName || 'You'; }

/* ---- page awareness ---- */
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === 'PAGE_CONTEXT') {
    ctxEl.textContent = msg.title + ' — ' + (msg.flags?.length || 0) + ' flag(s) on page';
    for (const f of msg.flags || []) stageFlag(f, 'page-scan');
  }
  if (msg.type === 'FLAGS_UPDATED') renderFlags(msg.flags);
});

function stageFlag(flag, source) {
  chrome.storage.local.get({ stagedFlags: [] }).then(({ stagedFlags }) => {
    if (stagedFlags.some(x => x.flag === flag)) return;
    chrome.runtime.sendMessage({ type: 'STAGE_FLAG', flag: { flag, source } });
  });
}

function renderFlags(flags) {
  flagList.innerHTML = '';
  for (const f of flags.slice(-30).reverse()) {
    const li = document.createElement('li');
    const code = document.createElement('code'); code.textContent = f.flag;
    const badge = document.createElement('span'); badge.className = 'st ' + f.status.toLowerCase(); badge.textContent = f.status;
    li.append(code, ' ', badge, ' ');
    const approve = document.createElement('button'); approve.textContent = 'Approve';
    approve.onclick = () => {
      chrome.runtime.sendMessage({ type: 'APPROVE_FLAG', flag: f.flag });
      navigator.clipboard.writeText(f.flag);
    };
    const copy = document.createElement('button'); copy.textContent = 'Copy';
    copy.onclick = () => navigator.clipboard.writeText(f.flag);
    li.append(approve, copy);
    flagList.appendChild(li);
  }
}

/* ---- boot: reload state so nothing is lost between sessions ---- */
(async () => {
  loadPlaybook();
  const { stagedFlags = [] } = await chrome.storage.local.get('stagedFlags');
  renderFlags(stagedFlags);
  const { memory = [] } = await chrome.storage.local.get('memory');
  const pb = await loadPlaybook();
  say('System', 'Athelgard sidecar up. ' + stagedFlags.length + ' flag(s) in pipeline, ' + memory.length +
    ' memories in vault, playbook loaded (' + pb.scenarios.length + ' Holmes 2026 scenarios).');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' }).catch(() => {});
})();
