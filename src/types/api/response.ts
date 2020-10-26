
interface Response {
    requestId: string;
    state: string;
    statusCode: number;
    message?: string;
}

export interface StreamResponse extends Response {
    login?: {
      token: string;
      timeToLive?: number;
    }
    validate?: {
        token: string;
    }    
}

export interface RESTResponse extends Response  {
    token?: string;
    href?: string;
    timeToLive?: number;
}


// ** REST API Hello **

interface APIEndpoint {
    version: string;
    'signalk-http'?: string;
    'signalk-ws'?: string;
    'signalk-tcp'?: string;
}
  
interface APIEndpointObj {
    [key: string]: APIEndpoint;
}

export interface RESTHello extends Response  {
    endpoints: APIEndpointObj;
    server: {
        id: string;
        version: string;
    }
}
