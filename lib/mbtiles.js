const fs = require('fs');
const path = require('path');
const url = require('url');
const qs = require('querystring');
const { Buffer } = require('buffer');
const sm = new (require('@mapbox/sphericalmercator'))();
const sqlite3 = require('sqlite3');
const tiletype = require('@mapbox/tiletype');


// MBTiles
// -------
// MBTiles class for doing common operations (schema setup, tile reading,
// insertion, etc.)

const GET_TILE_SQL = 'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';

class MBTiles {
  constructor(uri, callback) {
        if (typeof uri === 'string') {
            uri = url.parse(uri);
            uri.pathname = qs.unescape(uri.pathname);
        }

        if (!uri.pathname) {
            callback(new Error(`Invalid URI ${url.format(uri)}`));
            return;
        }

        if (uri.hostname === '.' || uri.hostname === '..') {
            uri.pathname = uri.hostname + uri.pathname;
            delete uri.hostname;
            delete uri.host;
        }

        const mbtiles = this;
        this.filename = uri.pathname;
        mbtiles._db = new sqlite3.Database(mbtiles.filename, sqlite3.OPEN_READONLY, err => {
            if (err) return callback(err);
            fs.stat(mbtiles.filename, (err, stat) => {
                if (err) return callback(err);
                mbtiles._stat = stat;
                mbtiles._lastModified = new Date(stat.mtime).toUTCString()
                mbtiles.open = true;
                callback(null, mbtiles);
            });
        });
    }

    // Select a tile from an mbtiles database. Scheme is XYZ.
    //
    // - @param {Number} z tile z coordinate.
    // - @param {Number} x tile x coordinate.
    // - @param {Number} y tile y coordinate.
    // - @param {Function(err, grid, headers)} callback
    getTile(z, x, y, callback) {
        if (typeof callback !== 'function') throw new Error('Callback needed');
        if (!this.open) return callback(new Error('MBTiles not yet loaded'));

        // Flip Y coordinate because MBTiles files are TMS.
        y = (1 << z) - 1 - y;

        const mbtiles = this;

        if (!this._sqlGetTile) {
          this._sqlGetTile = this._db.prepare(GET_TILE_SQL);
        }

        this._sqlGetTile.get(z, x, y, (err, row) => {
            if ((!err && !row) || (err && err.errno == 1)) {
                return callback(new Error('Tile does not exist'));
            } else if (err) {
                return callback(err);
            } else if (!row.tile_data || !Buffer.isBuffer(row.tile_data)) {
                let err = new Error('Tile is invalid');
                err.code = 'EINVALIDTILE';
                return callback(err);
            } else {
                const headers = tiletype.headers(row.tile_data);
                headers['Last-Modified'] = mbtiles._lastModified;
                return callback(null, row.tile_data, headers);
            }
        });
    }

    close(callback) {
        this._db.close(callback);
    }

    // Obtain metadata from the database. Performing fallback queries if certain
    // keys(like `bounds`, `minzoom`, `maxzoom`) have not been provided.
    //
    // - @param {Function(err, data)} callback
    getInfo(callback) {
        if (typeof callback !== 'function') throw new Error('Callback needed');
        if (!this.open) return callback(new Error('MBTiles not yet loaded'));
        if (this._info) return callback(null, this._info);

        const mbtiles = this;
        const info = {};
        info.basename = path.basename(mbtiles.filename);
        info.id = path.basename(mbtiles.filename, path.extname(mbtiles.filename));
        info.filesize = mbtiles._stat.size;
        mbtiles._db.all('SELECT name, value FROM metadata', (err, rows) => {
            if (err && err.errno !== 1) return callback(err);
            if (rows) rows.forEach(({name, value}) => {
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
                    ensureCenter(info, (err, info) => {
                        if (err) return callback(err);
                        mbtiles._info = info;
                        return callback(null, info);
                    });
                });
            });
        });

        function ensureZooms(info, callback) {
            if ('minzoom' in info && 'maxzoom' in info) return callback(null, info);
            let remaining = 30;
            const zooms = [];
            const query = mbtiles._db.prepare('SELECT zoom_level FROM tiles WHERE zoom_level = ? LIMIT 1', err => {
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
            mbtiles._db.get(
                'SELECT MAX(tile_column) AS maxx, ' +
                'MIN(tile_column) AS minx, MAX(tile_row) AS maxy, ' +
                'MIN(tile_row) AS miny FROM tiles ' +
                'WHERE zoom_level = ?',
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

        function ensureCenter(info, callback) {
            if ('center' in info) return callback(null, info);
            if (!('bounds' in info) || !('minzoom' in info) || !('maxzoom' in info)) return callback(null, info);
            const range = info.maxzoom - info.minzoom;
            info.center = [
                (info.bounds[2] - info.bounds[0]) / 2 + info.bounds[0],
                (info.bounds[3] - info.bounds[1]) / 2 + info.bounds[1],
                range <= 1 ? info.maxzoom : Math.floor(range * 0.5) + info.minzoom
            ];
            return callback(null, info);
        }
    }
}

module.exports = MBTiles;
