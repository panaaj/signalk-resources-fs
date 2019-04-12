
const fs= require('fs')
const path= require('path')
const utils = require('./utils')

// ** resource storage library functions **
module.exports= {
	
	savePath: '',
	resources: {},	
	
    // ** check / create path to persist resources
    init: function(config) {
        this.savePath= config.path + '/resources';
        if(config.settings.API) {
            Object.keys(config.settings.API).forEach( i=>{
                this.resources[i.slice(0,i.length-1)]= {path: path.join(this.savePath, `/${i}`)}
            });
        }	
        return new Promise( (resolve, reject)=> {
            fs.access(
                this.savePath, 
                fs.constants.W_OK | fs.constants.R_OK, 
                err=>{
                    if(err) {
                        //console.log(`${this.savePath} not detected.... attempting to create it....`)
                        fs.mkdir(this.savePath, (err)=> {
                            if(err) { 
                                resolve({error: true, message: `Unable to create ${this.savePath} folder`})
                            }   
                            else {
                                //console.log(`** OK: ${this.savePath} created....`)
                                Object.keys(this.resources).forEach( t=> {
                                    fs.mkdir(this.resources[t].path, (err)=> {
										let retval= {error: false, message: ``}
                                        if(err) { 
											retval.error= true
											retval.message+= `ERROR creating ${this.resources[t].path} folder\r\n` 
										}                           
                                    })
                                })
                                resolve({error: false, message: `Resource folders created`})                       
                            }
                        })
                    }
                    else { resolve({error: false, message: `Resource folders already exist`}) }
                }
            )
        })
    },

    //** return persisted resources from storage
    getResources: function(type=null, item=null, params={}) {
        let result= {}
		// ** parse supplied params
        params= utils.processParameters(params) 
        if(params.error) { return params } 	
        try {
            if(item) { // return specified resource
                result= JSON.parse(fs.readFileSync( path.join(this.resources[type].path, item) , 'utf8'))
                let stats = fs.statSync(path.join(this.resources[type].path, item))
                result['timestamp'] = stats.mtime;
                result['$source'] = 'resources';
            }
            else {	// return matching resources
                Object.entries(this.resources).forEach(rt=> {         
                    if(!type || type==rt[0]) {
                        result[rt[0] + 's']= {}
                        let files= fs.readdirSync(rt[1].path)
						// check resource count 
						let fcount= (params.limit && files.length > params.limit) ? params.limit : files.length
                        for( let f in files) {
							if(f>=fcount) { break }
                            let uuid= utils.uuidPrefix + files[f]
							try {
								let res= JSON.parse(fs.readFileSync( path.join(rt[1].path, files[f]) , 'utf8'))
                                // ** apply param filters **
                                if( this.filter(res, rt[0], params) ) {
									result[rt[0] + 's'][uuid]= res
									let stats = fs.statSync(path.join(rt[1].path, files[f]))
									result[rt[0] + 's'][uuid]['timestamp'] = stats.mtime;
									result[rt[0] + 's'][uuid]['$source'] = 'resources';
								}
							}
							catch(err) {
								console.log(err)
								console.log(`Invalid file contents: ${files[f]}`)
							}
                        }                
                    }
                })  
            }  
            return result
        }
        catch(err) {
            console.log(err)
            return {
                error: true, 
                message: `Error retreiving resources from ${this.savePath}. Ensure plugin is active or restart plugin!`,
                source: 'resources'
            }
        }
    },
	
    // ** save / delete (r.value==null) resource file
    setResource: function(r) {
        if( !utils.isUUID(r.id) ) { return false }
        let fname= r.id.substring(r.id.lastIndexOf(':')+1)
        let p= path.join(this.resources[r.type].path, fname)
        let action= (r.value===null) ? 'DELETE' : 'SAVE'
        //console.log(`******  ${r.type}: ${action} -> ${fname} ******`)
        if(r.value===null) { // ** delete file **
            fs.unlink(p, res=> { 
                if(res) { 
                    console.log('Error deleting resource file!')
                    return false 
                }
                else { 
                    console.log(`** DELETED: ${r.type} entry ${fname} **`)
                    return true
                }
            })
            return true
        }
        else {  // ** add / update file
            if( !utils.validateData(r) ) { console.log('failed validation') ; return false }
            // ** test for valid SignalK value **
            fs.writeFile(p, JSON.stringify(r.value), (err, res)=> {
                if(err) { 
                    console.log(err)
                    return false
                }
                else { 
                    console.log(`** ${r.type} written to ${fname} **`); 
                    return true
                }
            })
            return true
        }      
    },

    // ** apply filters to resource **
    filter: function(res, type, params) {
        let ok= true;
        if(params.region) {	// ** check is attached to region
            console.log(`check region: ${params.region}`)
            if(typeof res.region==='undefined') { ok= ok && false }
            else { ok= ok && (res.region==params.region) }
        }        
        if(params.geobounds) {	// ** check is within bounds
            ok= ok && utils.inBounds(res, rt[0], params.geobounds)
        }
        return ok;
    }
	
}

