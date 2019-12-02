
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));

const path= require('path')
const utils = require('./utils')
const pkg= require('../package.json')

// ** resource storage library functions **
module.exports= {
	
    savePath: '',
    dbName: 'resources.db',
    resources: {},
	
    // ** check / create path to persist resources
    init: async function(config) {
        let url= false
        if(typeof config.settings.path==='undefined') { this.savePath= config.path + '/resources' }
        else if(config.settings.path[0]=='/'){ this.savePath= config.settings.path }
        else if(config.settings.path.indexOf('http')!=-1){ 
            this.savePath= config.settings.path 
            url= true
        }
        else { this.savePath= path.join(config.path, config.settings.path) }
        return new Promise( (resolve, reject)=> {
            if(config.settings.API) {
                Object.entries(config.settings.API).forEach( i=>{ 
                    if(i[1]) {
                        try {
                            let dbPath= (url) 
                                ? this.savePath + `${(this.savePath.slice(-1)!='/') ? '/' : ''}` + `${i[0]}_db`
                                : path.join(this.savePath, `${i[0]}_db`)
                            
                            this.resources[i[0]]= new PouchDB(dbPath)
                            this.resources[i[0]].info().then( info=> {
                                console.log(`${info.db_name} (${info.doc_count}) - OK...`)
                            }).catch(err=> { console.log(err) }); 
                            resolve( {error: false, message: `OK`} )
                        }
                        catch(err) { reject( {error: true, message: err} ) }
                    }
                })
            }
            else { reject( {error: true, message: `Invalid config!`} )}
        })
    },

    // ** close database /free resources **
    close: function() { 
        Object.entries(this.resources).forEach( db=> {
            db[1].close().then( ()=> console.log(`** ${db[0]} DB closed **`) ) 
        })
    },

    /** return persisted resources from storage OR
     * {error: true, message: string, status: number }
     * ****************************************/
    getResources: async function(type=null, item=null, params={}) {
		// ** parse supplied params
        params= utils.processParameters(params) 
        if(params.error) { return params } 	
        try {
            if(item) { // return specified resource
                return this.getRecord(this.resources[type], item)
            }
            else {	// return matching resources
                return this.listRecords(this.resources[type], params, type)
            }
        }
        catch(err) {
            console.log(err)
            return {
                error: true, 
                message: `Error retreiving resources from ${this.savePath}. Ensure plugin is active or restart plugin!`,
                status: 400
            }
        }
    },
	
    /** save / delete (r.value==null) resource file 
        r: {
            type: 'routes' | 'waypoints' | 'notes' | 'regions',
            id: string,
            value: any (null=delete)
        }
     ***********************************************/
    setResource: async function(r) {
        let err= {error: true, message: ``, status: 404 }
        if( !utils.isUUID(r.id) ) {
            err.message= 'Invalid resource id!'
            return err 
        }
        try {
            //console.log(`******  ${r.type}: ${(r.value===null) ? 'DELETE' : 'SAVE'} -> ${r.id} ******`)
            if(r.value===null) { // ** delete resource **
                return this.deleteRecord(this.resources[r.type], r.id)
            }
            else {  // ** add / update file
                if( !utils.validateData(r) ) { // ** invalid SignalK value **
                    err.message= 'Invalid resource data!'
                    return err 
                }
                // add source / timestamp
                r.value.timestamp= new Date().toISOString()
                if(typeof r.value.$source === 'undefined') { r.value.$source= pkg.name }

                // update / add resource 
                let result= await this.updateRecord(this.resources[r.type], r.id, r.value)
                if(typeof result.error!== 'undefined') {  // unable to update
                    return this.newRecord(this.resources[r.type], r.id, r.value)
                }
                else { return result }
            } 
        }
        catch(err) {
            console.log(err)
            return {
                error: true, 
                message: `Error setting resource! Ensure plugin is active or restart plugin!`,
                status: 400
            }
        }
    },

    //*** DB API calls *****
    listRecords: async function(db, params={}, type) {
        let options= { include_docs: true }
        let result= {}
        let count=0
        //if(typeof params.limit!=='undefined') { options['limit']= params.limit }
        let entries= await db.allDocs(options)
        entries.rows.forEach( row=> {
            if(typeof params.limit!=='undefined' && count>= parseInt(params.limit) ) { }
            else if(utils.passFilter(row.doc.resource, type, params) ) { // ** true if entry meets criteria **
                result[row.id]= row.doc.resource 
                count++
            }
        })
        return result
    },

    getRecord: async function (db, uuid) {
        try {
            let entry=  await db.get(uuid) 
            return entry.resource
        } 
        catch (err) { 
            console.error(`Fetch ERROR: Resource ${uuid} could not be retrieved!`)
            return err
        }
    },

    deleteRecord: async function (db, uuid) {
        try {
            let entry = await db.get(uuid);
            return await db.remove(entry._id, entry._rev)
        } 
        catch (err) { 
            console.error(`Delete ERROR: Resource ${uuid} could not be deleted!`)
            return err
        } 
    },

    newRecord: async function (db, uuid, doc) {
        try {
            let result=  await db.put({
                _id: uuid,
                resource: doc
            });
            return result
        } 
        catch (err) { 
            console.error(`Create ERROR: Resource ${uuid} could not be created!`)
            return err
        }
    },
    
    updateRecord: async function (db, uuid, doc) {
        try {
            let entry = await db.get(uuid);
            let result= await db.put({
                _id: uuid,
                _rev: entry._rev,
                resource: doc
            });
            return result
        } 
        catch (err) { 
            //console.log(`Update ERROR: Resource ${uuid} was not found... create new resource...`)
            return err
        }
    }    
	
}

