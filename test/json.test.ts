import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isJsonObject,
  parseJson,
  readNumber,
  readString,
} from '../src/json.js';

test('parseJson reads objects and arrays', () => {
  const object = parseJson('{"ok":true,"count":2}');
  assert.equal(isJsonObject(object), true);
  if (!isJsonObject(object)) return;
  assert.equal(object.ok, true);
  assert.equal(readNumber(object, 'count'), 2);
  assert.equal(readString(object, 'missing'), undefined);

  const rows = parseJson('[{"id":"a"}]');
  assert.equal(Array.isArray(rows), true);
});

test('parseJson rejects non-json shapes after parse', () => {
  assert.throws(() => parseJson('undefined'));
  assert.throws(() => parseJson('{'));
});
