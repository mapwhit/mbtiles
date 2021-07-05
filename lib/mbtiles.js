const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const sm = new (require('@mapbox/sphericalmercator'))();
const sqlite3 = require('sqlite3');
const tiletype = require('@mapbox/tiletype');


const GET_TILE_SQL = 'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';

module.exports = mbTiles;

function mbTiles(filename, callback) {

  const self = {
    getTile,
    getInfo,
    close
  };
  const my = {
  };

  let sql = {
  };

  my.db = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, err => {
    if (err) return callback(err);
    fs.stat(filename, (err, stat) => {
      if (err) return callback(err);
      my.stat = stat;
      my.lastModified = new Date(stat.mtime).toUTCString()
      callback(null, self);
    });
  });

  return self;

  // Select a tile from an mbtiles database. Scheme is XYZ.
  //
  // - @param {Number} z tile z coordinate.
  // - @param {Number} x tile x coordinate.
  // - @param {Number} y tile y coordinate.
  // - @param {Function(err, grid, headers)} callback
  function getTile(z, x, y, callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!my.stat) return callback(new Error('MBTiles not yet loaded'));

    // Flip Y coordinate because MBTiles files are TMS.
    y = (1 << z) - 1 - y;

    if (!sql.getTile) {
      sql.getTile = my.db.prepare(GET_TILE_SQL);
    }

    sql.getTile.get(z, x, y, (err, row) => {
      if ((!err && !row) || (err && err.errno == 1)) {
        return callback(new Error('Tile does not exist'));
      }
      if (err) {
        return callback(err);
      }
      if (!row.tile_data || !Buffer.isBuffer(row.tile_data)) {
        let err = new Error('Tile is invalid');
        err.code = 'EINVALIDTILE';
        return callback(err);
      }

      const headers = tiletype.headers(row.tile_data);
      headers['Last-Modified'] = my.lastModified;
      return callback(null, row.tile_data, headers);
    });
  }

  function close(callback) {
    delete my.stat;
    delete my.info;
    my.db.close(callback);
  }

  // Obtain metadata from the database. Performing fallback queries if certain
  // keys(like `bounds`, `minzoom`, `maxzoom`) have not been provided.
  //
  // - @param {Function(err, data)} callback
  function getInfo(callback) {
    if (typeof callback !== 'function') throw new Error('Callback needed');
    if (!my.stat) return callback(new Error('MBTiles not yet loaded'));
    if (my.info) return callback(null, my.info);

    const info = {};
    info.basename = path.basename(filename);
    info.id = path.basename(filename, path.extname(filename));
    info.filesize = my.stat.size;
    my.db.all('SELECT name, value FROM metadata', (err, rows) => {
      if (err && err.errno !== 1) return callback(err);
      if (rows) rows.forEach(({ name, value }) => {
        switch (name) {
          // The special "json" key/value pair allows JSON to be serialized
          // and merged into the metadata of an MBTiles based source. This
          // enables nested properties and non-string datatypes to be
          // captured by the MBTiles metadata table.
          case 'json':
            try {
              const jsondata = JSON.parse(value);
              Object.keys(jsondata).reduce((memo, key) => {
                memo[key] = memo[key] || jsondata[key];
                return memo;
              }, info);
            }
            catch (err) { return callback(err); }
            break;
          case 'minzoom':
          case 'maxzoom':
            info[name] = parseInt(value, 10);
            break;
          case 'center':
          case 'bounds':
            info[name] = value.split(',').map(parseFloat);
            break;
          default:
            info[name] = value;
            break;
        }
      });

      // Guarantee that we always return proper schema type, even if 'tms' is specified in metadata
      info.scheme = 'xyz';

      ensureZooms(info, (err, info) => {
        if (err) return callback(err);
        ensureBounds(info, (err, info) => {
          if (err) return callback(err);
          ensureCenter(info);
          return callback(null, info);
        });
      });
    });

    function ensureZooms(info, callback) {
      if ('minzoom' in info && 'maxzoom' in info) return callback(null, info);
      let remaining = 30;
      const zooms = [];
      const query = my.db.prepare('SELECT zoom_level FROM tiles WHERE zoom_level = ? LIMIT 1', err => {
        if (err) return callback(err.errno === 1 ? null : err, info);

        function done(err, info) {
          if (done.sent) return;
          callback(err, info);
          done.sent = true;
        }

        done.sent = false;

        for (let i = 0; i < remaining; i++) {
          query.get(i, (err, row) => {
            if (err) return done(err);
            if (row) zooms.push(row.zoom_level);
            if (--remaining === 0) {
              if (!zooms.length) return callback(null, info);
              zooms.sort((a, b) => { return a < b ? -1 : 1; });
              info.minzoom = zooms[0];
              info.maxzoom = zooms.pop();
              return done(null, info);
            }
          });
        }

        query.finalize();
      });
    }

    function ensureBounds(info, callback) {
      if ('bounds' in info) return callback(null, info);
      if (!('minzoom' in info)) return callback(null, info);
      my.db.get(
        `
        SELECT
          MAX(tile_column) AS maxx MIN(tile_column) AS minx,
          MAX(tile_row) AS maxy MIN(tile_row) AS miny
        FROM tiles
        WHERE zoom_level = ?
        `,
        info.minzoom,
        (err, row) => {
          if (err) return callback(err);
          if (!row) return callback(null, info);

          // @TODO this breaks a little at zoom level zero
          const urTile = sm.bbox(row.maxx, row.maxy, info.minzoom, true);
          const llTile = sm.bbox(row.minx, row.miny, info.minzoom, true);
          // @TODO bounds are limited to "sensible" values here
          // as sometimes tilesets are rendered with "negative"
          // and/or other extremity tiles. Revisit this if there
          // are actual use cases for out-of-bounds bounds.
          info.bounds = [
            llTile[0] > -180 ? llTile[0] : -180,
            llTile[1] > -90 ? llTile[1] : -90,
            urTile[2] < 180 ? urTile[2] : 180,
            urTile[3] < 90 ? urTile[3] : 90
          ];
          return callback(null, info);
        });
    }

    function ensureCenter(info) {
      if ('center' in info) return;
      if (!('bounds' in info) || !('minzoom' in info) || !('maxzoom' in info)) return;
      const range = info.maxzoom - info.minzoom;
      info.center = [
        (info.bounds[2] - info.bounds[0]) / 2 + info.bounds[0],
        (info.bounds[3] - info.bounds[1]) / 2 + info.bounds[1],
        range <= 1 ? info.maxzoom : Math.floor(range * 0.5) + info.minzoom
      ];
    }
  }
}
