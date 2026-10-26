// Dependency-free checks for the response parser. Run: npm test
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost';
const assert = require('assert');
const { parseResponse } = require('../lib/agent');

const ok = (raw, expected) => assert.deepStrictEqual(parseResponse(raw), expected);
const bad = (raw) => assert.strictEqual(parseResponse(raw), null);

ok('{"notes":[]}', []);
ok('{"notes":[{"visible":true,"content":"hi"}]}', [{ visible: true, content: 'hi' }]);
ok('```json\n{"notes":[{"visible":false,"content":" x "}]}\n```', [{ visible: false, content: 'x' }]);
ok('{"notes":[{"visible":true,"content":"   "}]}', []);

bad('');
bad('sure! {"notes":[]}');
bad('{"notes":"no"}');
bad('{"notes":[{"visible":"yes","content":"hi"}]}');
bad('{"notes":[{"visible":true}]}');
bad('{"notes":[{"visible":true,"content":"cut off');
bad(undefined);

console.log('parse tests passed');
