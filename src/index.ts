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

//import { ResourceTypes, ResourceProvider } from '@signalk/server-api';

type SignalKResourceType= 'routes' | 'waypoints' |'notes' |'regions' |'charts'
export type ResourceTypes= SignalKResourceType[] | string[]

export interface ResourceProviderMethods {
  pluginId?: string
  listResources: (type: string, query: { [key: string]: any }) => Promise<any>
  getResource: (type: string, id: string) => Promise<any>
  setResource: (
    type: string,
    id: string,
    value: { [key: string]: any }
  ) => Promise<any>
  deleteResource: (type: string, id: string) => Promise<any>
}

export interface ResourceProvider {
  types: ResourceTypes
  methods: ResourceProviderMethods
}

import { DBStore } from './lib/dbfacade';
import { FileStore } from './lib/filestorage';
import { Utils} from './lib/utils';
import { StoreRequestParams } from './types';

interface ResourceProviderPlugin extends ServerPlugin {
    resourceProvider: ResourceProvider
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
        start: (options:any, restart:any)=> { doStartup( options ) },
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

    let apiProviderFor: string[];
    let customTypes: string[];

    const doStartup= (options:any) => {
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
            for(let i in config.API) {
                if(config.API[i]) {
                    apiProviderFor.push(i as string);
                }
            }
            customTypes= [];
            if(config.resourcesOther && Array.isArray(config.resourcesOther)) {
                customTypes= config.resourcesOther.map( (i:any) => {
                    return i.name;
                });
            }
            plugin.resourceProvider.types= apiProviderFor.concat(customTypes);

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

                server.debug(`** ${plugin.name} started... ${(!res.error) ? 'OK' : 'with errors!'}`);    
                let msg:string= `Resource Provider (active): ${plugin.resourceProvider.types.toString()}`;       
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

    const getVesselPosition= ()=> {
        let p:any= server.getSelfPath('navigation.position');
        return (p && p.value) ? [ p.value.longitude, p.value.latitude ] : null;
    }

    // ******* Signal K server Resource Provider interface functions **************
    
     const apiGetResource= async (resType:string, id:string, params?:any):Promise<any>=> {
         // append vessel position to params
        params= params ?? {};
        params.position= getVesselPosition();
        server.debug(`*** apiGetResource:  ${resType}, ${id}, ${JSON.stringify(params)}`)
        if(!id) { // retrieve resource list          
            let r= await db.getResources(resType, null, params);
            if(typeof r.error==='undefined') { return r }
            else { throw(r.error) }   
        }
        else { // retrieve resource entry
            let r= await db.getResources(resType, id);
            if(typeof r.error==='undefined') {
                return r;
                /*if(p.attribute) { // extract resource attribute value
                    let a= eval(`r.${p.attribute}`);
                    if(a) { return a }
                    else { return err }
                }
                else { return r }*/
            }
            else { 
                throw(r.error)
            } 

        }
    }

    const apiSetResource= async (resType:string, id:string, value:any):Promise<any>=> {
        server.debug(`*** apiSetResource:  ${resType}, ${id}, ${value}`);
        let r: StoreRequestParams = {
            type: resType,
            id: id,
            value: value
        }
        try {
            let dbop= await db.setResource(r);     
            if(typeof dbop.error==='undefined') { // OK
                return dbop;
            }
            else {  // error
                throw(dbop.error);        
            }
        }
        catch(error) {
            throw(error);
        }

    }

    return plugin;
}


