// ** utility library functions **

import { GeoHash, GeoBounds } from './geo';
import geoJSON from 'geojson-validation';
import { Route, Waypoint, Note, Region } from '@panaaj/sk-types';


export class Utils {
	
	uuidPrefix:string= 'urn:mrn:signalk:uuid:';
	
    // ** returns true if id is a valid UUID **
    isUUID(id:string) {
        let uuid= RegExp("^urn:mrn:signalk:uuid:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$");
        return uuid.test(id);
    }
	
	// ** check geometry is in bounds
    inBounds(val:any, type:string, bounds:GeoBounds):boolean {
        let ok:boolean= false;
		switch( type ) {
			case 'notes':
			case 'waypoints':
				if(val.position) { ok= this.pointInBounds([val.position.longitude, val.position.latitude], bounds) }
				if(val.geohash) { ok= this.pointInBounds(new GeoHash().center(val.geohash), bounds) }
				break
			case 'routes':
				if(val.feature.geometry.coordinates) {
					val.feature.geometry.coordinates.forEach( (i:any)=> {
						ok= ok || this.pointInBounds(i, bounds);
					});
				}
				break;
			case 'regions':
				if(val.feature.geometry.coordinates && val.feature.geometry.coordinates.length>0) {
					if(val.feature.geometry.type=='Polygon') {
						val.feature.geometry.coordinates.forEach( (ls:any)=> {
							ls.forEach( (pt:any)=> { ok= ok || this.pointInBounds(pt, bounds) })
						});
					}
					else if(val.feature.geometry.type=='MultiPolygon') {
						val.feature.geometry.coordinates.forEach( (polygon:any)=> {
							polygon.forEach( (ls:any)=> {
								ls.forEach( (pt:any)=> { ok= ok || this.pointInBounds(pt, bounds) })
							});
						});
					}
				}
				break;
        }
        return ok;
	}
	
	// test point is in bounds
	pointInBounds(pt:[number,number], bounds:GeoBounds) {
		return ( 
			(pt[1]>= bounds.sw[1] && pt[1]<= bounds.ne[1])
			&& 
			(pt[0]>= bounds.sw[0] && pt[0]<= bounds.ne[0])
		) ? true : false;
    }
    
    /** Apply filters to Resource entry
     * returns: true if entry should be included in results **/
     passFilter(res:any, type:string, params:any) {
        let ok:boolean= true;
        if(params.region) {	// ** check is attached to region
            //console.log(`check region: ${params.region}`);
            if(typeof res.region==='undefined') { ok= ok && false }
            else {
                // deconstruct resource region value
                let ha= res.region.split('/')
                let hType:string = ha.length === 1 ? 
                    'regions' :
                    ha.length > 2  ? ha[ha.length-2] : 'regions'
                let hId= ha.length === 1 ? ha[0] : ha[ha.length-1]

                // deconstruct param.region value
                let pa= params.region.split('/')
                let pType:string = pa.length === 1 ? 
                    'regions' :
                    pa.length > 2  ? pa[pa.length-2] : 'regions'
                let pId= pa.length === 1 ? pa[0] : pa[pa.length-1]

                ok= ok && (hType === pType && hId === pId) 
            }
        }  
        if(params.group) {	// ** check is attached to group
            //console.log(`check group: ${params.group}`);
            if(typeof res.group==='undefined') { ok= ok && false }
            else { ok= ok && (res.group==params.group) }
        } 
        if(params.geobounds) {	// ** check is within bounds
            ok= ok && this.inBounds(res, type, params.geobounds);
        }
        return ok;
    }
	
    // ** validate provided resource value data
    validateData(r:any):boolean {
        if(!r.type) { return false }
        switch(r.type) {
            case 'routes':
                return this.validateRoute(r.value);
                break;
            case 'waypoints':
                return this.validateWaypoint(r.value);
                break;
            case 'notes':
                return this.validateNote(r.value);
                break;   
            case 'regions':
                return this.validateRegion(r.value);
                break;                   
            default:
                return true;             
        }      
    } 
    
    // ** validate route data
    validateRoute(r:Route):boolean {   
        if(typeof r.name == 'undefined') { return false }
        if(typeof r.description == 'undefined') { return false }
        if(typeof r.distance == 'undefined' || isNaN(r.distance)) { return false }
        if(r.start && !this.isUUID(r.start)) { return false }
        if(r.end && !this.isUUID(r.end)) { return false }
		try {
			if(!r.feature || !geoJSON.valid(r.feature)) { 
				return false;
            }
            if(r.feature.geometry.type!=='LineString') { return false }
		}
		catch(e) { console.log(e); return false }
        return true;
    }

    // ** validate waypoint data
    validateWaypoint(r:Waypoint):boolean { 
        if(!r.position) { return false } 
        if(!r.position.latitude || !r.position.longitude) { return false } 
		try {
			if(!r.feature || !geoJSON.valid(r.feature)) { 
				return false; 
            }
            if(r.feature.geometry.type!=='Point') { return false }
		}
		catch(e) { console.log(e); return false }
        return true;
    }

    // ** validate note data
    validateNote(r:Note):boolean {  
        if(!r.region && !r.position && !r.geohash ) { return false } 
        if(typeof r.position!== 'undefined') {
            if(!r.position.latitude || !r.position.longitude) { return false } 
            return true;
        }
        if(typeof r.region!== 'undefined') { return true } 
        if(typeof r.geohash!== 'undefined') { return true }
        return false;
    }
    
    // ** validate region data
    validateRegion(r:Region):boolean {  
        if(!r.geohash && !r.feature) { return false } 
        if(r.feature ) {
			try {
                if(!geoJSON.valid(r.feature)) { return false }
                if(r.feature.geometry.type!=='Polygon' && r.feature.geometry.type!=='MultiPolygon') { 
                    return false;
                }
				return true;
			}
			catch(e) { console.log(e); return false; }
        }
        if(r.geohash) { return true }

        return false;
    }

    // ** returns point dist(m) at brng(degrees) from lat1, lon1
    destCoordinate(pt:[number,number], brng:number, dist:number) {
        let lat1:number= pt[1];
        let lon1:number= pt[0];
        let a:number = 6378137, b:number = 6356752.3142, f:number = 1 / 298.257223563; // WGS-84
        // ellipsiod
        let s= dist; 
        let alpha1:number= (brng * Math.PI/180);
        let sinAlpha1:number = Math.sin(alpha1);
        let cosAlpha1:number = Math.cos(alpha1);
        let tanU1:number = (1 - f) * Math.tan(lat1 * Math.PI/180);
        let cosU1:number = 1 / Math.sqrt((1 + tanU1 * tanU1));
        let sinU1:number = tanU1 * cosU1;
        let sigma1:number = Math.atan2(tanU1, cosAlpha1);
        let sinAlpha:number = cosU1 * sinAlpha1;
        let cosSqAlpha:number = 1- sinAlpha * sinAlpha;
        let uSq:number = cosSqAlpha * (a * a - b * b) / (b * b);
        let A:number = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
        let B:number = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
        let sigma:number = s / (b * A);
        let sigmaP:number = 2 * Math.PI;

        let sinSigma: number=0;
        let cos2SigmaM: number=0;
        let cosSigma: number=0;
        let deltaSigma: number=0;

        while (Math.abs(sigma - sigmaP) > 1e-12) {
            cos2SigmaM = Math.cos(2 * sigma1 + sigma);
            sinSigma = Math.sin(sigma);
            cosSigma = Math.cos(sigma);
            deltaSigma = B * sinSigma * (cos2SigmaM + B / 4
                        * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B
                        / 6 * cos2SigmaM
                        * (-3 + 4 * sinSigma * sinSigma)
                        * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
            sigmaP = sigma;
            sigma = s / (b * A) + deltaSigma;
        }

        let tmp:number = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
        let lat2:number = Math.atan2(
            sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, 
            (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)
        );
        let lambda:number = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1); 
        let C:number = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
        let La:number = lambda- (1 - C) * f * sinAlpha
            * (sigma + C * sinSigma
            * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
        let revAz:number = Math.atan2(sinAlpha, -tmp); // final bearing
        let llat = lat2 * 180/Math.PI; 
        let llon = lon1 + (La * 180/Math.PI);
        return  [llon, llat];
    }
    
    // ** process query parameters
    processParameters(params:any) {
		if(typeof params.limit !== 'undefined') {
            if(isNaN(params.limit) ) { 
                let s= `Error: max record count specified is not a number! (${params.limit})`;
                console.log(`*** ${s} ***`);
                return {
                    error: true, 
                    message: s,
                    source: 'resources'
                };              
            }
            else { params.limit= parseInt(params.limit) }
		}
		if(typeof params.geohash !== 'undefined') {
            try { params.geobounds= new GeoHash().decode(params.geobounds) }
            catch(err) {
                let s= 'INVALID GeoHash!';
                console.log(`*** ${s} ***`); 
                return {
                    error: true, 
                    message: s,
                    source: 'resources'
                };
            }
        }
        else if(typeof params.geobounds !== 'undefined') {
            let b= params.geobounds.split(',')
            .map( (i:any)=> { if(!isNaN(i)) {return parseFloat(i) } })
            .filter( (i:any)=> { if(i) return i })
            if(b.length==4) {
                params.geobounds= { sw: [b[0], b[1]], ne: [b[2], b[3] ] };
            }
            else {
                let s=`Error: GeoBounds contains invalid coordinate value (${params.geobounds})`;
                console.log(`*** ${s} ***`);
                params.geobounds= null;
                return {
                    error: true, 
                    message: s,
                    source: 'resources'
                };
            }
        }	
        else if(typeof params.geobox !=='undefined' && params.position) {
            if(isNaN(params.geobox) ) { 
                let s= `Error: GeoBox radius specified is not a number! (${params.geobox})`;
                console.log(`*** ${s} ***`);
                return {
                    error: true, 
                    message: s,
                    source: 'resources'
                };                
            }
            let d= Math.sqrt( Math.pow(params.geobox,2) + Math.pow(params.geobox,2) );
            params.geobounds= { 
                sw: this.destCoordinate(params.position, 225, d),
                ne: this.destCoordinate(params.position, 45, d) 
            };
        }	 
        
        return params;
    }

}
