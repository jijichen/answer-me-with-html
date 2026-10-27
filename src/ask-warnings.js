// An ask multi with no * option shows the reader no suggestion. It warns so the draft gets fixed before the reader sees it.
// Always on: this is not a writing-style check. A single-choice ask with no * is an error in the ask component itself.

const ASK_OPTION_PICKED = /^\s*\*\s+\S/;

export const MULTI_MESSAGE = 'ask multi has no * option; mark the options you suggest with *';

// Every ask multi with no * option, in every panel; [{ line, component: 'ask', message }].
export function askWarnings(doc) {
  const out = [];
  for (const panel of doc.panels) {
    for (const ask of panel.blocks.filter((b) => b.type === 'fence' && b.lang === 'ask')) {
      const multi = /(^|\s)multi(\s|$)/.test(ask.args ?? '');
      if (multi && !ask.text.split('\n').some((l) => ASK_OPTION_PICKED.test(l))) out.push({ line: ask.line, component: 'ask', message: MULTI_MESSAGE });
    }
  }
  return out;
}
