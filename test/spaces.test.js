const tape = require('tape');
const MBTiles = require('..');

tape('opens mbtiles file with spaces', function (assert) {
  const mbtiles = new MBTiles(__dirname + '/fixtures/with spaces.mbtiles')
  const info = mbtiles.getInfo();
  assert.deepEqual(info.level1, { level2: 'property' });
  assert.deepEqual(info.custom, ['custom list']);
  assert.end();
});
