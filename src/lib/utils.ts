// ** utility library functions **

import ngeohash from 'ngeohash'
import { isPointInPolygon, computeDestinationPoint, getCenterOfBounds } from 'geolib'


export class Utils {
	
	uuidPrefix:string= 'urn:mrn:signalk:uuid:';
	
    // ** returns true if id is a valid UUID **
    isUUID(id:string) {
        let uuid= RegExp("^urn:mrn:signalk:uuid:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$");
        return uuid.test(id);
    }
	
	// ** check geometry is in bounds
    inBounds(val:any, type:string, polygon:number[]):boolean {
        let ok:boolean= false;
		switch( type ) {
			case 'notes':
			case 'waypoints':
				if(val.position) { ok= isPointInPolygon(val.position, polygon) } 
				if(val.geohash) { 
                    let bar= ngeohash.decode_bbox(val.geohash);
                    let bounds= this.toPolygon(`${bar[1]},${bar[0]}, ${bar[3]}, ${bar[2]}`);
                    let center= getCenterOfBounds(bounds);
                    ok= isPointInPolygon(center, polygon);
                }
				break
			case 'routes':
				if(val.feature.geometry.coordinates) {
					val.feature.geometry.coordinates.forEach( (pt:any)=> {
						ok= ok || isPointInPolygon(pt, polygon);
					});
				}
				break;
			case 'regions':
				if(val.feature.geometry.coordinates && val.feature.geometry.coordinates.length>0) {
					if(val.feature.geometry.type=='Polygon') {
						val.feature.geometry.coordinates.forEach( (ls:any)=> {
							ls.forEach( (pt:any)=> { ok= ok || isPointInPolygon(pt, polygon) })
						});
					}
					else if(val.feature.geometry.type=='MultiPolygon') {
						val.feature.geometry.coordinates.forEach( (polygon:any)=> {
							polygon.forEach( (ls:any)=> {
								ls.forEach( (pt:any)=> { ok= ok || isPointInPolygon(pt, polygon) })
							});
						});
					}
				}
				break;
        }
        return ok;
	}
    
    /** Apply filters to Resource entry
     * returns: true if entry should be included in results **/
    passFilter(res:any, type:string, params:any) {
        let ok:boolean= true;
        if(params.region) {	// ** check is attached to region
            console.log(`check region: ${params.region}`);
            if(typeof res.region==='undefined') { ok= ok && false }
            else { ok= ok && (res.region==params.region) }
        }  
        if(params.group) {	// ** check is attached to group
            console.log(`check group: ${params.group}`);
            if(typeof res.group==='undefined') { ok= ok && false }
            else { ok= ok && (res.group==params.group) }
        } 
        if(params.geobounds) {	// ** check is within bounds
            ok= ok && this.inBounds(res, type, params.geobounds);
        }
        return ok;
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

        if(typeof params.bbox !== 'undefined') {
            // ** generate geobounds polygon from bbox
            params.geobounds= this.toPolygon(params.bbox);
            if(params.geobounds.length!==5) {
                params.geobounds= null;
                return {
                    error: true, 
                    message: `Error: Bounding box contains invalid coordinate value (${params.bbox})`,
                    source: 'resources'
                }
            }
        }	
        else if(typeof params.distance !=='undefined' && params.position) {
            if(isNaN(params.distance) ) { 
                let s= `Error: Distance specified is not a number! (${params.distance})`;
                console.log(`*** ${s} ***`);
                return {
                    error: true, 
                    message: s,
                    source: 'resources'
                };                
            }
            let sw= computeDestinationPoint(params.position, params.distance, 225);
            let ne= computeDestinationPoint(params.position, params.distance, 45);
            params.geobounds= this.toPolygon(`${sw.longitude},${sw.latitude}, ${ne.longitude}, ${ne.latitude}`);
        }	 
        return params;
    }

    // ** convert bbox  string to array of points (polygon) **
    toPolygon(bbox: string) {
        let polygon= [];
        let b= bbox.split(',')
        .map( (i:any)=> { 
            if(!isNaN(i)) {
                return parseFloat(i);
            }
        })
        .filter( (i:any)=> { if(i) return i });
        if(b.length==4) {
            polygon.push([b[0], b[1]]);
            polygon.push([b[0], b[3]]);
            polygon.push([b[2], b[3]]);
            polygon.push([b[2], b[1]]);
            polygon.push([b[0], b[1]]);
        }
        else {
            console.log(`*** Error: Bounding box contains invalid coordinate value (${bbox}) ***`);
        }
        return polygon;
    }

}
