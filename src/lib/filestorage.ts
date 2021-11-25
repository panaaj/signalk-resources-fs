
import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import { IResourceStore, StoreRequestParams } from '../types';
import { Utils} from './utils';

// ** File Resource Store Class
export class FileStore implements IResourceStore {

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
        if(typeof config.settings.path==='undefined') { this.savePath= config.path + '/resources' }
        else if(config.settings.path[0]=='/'){ this.savePath= config.settings.path }
        else { this.savePath= path.join(config.path, config.settings.path) }
        // std resources
        if(config.settings.API) {
            Object.keys(config.settings.API).forEach( (i:any)=>{
                this.resources[i]= {path: path.join(this.savePath, `/${i}`)};
            });
        }	
        // other resources
        let enabledResTypes:any= {};
        Object.assign(enabledResTypes, config.settings.API);
        if(config.settings.resourcesOther && Array.isArray(config.settings.resourcesOther) ) {
            config.settings.resourcesOther.forEach( (i:any)=>{
                this.resources[i.name]= {path: path.join(this.savePath, `/${i.name}`)};
                enabledResTypes[i.name]= true;
            });
        }	

        let p:any= await this.checkPath(this.savePath);
        if(p.error) { return {error: true, message: `Unable to create ${this.savePath}!`} }
        else { return this.createSavePaths(enabledResTypes) }        
    }

    // ** create save paths for resource types
    async createSavePaths(resTypes:any) {
        console.log('** FS initialising resource storage **');
        let result= {error: false, message: ``};
        Object.keys(this.resources).forEach( t=> {
            if(resTypes[t]) {
                fs.access( 
                    this.resources[t].path, 
                    fs.constants.W_OK | fs.constants.R_OK, 
                    err=>{
                        if(err) {
                            console.log(`${this.resources[t].path} NOT available...`);
                            console.log(`Creating ${this.resources[t].path} ...`);
                            fs.mkdir(this.resources[t].path, (err)=> {
                                if(err) { 
                                    result.error= true;
                                    result.message+= `ERROR creating ${this.resources[t].path} folder\r\n `; 
                                }                           
                            })  
                        }
                        else { console.log(`${this.resources[t].path} - OK....`) }
                    }
                ) 
            }
        })  
        return result;        
    }     
    
    //** return persisted resources from storage
    async getResources(type:string, item:any=null, params:any={}) {
        let result:any= {};
        // ** parse supplied params
        params= this.utils.processParameters(params); 
        if(params.error) { return params } 	
        try {
            if(item) { // return specified resource
                item= item.split(':').slice(-1)[0];
                result= JSON.parse(fs.readFileSync( path.join(this.resources[type].path, item) , 'utf8'));
                let stats = fs.statSync( path.join( this.resources[type].path, item) );
                result['timestamp'] = stats.mtime;
                result['$source'] = this.pkg.id;
                return result;
            }
            else {	// return matching resources
                Object.entries(this.resources).forEach( (rt:any)=> {         
                    if(!type || type==rt[0]) {
                        let files= fs.readdirSync(rt[1].path);
                        // check resource count 
                        let fcount= (params.limit && files.length > params.limit) ? params.limit : files.length;
                        for( let f in files) {
                            if(f>=fcount) { break }
                            let uuid= this.utils.uuidPrefix + files[f];
                            try {
                                let res= JSON.parse(fs.readFileSync( path.join(rt[1].path, files[f]) , 'utf8'));
                                // ** apply param filters **
                                if( this.utils.passFilter(res, rt[0], params) ) {
                                    result[uuid]= res;
                                    let stats = fs.statSync(path.join(rt[1].path, files[f]));
                                    result[uuid]['timestamp'] = stats.mtime;
                                    result[uuid]['$source'] = this.pkg.id;
                                }
                            }
                            catch(err) {
                                console.log(err);
                                return {
                                    message: `Invalid file contents: ${files[f]}`,
                                    status: 400,
                                    error: true
                                };	
                            }
                        }                
                    }
                })  
                return result;
            }
        }
        catch(err) {
            console.log(err);
            return {
                error: true, 
                message: `Error retreiving resources from ${this.savePath}. Ensure plugin is active or restart plugin!`,
                status: 400
            };
        }
    }    

    // ** save / delete (r.value==null) resource file
    async setResource(r:StoreRequestParams) {
        let err= {error: true, message: ``, status: 404 }
        if( !this.utils.isUUID(r.id) ) {
            err.message= 'Invalid resource id!';
            return err;
        }
        let fname= r.id.split(':').slice(-1)[0];
        let p= path.join(this.resources[r.type].path, fname);
        let action= (r.value===null) ? 'DELETE' : 'SAVE';
        //console.log(`******  ${r.type}: ${action} -> ${fname} ******`);
        //console.log(`******  path: ${p} ******`);

        if(r.value===null) { // ** delete file **
            return await (()=> {
                return new Promise( resolve=> {
                    fs.unlink(p, res=> { 
                        if(res) { 
                            console.log('Error deleting resource!');
                            err.message= 'Error deleting resource!';
                            resolve(err);
                        }
                        else { 
                            console.log(`** DELETED: ${r.type} entry ${fname} **`);
                            resolve({ok: true});
                        }
                    });
                });
            })()
        }
        else {  // ** add / update file
            return await (()=> {
                return new Promise( resolve=> {
                    // ** test for valid SignalK value **
                    fs.writeFile(p, JSON.stringify(r.value), (error)=> {
                        if(error) { 
                            console.log('Error updating resource!');
                            err.message= 'Error updating resource!';
                            resolve(err);
                        }
                        else { 
                            console.log(`** ${r.type} written to ${fname} **`); 
                            resolve({ok: true});
                        }
                    });
                });
            })()
        }      
    }    

    async close() { return true }

    // ** check path exists / create it if it doesn't **
    checkPath(path:string= this.savePath) {
        return new Promise( (resolve)=> {
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
                        });
                    }
                    else { // path exists
                        console.log(`${path} - OK...`);
                        resolve({error: false, message: `${path} - OK...`});
                    }
                }
            );
        });
    }        

}
