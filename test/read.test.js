const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const MBTiles = require('..');

const fixtures = {
  plain_1: `${__dirname}/fixtures/plain_1.mbtiles`,
  plain_2: `${__dirname}/fixtures/plain_2.mbtiles`,
  plain_3: `${__dirname}/fixtures/plain_3.mbtiles`,
  plain_4: `${__dirname}/fixtures/plain_4.mbtiles`,
  corrupt: `${__dirname}/fixtures/corrupt.mbtiles`,
  corrupt_null_tile: `${__dirname}/fixtures/corrupt_null_tile.mbtiles`
};

function assertError(err, msg) {
  assert.ok(err, msg);
  const re = new RegExp(`^${msg}`, "i");
  assert.match(err.message, re);
}

const loaded = {};

Object.keys(fixtures).forEach(key => {
  loaded[key] = new MBTiles(fixtures[key]);
});

fs.readdirSync(`${__dirname}/fixtures/images/`).forEach(file => {
  let coords = file.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/);
  if (!coords) return;

  // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
  coords = [coords[3], coords[1], coords[2]];
  coords[2] = 2 ** coords[0] - 1 - coords[2];
  test(`tile ${coords.join('/')}`, () => {
    const { tile, headers, error } = loaded.plain_1.getTile(coords[0] | 0, coords[1] | 0, coords[2] | 0);
    assert.ifError(error);
    assert.deepEqual(tile, fs.readFileSync(`${__dirname}/fixtures/images/${file}`));
    assert.equal(headers['Content-Type'], 'image/png');
    assert.ok(!Number.isNaN(Date.parse(headers['Last-Modified'])));
  });
});

[[0, 1, 0],
[-1, 0, 0],
[0, 0, 1],
[3, 1, -1],
[2, -3, 3],
[18, 2, 262140],
[4, 0, 15]
].forEach(coords => {
  test(`tile ${coords.join('/')}`, () => {
    const { error } = loaded.plain_1.getTile(coords[0], coords[1], coords[2]);
    assertError(error, 'Tile does not exist');
  });
});

[[0, 1, 0],
[-1, 0, 0],
[0, 0, -1],
[3, 1, 8],
[2, -3, 0],
[18, 2, 3],
[4, 0, 0],
[4, 3, 8],
[4, 4, 8],
[4, 5, 8],
[4, 13, 4],
[4, 0, 14],
[3, 0, 7],
[3, 6, 2]
].forEach(coords => {
  test(`corrupt ${coords.join('/')}`, () => {
    const { error } = loaded.corrupt.getTile(coords[0], coords[1], coords[2]);
    assertError(error, 'database disk image is malformed');
  });
});

test('corrupt null tile', () => {
  const { error } = loaded.corrupt_null_tile.getTile(1, 0, 1);
  assertError(error, 'Tile is invalid');
});
