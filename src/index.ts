/*
* Copyright 2019 Adrian Panazzolo <panaaj@hotmail.com>
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

import { ServerPlugin, ServerAPI, ActionResult, 
        DeltaUpdate, DeltaMessage } from '@panaaj/sk-types';

//import { ResourceProvider } from '@signalk/server-api';

import { Request, Response, NextFunction }  from 'express';
import uuid from 'uuid/v4';

import { DBStore } from './lib/dbfacade';
import { FileStore } from './lib/filestorage';
import { Utils} from './lib/utils';
import { StoreRequestParams } from './types';


interface ResourceProviderPlugin extends ServerPlugin {
    resourceProvider: any // ResourceProvider
}

interface ResourceProviderServer extends ServerAPI {
    resourcesApi: any    // ** access to serer resources API
}


const CONFIG_SCHEMA= {
    properties: { 
        API: {
            type: "object",
            title: "Resources (standard)",
            description: 'ENABLE / DISABLE storage provider for the following SignalK resource types.',
            properties: {
                routes: {
                    type: "boolean", 
                    title: "ROUTES"
                },
                waypoints: {
                    type: "boolean",
                    title: "WAYPOINTS"
                },                                  
                notes: {
                    type: "boolean",
                    title: "NOTES"
                },                   
                regions: {
                    type: "boolean",
                    title: "REGIONS"
                }                    
            }
        },
        resourcesOther: {
            type: "array",
            title: "Resources (custom)",
            description: "Define paths for custom resource types.",
            items: {
              type: "object",
              required: [ 'name' ],
              properties: {
                name: {
                  type: 'string',
                  title: 'Name',
                  description: 'Path name to use /signalk/v1/api/resources/<name>'
                }
              }
            }         
        },       
        source: {
            type: "string",
            title: "Select type of Resource data store to use.",
            default: 'filesystem',
            enum: ['filesystem', 'db'],
            enumNames: ['FileSystem', 'Database']
        },
        path: {
            type: "string",
            title: "PATH to Resource data: URL or file system path (relative to home/<user>/.signalk)",
            default: "./resources"
        }              
    }
}

const CONFIG_UISCHEMA= {
    API: {
        routes: {
            "ui:widget": "checkbox",
            "ui:title": " ",
            "ui:help": "Signal K Route resources"
        },
        waypoints: {
            "ui:widget": "checkbox",
            "ui:title": " ",
            "ui:help": "Signal K Waypoint resources"
        },
        notes: {
            "ui:widget": "checkbox",
            "ui:title": " ",
            "ui:help": "Signal K Note resources"
        },
        regions: {
            "ui:widget": "checkbox",
            "ui:title": " ",
            "ui:help": "Signal K Region resources"
        }                          
    },
    SOURCE: {
        "ui:widget": "radio",
        "ui:title": " ",
        "ui:help": "Select the type of Resource data store to use." 
    },
    PATH: {
        "ui:emptyValue": "./resources",
        "ui:help": "Enter URL or path relative to home/<user>/.signalk/"            
    }
}

module.exports = (server: ResourceProviderServer): ResourceProviderPlugin=> {
    let subscriptions: Array<any>= []; // stream subscriptions   
    let utils: Utils= new Utils();

    let plugin: ResourceProviderPlugin= {
        id: 'sk-resources-fs',
        name: 'Resources Provider (sk-resources-fs)',
        schema: ()=> (CONFIG_SCHEMA),
        uiSchema: ()=> (CONFIG_UISCHEMA),   
        start: (options:any, restart:any)=> { doStartup( options, restart ) },
        stop: ()=> { doShutdown() },
        resourceProvider: {
            types: [],
            methods: {
                listResources: (type:string, params:object):any=> { 
                    return apiGetResource(type, '', params); 
                },
                getResource: (type:string, id:string)=> {
                    return apiGetResource(type, id); 
                } ,
                setResource: (type:string, id:string, value:any)=> { 
                    return apiSetResource(type, id, value); 
                },
                deleteResource: (type:string, id:string)=> {
                    return apiSetResource(type, id, null); 
                }
            }
        }
    }

    let fsAdapter: FileStore= new FileStore(plugin.id); 
    let dbAdapter: DBStore= new DBStore(plugin.id);
    let db:any= dbAdapter;  // active data store     

    let config:any= {
        API: {
            routes: false,
            waypoints: false,
            notes: false,
            regions: false
        }
    };

    let apiProviderFor: Array<string>= [];
    let customTypes: Array<string>= [];

    const doStartup= (options:any, restart:any) => {
        try {
            server.debug(`${plugin.name} starting.......`);

            config= options || config;
            server.debug('*** Configuration ***');
            server.debug(JSON.stringify(config) ); 
            if(!config.source) { db= fsAdapter }
            else {
                switch(config.source) {
                    case 'db':
                        db= dbAdapter; 
                        break
                    default: 
                        db= fsAdapter; 
                }
            }
            // compile list of enabled resource types
            apiProviderFor= [];
            Object.entries(config.API).forEach( i=> {
                if(i[1]) {
                    apiProviderFor.push(i[0]);
                }
            })
            plugin.resourceProvider.types= apiProviderFor;

            if(config.resourcesOther && Array.isArray(config.resourcesOther)) {
                customTypes= config.resourcesOther.map( (i:any) => {
                    return i.name;
                });
            }
            server.debug('*** Enabled standard resources ***');
            server.debug(JSON.stringify(apiProviderFor));
            server.debug('*** Enabled additional resources ***');
            server.debug(JSON.stringify(customTypes));

			// ** initialise resource storage
            db.init({settings: config, path: server.config.configPath})
            .then( (res:any)=> {
				if(res.error) {
                    let msg:string= `*** ERROR: ${res.message} ***`;
					server.error(msg);                   
                    if(typeof server.setPluginError === 'function') { server.setPluginError(msg) }
                    else { server.setProviderError(msg) }		
                }

                let ae= `Providing resources: ${apiProviderFor.toString()}`;
                ae+= customTypes.toString();
            
                server.debug(`** ${plugin.name} started... ${(!res.error) ? 'OK' : 'with errors!'}`);    
                let msg:string= `Started. ${ae}`;       
                if(typeof server.setPluginStatus === 'function') { server.setPluginStatus(msg) }
                else { server.setProviderStatus(msg) }                
            })
            .catch( (e:any)=> { 
                server.debug(e);
                let msg:string= `Initialisation Error! See console for details.`;       
                if(typeof server.setPluginError === 'function') { server.setPluginError(msg) }
                else { server.setProviderError(msg) }
            } );

            // ** register resource provider **
            server.resourcesApi.register(plugin.id, plugin.resourceProvider);
            // ** non-std resource path handlers **
            initCustomResourcePaths();
        } 
        catch(e) {
            let msg:string= `Started with errors!`;       
            if(typeof server.setPluginError === 'function') { server.setPluginError(msg) }
            else { server.setProviderError(msg) }
            server.error("error: " + e);
            console.error((e as any).stack);
            return e;
        }    
    }

    const doShutdown= ()=> { 
        server.debug(`${plugin.name} stopping.......`);
        server.debug('** Un-registering Resource Provider(s) **');
        server.resourcesApi.unRegister(plugin.id, plugin.resourceProvider.types);
        server.debug('** Un-registering Update Handler(s) **');
        subscriptions.forEach( b=> b() );
        subscriptions= [];
        if(db) { db.close().then( ()=> server.debug(`** Store closed **`) ) }
        let msg= 'Stopped.';
        if(typeof server.setPluginStatus === 'function') { server.setPluginStatus(msg) }
        else { server.setProviderStatus(msg) }	
    }

    // ******* Signal K server Resource Provider interface functions **************
    
    /** return resource entry
     * resType: type of resource e.g. routes, waypoints, etc
     * id: resource id to fetch
     * *******************************/
     const apiGetResource= async (resType:string, id:string, params?:any):Promise<any>=> {
         // append vessel position to params
        params= params ?? {};
        params.position= getVesselPosition();
        server.debug(`*** apiGetResource:  ${resType}, ${id}, ${JSON.stringify(params)}`)
        if(!id) { // retrieve resource list          
            let r= await db.getResources(resType, null, params);      
            if(typeof r.error==='undefined') { return r }
            else { null }   
        }
        else { // retrieve resource entry
            let r= await db.getResources(resType, id);
            if(typeof r.error==='undefined') {
                return r;
            }
            else { null } 
            /*if(p.attribute) { // extract resource attribute value
                let a= eval(`r.${p.attribute}`);
                if(a) { return a }
                else { return err }
            }
            else { return r }*/
        }
    }

    /** add / update / delete resource entry
     * resType: type of resource e.g. routes, waypoints, etc
     * id: resource id
     * value: resource data
     * *******************************/
    const apiSetResource= async (resType:string, id:string, value:any):Promise<any>=> {
        server.debug(`*** apiSetResource:  ${resType}, ${id}, ${value}`);
        let dbop= await db.setResource({
            type: resType,
            id: id,
            value: value
        });        
        if(typeof dbop.error==='undefined') { // OK
            return true
        }
        else {  // error
            return false;             
        }
    }


    // ******* Non-standard Resource processing **************

    // ** Intialise HTTP path handlers (non-standard paths) **
    const initCustomResourcePaths= ()=> {

        (server as any).get(
            `/signalk/v1/api/resources/:customType`, 
            async (req:Request, res:Response, next:NextFunction)=> {
                server.debug(`** GET /signalk/v1/api/resources/:customType`);

                if(!customTypes.includes(req.params.customType)) {
                    server.debug(`** Unhandled custom path (${req.params.customType})...next()`);
                    next();
                    return;
                }

                getCustomResource(req, true)
                .then( r=> {
                    if(r.statusCode>=400) { 
                        res.status(r.statusCode).send(r.message);
                    }
                    else { res.json(r) }                    
                })
                .catch (err=> { res.status(500) } )
            }
        );

        (server as any).get(
            `/signalk/v1/api/resources/:customType/:id`, 
            async (req:Request, res:Response, next:NextFunction)=> {
                server.debug(`** GET /signalk/v1/api/resources/:customType/:id`);

                if(!customTypes.includes(req.params.customType)) {
                    server.debug(`** Unhandled custom path ${req.params.customType}...next()`);
                    next();
                    return;
                }

                getCustomResource(req)
                .then( r=> {
                    if(r.statusCode>=400) { 
                        res.status(r.statusCode).send(r.message);
                    }
                    else { res.json(r) }                    
                })
                .catch (err=> { res.status(500) } )
            }
        );

        (server as any).delete(
            `/signalk/v1/api/resources/:customType/:id`, 
            async (req:Request, res:Response, next:NextFunction)=> {
                server.debug(`** DELEGTE /signalk/v1/api/resources/:customType/:id`);

                if(!customTypes.includes(req.params.customType)) {
                    server.debug(`** Unhandled custom path ${req.params.customType}...next()`);
                    next();
                    return;
                }
                let resData:StoreRequestParams = {
                    id: req.params.id,
                    type: req.params.customType,
                    value: null
                };

                actionResourceRequest('', resData)
                .then(
                    (r:any) => {
                        if(r.statusCode>=400) { 
                            res.status(r.statusCode).send(r.message);
                        }
                        else { res.json(r) }                    
                    }
                ).catch( err => { 
                    res.status(500);
                }); 
            }
        );

        (server as any).put(
            `/signalk/v1/api/resources/:customType/:id`, 
            async (req:Request, res:Response, next:NextFunction)=> {
                server.debug(`** PUT /signalk/v1/api/resources/:customType/:id`);

                if(!customTypes.includes(req.params.customType)) {
                    server.debug(`** Unhandled custom path ${req.params.customType}...next()`);
                    next();
                    return;
                }
                let resData:StoreRequestParams = {
                    id: req.params.id,
                    type: req.params.customType,
                    value: req.params.body
                };

                actionResourceRequest('', resData)
                .then(
                    (r:any) => {
                        if(r.statusCode>=400) { 
                            res.status(r.statusCode).send(r.message);
                        }
                        else { res.json(r) }                    
                    }
                ).catch( err => { 
                    res.status(500);
                }); 
            }
        );

        (server as any).post(
            `/signalk/v1/api/resources/:customType`, 
            async (req:Request, res:Response, next:NextFunction)=> {
                server.debug(`** POST /signalk/v1/api/resources/:customType`);

                if(!customTypes.includes(req.params.customType)) {
                    server.debug(`** Unhandled custom path ${req.params.customType}...next()`);
                    next();
                    return;
                }
                let resData:StoreRequestParams = {
                    id: utils.uuidPrefix + uuid(),
                    type: req.params.customType,
                    value: req.params.body
                };

                actionResourceRequest('', resData)
                .then(
                    (r:any) => {
                        if(r.statusCode>=400) { 
                            res.status(r.statusCode).send(r.message);
                        }
                        else { res.json(r) }                    
                    }
                ).catch( err => { 
                    res.status(500);
                }); 
            }
        );
    }

    /** retrieve custom resource entries 
     * req: http request object
     * list: true: resource list, false: single entry
     * *******************************/
    const getCustomResource= async (req:Request, list:boolean=false) => {
        let err= { 
            state: 'COMPLETED', 
            message: `Cannot GET ${req.path}`, 
            statusCode: 404
        };

        let query:any= Object.assign({}, req.query);
        query['position']= getVesselPosition();
 
        if(list) { // retrieve resource list
            let r= await db.getResources(req.params.customType, null, query);      
            if(typeof r.error==='undefined') { return r }
            else { return err }             
        }
        else { // retrieve resource entry
            let r= await db.getResources(req.params.customType, req.params.id);
            if(typeof r.error==='undefined') { return r }
            else { return err } 
        }
    }

    /** handle Resource POST, PUT, DELETE requests 
     * http: false: WS formatted status, true: http formatted status **/
    const actionResourceRequest= async (context:string, dbReq:StoreRequestParams):Promise<ActionResult> => {
        server.debug(`Data= ${JSON.stringify(dbReq)}, context= ${context}`) 
        let result:ActionResult;

        // ** test for valid resource identifier
        if( !utils.isUUID(dbReq.id) ) {
            return { 
                state: 'COMPLETED', 
                statusCode: 406,
                message: `Invalid resource id!` 
            };
        }
  
        let dbop= await db.setResource(dbReq);   

        if(typeof dbop.error==='undefined') { // OK
            sendDelta(dbReq);
            result= { state: 'COMPLETED', message:'COMPLETED', statusCode: 200 };
        }
        else {  // error
            result= { 
                state: 'COMPLETED', 
                statusCode: 502,
                message: `Error updating resource!` 
            };               
        }              
        return result;
    } 
     
    // ** send delta message for resource
    const sendDelta= (r:StoreRequestParams)=> {
        let key= r.id;
        let p= `resources.${r.type}.${key}`;
        let val:Array<DeltaMessage>= [
            {
                path: p, 
                value: r.value
            }
        ];
        server.debug(`****** Send Delta: ******`);
        let msg: DeltaUpdate= {updates: [ {values: val} ] }
        server.debug(JSON.stringify(msg));
        server.handleMessage(plugin.id, msg);
    }

    const getVesselPosition= ()=> {
        let p:any= server.getSelfPath('navigation.position');
        return (p && p.value) ? [ p.value.longitude, p.value.latitude ] : null;
    }

    return plugin;
}


