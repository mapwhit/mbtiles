const test = require('node:test');
const MBTiles = require('..');

test('get metadata', t => {
  const mbtiles = new MBTiles(`${__dirname}/fixtures/plain_1.mbtiles`);
  const data = mbtiles.getInfo();

  t.assert.deepEqual(
    {
      name: 'plain_1',
      description: 'demo description',
      version: '1.0.3',
      scheme: 'xyz',
      minzoom: 0,
      maxzoom: 4,
      formatter: null,
      center: [0, 7.500000001278025, 2],
      bounds: [
        -179.9999999749438, -69.99999999526695, 179.9999999749438,
        84.99999999782301
      ],
      // Test that json data is merged in.
      level1: { level2: 'property' },
      // These aren't part of TileJSON, but exist in an MBTiles file.
      filesize: 561152,
      type: 'baselayer',
      id: 'plain_1',
      basename: 'plain_1.mbtiles'
    },
    data
  );
});

test('get metadata 4', t => {
  const mbtiles = new MBTiles(`${__dirname}/fixtures/plain_4.mbtiles`);
  const data = mbtiles.getInfo();

  t.assert.deepEqual(
    {
      name: 'plain_2',
      description: '',
      version: '1.0.0',
      scheme: 'xyz',
      minzoom: 0,
      maxzoom: 4,
      formatter:
        "function(options, data) { if (options.format === 'full') { return '' + data.NAME + ' (Population: ' + data.POP2005 + ')'; } else { return '' + data.NAME + ''; } }",
      center: [0, 5.0000000006793215, 2],
      bounds: [
        -179.9999999749438, -69.99999999526695, 179.9999999749438,
        79.99999999662558
      ],
      filesize: 684032,
      type: 'baselayer',
      id: 'plain_4',
      basename: 'plain_4.mbtiles'
    },
    data
  );
});
