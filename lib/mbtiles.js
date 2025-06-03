const fs = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');
const { DatabaseSync } = require('node:sqlite');
const {
  ensureZooms,
  ensureBounds,
  ensureCenter,
  headersFromMetadata,
  headersFromTile
} = require('./metadata');

module.exports = mbTiles;

function mbTiles(filename) {
  const stat = fs.statSync(filename);
  const my = {
    db: new DatabaseSync(filename, {
      readonly: true
    }),
    lastModified: new Date(stat.mtime).toUTCString()
  };
  let sqlGetTile;

  return {
    getTile(z, x, y) {
      try {
        return getTile(z, x, y);
      } catch (error) {
        return { error };
      }
    },
    getInfo,
    close
  };

  /**
   * Select a tile from an mbtiles database. Scheme is XYZ.
   *
   * @param {Number} z tile z coordinate.
   * @param {Number} x tile x coordinate.
   * @param {Number} y tile y coordinate.
   */
  function getTile(z, x, y) {
    // Flip Y coordinate because MBTiles files are TMS.
    const r = (1 << z) - 1 - y;
    sqlGetTile ??= my.db.prepare(
      'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?'
    );
    const row = sqlGetTile.get(z, x, r);
    if (!row) {
      throw new Error('Tile does not exist');
    }
    const tile = row.tile_data;
    if (!(tile instanceof Uint8Array)) {
      const error = new Error('Tile is invalid');
      error.code = 'EINVALIDTILE';
      throw error;
    }

    return {
      tile,
      headers: getHeaders(tile)
    };
  }

  function getHeaders(tile) {
    if (my.headers) {
      return my.headers;
    }
    if (my.headers === false) {
      // calculate headers for every tile
      return headersFromTile(tile, my.lastModified);
    }
    // try calculating headers from metadata
    const headers = headersFromMetadata(getInfo(), my.lastModified);
    if (!headers) {
      // fallback to calculating headers for every tile
      my.headers = false;
      return headersFromTile(tile, my.lastModified);
    }
    return (my.headers = headers);
  }

  function close() {
    delete my.info;
    delete my.lastModified;
    delete my.headers;
    sqlGetTile = null;
    my.db.close();
  }

  function getInfo() {
    if (!my.info) {
      my.info = prepareInfo(my.db, filename, stat);
    }
    return my.info;
  }
}

/**
 * Obtain metadata from the database. Performing fallback queries.
 * If certain keys(like `bounds`, `minzoom`, `maxzoom`) have not been provided.
 *
 * @param {Database} db database instance
 * @param {String} filename mbtiles file path
 * @param {fs.Stats} stat
 * @returns {Object} metadata
 */
function prepareInfo(db, filename, stat) {
  const info = {
    basename: path.basename(filename),
    id: path.basename(filename, path.extname(filename)),
    filesize: stat.size
  };
  const rows = db.prepare('SELECT name, value FROM metadata').all();

  for (const { name, value } of rows) {
    switch (name) {
      // The special "json" key/value pair allows JSON to be serialized
      // and merged into the metadata of an MBTiles based source. This
      // enables nested properties and non-string datatypes to be
      // captured by the MBTiles metadata table.
      case 'json': {
        const jsondata = JSON.parse(value);
        for (const [key, value] of Object.entries(jsondata)) {
          info[key] ??= value;
        }
        break;
      }
      case 'minzoom':
      case 'maxzoom':
        info[name] = Number.parseInt(value, 10);
        break;
      case 'center':
      case 'bounds':
        info[name] = value.split(',').map(Number.parseFloat);
        break;
      default:
        info[name] = value;
        break;
    }
  }

  // Guarantee that we always return proper schema type, even if 'tms' is specified in metadata
  info.scheme = 'xyz';

  ensureZooms(db, info);
  ensureBounds(db, info);
  ensureCenter(info);
  return info;
}
