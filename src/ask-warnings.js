// An ask multi with no * option shows the reader no suggestion. It warns so the draft gets fixed before the reader sees it.
// Always on: this is not a writing-style check. A single-choice ask with no * is an error in the ask component itself.

import { readAsk } from './components/ask.js';

// True when the ask marks an option with *, read by the ask component's own parser, so the warning follows its syntax: a * line
// inside a preview is the preview's content, not an option. An ask the parser rejects counts as picked: the render already
// reports it as an error, and a second message about it would only add noise.
const hasPick = (text) => {
  try {
    return readAsk(text).options.some((o) => o.suggested);
  } catch {
    return true;
  }
};

export const MULTI_MESSAGE = 'ask multi has no * option; mark the options you suggest with *';

// Every ask multi with no * option, in every panel; [{ line, component: 'ask', message }].
export function askWarnings(doc) {
  const out = [];
  for (const panel of doc.panels) {
    for (const ask of panel.blocks.filter((b) => b.type === 'fence' && b.lang === 'ask')) {
      const multi = /(^|\s)multi(\s|$)/.test(ask.args ?? '');
      if (multi && !hasPick(ask.text)) out.push({ line: ask.line, component: 'ask', message: MULTI_MESSAGE });
    }
  }
  return out;
}
