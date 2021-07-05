const fs = require('fs');
const MBTiles = require('..');
const tape = require('tape');

const fixtures = {
  plain_1: `${__dirname}/fixtures/plain_1.mbtiles`,
  plain_2: `${__dirname}/fixtures/plain_2.mbtiles`,
  plain_3: `${__dirname}/fixtures/plain_3.mbtiles`,
  plain_4: `${__dirname}/fixtures/plain_4.mbtiles`,
  corrupt: `${__dirname}/fixtures/corrupt.mbtiles`,
  corrupt_null_tile: `${__dirname}/fixtures/corrupt_null_tile.mbtiles`
};

function assertError(assert, err, msg) {
  assert.ok(err, msg);
  const re = new RegExp(`^${msg}`, "i");
  assert.ok(err.message.match(re));
}

const loaded = {};

tape('setup', assert => {
  Object.keys(fixtures).forEach(key => {
    loaded[key] = new MBTiles(fixtures[key]);
  });
  assert.end();
});

fs.readdirSync(`${__dirname}/fixtures/images/`).forEach(file => {
  let coords = file.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/);
  if (!coords) return;

  // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
  coords = [coords[3], coords[1], coords[2]];
  coords[2] = 2 ** coords[0] - 1 - coords[2];
  tape(`tile ${coords.join('/')}`, assert => {
    const { tile, headers, error } = loaded.plain_1.getTile(coords[0] | 0, coords[1] | 0, coords[2] | 0);
    assert.ifError(error);
    assert.deepEqual(tile, fs.readFileSync(`${__dirname}/fixtures/images/${file}`));
    assert.equal(headers['Content-Type'], 'image/png');
    assert.ok(!isNaN(Date.parse(headers['Last-Modified'])));
    assert.end();
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
  tape(`tile ${coords.join('/')}`, assert => {
    const { error } = loaded.plain_1.getTile(coords[0], coords[1], coords[2]);
    assertError(assert, error, 'Tile does not exist');
    assert.end();
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
  tape(`corrupt ${coords.join('/')}`, assert => {
    const { error } = loaded.corrupt.getTile(coords[0], coords[1], coords[2]);
    assertError(assert, error, 'database disk image is malformed');
    assert.end();
  });
});

tape('corrupt null tile', assert => {
  const { error } = loaded.corrupt_null_tile.getTile(1, 0, 1);
  assertError(assert, error, 'Tile is invalid');
  assert.end();
});
