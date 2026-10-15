// Browser seam for the keyboard shortcuts: render a page, press keys in headless Chrome and read what changed.
// Needs Chrome, so it runs only with AM_E2E=1 like test/remark-browser.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, devtoolsUrl, findChrome } from '../src/video/export.js';
import en from '../src/languages/en.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = findChrome();
const SKIP = process.env.AM_E2E !== '1'
  ? 'set AM_E2E=1 to run the browser hotkey tests'
  : !CHROME ? 'no Chrome found (set AM_CHROME)' : typeof WebSocket === 'undefined' ? 'needs Node 22 (built-in WebSocket)' : false;

const DRAFT = `---
title: Hotkey check
lang: en
---
## A First
One.

## B Second
Two.

## C Third
Three.
`;

let tmp;
let chrome;
let cdp;
let session;
let file;

const send = (method, params) => cdp.send(method, params, session);
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`page script error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};
const load = async () => {
  const loaded = cdp.once('Page.loadEventFired');
  await send('Page.navigate', { url: pathToFileURL(file).href });
  await loaded;
};

// Page helpers: press a key on an element (the focused one by default) and read the state the keys change.
const PAGE_JS = `
  const key = (k, opts = {}, el = document.activeElement || document.body) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
  const remarkOn = () => document.querySelector('[data-am="remark"]').getAttribute('aria-pressed') === 'true';
  const replyOpen = () => Boolean(document.querySelector('dialog.am-reply:not(.am-keys)[open]'));
  const keysOpen = () => Boolean(document.querySelector('dialog.am-keys[open]'));
  const focused = () => document.activeElement?.id ?? '';
`;

before(async () => {
  if (SKIP) return;
  tmp = mkdtempSync(join(tmpdir(), 'am-hotkeys-'));
  file = join(tmp, 'page.html');
  writeFileSync(join(tmp, 'page.md'), DRAFT);
  execFileSync(process.execPath, [join(ROOT, 'bin/am.js'), 'render', join(tmp, 'page.md'), '-o', file, '--no-open'], {
    env: { ...process.env, AM_NO_UPDATE_CHECK: '1', AM_HOME: join(tmp, 'home') }, stdio: 'pipe',
  });
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(tmp, 'profile')}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  cdp = await connect(await devtoolsUrl(chrome));
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: session } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errors = [];
      addEventListener('error', (e) => window.__errors.push(String(e.message)));
      addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));`,
  });
});

after(async () => {
  cdp?.close();
  if (chrome && chrome.exitCode === null) {
    await new Promise((r) => {
      const timer = setTimeout(r, 3000);
      chrome.once('exit', () => { clearTimeout(timer); r(); });
      chrome.kill();
    });
  }
  try {
    if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (e) {
    console.warn(`Could not remove ${tmp}: ${e.message}`);
  }
});

test('hotkeys: r toggles remark mode, c with no current panel opens the Reply, and no key acts while the Reply is open', { skip: SKIP }, async () => {
  await load();
  const state = await evaluate(`(() => { ${PAGE_JS}
    key('r'); const on = remarkOn();
    key('r'); const off = remarkOn();
    key('c'); const open = replyOpen();
    key('r'); const blocked = remarkOn();
    return { on, off, open, blocked, errors: window.__errors };
  })()`);
  assert.deepEqual(state, { on: true, off: false, open: true, blocked: false, errors: [] });
});

test('hotkeys: j, k and digits move the focus between panels and let go past the ends or on the current digit', { skip: SKIP }, async () => {
  await load();
  const ids = await evaluate(`(() => { ${PAGE_JS}
    const seen = [];
    for (const k of ['j', 'j', 'j', 'j', '1', 'k', '3', '3', '2', '9']) { key(k); seen.push(focused()); }
    key('c');
    return { seen, reply: replyOpen() };
  })()`);
  // Past the last panel, past the first, and the current digit again each let go; 9 has no panel and leaves the focus alone.
  assert.deepEqual(ids, { seen: ['panel-A', 'panel-B', 'panel-C', '', 'panel-A', '', 'panel-C', '', 'panel-B', 'panel-B'], reply: false });
});

test('hotkeys: keys do nothing while the reader types or holds Ctrl / Cmd', { skip: SKIP }, async () => {
  await load();
  const state = await evaluate(`(() => { ${PAGE_JS}
    const box = document.querySelector('.am-comment textarea') ?? document.body.appendChild(document.createElement('textarea'));
    key('r', {}, box); key('j', {}, box);
    const typing = { remark: remarkOn(), focus: focused() };
    key('r', { ctrlKey: true }, document.body); key('r', { metaKey: true }, document.body);
    return { typing, modifier: remarkOn() };
  })()`);
  assert.deepEqual(state, { typing: { remark: false, focus: '' }, modifier: false });
});

test('hotkeys: ? shows the list of keys in the page language, and ? again hides it', { skip: SKIP }, async () => {
  await load();
  const state = await evaluate(`(() => { ${PAGE_JS}
    key('?'); const shown = keysOpen();
    const dialog = document.querySelector('dialog.am-keys');
    const rows = [...dialog.querySelectorAll('dt')].map((dt) => dt.textContent);
    const title = dialog.querySelector('strong').textContent;
    key('r', {}, dialog); const remark = remarkOn();
    key('?', {}, dialog);
    return { shown, rows, title, remark, hidden: !keysOpen() };
  })()`);
  assert.deepEqual(state, { shown: true, rows: ['r', 'c', 'j', 'k', '1–9', '?', 'Ctrl / ⌘ + Enter', 'Esc'], title: en.ui.keys.title, remark: false, hidden: true });
});

test('hotkeys: c on a panel opens its Comment box, and Esc there goes back to the panel', { skip: SKIP }, async () => {
  await load();
  const state = await evaluate(`(() => { ${PAGE_JS}
    key('2'); key('c');
    const box = document.activeElement;
    const inBox = box.matches('#panel-B .am-comment textarea') && !box.closest('.am-comment').hidden;
    key('Escape', {}, box);
    const back = focused();
    key('c');
    return { inBox, back, again: document.activeElement === box, reply: replyOpen() };
  })()`);
  assert.deepEqual(state, { inBox: true, back: 'panel-B', again: true, reply: false });
});

test('hotkeys: Ctrl / Cmd + Enter saves a remark once it has a kind, and otherwise copies the reply', { skip: SKIP }, async () => {
  await load();
  await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
  const state = await evaluate(`(async () => { ${PAGE_JS}
    const pop = document.querySelector('.am-remark-pop');
    const block = document.querySelector('#panel-A p');
    key('r'); block.click();
    const note = pop.querySelector('textarea');
    note.value = 'shorter';
    key('Enter', { ctrlKey: true }, note);
    const noKind = { open: !pop.hidden, marked: Boolean(block.dataset.kind) };
    pop.querySelector('[data-kind="suggestion"]').click();
    key('Enter', { metaKey: true }, note);
    const saved = { open: !pop.hidden, kind: block.dataset.kind };
    key('r');
    let copied = '';
    navigator.clipboard.writeText = async (t) => { copied = t; };
    key('Enter', { ctrlKey: true }, document.body);
    await new Promise((r) => setTimeout(r, 50));
    return { noKind, saved, copied: copied.includes('suggestion') && copied.includes('shorter') };
  })()`);
  assert.deepEqual(state, { noKind: { open: true, marked: false }, saved: { open: false, kind: 'suggestion' }, copied: true });
});

test('remark popover: a hint shows until a tag is picked, 1–4 pick a tag, and a closed popover keeps its draft', { skip: SKIP }, async () => {
  await load();
  const state = await evaluate(`(() => { ${PAGE_JS}
    const pop = document.querySelector('.am-remark-pop');
    const block = document.querySelector('#panel-B p');
    const need = () => !pop.querySelector('.am-remark-need').hidden;
    key('r'); block.click();
    const first = { need: need(), save: pop.querySelector('.am-remark-actions .am-btn').disabled };
    key('j'); const stayed = focused();
    key('3');
    const picked = { kind: pop.querySelector('[aria-pressed="true"]')?.dataset.kind, need: need(), inNote: document.activeElement === pop.querySelector('textarea') };
    pop.querySelector('textarea').value = 'why?';
    key('Escape', {}, pop.querySelector('textarea'));
    const closed = pop.hidden && !block.dataset.kind;
    block.click();
    const back = { kind: pop.querySelector('[aria-pressed="true"]')?.dataset.kind, note: pop.querySelector('textarea').value, need: need() };
    return { first, stayed, picked, closed, back };
  })()`);
  assert.deepEqual(state, {
    first: { need: true, save: true },
    stayed: '',
    picked: { kind: 'question', need: false, inNote: true },
    closed: true,
    back: { kind: 'question', note: 'why?', need: false },
  });
});

test('hotkeys: c opens the Reply once the focus has let go of a panel', { skip: SKIP }, async () => {
  await load();
  const state = await evaluate(`(() => { ${PAGE_JS}
    key('1'); key('1'); key('c');
    return { focus: focused(), reply: replyOpen(), comment: Boolean(document.activeElement?.closest('.am-comment')) };
  })()`);
  assert.deepEqual(state, { focus: '', reply: true, comment: false });
});

test('hotkeys: Esc lets go of the panel, and Esc in a Comment box first goes back to the panel', { skip: SKIP }, async () => {
  await load();
  const state = await evaluate(`(() => { ${PAGE_JS}
    key('2'); key('Escape'); const plain = focused();
    key('2'); key('c'); key('Escape'); const fromBox = focused();
    key('Escape'); const after = focused();
    key('c');
    return { plain, fromBox, after, reply: replyOpen() };
  })()`);
  assert.deepEqual(state, { plain: '', fromBox: 'panel-B', after: '', reply: true });
});
