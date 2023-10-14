const test = require('node:test');
const assert = require('node:assert/strict');
const MBTiles = require('..');

test('opens mbtiles file with spaces', function () {
  const mbtiles = new MBTiles(__dirname + '/fixtures/with spaces.mbtiles')
  const info = mbtiles.getInfo();
  assert.deepEqual(info.level1, { level2: 'property' });
  assert.deepEqual(info.custom, ['custom list']);
});
