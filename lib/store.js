// ** Abstract Base Resource Store Class
class ResourceStoreBase {
    constructor() {
        this.savePath= ''
        this.resources= {}
    }

    async init(basePath) {}
    close() {}
    async getResources(type=null, item=null, params={}) {}
    async setResource(r) {}

    // ** check path exisits / create it if it doesn't **
    checkPath(path= this.savePath) {
        let fs= require('fs')
        return new Promise( (resolve, reject)=> {
            if(!path) { resolve({error: true, message: `Path not supplied!`}) }
            fs.access( // check path exists
                path, 
                fs.constants.W_OK | fs.constants.R_OK, 
                err=> {
                    if(err) {  //if not then create it
                        console.log(`${path} does NOT exist...`)
                        console.log(`Creating ${path} ...`)
                        let mkdirp = require('mkdirp');
                        mkdirp(path, (err)=> {
                            if(err) { resolve({error: true, message: `Unable to create ${path}!`}) }
                            else { resolve({error: false, message: `Created ${path} - OK...`}) }
                        })
                    }
                    else { // path exists
                        console.log(`${path} - OK...`)
                        resolve({error: false, message: `${path} - OK...`})
                    }
                }
            )
        })
    }
}

module.exports= ResourceStoreBase