export * from './store';

export interface Position {
    latitude: number;
    longitude: number;
    altitude?: number;
}

export interface Polygon {
    type: 'Feature';
    geometry: {
        type: 'Polygon' ;
        coords: Array< Array<[number,number,number?]> >;
    },
    properties?: object;
    id?: string;
}

export interface MultiPolygon {
    type: 'Feature';
    geometry: {
        type: 'MultiPolygon';
        coords: Array< Array< Array<[number,number,number?]> > >;
    },
    properties?: object;
    id?: string;
}

interface ResourceObj {
    timestamp?: string;
    source?: string;
}

export interface Route extends ResourceObj {
    name?: string;
    description?: string;
    distance?: number;
    start?: string;
    end?: string;
    feature: {
        type: 'Feature';
        geometry: {
            type: 'LineString';
            coords: Array< Array<[number,number,number?]> >;
        },
        properties?: object;
        id?: string;
    }
}

export interface Waypoint extends ResourceObj {
    position?: Position;
    feature: {
        type: 'Feature';
        geometry: {
            type: 'Point';
            coords: Array<[number,number,number?]>;
        },
        properties?: object;
        id?: string;
    }
}

export interface Note extends ResourceObj {
    title?: string;
    description?: string;
    region?: string;
    position?: Position;
    geohash?: string;
    mimeType?: string;
    url?: string;
}

export interface Region extends ResourceObj {
    geohash?: string;
    feature: Polygon | MultiPolygon;    
}

export interface Chart extends ResourceObj {
    name?: string;
    description?: string;
    identifier?: string;
    tilemapUrl?: string;
    geohash?: string;
    region?: string;
    chartUrl?: string;
    scale?: number;
    chartLayers?: Array<string>;
    bounds?: [ [number,number], [number,number] ];
    chartFormat?: string;
}


export interface ResourceCollection {
    [key: string] : Route | Waypoint | Note | Region | Chart;
}