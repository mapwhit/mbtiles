const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const sm = new (require('@mapbox/sphericalmercator'))();
const Database = require('better-sqlite3');
const tiletype = require('@mapbox/tiletype');


const GET_TILE_SQL = 'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';

module.exports = mbTiles;

function mbTiles(filename) {

  const self = {
    getTile,
    getInfo,
    close
  };
  const my = {
  };

  let sql = {
  };

  my.db = new Database(filename, {
    readonly: true,
    fileMustExist: true
  });
  my.stat = fs.statSync(filename);
  my.lastModified = new Date(my.stat.mtime).toUTCString();

  return self;

  // Select a tile from an mbtiles database. Scheme is XYZ.
  //
  // - @param {Number} z tile z coordinate.
  // - @param {Number} x tile x coordinate.
  // - @param {Number} y tile y coordinate.
  // - @param {Function(err, grid, headers)} callback
  function getTile(z, x, y) {
    if (!my.stat) return { error: new Error('MBTiles not yet loaded') };

    // Flip Y coordinate because MBTiles files are TMS.
    y = (1 << z) - 1 - y;

    try {
      if (!sql.getTile) {
        sql.getTile = my.db.prepare(GET_TILE_SQL);
      }

      const row = sql.getTile.get(z, x, y);
      if (!row) {
        throw new Error('Tile does not exist');
      }
      if (!row.tile_data || !Buffer.isBuffer(row.tile_data)) {
        const error = new Error('Tile is invalid');
        error.code = 'EINVALIDTILE';
        throw error;
      }

      const headers = tiletype.headers(row.tile_data);
      headers['Last-Modified'] = my.lastModified;
      return {
        tile: row.tile_data,
        headers
      };
    } catch (error) {
      return { error };
    }
  }

  function close() {
    delete my.stat;
    delete my.info;
    my.db.close();
  }

  // Obtain metadata from the database. Performing fallback queries if certain
  // keys(like `bounds`, `minzoom`, `maxzoom`) have not been provided.
  //
  // - @param {Function(err, data)} callback
  function getInfo() {
    if (!my.stat) throw new Error('MBTiles not yet loaded');
    if (my.info) return my.info;

    const info = {};
    info.basename = path.basename(filename);
    info.id = path.basename(filename, path.extname(filename));
    info.filesize = my.stat.size;
    const rows = my.db.prepare('SELECT name, value FROM metadata').all();
    if (rows) rows.forEach(({ name, value }) => {
      switch (name) {
        // The special "json" key/value pair allows JSON to be serialized
        // and merged into the metadata of an MBTiles based source. This
        // enables nested properties and non-string datatypes to be
        // captured by the MBTiles metadata table.
        case 'json':
          const jsondata = JSON.parse(value);
          Object.keys(jsondata).reduce((memo, key) => {
            memo[key] = memo[key] || jsondata[key];
            return memo;
          }, info);
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

    ensureZooms(info);
    ensureBounds(info);
    ensureCenter(info);
    return info;

    function ensureZooms(info) {
      if ('minzoom' in info && 'maxzoom' in info) return;
      let remaining = 30;
      const zooms = [];
      const query = my.db.prepare('SELECT zoom_level FROM tiles WHERE zoom_level = ? LIMIT 1');

      for (let i = 0; i < remaining; i++) {
        const row = query.get(i);
        if (row) zooms.push(row.zoom_level);
      }

      if (zooms.length) {
        zooms.sort((a, b) => { return a < b ? -1 : 1; });
        info.minzoom = zooms[0];
        info.maxzoom = zooms.pop();
      }

    }

    function ensureBounds(info) {
      if ('bounds' in info) return;
      if (!('minzoom' in info)) return;
      const row = my.db.prepare(`
        SELECT
          MAX(tile_column) AS maxx,
          MIN(tile_column) AS minx,
          MAX(tile_row) AS maxy,
          MIN(tile_row) AS miny
        FROM tiles
        WHERE zoom_level = ?`)
        .get(info.minzoom);
      if (!row) return;

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
