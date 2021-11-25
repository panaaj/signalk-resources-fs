

// ** Resource Store Interface
export interface IResourceStore {
    savePath: string;
    resources: any;
    init: (basePath:string) => Promise<any>;
    close?: ()=> void;
    getResources: (type:string, item:any, params:any) => Promise<any>;
    setResource?: (r:StoreRequestParams) => Promise<any>;
}

export interface StoreRequestParams {
    id: string;
    type: string;
    value: any;
}
