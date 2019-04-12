// ** utility library functions **
const GeoHash = require('./geo')
const geoJSON = require('geojson-validation')

module.exports= {
	
	uuidPrefix: 'urn:mrn:signalk:uuid:',
	
    // ** returns true if id is a valid UUID **
    isUUID: function(id) {
        let uuid= RegExp("^urn:mrn:signalk:uuid:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$")
        let result= uuid.test(id)
        return result
    },
	
	// ** check geometry is in bounds
    inBounds: function(val, type, bounds) {
		switch( type ) {
			case 'note':
			case 'waypoint':
				if(val.position) { return this.pointInBounds([val.position.longitude, val.position.latitude], bounds) }
				if(val.geohash) { return this.pointInBounds(new GeoHash().center(val.geohash), bounds) }
				break
			case 'route':
				if(val.feature.geometry.coordinates) {
					let ok=false;
					val.feature.geometry.coordinates.forEach( i=> {
						ok= ok || this.pointInBounds(i, bounds)
					});
					return ok
				}
				break
			case 'region':
				if(val.feature.geometry.coordinates && val.feature.geometry.coordinates.length>0) {
					let ok=false;
					val.feature.geometry.coordinates[0].forEach( i=> {
						ok= ok || this.pointInBounds(i, bounds)
					});
					return ok
				}
				break
		}
	},
	
	// test point is in bounds
	pointInBounds: function(pt, bounds) {
		return ( 
			(pt[1]>= bounds.sw[1] && pt[1]<= bounds.ne[1])
			&& 
			(pt[0]>= bounds.sw[0] && pt[0]<= bounds.ne[0])
		) ? true : false
	},
	
    // ** validate provided resource value data
     validateData: function(r) {
        if(!r.type) { return false }
        switch(r.type) {
            case 'route':
                return this.validateRoute(r.value);
                break;
            case 'waypoint':
                return this.validateWaypoint(r.value);
                break;
            case 'note':
                return this.validateNote(r.value);
                break;   
            case 'region':
                return this.validateRegion(r.value);
                break;                   
            default:
                return false;             
        }      
    }, 
    
    // ** validate route data
    validateRoute: function(r) {   
        if(typeof r.name == 'undefined') { return false }
        if(typeof r.description == 'undefined') { return false }
        if(typeof r.distance == 'undefined' || isNaN(r.distance)) { return false }
        if(!r.start) { return false }
        if(!r.end) { return false }
		try {
			if(!r.feature || !geoJSON.valid(r.feature)) { 
				return false 
			}
		}
		catch(e) { console.log(e); return false }
        return true
    },

    // ** validate waypoint data
    validateWaypoint: function(r) { 
        if(!r.position) { return false } 
        if(!r.position.latitude || !r.position.longitude) { return false } 
		try {
			if(!r.feature || !geoJSON.valid(r.feature)) { 
				return false 
			}
		}
		catch(e) { console.log(e); return false }
        return true
    },

    // ** validate note data
    validateNote: function(r) {  
        if(!r.region && !r.position && !r.geohash ) { return false } 
        if(typeof r.position!== 'undefined') {
            if(!r.position.latitude || !r.position.longitude) { return false } 
            return true
        }
        if(typeof r.region!== 'undefined') { return true } 
        if(typeof r.geohash!== 'undefined') { return true }
        return false
    }, 
    
    // ** validate region data
    validateRegion: function(r) {  
        if(!r.geohash && !r.feature) { return false } 
        if(r.feature ) {
			try {
				if(!geoJSON.valid(r.feature)) { 
					return false 
				}
				return true
			}
			catch(e) { console.log(e); return false }
        }
        if(r.geohash) { return true }

        return false
    },

    // ** returns point dist(m) at brng(degrees) from lat1, lon1
    destCoordinate(lat1, lon1, brng, dist) {
        let a = 6378137, b = 6356752.3142, f = 1 / 298.257223563, // WGS-84
        // ellipsiod
        s= dist, alpha1= (brng * Math.PI/180), sinAlpha1 = Math.sin(alpha1), cosAlpha1 = Math
            .cos(alpha1), tanU1 = (1 - f) * Math.tan(lat1 * Math.PI/180), cosU1 = 1 / Math
            .sqrt((1 + tanU1 * tanU1)), sinU1 = tanU1 * cosU1, sigma1 = Math
            .atan2(tanU1, cosAlpha1), sinAlpha = cosU1 * sinAlpha1, cosSqAlpha = 1
            - sinAlpha * sinAlpha, uSq = cosSqAlpha * (a * a - b * b) / (b * b), A = 1
            + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq))), B = uSq
            / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq))), sigma = s
            / (b * A), sigmaP = 2 * Math.PI;
        while (Math.abs(sigma - sigmaP) > 1e-12) {
            var cos2SigmaM = Math.cos(2 * sigma1 + sigma), sinSigma = Math
                    .sin(sigma), cosSigma = Math.cos(sigma), deltaSigma = B
                    * sinSigma
                    * (cos2SigmaM + B
                            / 4
                            * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B
                                    / 6 * cos2SigmaM
                                    * (-3 + 4 * sinSigma * sinSigma)
                                    * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
            sigmaP = sigma;
            sigma = s / (b * A) + deltaSigma;
        }

        let tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1, lat2 = Math
            .atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, (1 - f)
                    * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)), lambda = Math
            .atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma
                    * cosAlpha1), C = f / 16 * cosSqAlpha
            * (4 + f * (4 - 3 * cosSqAlpha)), La = lambda
            - (1 - C)
            * f
            * sinAlpha
            * (sigma + C
                    * sinSigma
                    * (cos2SigmaM + C * cosSigma
                            * (-1 + 2 * cos2SigmaM * cos2SigmaM))), revAz = Math
            .atan2(sinAlpha, -tmp); // final bearing
        let llat = lat2 * 180/Math.PI; 
        let llon = lon1 + (La * 180/Math.PI);
        return  [llon, llat];
    },
    
    // ** process query parameters
    processParameters: function(params) {
		if(typeof params.limit !== 'undefined') {
            if(isNaN(params.limit) ) { 
                let s= `Error: max record count specified is not a number! (${params.limit})`
                console.log(`*** ${s} ***`)
                return {
                    error: true, 
                    message: s,
                    source: 'resources'
                }                
            }
            else { params.limit= parseInt(params.limit) }
		}
		if(typeof params.geohash !== 'undefined') {
			params.geobounds= new GeoHash().decode(params.geobounds)
        }
        if(typeof params.geobounds !== 'undefined') {
            let b= params.geobounds.split(',')
            .map( i=> { if(!isNaN(i)) {return parseFloat(i) } })
            .filter( i=> { if(i) return i })
            if(b.length==4) {
                params.geobounds= { sw: [b[0], b[1]], ne: [b[2], b[3] ] } 
            }
            else {
                let s=`Error: GeoBounds contains invalid coordinate value (${params.geobounds})`
                console.log(`*** ${s} ***`)
                params.geobounds= null 
                return {
                    error: true, 
                    message: s,
                    source: 'resources'
                } 
            }
        }	
        if(typeof params.geobox !=='undefined' && params.position) {
            if(isNaN(params.geobox) ) { 
                let s= `Error: GeoBox radius specified is not a number! (${params.geobox})`
                console.log(`*** ${s} ***`)
                return {
                    error: true, 
                    message: s,
                    source: 'resources'
                }                
            }
            let d= Math.sqrt( Math.pow(params.geobox,2) + Math.pow(params.geobox,2) )
            params.geobounds= { 
                sw: utils.destCoordinate(params.position[1], params.position[0], 225, d),
                ne: utils.destCoordinate(params.position[1], params.position[0], 45, d) 
            } 
        }	 
        
        return params
    }

}