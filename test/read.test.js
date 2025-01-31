const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mbtiles = require('..');

test('plain_1 valid tiles', async t => {
  let plain_1;
  t.before(() => {
    plain_1 = load('plain_1');
  });
  const files = fs.readdirSync(`${__dirname}/fixtures/images/`);

  for (const file of files) {
    let coords = file.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/);
    if (!coords) return;

    // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
    coords = [coords[3], coords[1], coords[2]];
    coords[2] = 2 ** coords[0] - 1 - coords[2];
    await t.test(`tile ${coords.join('/')}`, () => {
      const { tile, headers, error } = plain_1.getTile(
        coords[0] | 0,
        coords[1] | 0,
        coords[2] | 0
      );
      assert.ifError(error);
      assert.deepEqual(
        tile,
        fs.readFileSync(`${__dirname}/fixtures/images/${file}`)
      );
      assert.equal(headers['Content-Type'], 'image/png');
      assert.ok(!Number.isNaN(Date.parse(headers['Last-Modified'])));
    });
  }
});

test('plain_1 missing tiles', async t => {
  let plain_1;
  t.before(() => {
    plain_1 = load('plain_1');
  });
  const tiles = [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [3, 1, -1],
    [2, -3, 3],
    [18, 2, 262140],
    [4, 0, 15]
  ];
  for (const coords of tiles) {
    await t.test(`tile ${coords.join('/')}`, () => {
      const { error } = plain_1.getTile(coords[0], coords[1], coords[2]);
      assertError(error, 'Tile does not exist');
    });
  }
});

test('corrupt', async t => {
  let corrupt;
  t.before(() => {
    corrupt = load('corrupt');
  });

  const tiles = [
    [0, 1, 0],
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
  ];
  for (const coords of tiles) {
    await t.test(`corrupt ${coords.join('/')}`, () => {
      const { error } = corrupt.getTile(coords[0], coords[1], coords[2]);
      assertError(error, 'database disk image is malformed');
    });
  }
});

test('corrupt null tile', () => {
  const { error } = load('corrupt_null_tile').getTile(1, 0, 1);
  assertError(error, 'Tile is invalid');
});

function assertError(err, msg) {
  assert.ok(err, msg);
  const re = new RegExp(`^${msg}`, 'i');
  assert.match(err.message, re);
}

function load(key) {
  const filename = path.resolve(__dirname, './fixtures', `${key}.mbtiles`);
  console.log(filename);
  return mbtiles(filename);
}
