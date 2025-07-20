const test = require('node:test');
const Database = require('better-sqlite3');
const { ensureZooms, ensureBounds, ensureCenter } = require('../lib/metadata');

test('metadata ensureZooms', async t => {
  let db;

  t.before(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE tiles (
        zoom_level INTEGER,
        tile_column INTEGER,
        tile_row INTEGER
      );
    `);
  });

  await t.test('should set minzoom and maxzoom if not present in info', () => {
    db.exec(`
        INSERT INTO tiles (zoom_level, tile_column, tile_row) VALUES
        (0, 0, 0),
        (1, 0, 0),
        (7, 0, 0),
        (2, 1, 1);
      `);

    const info = {};
    ensureZooms(db, info);
    t.assert.strictEqual(info.minzoom, 0);
    t.assert.strictEqual(info.maxzoom, 7);
  });

  await t.test(
    'should not overwrite existing minzoom and maxzoom in info',
    () => {
      const info = { minzoom: 1, maxzoom: 2 };
      ensureZooms(db, info);
      t.assert.strictEqual(info.minzoom, 1);
      t.assert.strictEqual(info.maxzoom, 2);
    }
  );
});

test('metadata ensureBounds', async t => {
  let db;

  t.before(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE tiles (
        zoom_level INTEGER,
        tile_column INTEGER,
        tile_row INTEGER
      );
    `);
  });

  await t.test('should set bounds if not present in info', () => {
    db.exec(`
        INSERT INTO tiles (zoom_level, tile_column, tile_row) VALUES
        (0, 0, 0),
        (0, 1, 1),
        (0, 2, 2),
        (0, 3, 3);
      `);

    const info = { minzoom: 0 };
    ensureBounds(db, info);
    t.assert.equal(info.bounds.length, 4);
    t.assert.ok(info.bounds[0] >= -180);
    t.assert.ok(info.bounds[1] >= -90);
    t.assert.ok(info.bounds[2] <= 180);
    t.assert.ok(info.bounds[3] <= 90);
  });

  await t.test('should not overwrite existing bounds in info', () => {
    const info = { minzoom: 0, bounds: [1, 2, 3, 4] };
    ensureBounds(db, info);
    t.assert.deepEqual(info.bounds, [1, 2, 3, 4]);
  });
});

test('metadata ensureCenter', async t => {
  await t.test('should set center if not present in info', () => {
    const info = { bounds: [-180, -90, 180, 90], minzoom: 0, maxzoom: 7 };
    ensureCenter(info);
    t.assert.deepEqual(info.center, [0, 0, 3]);
  });

  await t.test('should not set center if zoom levels missing', () => {
    const info = { bounds: [-180, -90, 180, 90] };
    ensureCenter(info);
    t.assert.equal('center' in info, false);
  });

  await t.test('should not overwrite existing center in info', () => {
    const info = { bounds: [-180, -90, 180, 90], center: [1, 2, 3] };
    ensureCenter(info);
    t.assert.deepEqual(info.center, [1, 2, 3]);
  });
});
