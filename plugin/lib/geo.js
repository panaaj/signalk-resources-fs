"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class GeoHash {
    constructor() {
        /* (Geohash-specific) Base32 map */
        this.BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
    }
    /** Encodes latitude/longitude to geohash, to specified precision
     * returns: string
    */
    encode(lat, lon, precision = 12) {
        if (isNaN(lat) || isNaN(lon) || isNaN(precision))
            throw new Error('Invalid geohash');
        let idx = 0; // index into base32 map
        let bit = 0; // each char holds 5 bits
        let evenBit = true;
        let geohash = '';
        let latMin = -90, latMax = 90;
        let lonMin = -180, lonMax = 180;
        while (geohash.length < precision) {
            if (evenBit) {
                // bisect E-W longitude
                let lonMid = (lonMin + lonMax) / 2;
                if (lon >= lonMid) {
                    idx = idx * 2 + 1;
                    lonMin = lonMid;
                }
                else {
                    idx = idx * 2;
                    lonMax = lonMid;
                }
            }
            else {
                // bisect N-S latitude
                let latMid = (latMin + latMax) / 2;
                if (lat >= latMid) {
                    idx = idx * 2 + 1;
                    latMin = latMid;
                }
                else {
                    idx = idx * 2;
                    latMax = latMid;
                }
            }
            evenBit = !evenBit;
            if (++bit == 5) {
                // 5 bits gives us a character: append it and start over
                geohash += this.BASE32.charAt(idx);
                bit = 0;
                idx = 0;
            }
        }
        return geohash;
    }
    ;
    /* Returns bounds of specified geohash.
     * returns: {sw: [longitude,latitude], ne: [longitude,latitude]}
    */
    decode(geohash) {
        if (geohash.length === 0)
            throw new Error('Invalid geohash');
        geohash = geohash.toLowerCase();
        let evenBit = true;
        let latMin = -90, latMax = 90;
        let lonMin = -180, lonMax = 180;
        for (let i = 0; i < geohash.length; i++) {
            var chr = geohash.charAt(i);
            var idx = this.BASE32.indexOf(chr);
            if (idx == -1)
                throw new Error('Invalid geohash');
            for (var n = 4; n >= 0; n--) {
                var bitN = idx >> n & 1;
                if (evenBit) {
                    // longitude
                    var lonMid = (lonMin + lonMax) / 2;
                    if (bitN == 1) {
                        lonMin = lonMid;
                    }
                    else {
                        lonMax = lonMid;
                    }
                }
                else {
                    // latitude
                    var latMid = (latMin + latMax) / 2;
                    if (bitN == 1) {
                        latMin = latMid;
                    }
                    else {
                        latMax = latMid;
                    }
                }
                evenBit = !evenBit;
            }
        }
        return {
            sw: [lonMin, latMin],
            ne: [lonMax, latMax]
        };
    }
    /* return approximate centre of geohash cell
     * returns: [lon, lat]
    */
    center(geohash) {
        let bounds = this.decode(geohash);
        // now just determine the centre of the cell...
        let latMin = bounds.sw[1], lonMin = bounds.sw[0];
        let latMax = bounds.ne[1], lonMax = bounds.ne[0];
        // cell centre
        let lat = (latMin + latMax) / 2;
        let lon = (lonMin + lonMax) / 2;
        // round to close to centre without excessive precision: ?2-log10(?�)? decimal places
        lat = Number(lat.toFixed(Math.floor(2 - Math.log(latMax - latMin) / Math.LN10)));
        lon = Number(lon.toFixed(Math.floor(2 - Math.log(lonMax - lonMin) / Math.LN10)));
        return [lon, lat];
    }
    /* Determines adjacent cell in given direction.
     * geohash: string - Cell to which adjacent cell is required.
     * direction: string - <N,S,E,W>.
     * return: string - Geocode of adjacent cell.
    */
    adjacent(geohash, direction = 'n') {
        geohash = geohash.toLowerCase();
        direction = direction.toLowerCase();
        if (geohash.length === 0)
            throw new Error('Invalid geohash');
        if ('nsew'.indexOf(direction) == -1)
            throw new Error('Invalid direction');
        let neighbour = {
            n: ['p0r21436x8zb9dcf5h7kjnmqesgutwvy', 'bc01fg45238967deuvhjyznpkmstqrwx'],
            s: ['14365h7k9dcfesgujnmqp0r2twvyx8zb', '238967debc01fg45kmstqrwxuvhjyznp'],
            e: ['bc01fg45238967deuvhjyznpkmstqrwx', 'p0r21436x8zb9dcf5h7kjnmqesgutwvy'],
            w: ['238967debc01fg45kmstqrwxuvhjyznp', '14365h7k9dcfesgujnmqp0r2twvyx8zb'],
        };
        let border = {
            n: ['prxz', 'bcfguvyz'],
            s: ['028b', '0145hjnp'],
            e: ['bcfguvyz', 'prxz'],
            w: ['0145hjnp', '028b'],
        };
        let lastCh = geohash.slice(-1); // last character of hash
        let parent = geohash.slice(0, -1); // hash without last character
        let type = geohash.length % 2;
        // check for edge-cases which don't share common prefix
        if (border[direction][type].indexOf(lastCh) != -1 && parent !== '') {
            parent = this.adjacent(parent, direction);
        }
        // append letter for direction to parent
        return parent + this.BASE32.charAt(neighbour[direction][type].indexOf(lastCh));
    }
    ;
    /* Returns all 8 adjacent cells to specified geohash.
     * returns: { n,ne,e,se,s,sw,w,nw: string }
     */
    neighbours(geohash) {
        return {
            'n': this.adjacent(geohash, 'n'),
            'ne': this.adjacent(this.adjacent(geohash, 'n'), 'e'),
            'e': this.adjacent(geohash, 'e'),
            'se': this.adjacent(this.adjacent(geohash, 's'), 'e'),
            's': this.adjacent(geohash, 's'),
            'sw': this.adjacent(this.adjacent(geohash, 's'), 'w'),
            'w': this.adjacent(geohash, 'w'),
            'nw': this.adjacent(this.adjacent(geohash, 'n'), 'w'),
        };
    }
    ;
}
exports.GeoHash = GeoHash;
