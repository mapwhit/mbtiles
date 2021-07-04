require('sqlite3').verbose();

var fs = require('fs');
var tape = require('tape');
var MBTiles = require('..');
var fixtures = {
    plain_1: __dirname + '/fixtures/plain_1.mbtiles',
    empty: __dirname + '/fixtures/empty.mbtiles'
};

try { fs.unlinkSync(fixtures.empty); } catch (err) {}

tape('get metadata', function(assert) {
    new MBTiles(fixtures.plain_1, function(err, mbtiles) {
        assert.ifError(err);

        mbtiles.getInfo(function(err, data) {
            assert.ifError(err);

            assert.deepEqual({
                name: 'plain_1',
                description: 'demo description',
                version: '1.0.3',
                scheme: 'xyz',
                minzoom: 0,
                maxzoom: 4,
                formatter: null,
                center: [ 0, 7.500000001278025, 2 ],
                bounds: [ -179.9999999749438, -69.99999999526695, 179.9999999749438, 84.99999999782301 ],
                // Test that json data is merged in.
                level1: { level2: 'property' },
                // These aren't part of TileJSON, but exist in an MBTiles file.
                filesize: 561152,
                type: 'baselayer',
                id: 'plain_1',
                basename: 'plain_1.mbtiles'
            }, data);

            assert.end();
        });
    });
});
