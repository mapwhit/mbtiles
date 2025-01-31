const SphericalMercator = require('@mapbox/sphericalmercator');
const tiletype = require('@mapbox/tiletype');

const sm = new SphericalMercator();

module.exports = {
  ensureZooms,
  ensureBounds,
  ensureCenter,
  headersFromMetadata,
  headersFromTile
};

const MAX_ZOOM = 30;

function ensureZooms(db, info) {
  if ('minzoom' in info && 'maxzoom' in info) return;
  const query = db.prepare(
    'SELECT zoom_level FROM tiles WHERE zoom_level = ? LIMIT 1'
  );

  let min = Number.MAX_SAFE_INTEGER;
  let max = Number.MIN_SAFE_INTEGER;
  for (let i = 0; i < MAX_ZOOM; i++) {
    const row = query.get(i);
    if (!row) continue;
    const zoom = row.zoom_level;
    if (zoom < min) min = zoom;
    if (zoom > max) max = zoom;
  }

  if (min <= max) {
    info.minzoom = min;
    info.maxzoom = max;
  }
}

function ensureBounds(db, info) {
  if ('bounds' in info) return;
  if (!('minzoom' in info)) return;
  const row = db
    .prepare(`
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
  if (!('bounds' in info) || !('minzoom' in info) || !('maxzoom' in info))
    return;
  const range = info.maxzoom - info.minzoom;
  info.center = [
    (info.bounds[2] - info.bounds[0]) / 2 + info.bounds[0],
    (info.bounds[3] - info.bounds[1]) / 2 + info.bounds[1],
    range <= 1 ? info.maxzoom : Math.floor(range * 0.5) + info.minzoom
  ];
}

/**
 * Tries for build headers from mbtiles metadata.
 *
 * @see https://github.com/mapbox/mbtiles-spec/blob/master/1.3/spec.md#content
 * @param {Object} info
 * @returns headers
 */
function headersFromMetadata(info, lastModified) {
  const { format, compression } = info;
  if (!format) return;
  switch (format) {
    case 'pbf':
      return {
        'Content-Type': 'application/x-protobuf',
        'Content-Encoding': compression ?? 'gzip',
        'Last-Modified': lastModified
      };
    case 'jpg':
      return {
        'Content-Type': 'image/jpeg',
        'Last-Modified': lastModified
      };
    case 'png':
      return {
        'Content-Type': 'image/png',
        'Last-Modified': lastModified
      };
    case 'webp':
      return {
        'Content-Type': 'image/webp',
        'Last-Modified': lastModified
      };
    default:
      return {
        'Content-Type': format,
        'Last-Modified': lastModified
      };
  }
}

function headersFromTile(tile, lastModified) {
  return {
    ...tiletype.headers(tile),
    'Last-Modified': lastModified
  };
}
