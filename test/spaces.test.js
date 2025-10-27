import test from 'node:test';
import MBTiles from '../lib/mbtiles.js';

test('opens mbtiles file with spaces', t => {
  const mbtiles = new MBTiles(
    import.meta.dirname + '/fixtures/with spaces.mbtiles'
  );
  const info = mbtiles.getInfo();
  t.assert.deepEqual(info.level1, { level2: 'property' });
  t.assert.deepEqual(info.custom, ['custom list']);
});
