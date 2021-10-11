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

import { DBStore } from './lib/dbfacade';
import { FileStore } from './lib/filestorage';
import { Utils} from './lib/utils';
import uuid from 'uuid/v4';
import * as openApi from './openApi.json'

interface OpenAPIPlugin extends ServerPlugin {
    openApiPaths: () => object
}

const CONFIG_SCHEMA= {
    properties: { 
        API: {
            type: "object",
            title: "Resources (standard)",
            description: 'ENABLE / DISABLE `/signalk/v1/api/resources` path handling.',
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
            title: "Resources (other)",
            description: "Define paths for additional resource types.",
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
            "ui:title": "NOTE: Changing these selections will require a server re-start before they take effect!",
            "ui:help": "/signalk/v1/api/resources/routes"
        },
        waypoints: {
            "ui:widget": "checkbox",
            "ui:title": " ",
            "ui:help": "/signalk/v1/api/resources/waypoints"
        },
        notes: {
            "ui:widget": "checkbox",
            "ui:title": " ",
            "ui:help": "/signalk/v1/api/resources/notes"
        },
        regions: {
            "ui:widget": "checkbox",
            "ui:title": " ",
            "ui:help": "/signalk/v1/api/resources/regions"
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

module.exports = (server: ServerAPI): OpenAPIPlugin=> {
    let subscriptions: Array<any>= []; // stream subscriptions   
    let timers: Array<any>= [];        // interval imers
    let utils: Utils= new Utils();

    let plugin: OpenAPIPlugin= {
        id: 'sk-resources-fs',
        name: 'Resources Provider (sk-resources-fs)',
        schema: ()=> (CONFIG_SCHEMA),
        uiSchema: ()=> (CONFIG_UISCHEMA),   
        start: (options:any, restart:any)=> { doStartup( options, restart ) },
        stop: ()=> { doShutdown() },
        openApiPaths: () => openApi.paths,
    };

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

    let enabledResTypes: any;

    const doStartup= (options:any, restart:any)=> { 
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
            // compile enabled resource types list
            enabledResTypes= JSON.parse(JSON.stringify(config.API));
            if(config.resourcesOther && Array.isArray(config.resourcesOther) ) {
                config.resourcesOther.forEach( (i:any)=>{ enabledResTypes[i.name]= true });
            }            
			// ** initialise resource storage
            db.init({settings: config, path: server.config.configPath})
            .then( (res:any)=> {
				if(res.error) {
                    let msg:string= `*** ERROR: ${res.message} ***`;
					server.error(msg);                   
                    if(typeof server.setPluginError === 'function') { server.setPluginError(msg) }
                    else { server.setProviderError(msg) }		
                }

                let ae= 'Handling: ';
                for( let i in enabledResTypes) {
                    ae+= (enabledResTypes[i]) ? `${i},` : '';
                }
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

            server.debug(`** Registering resource paths **`);
            // ** initialise Delta PUT handlers **
            setupDeltaPUT();
            // ** initialise HTTP routes **
            initRoutes();
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
        server.debug('** Un-registering Update Handler(s) **');
        subscriptions.forEach( b=> b() );
        subscriptions= [];
        server.debug('** Stopping Timer(s) **');
        timers.forEach( t=> clearInterval(t) );
        timers= [];    
        if(db) { db.close().then( ()=> server.debug(`** Store closed **`) ) }
        let msg= 'Stopped.';
        if(typeof server.setPluginStatus === 'function') { server.setPluginStatus(msg) }
        else { server.setProviderStatus(msg) }	
    }

    // ** Signal K Resources HTTP path handlers **
    const initRoutes= ()=> {
        let router: any = server;
        // add ./paths api route
        server.debug(`** Registering API route ./paths **`);
        router.get(
            `/skServer/plugins/${plugin.id}/paths`, 
            (req:any, res:any)=> { 
                res.status(200);
                server.debug(enabledResTypes);
                res.json( Object.entries(enabledResTypes).map(i=>{ if(i[1]) { return i[0] }}).filter( i=>{ return i }) );
            }
        );            
        // add /signalk/v1/api/resources route
        server.debug(`** Registering /signalk/v1/api/resources path **`);
        router.get(
            `/signalk/v1/api/resources`, 
            (req:any, res:any)=> {
                let app: any = server;
                let resRoutes:Array<string>= [];
                app._router.stack.forEach((i:any)=> {
                    if(i.route && i.route.path && typeof i.route.path==='string') {
                        if(i.route.path.indexOf('/signalk/v1/api/resources')!=-1) {
                            let r= i.route.path.split('/');
                            if( r.length>5 && !resRoutes.includes(r[5]) ) { resRoutes.push(r[5]) }
                        }
                    }
                });
                res.json(resRoutes);
        });    
        // add routes for each resource type
        Object.entries(enabledResTypes).forEach( ci=>{
            server.debug(`** Registering resource path **`);
            if(ci[1]) {
                server.debug(`** Registering ${ci[0]} API paths **`);
                router.get(
                    `/signalk/v1/api/resources/${ci[0]}/meta`, 
                    (req:any, res:any)=> {
                    res.json( {description: `Collection of ${ci[0]}, each named with a UUID`} );
                });          
                router.get(
                    `/signalk/v1/api/resources/${ci[0]}`, 
                    async (req:any, res:any)=> {
                    req.query['position']= getVesselPosition()
                    compileHttpGetResponse(req, true)
                    .then( r=> {
                        if(r.statusCode>=400) { 
                            res.status(r.statusCode).send(r.message);
                        }
                        else { res.json(r) }                    
                    })
                    .catch (err=> { res.status(500) } )
                });
                router.get(
                    `/signalk/v1/api/resources/${ci[0]}/${utils.uuidPrefix}*-*-*-*-*`, 
                    async (req:any, res:any)=> {
                    compileHttpGetResponse(req)
                    .then( r=> {
                        if(r.statusCode>=400) { 
                            res.status(r.statusCode).send(r.message);
                        }
                        else { res.json(r) }                    
                    })
                    .catch (err=> { res.status(500) } ) 
                });  
                router.post(
                    `/signalk/v1/api/resources/${ci[0]}`, 
                    async (req:any, res:any)=> {
                    let p= formatActionRequest(req)
                    actionResourceRequest('', p.path, p.value) 
                    .then( (r:any)=> {
                        if(r.statusCode>=400) { 
                            res.status(r.statusCode).send(r.message);
                        }
                        else { res.json(r) }                    
                    })
                    .catch (err=> { res.status(500) } ) 
                });
                router.put(
                    `/signalk/v1/api/resources/${ci[0]}/${utils.uuidPrefix}*-*-*-*-*`, 
                    async (req:any, res:any)=> {
                        let p= formatActionRequest(req)
                        actionResourceRequest('', p.path, p.value)
                        .then( (r:any)=> {
                            if(r.statusCode>=400) { 
                                res.status(r.statusCode).send(r.message);
                            }
                            else { res.json(r) }                    
                        })
                        .catch (err=> { res.status(500) } ) 
                    }
                );                                
                router.delete(
                    `/signalk/v1/api/resources/${ci[0]}/${utils.uuidPrefix}*-*-*-*-*`, 
                    async (req:any, res:any)=> {
                    let p= formatActionRequest(req, true);
                    actionResourceRequest('', p.path, p.value)
                    .then( (r:any)=> {
                        if(r.statusCode>=400) { 
                            res.status(r.statusCode).send(r.message);
                        }
                        else { res.json(r) }                    
                    })
                    .catch (err=> { res.status(500) } ) 
                });
            }
        })    
    }

    // *** SETUP ROUTE HANDLING **************************************

    // ** register DELTA PUT handlers **
    const setupDeltaPUT= ()=> {
        if(server.registerPutHandler) {
            Object.entries(enabledResTypes).forEach( ci=>{
                if(ci[1]) { 
                    server.debug(`** Registering ${ci[0]}  DELTA Action Handler **`);
                    server.debug(`** resources.${ci[0]} **`);
                    server.registerPutHandler(
                        'vessels.self',
                        `resources.${ci[0]}`,
                        (context, path, value, cb)=> { 
                            server.debug('DELTA PUT ACTION');
                            actionResourceRequest(context, path, value)
                            .then( result=>{ cb(result) } );
                            return { state: 'PENDING', statusCode: 202, message: 'PENDING'};
                        }
                    ); 
                }
            });                           
        }         
    }

    // *** RESOURCE PROCESSING **************************************

    /** compile http api get response 
     * req: http request object
     * list: true: resource list, false: single entry
     * *******************************/
    const compileHttpGetResponse= async (req:any, list:boolean=false)=> {
        let err= { 
            state: 'COMPLETED', 
            message: `Cannot GET ${req.path}`, 
            statusCode: 404
        };

        let p:any= parsePath(req.path);
        if(!p.type) { return err }
 
        if(list) { // retrieve resource list
            let r= await db.getResources(p.type, null, req.query);      
            if(typeof r.error==='undefined') { return r }
            else { return err }             
        }
        else { // retrieve resource entry
            let r= await db.getResources(p.type, p.uuid);
            if(p.attribute) { // extract resource attribute value
                let a= eval(`r.${p.attribute}`);
                if(a) { return a }
                else { return err }
            }
            else { return r }
        }
    }

    // ** parse provided path to resource type, uuid and attributes
    // path: /signalk/v1/api/resources/<restype>/<uuid>/<attribute>
    const parsePath= (path:string)=> { 
        let res:any= {
            type: null,
            uuid: null,
            attribute: null
        };
        let a:Array<string>= path.split('/');
        server.debug(path);
        server.debug(a.toString());
        res.type= a[5];  // set resource type
        if( utils.isUUID(a[a.length-1]) ) { res.uuid= a[a.length-1] }
        else {  
            if( a.length>6 && utils.isUUID(a[6]) ) {
                server.debug(a[6]);
                res.uuid= a[6].slice(a[6].lastIndexOf(':')+1);
                res.attribute= a.slice(7).join('.');
            }
        }
        server.debug(res);
        return res;
    }

    /** format http request path for HTTP PUT, POST, DELETE (via router)
     * req.path: /signalk/v1/api/resources/<restype>/<uuid>
     * forDelete: true= returned value=null
     * returns: { path: string, value: {id: string} } **/
    const formatActionRequest= (req:any, forDelete:boolean=false)=> {
        server.debug(req.path);
        let result:any= {path: null, value: {} };
        let id:string;
        let p:Array<string>= req.path.split('/').slice(4);
        server.debug(p.toString());
        if(p.length==2) { 
            result.path= p.join('.');
            id= utils.uuidPrefix + uuid();
        }
        else { 
            result.path= p.slice(0,2).join('.');              
            id= p[2];
        }
        result.value[id]= (forDelete) ? null 
            : (typeof req.body.value!=='undefined') ? req.body.value : req.body;

        server.debug('** FORMATTED ACTION REQUEST: **');
        server.debug(result);
        return result;
    }

    /** handle Resource POST, PUT, DELETE requests 
     * http: false: WS formatted status, true: http formatted status **/
    const actionResourceRequest= async ( context:string, path:string, value:any):Promise<ActionResult> => {
        if(path[0]=='.') {path= path.slice(1) }
        server.debug(`Path= ${JSON.stringify(path)}, value= ${JSON.stringify(value)}`) 
        let r:any= {};
        let p:Array<string>= path.split('.');
        let ok:boolean= false; 
        let result:ActionResult;
        if(enabledResTypes) {
            Object.entries(enabledResTypes).forEach( i=> { 
                if(path.indexOf(i[0])!=-1 && i[1] ) { ok= true }
            });
        }  
  
        if( ok ) {  // enabled resource type
            r.type= (p.length>1) ? p[1] :  p[0];   // ** get resource type from path **
			let v:any= Object.entries(value);            // ** value= { uuid: { resource_data} }
            r.id= v[0][0];                           // uuid
            r.value= v[0][1];                        // resource_data
            // ** test for valid resource identifier
            if( !utils.isUUID(r.id) ) {
                return { 
                    state: 'COMPLETED', 
                    statusCode: 400,
                    message: `Invalid resource id!` 
                };
            }
        }
        else { 
            return { 
                state: 'COMPLETED', 
                statusCode: 400,
                message: `Invalid path!` 
            };   
        }
        // store action
        let dbop= await db.setResource(r);        
        if(typeof dbop.error==='undefined') { // OK
            sendDelta(r);
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
    const sendDelta= (r:any)=> {
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


