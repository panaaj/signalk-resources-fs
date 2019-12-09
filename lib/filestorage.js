
const fs= require('fs')
const path= require('path')
const utils = require('./utils')
const pkg= require('../package.json')

const ResourceStoreBase= require('./store')

// ** File Resource Store Class
class FileStore extends ResourceStoreBase {

    constructor() { super() }

    // ** check / create path to persist resources
    async init(config) {
        if(typeof config.settings.path==='undefined') { this.savePath= config.path + '/resources' }
        else if(config.settings.path[0]=='/'){ this.savePath= config.settings.path }
        else { this.savePath= path.join(config.path, config.settings.path) }

        if(config.settings.API) {
            Object.keys(config.settings.API).forEach( i=>{
                this.resources[i]= {path: path.join(this.savePath, `/${i}`)}
            });
        }	

        let p= await this.checkPath(this.savePath)
        if(p.error) { return {error: true, message: `Unable to create ${this.savePath}!`} }
        else { return this.createSavePaths(config.settings.API) }        
    }

    // ** create save paths for resource types
    async createSavePaths(resTypes) {
        console.log('** FS createSavePaths() **')
        let result= {error: false, message: ``}
        Object.keys(this.resources).forEach( t=> {
            if(resTypes[t]) {
                fs.access( 
                    this.resources[t].path, 
                    fs.constants.W_OK | fs.constants.R_OK, 
                    err=>{
                        if(err) {
                            console.log(`${this.resources[t].path} NOT available...`) 
                            console.log(`Creating ${this.resources[t].path} ...`)
                            fs.mkdir(this.resources[t].path, (err)=> {
                                if(err) { 
                                    result.error= true
                                    result.message+= `ERROR creating ${this.resources[t].path} folder\r\n ` 
                                }                           
                            })  
                        }
                        else { console.log(`${this.resources[t].path} - OK....`) }
                    }
                ) 
            }
        })  
        return result        
    }     
    
    //** return persisted resources from storage
    async getResources(type=null, item=null, params={}) {
        let result= {}
        // ** parse supplied params
        params= utils.processParameters(params) 
        if(params.error) { return params } 	
        try {
            if(item) { // return specified resource
                item= item.split(':').slice(-1)[0]
                result= JSON.parse(fs.readFileSync( path.join(this.resources[type].path, item) , 'utf8'))
                let stats = fs.statSync(
                    path.join( this.resources[type].path, item) )
                result['timestamp'] = stats.mtime
                result['$source'] = pkg.name
                return result
            }
            else {	// return matching resources
                Object.entries(this.resources).forEach(rt=> {         
                    if(!type || type==rt[0]) {
                        let files= fs.readdirSync(rt[1].path)
                        // check resource count 
                        let fcount= (params.limit && files.length > params.limit) ? params.limit : files.length
                        for( let f in files) {
                            if(f>=fcount) { break }
                            let uuid= utils.uuidPrefix + files[f]
                            try {
                                let res= JSON.parse(fs.readFileSync( path.join(rt[1].path, files[f]) , 'utf8'))
                                // ** apply param filters **
                                if( utils.passFilter(res, rt[0], params) ) {
                                    result[uuid]= res
                                    let stats = fs.statSync(path.join(rt[1].path, files[f]))
                                    result[uuid]['timestamp'] = stats.mtime
                                    result[uuid]['$source'] = pkg.name
                                }
                            }
                            catch(err) {
                                console.log(err)
                                return {
                                    message: `Invalid file contents: ${files[f]}`,
                                    status: 400,
                                    error: true
                                }	
                            }
                        }                
                    }
                })  
                return result
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

    // ** save / delete (r.value==null) resource file
    async setResource(r) {
        let err= {error: true, message: ``, status: 404 }
        if( !utils.isUUID(r.id) ) {
            err.message= 'Invalid resource id!'
            return err 
        }
        let fname= r.id.split(':').slice(-1)[0]
        let p= path.join(this.resources[r.type].path, fname)
        let action= (r.value===null) ? 'DELETE' : 'SAVE'
        //console.log(`******  ${r.type}: ${action} -> ${fname} ******`)
        //console.log(`******  path: ${p} ******`)

        if(r.value===null) { // ** delete file **
            return await (()=> {
                return new Promise( resolve=> {
                    fs.unlink(p, res=> { 
                        if(res) { 
                            console.log('Error deleting resource!')
                            err.message= 'Error deleting resource!'
                            resolve(err) 
                        }
                        else { 
                            console.log(`** DELETED: ${r.type} entry ${fname} **`)
                            resolve({ok: true})
                        }
                    })
                })
            })()
        }
        else {  // ** add / update file
            return await (()=> {
                return new Promise( resolve=> {
                    if( !utils.validateData(r) ) { // ** invalid SignalK value **
                        err.message= 'Invalid resource data!'
                        resolve(err) 
                    }
                    // ** test for valid SignalK value **
                    fs.writeFile(p, JSON.stringify(r.value), (error, res)=> {
                        if(error) { 
                            console.log('Error updating resource!')
                            err.message= 'Error updating resource!'
                            resolve(err)  
                        }
                        else { 
                            console.log(`** ${r.type} written to ${fname} **`); 
                            resolve({ok: true})
                        }
                    })
                })
            })()
        }      
    }    

}

module.exports= new FileStore()
