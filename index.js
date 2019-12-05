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

const pkg= require('./package.json')
const dbAdapter = require('./lib/dbfacade')
const fsAdapter = require('./lib/filestorage')
const utils = require('./lib/utils')
const uuid = require('uuid/v4')

module.exports= function(app) {

    let plugin= {
        id: 'sk-resources-fs',
        name: 'Resources Provider (sk-resources-fs)',
        description: pkg.description,
        version: pkg.version
    }
    let config= {
        API: {
            routes: false,
            waypoints: false,
            notes: false,
            regions: false
        }
    }

    let db= dbAdapter  // resource data source handle

    plugin.start= (options)=> {
        try {
            app.debug(`${plugin.name} starting.......`) 
            app.debug(`** pkgname: ${pkg.name}, pkgversion: ${pkg.version}`) 

            config= options || config;
            app.debug('*** Configuration ***')
            app.debug(config)  
            if(!config.source) { db= fsAdapter }
            else {
                switch(config.source) {
                    case 'db':
                        db= dbAdapter 
                        break
                    default: 
                        db= fsAdapter 
                }
            }
			// ** initialise resource storage
            db.init({settings: config, path: app.config.configPath})
            .then( res=> {
				if(res.error) {
					app.error(`*** ERROR: ${res.message} ***`)
					app.setProviderError(res.message)			
                }
                let ae= 'Handling:'
                ae+= (config.API && config.API.routes) ? ' Routes, ' : ''
                ae+= (config.API && config.API.waypoints) ? ' Waypoints, ' : ''
                ae+= (config.API && config.API.notes) ? ' Notes, ' : ''
                ae+= (config.API && config.API.regions) ? ' Regions, ' : ''
                app.setProviderStatus(`Started. ${ae}`) 
                app.debug(`** ${plugin.name} started... ${(!res.error) ? 'OK' : 'with errors!'}`)     
            })
            .catch( e=> { 
                app.debug(e)
                app.setProviderStatus(`Initialisation Error! See console for details.`) 
            } )

            // ** initialise Delta PUT handlers **
            setupDeltaPUT()
        } 
        catch (e) {
            app.setProviderError(`Started with errors!`)
            app.error("error: " + e)
            console.error(e.stack)
            return e
        }       
    }

    plugin.stop= ()=> { 
        app.debug(`${plugin.name} stopping.......`)   
        app.setProviderStatus(`Stopped`)
        db.close()
    }

    plugin.schema= { 
        properties: { 
            API: {
                type: "object",
                description: 'ENABLE / DISABLE `/signalk/api/resources` path handling.',
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

    plugin.uiSchema= {
        API: {
            routes: {
                "ui:widget": "checkbox",
                "ui:title": "NOTE: Changing these selections will require a server re-start before they take effect!",
                "ui:help": "/signalk/api/resources/routes"
            },
            waypoints: {
                "ui:widget": "checkbox",
                "ui:title": " ",
                "ui:help": "/signalk/api/resources/waypoints"
            },
            notes: {
                "ui:widget": "checkbox",
                "ui:title": " ",
                "ui:help": "/signalk/api/resources/notes"
            },
            regions: {
                "ui:widget": "checkbox",
                "ui:title": " ",
                "ui:help": "/signalk/api/resources/regions"
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

    // *** SETUP ROUTE HANDLING **************************************

    // ** register DELTA PUT handlers **
    setupDeltaPUT= ()=> {
        if(app.registerActionHandler) {
            Object.entries(config.API).forEach( ci=>{
                if(ci[1]) { 
                    app.debug(`** Registering ${ci[0]}  DELTA Action Handler **`)
                    app.registerActionHandler(
                        'vessels.self',
                        `resources.${ci[0]}`,
                        doActionHandler
                    )  
                }
            })                            
        }         
    }

    // ** DELTA PUT action handler **
    doActionHandler= (context, path, value, cb)=> { 
		app.debug('DELTA PUT ACTION')
		return actionResourceRequest( path, value) 
	}
   
    // ** Signal K Resources HTTP path handlers **
    plugin.signalKApiRoutes= router=> {
        Object.entries(config.API).forEach( ci=>{
            if(ci[1]) {
                app.debug(`** Registering ${ci[0]} API paths **`)
                router.get(`/resources/${ci[0]}/meta`, (req, res)=> {
                    res.json( {description: `Collection of ${ci[0]}, each named with a UUID`} )
                })          
                router.get(`/resources/${ci[0]}`, async (req, res)=> {
                    req.query['position']= getVesselPosition()
                    compileHttpGetResponse(req, true)
                    .then( r=> {
                        if(typeof r.error!=='undefined') { 
                            res.status(r.status).send(r.message)
                        }
                        else { res.json(r) }                    
                    })
                    .catch (err=> { res.status(500) } )
                })
                router.get(`/resources/${ci[0]}/${utils.uuidPrefix}*-*-*-*-*`, async (req, res)=> {
                    compileHttpGetResponse(req)
                    .then( r=> {
                        if(typeof r.error!=='undefined') { 
                            res.status(r.status).send(r.message)
                        }
                        else { res.json(r) }                    
                    })
                    .catch (err=> { res.status(500) } ) 
                })   
                router.post(`/resources/${ci[0]}`, async (req, res)=> {
                    let p= formatActionRequest(req)
                    actionResourceRequest( p.path, p.value) 
                    .then( r=> {
                        if(typeof r.error!=='undefined') { 
                            res.status(r.status).send(r.message)
                        }
                        else { res.json(r) }                    
                    })
                    .catch (err=> { res.status(500) } ) 
                }) 
                router.put(`/resources/${ci[0]}/${utils.uuidPrefix}*-*-*-*-*`, async (req, res)=> {
                    let p= formatActionRequest(req)
                    actionResourceRequest( p.path, p.value)
                    .then( r=> {
                        if(typeof r.error!=='undefined') { 
                            res.status(r.status).send(r.message)
                        }
                        else { res.json(r) }                    
                    })
                    .catch (err=> { res.status(500) } ) 
                })                                    
                router.delete(`/resources/${ci[0]}/${utils.uuidPrefix}*-*-*-*-*`, async (req, res)=> {
                    let p= formatActionRequest(req, true)
                    actionResourceRequest( p.path, p.value)
                    .then( r=> {
                        if(typeof r.error!=='undefined') { 
                            res.status(r.status).send(r.message)
                        }
                        else { res.json(r) }                    
                    })
                    .catch (err=> { res.status(500) } ) 
                })
            }
        })    
        return router
    }

    // *** RESOURCE PROCESSING **************************************

    /** compile http api get response 
     * req: http request object
     * list: true: resource list, false: single entry
     * *******************************/
    compileHttpGetResponse= async (req, list=false)=> {
        let err= {error: true, message: `Cannot GET ${req.path}`, status: 404 }

        let p= parsePath(req.path)
        if(!p.type) { return err }
 
        if(list) { // retrieve resource list
            return await db.getResources(p.type, null, req.query) 
        }
        else { // retrieve resource entry
            let r= await db.getResources(p.type, p.uuid) 
            if(p.attribute) { // extract resource attribute value
                let a= eval(`r.${p.attribute}`)
                if(a) { return a }
                else { return err }
            }
            else { return r }
        }
    }

    // ** parse provided path to resource type, uuid and attributes
    parsePath= path=> {
        let res= {
            type: null,
            uuid: null,
            attribute: null
        }
        let a= path.split('/')
        res.type= a[2]  // set resource type
        if( utils.isUUID(a[a.length-1]) ) { res.uuid= a[a.length-1] }
        else {  
            if( utils.isUUID(a[3]) ) {
                app.debug(a[3])
                res.uuid= a[3].slice(a[3].lastIndexOf(':')+1)
                res.attribute= a.slice(4).join('.')
            }
        }
        app.debug(res)
        return res
    }

    /** format http request path for action request 
     * forDelete: true= returned value=null, false= returned value= req.body
     * returns: { path: string, value: {id: string} } **/
    formatActionRequest= (req, forDelete=false)=> {
        let result= {path: null, value: {} }
        let id
        let p= req.path.slice(1).split('/')
        if(p.length==2) { 
            result.path= p.join('.')
            id= utils.uuidPrefix + uuid()
        }
        else { 
            result.path= p.slice(0,2).join('.')               
            id= p[2]
        }
        result.value[id]= (forDelete) ? null 
            : (typeof req.body.value!=='undefined') ? req.body.value : req.body

        app.debug('** FORMATTED ACTION REQUEST: **')
        app.debug(result)
        return result
    }

    // ** format actionRequest response message for http request 
    formatHttpResult= value=> {
        return { 
            error: (value.statusCode>=400) ? true : false,
            status: value.statusCode,
            message: value.message
        }
    }

    /** handle Resource POST, PUT, DELETE requests 
     * http: false: WS formatted status, true: http formatted status **/
    actionResourceRequest= async (path, value, http=false)=> {
        if(path[0]=='.') {path= path.slice(1) }
        //app.debug(`Path= ${JSON.stringify(path)}, value= ${JSON.stringify(value)}`) 
        let r={} 
        let p= path.split('.')  
        let ok= false 
        let result
        if(config.API) {
            Object.entries(config.API).forEach( i=> { 
                if(path.indexOf(i[0])!=-1 && i[1] ) { ok= true }
            })
        }  
  
        if( ok ) {  // enabled resource type
            r.type= (p.length>1) ? p[1] :  p[0]   // ** get resource type from path **
			let v= Object.entries(value)            // ** value= { uuid: { resource_data} }
            r.id= v[0][0]                           // uuid
            r.value= v[0][1]                        // resource_data
            // ** test for valid resource identifier
            if( !utils.isUUID(r.id) ) {
                result= { 
                    state: 'COMPLETED', 
                    resultStatus: 400, 
                    statusCode: 400,
                    message: `Invalid resource id!` 
                }
                return (http) ? formatHttpResult(result) : result
            }
        }
        else { 
            result= { 
                state: 'COMPLETED', 
                resultStatus: 400, 
                statusCode: 400,
                message: `Invalid path!` 
            }    
            return (http) ? formatHttpResult(result) : result    
        }

        switch(r.type) {
            case 'routes': 
            case 'waypoints':
            case 'notes':
            case 'regions':
                result= await db.setResource(r)          
                if(typeof result.error==='undefined') { // OK
                    sendDelta(r)
                    result= { state: 'COMPLETED', resultStatus: 200, statusCode: 200 } 
                    return (http) ? formatHttpResult(result) : result
                }
                else {  // error
                    result= { 
                        state: 'COMPLETED', 
                        resultStatus: 502, 
                        statusCode: 502,
                        message: `Error updating resource!` 
                    }
                    return (http) ? formatHttpResult(result) : result                 
                }              
                break;
            default:
                result= { 
                    state: 'COMPLETED', 
                    resultStatus: 400, 
                    statusCode: 400,
                    message: `Invalid resource type (${r.type})!` 
                }
                return (http) ? formatHttpResult(result) : result
        }
    } 
     
    // ** send delta message for resource
    sendDelta= r=> {
        let key= r.id
        let p= `resources.${r.type}.${key}`
        let val= [{path: p, value: r.value}]
        app.debug(`****** Send Delta: ******`)
        app.debug(JSON.stringify({updates: [ {values: val} ] }))
        app.handleMessage(plugin.id, {updates: [ {values: val} ] })
    }

    getVesselPosition= ()=> {
        let p= app.getSelfPath('navigation.position')
        return (p && p.value) ? [ p.value.longitude, p.value.latitude ] : null
    }

    return plugin
}


