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
const db = require('./filestorage')
const utils = require('./utils')

module.exports= function (app) {

    let plugin= {
        id: 'resources',
        name: 'Resources Provider',
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
	
    plugin.start= (props)=> {
        try {
            app.debug(`${plugin.name} starting.......`) 
            app.debug(`** pkgname: ${pkg.name}, pkgversion: ${pkg.version}`) 

            config= props || config;
            app.debug('*** Configuration ***')
            app.debug(config)           

			// ** initialise resource storage
            db.init({settings: config, path: app.config.configPath})
            .then( res=> {
				if(res.error) {
					app.error(`*** ERROR: ${res.message} ***`)
					app.setProviderError(res.message)			
				}
				app.debug(res)
                let ae= 'Handling:'
                ae+= (config.API && config.API.routes) ? ' Routes, ' : ''
                ae+= (config.API && config.API.waypoints) ? ' Waypoints, ' : ''
                ae+= (config.API && config.API.notes) ? ' Notes, ' : ''
                ae+= (config.API && config.API.regions) ? ' Regions, ' : ''
                app.setProviderStatus(`Started. ${ae}`) 
                app.debug(`** ${plugin.name} started... ${(!res.error) ? 'OK' : 'with errors!'}`)     
            })
            .catch( e=> { app.debug(e) } )
            
            // **register HTTP PUT handlers
            if(app.registerActionHandler) {
                app.debug('** Registering PUT Action Handler(s) **')
                setupPUTHandlers() 
            }  
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
    }

    plugin.schema= { 
        properties: { 
            API: {
                type: "object",
                description: `Note: Changing these selections will require a server re-start before they take effect!`,
                properties: {
                    routes: {
                        type: "boolean", 
                        title: "Enabled"
                    },
                    waypoints: {
                        type: "boolean",
                        title: "Enabled"
                    },                                  
                    notes: {
                        type: "boolean",
                        title: "Enabled"
                    },                   
                    regions: {
                        type: "boolean",
                        title: "Enabled"
                    }                    
                }
            }
        } 
    }

    plugin.uiSchema= {
        API: {
            routes: {
                "ui:widget": "checkbox",
                "ui:title": "Enable / Disable ROUTES",
                "ui:help": "Check this box to allow Routes to be managed"
            },
            waypoints: {
                "ui:widget": "checkbox",
                "ui:title": "Enable / Disable WAYPOINTS",
                "ui:help": "Check this box to allow Waypoints to be managed"
            },
            notes: {
                "ui:widget": "checkbox",
                "ui:title": "Enable / Disable NOTES",
                "ui:help": "Check this box to allow Notes to be managed"
            },
            regions: {
                "ui:widget": "checkbox",
                "ui:title": "Enable / Disable REGIONS",
                "ui:help": "Check this box to allow Regions to be managed"
            }                          
        }
    }

    // *** set up **************************************
   
    plugin.signalKApiRoutes= router=> {
        if(config.API.waypoints) {
            app.debug('** Registering Waypoint routes **')
            router.get('/resources/waypoints/meta', (req, res)=> {
                res.json( {description: 'Collection of waypoints, each named with a UUID'} )
            })           
            router.get('/resources/waypoints', (req, res)=> {
                req.query['position']= getVesselPosition()
                res.json( db.getResources('waypoint', null, req.query).waypoints )
            })   
            router.get(`/resources/waypoints/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let r= compileHttpResponse(req, 'waypoint') 
                if(r.error) { res.send( r.message ) }
                else { res.json(r.data) }
            })   
            router.post(`/resources/waypoints/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let p= req.path.split('/')
				let path= p.slice(0,2).join('.')
				let value= {}
				value[p[2]]= (req.body.value) ? req.body.value : req.body
				res.json( actionResourceRequest(
                    'vessels.self',
                    path, 
                    value, 
                    null
                ) )
            })              
            router.delete(`/resources/waypoints/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let p= req.path.split('/')
				let path= p.slice(0,2).join('.')
				let value= null
				res.json( actionResourceRequest(
                    'vessels.self',
                    path, 
                    value, 
                    null
                ) )
            })
        }
        
        if(config.API.routes) {
            app.debug('** Registering Route routes **')
            router.get('/resources/routes/meta', (req, res)=> {
                res.json( {description: 'Collection of routes, each named with a UUID'} )
            })            
            router.get('/resources/routes', (req, res) => {
                req.query['position']= getVesselPosition()
                res.json( db.getResources('route', null, req.query).routes )
            })   
            router.get(`/resources/routes/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let r= compileHttpResponse(req, 'route') 
                if(r.error) { res.send( r.message ) }
                else { res.json(r.data) }
            })  
            router.post(`/resources/routes/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let p= req.path.split('/')
				let path= p.slice(0,2).join('.')
				let value= {}
				value[p[2]]=(req.body.value) ? req.body.value : req.body
				res.json( actionResourceRequest(
                    'vessels.self',
                    path, 
                    value, 
                    null
                ) )
            })              
            router.delete(`/resources/routes/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let p= req.path.split('/')
				let path= p.slice(0,2).join('.')
				let value= null
				res.json( actionResourceRequest(
                    'vessels.self',
                    path, 
                    value, 
                    null
                ) )
            })      
        }  
        
        if(config.API.notes) {
            app.debug('** Registering Note routes **')
            router.get('/resources/notes/meta', (req, res)=> {
                res.json( {description: 'Collection of notes, each named with a UUID'} )
            })            
            router.get('/resources/notes', (req, res)=> {
                req.query['position']= getVesselPosition()
                res.json( db.getResources('note', null, req.query).notes )
            })  
            router.get(`/resources/notes/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let r= compileHttpResponse(req, 'note') 
                if(r.error) { res.send( r.message ) }
                else { res.json(r.data) }
            })
            router.post(`/resources/notes/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let p= req.path.split('/')
				let path= p.slice(0,2).join('.')
				let value= {}
				value[p[2]]= (req.body.value) ? req.body.value : req.body
				res.json( actionResourceRequest(
                    'vessels.self',
                    path, 
                    value, 
                    null
                ) )
            })              
            router.delete(`/resources/notes/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let p= req.path.split('/')
				let path= p.slice(0,2).join('.')
				let value= null
				res.json( actionResourceRequest(
                    'vessels.self',
                    path, 
                    value, 
                    null
                ) )
            })
        }

        if(config.API.regions) {
            app.debug('** Registering Region routes **')
            router.get('/resources/regions/meta', (req, res)=> {
                res.json( {description: 'Collection of regions, each named with a UUID'} )
            })            
            router.get('/resources/regions', (req, res)=> {
                req.query['position']= getVesselPosition()
                res.json( db.getResources('region', null, req.query).regions )
            })  
            router.get(`/resources/regions/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let r= compileHttpResponse(req, 'region') 
                if(r.error) { res.send( r.message ) }
                else { res.json(r.data) }
            }) 
            router.post(`/resources/regions/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let p= req.path.split('/')
				let path= p.slice(0,2).join('.')
				let value= {}
				value[p[2]]= (req.body.value) ? req.body.value : req.body
				res.json( actionResourceRequest(
                    'vessels.self',
                    path, 
                    value, 
                    null
                ) )
            })              
            router.delete(`/resources/regions/${utils.uuidPrefix}*-*-*-*-*`, (req, res)=> {
                let p= req.path.split('/')
				let path= p.slice(0,2).join('.')
				let value= null
				res.json( actionResourceRequest(
                    'vessels.self',
                    path, 
                    value, 
                    null
                ) )
            }) 
        }                     
     
        return router
    }

    function setupPUTHandlers() {
        if(config.API.routes) {
            app.debug('** Registering Route PUT Handler(s) **')
            app.registerActionHandler(
                'vessels.self',
                'resources.routes',
                actionResourceRequest
            )
        }
        if(config.API.waypoints) {
            app.debug('** Registering Waypoint PUT Handler(s) **')
            app.registerActionHandler(
                'vessels.self',
                'resources.waypoints',
                actionResourceRequest
            )
        }
        if(config.API.notes) {
            app.debug('** Registering Notes PUT Handler(s) **')
            app.registerActionHandler(
                'vessels.self',
                'resources.notes',
                actionResourceRequest
            )
        }    
        if(config.API.regions) {
            app.debug('** Registering Regions PUT Handler(s) **')
            app.registerActionHandler(
                'vessels.self',
                'resources.regions',
                actionResourceRequest
            )
        }                  
    }

    // *** resource processing **************************************

    // ** compile http api get response **
    function compileHttpResponse(req, resType) {
        let res= {error: false, message: '', data: null }

        let p= parsePath(req.path)
        if(!p.path) { 
            res.error= true
            res.message= `Cannot GET ${req.path}`
            return res
        }

        let fname= p.path.substring(p.path.lastIndexOf(':')+1)
        let r= db.getResources(resType, fname)
        
        if(r.error) { 
            res.error= true
            res.message= `Cannot GET ${req.path}`
            return res
        }

        if(p.attribute) { 
            let a= eval(`r.${p.attribute}`)
            if(a) { res.data= a }
            else { 
                res.error= true
                res.message= `Cannot GET ${req.path}` 
            }
        }
        else { res.data=r }

        return res         
    }

    // ** parse provided path to resource and attributes
    function parsePath(path) {
        let res= {
            path: null,
            attribute: null
        }
        let a= path.split('/')
        if( isUUID(a[a.length-1]) ) { res.path= path }
        else {  
            if( isUUID(a[3]) ) {
                res.path= a.slice(0,4).join('/')
                res.attribute= a.slice(4).join('.')
            }
        }
        app.debug(res)
        return res
    }

    // ** handle Resource POST, PUT, DELETE requests
    function actionResourceRequest(context, path, value, cb) {
        if(path[0]=='.') {path= path.slice(1) }
        app.debug(`Path= ${JSON.stringify(path)}, value= ${JSON.stringify(value)}`) 
        let r={} 
        let p= path.split('.')   
        if( (path.indexOf('routes')!=-1 && config.API.routes) ||
                (path.indexOf('waypoints')!=-1 && config.API.waypoints) ||
                (path.indexOf('notes')!=-1 && config.API.notes) ||
                (path.indexOf('regions')!=-1 && config.API.regions) ) {
            // ** get resource id and set type from path **
            r.type= p[1].slice(0, p[1].length-1)
			let v= Object.entries(value)
            r.id= v[0][0]
            r.value= v[0][1]
            app.debug(r)  
            // ** test for valid resource identifier
            if( !utils.isUUID(r.id) ) {
                return { 
                    state: 'COMPLETED', 
                    resultStatus: 400, 
                    statusCode: 400,
                    message: `Invalid resource id!` 
                }
            }
        }
        else { 
            return { 
                state: 'COMPLETED', 
                resultStatus: 400, 
                statusCode: 400,
                message: `Invalid path!` 
            }        
        }

        switch(r.type) {
            case 'route': 
            case 'waypoint':
            case 'note':
            case 'region':
            if(db.setResource(r)) { 
                sendDelta(r)
                return { state: 'COMPLETED', resultStatus: 200, statusCode: 200 } 
            }
            else {
                return { 
                    state: 'COMPLETED', 
                    resultStatus: 502, 
                    statusCode: 502,
                    message: `Invalid resource data values!` 
                }                    
            } 
            default:
                return { 
                    state: 'COMPLETED', 
                    resultStatus: 400, 
                    statusCode: 400,
                    message: `Invalid resource type (${r.type})!` 
                }
        }
    } 
     
    // ** send delta message for resource
    function sendDelta(r) {
        let key= r.id
        let p= `resources.${r.type}s.${key}`
        let val= [{path: p, value: r.value}]
        app.debug(`****** Send Delta: ******`)
        app.debug(JSON.stringify({updates: [ {values: val} ] }))
        app.handleMessage(plugin.id, {updates: [ {values: val} ] })
    }

    function getVesselPosition() {
        let p= app.getSelfPath('navigation.position')
        return (p && p.value) ? [ p.value.longitude, p.value.latitude ] : null
    }

    return plugin
}


