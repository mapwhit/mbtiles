const test = require('node:test');
const MBTiles = require('..');

test('opens mbtiles file with spaces', t => {
  const mbtiles = new MBTiles(__dirname + '/fixtures/with spaces.mbtiles');
  const info = mbtiles.getInfo();
  t.assert.deepEqual(info.level1, { level2: 'property' });
  t.assert.deepEqual(info.custom, ['custom list']);
});
