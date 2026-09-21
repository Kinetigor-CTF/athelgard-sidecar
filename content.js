// Athelgard Sidecar — content script v2 (her eyes AND her hands)
// Watches the page, extracts flags/IOCs, executes TOOL_ACTIONs from the panel.

const FLAG_RE = /(?:HTB|FLAG|CTF|cyberhx)\{[^}\s]{4,80}\}/g;

function pageDigest() {
  const text = document.body ? document.body.innerText.slice(0, 12000) : '';
  const flags = (text.match(FLAG_RE) || []);
  const selection = String(getSelection());
  return {
    title: document.title,
    url: location.href,
    flags: [...new Set(flags)],
    selection: selection.slice(0, 500),
    textHead: text.slice(0, 4000)
  };
}

chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', ...pageDigest() });
let lastSel = '';
setInterval(() => {
  const sel = String(getSelection());
  if (sel && sel !== lastSel) { lastSel = sel; chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', ...pageDigest() }); }
}, 1500);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_CONTEXT') {
    chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', ...pageDigest() });
  }
  if (msg.type === 'HIGHLIGHT' && msg.text) highlight(msg.text);

  // ---- TOOL_ACTION: her hands. Operator-typed commands only. ----
  if (msg.type === 'TOOL_ACTION') {
    try { sendResponse(runAction(msg)); } catch (e) { sendResponse({ error: e.message }); }
    return true;
  }
});

function runAction(a) {
  if (a.action === 'CLICK') {
    const el = document.querySelector(a.selector);
    if (!el) return { error: 'not found: ' + a.selector };
    el.scrollIntoView({ block: 'center' }); el.click();
    return { ok: 'clicked ' + a.selector };
  }
  if (a.action === 'FILL') {
    const el = document.querySelector(a.selector);
    if (!el) return { error: 'not found: ' + a.selector };
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype === HTMLTextAreaElement.prototype ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
    setter.call(el, a.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: 'filled ' + a.selector };
  }
  if (a.action === 'SCROLL_TEXT') { highlight(a.text); return { ok: 'scrolled to text' }; }
  if (a.action === 'EXTRACT') {
    return { ok: true, title: document.title, text: document.body.innerText.slice(0, 20000), flags: pageDigest().flags };
  }
  return { error: 'unknown action ' + a.action };
}

function highlight(text) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const i = node.textContent.indexOf(text);
    if (i >= 0) {
      const range = document.createRange();
      range.setStart(node, i); range.setEnd(node, i + text.length);
      const span = document.createElement('span');
      span.style.cssText = 'background:#ffd54a;color:#000;outline:2px solid #ff8f00;';
      try { range.surroundContents(span); span.scrollIntoView({ block: 'center' }); } catch (e) {}
      setTimeout(() => { span.style.cssText = ''; }, 4000);
      break;
    }
  }
}
