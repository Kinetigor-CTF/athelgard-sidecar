// Demo bridge: this frame borrows its chrome.* from the parent hub.
window.chrome = window.parent.setChrome(window.__SIDE ? 'side' : 'page');
