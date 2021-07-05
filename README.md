# mbtiles

This is a fork of [@mapbox/mbtiles].

It only provides sync and read-only subset of API.
It is using [better-sqllite3] instead of [sqllite3].

# Installation

```
npm install @mapwhit/mbtiles
```

```javascript
const MBTiles = require('@mapwhit/mbtiles');
```

# API

### Constructor

All MBTiles instances need to be constructed before any of the methods become available. *NOTE: All methods described below assume you've taken this step.*

```javascript
const mbtiles = new MBTiles('./path/to/file.mbtiles');
console.log(mbtiles) // mbtiles object with methods listed below
```

### Reading

**`getTile(z, x, y)`**

Get an individual tile from the MBTiles table. This can be a raster or gzipped vector tile. Also returns headers that are important for serving over HTTP.

```javascript
const { error, tile, headers } = mbtiles.getTile(z, x, y);
// `tile` is your gzipped buffer - use zlib to gunzip or inflate
```

**`getInfo()`**

Get info of an MBTiles file, which is stored in the `metadata` table. Includes information like zoom levels, bounds, vector_layers, that were created during generation. This performs fallback queries if certain keys like `bounds`, `minzoom`, or `maxzoom` have not been provided.

```javascript
const info = mbtiles.getInfo();
```

# Test

```
npm test
```

[@mapbox/mbtiles]: https://github.com/mapbox/node-mbtiles
[better-sqllite3]: http://github.com/JoshuaWise/better-sqlite3
[sqllite3]: https://github.com/mapbox/node-sqlite3

