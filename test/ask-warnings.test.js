// Ask warnings: an ask multi with no * option warns on render and on patch, holds the page from opening, and stays on with
// style: off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderDoc, RenderError } from '../src/render.js';
import { main } from '../src/cli.js';
import { MULTI_MESSAGE } from '../src/ask-warnings.js';

const FM = '---\ntitle: Report\nlang: en\n---\n';
const warningsOf = (body) => renderDoc(`${FM}${body}`).stats.askWarnings;
const MULTI = '```ask multi\nWhat do we log?\n- Retry\n- Give up\n```\n';

test('ask warnings: a table or list of choices outside an ask does not warn', () => {
  assert.deepEqual(warningsOf('## A Open decisions\n| # | Question | Options |\n|---|---|---|\n| 1 | Which cache? | Redis, Memcached |\n'), []);
});

test('ask warnings: ask multi with only - options warns at its fence line; with one * it does not', () => {
  assert.deepEqual(warningsOf('## A Logs\n```ask multi\nWhat do we log?\n- Retry\n- Give up\n```\n'), [{ line: 6, component: 'ask', message: MULTI_MESSAGE }]);
  assert.deepEqual(warningsOf('## A Logs\n```ask multi\nWhat do we log?\n* Retry\n- Give up\n```\n'), []);
});

test('ask warnings: a single-choice ask with no * stays a hard error with a correct example, not a warning', () => {
  assert.throws(() => renderDoc(`${FM}## A Cache\n\`\`\`ask\nWhich cache?\n- Redis\n- Memcached\n\`\`\`\n`), (err) => err instanceof RenderError
    && err.component === 'ask' && /mark exactly one option with \* as your suggestion \(found 0\)/.test(err.message) && Boolean(err.example));
});

test('ask warnings: style: off does not turn them off', () => {
  assert.equal(renderDoc(`---\ntitle: Report\nlang: en\nstyle: off\n---\n## A Logs\n${MULTI}`).stats.askWarnings.length, 1);
});

// The CLI in a fresh data directory, with an opener that records what it would open.
function cli(t) {
  const home = mkdtempSync(join(tmpdir(), 'am-ask-warn-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const opened = [];
  const call = async (args, stdin = '') => {
    let out = '';
    let err = '';
    const stdout = new Writable({ write(c, _e, cb) { out += c; cb(); } });
    const stderr = new Writable({ write(c, _e, cb) { err += c; cb(); } });
    const code = await main(args, { stdout, stderr, stdin: Readable.from([stdin]), env: { AM_HOME: home, AM_NO_UPDATE_CHECK: '1' }, cwd: home, open: (f) => opened.push(f) });
    return { code, out, err, file: out.match(/^✓ (.+\.html)$/m)?.[1] };
  };
  return { call, opened };
}

test('ask warnings: am render prints them and does not open the page', async (t) => {
  const { call, opened } = cli(t);
  const r = await call(['render', '-'], `${FM}## A Logs\n${MULTI}`);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes(`ask 1 warning`), r.out);
  assert.ok(r.out.includes(`L6 [ask] ${MULTI_MESSAGE}`), r.out);
  assert.ok(r.out.includes('Not opened because of the warnings'), r.out);
  assert.deepEqual(opened, []);
});

test('ask warnings: am patch with an ask multi with no * in the new panel warns', async (t) => {
  const { call } = cli(t);
  const first = await call(['render', '-', '--no-open'], `${FM}## A Summary\nThe cache works.\n\n## B Next\nShip it.\n`);
  assert.equal(first.code, 0, first.err);
  assert.doesNotMatch(first.out, /\[ask\]/);
  const r = await call(['patch', first.file, '--panel', 'B', '-', '--no-open'], `## B Next\n${MULTI}`);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes(`[ask] ${MULTI_MESSAGE}`), r.out);
});
