// Athelgard Skills — operator-grade tools, same class as the orchestrator's kit.
// Exposes window.athelgard.skills. Pure JS, no dependencies, extension-safe.

(function () {
  const RE = {
    md5: /\b[a-fA-F0-9]{32}\b/g,
    sha1: /\b[a-fA-F0-9]{40}\b/g,
    sha256: /\b[a-fA-F0-9]{64}\b/g,
    ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    email: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
    url: /https?:\/\/[^\s"'<>]+/g,
    htbHost: /\b[a-z0-9-]+\.htb\b/gi,
    xmppRoom: /[\w.-]+@(?:muc\.)?[\w.-]+/g,
    ethAddr: /\b0x[a-fA-F0-9]{40}\b/g,
    txHash: /\b0x[a-fA-F0-9]{64}\b/g,
    flag: /(?:HTB|FLAG|CTF|cyberhx)\{[^}\s]{4,80}\}/g,
    cronTs: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?\b/g
  };

  function uniq(a) { return [...new Set(a)]; }

  // SCAN — pull every IOC class out of a context (page text, selection, chat)
  function scan(text) {
    text = String(text || '');
    const out = {};
    for (const [k, re] of Object.entries(RE)) {
      const m = text.match(re) || [];
      if (m.length) out[k] = uniq(m).slice(0, 50);
    }
    out.iocCount = Object.entries(out).filter(([k]) => k !== 'iocCount')
      .reduce((n, [, v]) => n + v.length, 0);
    return out;
  }

  // HASHID — what is this digest, and what does that tell us
  function hashid(h) {
    h = String(h || '').trim();
    if (/^[a-fA-F0-9]{32}$/.test(h)) return 'MD5 — file artifact, crackable: hashcat -m 0';
    if (/^[a-fA-F0-9]{40}$/.test(h)) return 'SHA1 — file/cert artifact, hashcat -m 100';
    if (/^[a-fA-F0-9]{64}$/.test(h)) return 'SHA256 — modern artifact, hashcat -m 1400 / VT lookup';
    if (/^[a-fA-F0-9]{128}$/.test(h)) return 'SHA512 — high-assurance artifact';
    return 'not a hex digest';
  }

  // WAYBACK — ask the CDX API what an URL/path left behind (Whisper Chain lesson)
  async function wayback(url, limit = 20) {
    const q = 'https://web.archive.org/cdx/search/cdx?url=' +
      encodeURIComponent(url) + '&output=json&limit=' + limit + '&collapse=digest';
    const r = await fetch(q);
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const [head, ...rest] = rows;
    const iUrl = head.indexOf('original'), iTs = head.indexOf('timestamp'), iSt = head.indexOf('statuscode');
    return rest.map(rw => ({ url: rw[iUrl], ts: rw[iTs], status: rw[iSt] }));
  }

  // XOR CRIB — known-plaintext single-byte XOR helper (Silent Dividend lesson)
  function xorCrib(cipherHex, crib) {
    const c = [];
    for (let i = 0; i < cipherHex.length; i += 2) c.push(parseInt(cipherHex.substr(i, 2), 16));
    const k = [];
    for (let i = 0; i < Math.min(c.length, crib.length); i++) k.push(c[i] ^ crib.charCodeAt(i));
    return { keyBytes: k.map(x => '0x' + x.toString(16)), likelyKey: k.length ? k[0] : null };
  }

  // AUDITD — decode hex-encoded auditd argument fields (Poisoned Branch lesson)
  function auditd(hex) {
    hex = String(hex || '').replace(/^aN=/, '').trim();
    let s = '';
    for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return s;
  }

  // REPORT — format a scan as a briefing block
  function report(iocs) {
    const lines = ['IOC REPORT (' + iocs.iocCount + ' indicators)'];
    for (const [k, v] of Object.entries(iocs)) {
      if (k === 'iocCount') continue;
      lines.push(k.toUpperCase() + ': ' + v.join(', '));
    }
    return lines.join('\n');
  }

  window.athelgard = Object.assign(window.athelgard || {}, {
    skills: { scan, hashid, wayback, xorCrib, auditd, report }
  });
})();
