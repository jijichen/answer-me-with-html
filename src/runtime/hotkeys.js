// Keyboard shortcuts: r remark mode, c comment on the current panel (or the Reply), j / k next / previous panel, 1–9 jump to a panel,
// ? the list of keys, j / k past the ends, the current digit again or Esc let go of the panel, Ctrl / Cmd + Enter save the open remark (or copy the reply).
// The keys press the page's own buttons, so remark.js and reply.js stay the only owners of what those buttons do.
// A letter never fires while the reader types (a comment box, a remark note, a select), holds Ctrl / Cmd / Alt, or has a dialog open.
const toolbar = document.querySelector('.am-toolbar');
const panels = [...document.querySelectorAll('.am-panel')];
if (toolbar?.dataset.keys) {
  const labels = JSON.parse(toolbar.dataset.keys);
  const press = (name) => document.querySelector(`[data-am="${name}"]`)?.click();
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The panel the reader is on: the last one jumped to, else the last whose top has scrolled to the top of the window.
  let current = -1;
  const onScreen = () => panels.reduce((at, p, i) => (p.getBoundingClientRect().top <= 80 ? i : at), -1);
  const go = (i) => {
    const panel = panels[i];
    if (!panel) return;
    current = i;
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    panel.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    panel.focus({ preventScroll: true });
  };
  // Going past the first or last panel, the digit of the current one or Esc lets go of the panel, so c opens the Reply again.
  const leave = () => {
    panels[current]?.blur();
    current = -1;
  };
  const step = (by) => {
    const at = current >= 0 ? current : onScreen();
    const to = at + by;
    if (current >= 0 && (to < 0 || to >= panels.length)) return leave();
    go(Math.min(Math.max(to, 0), panels.length - 1));
  };
  const jump = (i) => (i === current ? leave() : go(i));
  // Scrolling by hand moves the reader off the panel jumped to; the next j / k starts from what is on screen.
  window.addEventListener('wheel', () => { current = -1; }, { passive: true });
  window.addEventListener('touchmove', () => { current = -1; }, { passive: true });

  let help;
  const showHelp = () => {
    if (!help) {
      help = document.createElement('dialog');
      help.className = 'am-reply am-keys';
      help.setAttribute('aria-label', labels.title);
      const rows = [['r', labels.remark], ['c', labels.reply], ['j', labels.next], ['k', labels.prev], ['1–9', labels.jump], ['?', labels.help], ['Ctrl / ⌘ + Enter', labels.send], ['Esc', labels.close]];
      const list = document.createElement('dl');
      for (const [key, label] of rows) {
        const dt = document.createElement('dt');
        dt.append(Object.assign(document.createElement('kbd'), { textContent: key }));
        list.append(dt, Object.assign(document.createElement('dd'), { textContent: label }));
      }
      const head = Object.assign(document.createElement('strong'), { textContent: labels.title });
      help.append(head, list);
      help.addEventListener('click', (e) => { if (e.target === help) help.close(); });
      document.body.append(help);
    }
    help.open ? help.close() : help.showModal();
  };

  // c on a panel the reader jumped to opens that panel's Comment box; anywhere else it opens the Reply.
  const comment = () => {
    const panel = panels[current];
    const btn = panel?.querySelector('.am-comment-btn');
    if (!btn) return press('reply');
    const box = panel.querySelector('.am-comment textarea');
    if (box?.closest('.am-comment').hidden) btn.click();
    else box?.focus();
  };
  // Ctrl / Cmd + Enter: in the Reply it presses Copy; anywhere else it presses Copy reply on the bottom bar, which shows once there
  // is any input. The remark popover handles the key itself (remark.js) and marks it handled, so it never reaches send.
  const send = () => {
    const sheet = document.querySelector('dialog.am-reply:not(.am-keys)[open]');
    if (sheet) return sheet.querySelector('[data-act="copy"]')?.click();
    const bar = document.querySelector('.am-reply-bar:not([hidden])');
    bar?.querySelector('.am-btn--reply')?.click();
  };

  const typing = (el) => el instanceof Element && el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .am-remark-pop');
  const blocked = () => [...document.querySelectorAll('dialog[open]')].some((d) => d !== help)
    || Boolean(document.querySelector('.am-lightbox:not([hidden])'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing && !e.defaultPrevented) { e.preventDefault(); return send(); }
    // Esc in a Comment box goes back to its panel, so j / k / c work again.
    if (e.key === 'Escape' && e.target instanceof Element && e.target.closest('.am-comment')) {
      const panel = e.target.closest('.am-panel');
      const i = panels.indexOf(panel);
      if (i >= 0) { e.preventDefault(); return go(i); }
    }
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.key === '?') { e.preventDefault(); return showHelp(); }
    if (blocked() || help?.open) return;
    const k = e.key;
    if (k === 'r') press('remark');
    else if (k === 'c') comment();
    else if (k === 'j') step(1);
    else if (k === 'k') step(-1);
    else if (/^[1-9]$/.test(k)) jump(Number(k) - 1);
    else if (k === 'Escape' && current >= 0) leave();
    else return;
    e.preventDefault();
  });
}
