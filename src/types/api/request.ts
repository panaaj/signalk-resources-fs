import { DeltaMessage } from '../server/delta';

interface Request {
    context?: string;
    token?: string;
    requestId: string;
}


export interface StreamRequestGet extends Request {
    get: Array<{path: string}>
}

export interface StreamRequestPut extends Request {
    put: Array<DeltaMessage>
}

export interface StreamRequestQuery extends Request {
    query: boolean;
}


// ** Subscription **

interface Subscription {
    path: string;
    period?: number;
    format?: 'delta' | 'full';
    policy?: 'instant' | 'ideal' | 'fixed';
    minPeriod?: number;
}

export interface StreamRequestSubscribe extends Request {
    subscribe: Array<Subscription>
}

export interface StreamRequestUnSubscribe extends Request {
    unsubscribe: Array<{path: string}>
}


// ** Authentication **

export interface RESTRequestLogin extends Request {
    username: string;
    password: string;
}

export interface StreamRequestLogIn extends Request {
    login: {
        username: string;
        password: string;
    }
}

export interface StreamRequestLogOut extends Request {
    logout: {
        token: string;
    } 
} 

export interface StreamRequestValidate extends Request {
    validate: {
      token: string;
    }
}




