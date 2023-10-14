const test = require('node:test');
const assert = require('node:assert/strict');
const MBTiles = require('..');

const fixtures = {
  plain_1: `${__dirname}/fixtures/plain_1.mbtiles`,
};

test('get metadata', function () {
  const mbtiles = new MBTiles(fixtures.plain_1);
  const data = mbtiles.getInfo();

  assert.deepEqual({
    name: 'plain_1',
    description: 'demo description',
    version: '1.0.3',
    scheme: 'xyz',
    minzoom: 0,
    maxzoom: 4,
    formatter: null,
    center: [0, 7.500000001278025, 2],
    bounds: [-179.9999999749438, -69.99999999526695, 179.9999999749438, 84.99999999782301],
    // Test that json data is merged in.
    level1: { level2: 'property' },
    // These aren't part of TileJSON, but exist in an MBTiles file.
    filesize: 561152,
    type: 'baselayer',
    id: 'plain_1',
    basename: 'plain_1.mbtiles'
  }, data);
});
