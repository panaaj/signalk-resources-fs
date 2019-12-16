import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import { IResourceStore } from 'signalk-plugin-types';
import { Utils} from './utils';

import PouchDB from 'pouchdb';
PouchDB.plugin(require('pouchdb-find'));

// ** File Resource Store Class
export class DBStore implements IResourceStore {

    utils: Utils;
    savePath: string;
    resources: any;
    pkg: {id:string};

    constructor(pluginId:string='') { 
        this.utils= new Utils();
        this.savePath= '';
        this.resources= {};
        this.pkg= { id: pluginId };
    }
	
    // ** check / create path to persist resources
    async init(config:any) {
        let url:boolean= false;
        if(typeof config.settings.path==='undefined') { this.savePath= config.path + '/resources' }
        else if(config.settings.path[0]=='/'){ this.savePath= config.settings.path }
        else if(config.settings.path.indexOf('http')!=-1){ 
            this.savePath= config.settings.path;
            url= true;
        }
        else { this.savePath= path.join(config.path, config.settings.path) }

        let p:any= await this.checkPath(this.savePath)
        if(p.error) { return {error: true, message: `Unable to create ${this.savePath}!`} }
        else { 
            return new Promise( (resolve, reject)=> {
                if(config.settings.API) {
                    Object.entries(config.settings.API).forEach( i=>{ 
                        if(i[1]) {
                            try {
                                let dbPath= (url) 
                                    ? this.savePath + `${(this.savePath.slice(-1)!='/') ? '/' : ''}` + `${i[0]}_db`
                                    : path.join(this.savePath, `${i[0]}_db`);
                                
                                this.resources[i[0]]= new PouchDB(dbPath);
                                this.resources[i[0]].info().then( (info:any)=> {
                                    console.log(`${info.db_name} (${info.doc_count}) - OK...`);
                                }).catch( (err:any)=> { console.log(err) }); 
                                resolve( {error: false, message: `OK`} );
                            }
                            catch(err) { reject( {error: true, message: err} ) }
                        }
                    })
                }
                else { reject( {error: true, message: `Invalid config!`} )}
            })
        }
    }

    // ** close database /free resources **
    async close() { 
        Object.entries(this.resources).forEach( (db:any)=> {
            db[1].close()
            .then( ()=> console.log(`** ${db[0]} DB closed **`) )
            .catch( ()=> { console.log(`** ${db[0]} DB already closed **`) });
        });
        return true;
    }

    // ** check path exists / create it if it doesn't **
    checkPath(path:string= this.savePath) {
        return new Promise( (resolve, reject)=> {
            if(!path) { resolve({error: true, message: `Path not supplied!`}) }
            fs.access( // check path exists
                path, 
                fs.constants.W_OK | fs.constants.R_OK, 
                err=> {
                    if(err) {  //if not then create it
                        console.log(`${path} does NOT exist...`);
                        console.log(`Creating ${path} ...`);
                        mkdirp(path, (err)=> {
                            if(err) { resolve({error: true, message: `Unable to create ${path}!`}) }
                            else { resolve({error: false, message: `Created ${path} - OK...`}) }
                        })
                    }
                    else { // path exists
                        console.log(`${path} - OK...`);
                        resolve({error: false, message: `${path} - OK...`});
                    }
                }
            )
        })
    }    

    /** return persisted resources from storage OR
     * {error: true, message: string, status: number }
     * ****************************************/
    async getResources(type:string, item:any=null, params:any={}) {
		// ** parse supplied params
        params= this.utils.processParameters(params) 
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
    }
	
    /** save / delete (r.value==null) resource file 
        r: {
            type: 'routes' | 'waypoints' | 'notes' | 'regions',
            id: string,
            value: any (null=delete)
        }
     ***********************************************/
    async setResource(r:any) {
        let err= {error: true, message: ``, status: 404 }
        if( !this.utils.isUUID(r.id) ) {
            err.message= 'Invalid resource id!'
            return err 
        }
        try {
            //console.log(`******  ${r.type}: ${(r.value===null) ? 'DELETE' : 'SAVE'} -> ${r.id} ******`)
            if(r.value===null) { // ** delete resource **
                return this.deleteRecord(this.resources[r.type], r.id)
            }
            else {  // ** add / update file
                if( !this.utils.validateData(r) ) { // ** invalid SignalK value **
                    err.message= 'Invalid resource data!'
                    return err 
                }
                // add source / timestamp
                r.value.timestamp= new Date().toISOString()
                if(typeof r.value.$source === 'undefined') { r.value.$source= this.pkg.id }

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
    }

    //*** DB API calls *****
    async listRecords(db:any, params:any={}, type:string) {
        let options:any= { include_docs: true };
        let result:any= {};
        let count:number=0;
        //if(typeof params.limit!=='undefined') { options['limit']= params.limit }
        let entries= await db.allDocs(options)
        entries.rows.forEach( (row:any)=> {
            if(typeof params.limit!=='undefined' && count>= parseInt(params.limit) ) { }
            else if(this.utils.passFilter(row.doc.resource, type, params) ) { // ** true if entry meets criteria **
                result[row.id]= row.doc.resource; 
                count++;
            }
        })
        return result;
    }

    async getRecord(db:any, uuid:string) {
        try {
            let entry=  await db.get(uuid); 
            return entry.resource;
        } 
        catch (err) { 
            console.error(`Fetch ERROR: Resource ${uuid} could not be retrieved!`);
            return err;
        }
    }

    async deleteRecord(db:any, uuid:string) {
        try {
            let entry = await db.get(uuid);
            return await db.remove(entry._id, entry._rev);
        } 
        catch (err) { 
            console.error(`Delete ERROR: Resource ${uuid} could not be deleted!`);
            return err;
        } 
    }

    async newRecord(db:any, uuid:string, doc:any) {
        try {
            let result=  await db.put({
                _id: uuid,
                resource: doc
            });
            return result;
        } 
        catch (err) { 
            console.error(`Create ERROR: Resource ${uuid} could not be created!`);
            return err;
        }
    }
    
    async updateRecord(db:any, uuid:string, doc:any) {
        try {
            let entry = await db.get(uuid);
            let result= await db.put({
                _id: uuid,
                _rev: entry._rev,
                resource: doc
            });
            return result;
        } 
        catch (err) { 
            //console.log(`Update ERROR: Resource ${uuid} was not found... create new resource...`);
            return err;
        }
    }       

}
