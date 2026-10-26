// Checks for the code-enforced loop guards. Run: npm test
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost';
const assert = require('assert');
const { applyGuards, buildPrompt } = require('../lib/agent');

const NOW = 1_000_000_000_000;
let idx = 0;
const entry = (author, content, visible, ago = 1000) => ({
  index: ++idx,
  content,
  properties: {
    tags: visible ? ['orca-note', 'orca-thread'] : ['orca-note'],
    metadata: { author, time: NOW - ago },
  },
});
const note = (content, visible = true) => ({ visible, content });
const contents = (notes) => notes.map((n) => n.content);

// Unanswered cap: three botman messages after the user -> visible notes dropped, hidden kept.
let log3 = [entry('user', 'hi', true, 9000), entry('botman', 'one one one one', true, 3000),
  entry('botman', 'two two two two', true, 2000), entry('botman', 'three three three three', true, 1000)];
assert.deepStrictEqual(contents(applyGuards([note('something new entirely here'), note('plan', false)], log3, NOW)), ['plan']);

// ...but the cap lifts after UNANSWERED_RESET_MS of silence.
const old = log3.map((o) => ({ ...o, properties: { ...o.properties, metadata: { ...o.properties.metadata, time: NOW - 3_600_000 } } }));
assert.deepStrictEqual(contents(applyGuards([note('a fresh thought about bridges')], old, NOW)), ['a fresh thought about bridges']);

// A user reply resets the count.
const replied = [...log3, entry('user', 'ok', true, 500)];
assert.strictEqual(applyGuards([note('answering you now')], replied, NOW).length, 1);

// The cap also holds within a single cycle.
const two = [entry('user', 'yo', true, 9000), entry('botman', 'first message here ok', true, 2000), entry('botman', 'second message here ok', true, 1000)];
assert.strictEqual(applyGuards([note('third thing to say'), note('fourth thing to say')], two, NOW).length, 1);

// Duplicates (exact, punctuation/case, and high word overlap) are dropped; different notes are kept.
const dup = [entry('user', 'hello', true, 9000), entry('botman', 'What does your typical day look like?', true, 8000)];
assert.strictEqual(applyGuards([note('what does your typical day look like')], dup, NOW).length, 0);
assert.strictEqual(applyGuards([note('What does your typical day actually look like?')], dup, NOW).length, 0);
assert.strictEqual(applyGuards([note('Do you prefer mountains or oceans?')], dup, NOW).length, 1);
assert.strictEqual(applyGuards([note('same same same same'), note('Same same same same!')], [], NOW).length, 1);

// Hidden and visible duplicates are tracked separately.
const mixed = [entry('botman', 'thinking about the weather today', false, 5000)];
assert.strictEqual(applyGuards([note('thinking about the weather today', true)], mixed, NOW).length, 1);
assert.strictEqual(applyGuards([note('thinking about the weather today', false)], mixed, NOW).length, 0);

// The prompt reports the pending state.
assert.match(buildPrompt(log3, NOW), /3 of 3 allowed/);
assert.match(buildPrompt(log3, NOW), /discarded until the user replies/);
assert.match(buildPrompt([], NOW), /very beginning/);

console.log('guard tests passed');
