"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mkdirp_1 = __importDefault(require("mkdirp"));
const utils_1 = require("./utils");
const pouchdb_1 = __importDefault(require("pouchdb"));
pouchdb_1.default.plugin(require('pouchdb-find'));
// ** File Resource Store Class
class DBStore {
    constructor(pluginId = '') {
        this.utils = new utils_1.Utils();
        this.savePath = '';
        this.resources = {};
        this.pkg = { id: pluginId };
    }
    // ** check / create path to persist resources
    init(config) {
        return __awaiter(this, void 0, void 0, function* () {
            let url = false;
            if (typeof config.settings.path === 'undefined') {
                this.savePath = config.path + '/resources';
            }
            else if (config.settings.path[0] == '/') {
                this.savePath = config.settings.path;
            }
            else if (config.settings.path.indexOf('http') != -1) {
                this.savePath = config.settings.path;
                url = true;
            }
            else {
                this.savePath = path_1.default.join(config.path, config.settings.path);
            }
            let p = yield this.checkPath(this.savePath);
            if (p.error) {
                return { error: true, message: `Unable to create ${this.savePath}!` };
            }
            else {
                return new Promise((resolve, reject) => {
                    if (config.settings.API) {
                        Object.entries(config.settings.API).forEach(i => {
                            if (i[1]) {
                                try {
                                    let dbPath = (url)
                                        ? this.savePath + `${(this.savePath.slice(-1) != '/') ? '/' : ''}` + `${i[0]}_db`
                                        : path_1.default.join(this.savePath, `${i[0]}_db`);
                                    this.resources[i[0]] = new pouchdb_1.default(dbPath);
                                    this.resources[i[0]].info().then((info) => {
                                        console.log(`${info.db_name} (${info.doc_count}) - OK...`);
                                    }).catch((err) => { console.log(err); });
                                    resolve({ error: false, message: `OK` });
                                }
                                catch (err) {
                                    reject({ error: true, message: err });
                                }
                            }
                        });
                    }
                    else {
                        reject({ error: true, message: `Invalid config!` });
                    }
                });
            }
        });
    }
    // ** close database /free resources **
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            Object.entries(this.resources).forEach((db) => {
                db[1].close()
                    .then(() => console.log(`** ${db[0]} DB closed **`))
                    .catch(() => { console.log(`** ${db[0]} DB already closed **`); });
            });
            return true;
        });
    }
    // ** check path exists / create it if it doesn't **
    checkPath(path = this.savePath) {
        return new Promise((resolve, reject) => {
            if (!path) {
                resolve({ error: true, message: `Path not supplied!` });
            }
            fs_1.default.access(// check path exists
            path, fs_1.default.constants.W_OK | fs_1.default.constants.R_OK, err => {
                if (err) { //if not then create it
                    console.log(`${path} does NOT exist...`);
                    console.log(`Creating ${path} ...`);
                    mkdirp_1.default(path, (err) => {
                        if (err) {
                            resolve({ error: true, message: `Unable to create ${path}!` });
                        }
                        else {
                            resolve({ error: false, message: `Created ${path} - OK...` });
                        }
                    });
                }
                else { // path exists
                    console.log(`${path} - OK...`);
                    resolve({ error: false, message: `${path} - OK...` });
                }
            });
        });
    }
    /** return persisted resources from storage OR
     * {error: true, message: string, status: number }
     * ****************************************/
    getResources(type, item = null, params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            // ** parse supplied params
            params = this.utils.processParameters(params);
            if (params.error) {
                return params;
            }
            try {
                if (item) { // return specified resource
                    return this.getRecord(this.resources[type], item);
                }
                else { // return matching resources
                    return this.listRecords(this.resources[type], params, type);
                }
            }
            catch (err) {
                console.log(err);
                return {
                    error: true,
                    message: `Error retreiving resources from ${this.savePath}. Ensure plugin is active or restart plugin!`,
                    status: 400
                };
            }
        });
    }
    /** save / delete (r.value==null) resource file
        r: {
            type: 'routes' | 'waypoints' | 'notes' | 'regions',
            id: string,
            value: any (null=delete)
        }
     ***********************************************/
    setResource(r) {
        return __awaiter(this, void 0, void 0, function* () {
            let err = { error: true, message: ``, status: 404 };
            if (!this.utils.isUUID(r.id)) {
                err.message = 'Invalid resource id!';
                return err;
            }
            try {
                //console.log(`******  ${r.type}: ${(r.value===null) ? 'DELETE' : 'SAVE'} -> ${r.id} ******`)
                if (r.value === null) { // ** delete resource **
                    return this.deleteRecord(this.resources[r.type], r.id);
                }
                else { // ** add / update file
                    if (!this.utils.validateData(r)) { // ** invalid SignalK value **
                        err.message = 'Invalid resource data!';
                        return err;
                    }
                    // add source / timestamp
                    r.value.timestamp = new Date().toISOString();
                    if (typeof r.value.$source === 'undefined') {
                        r.value.$source = this.pkg.id;
                    }
                    // update / add resource 
                    let result = yield this.updateRecord(this.resources[r.type], r.id, r.value);
                    if (typeof result.error !== 'undefined') { // unable to update
                        return this.newRecord(this.resources[r.type], r.id, r.value);
                    }
                    else {
                        return result;
                    }
                }
            }
            catch (err) {
                console.log(err);
                return {
                    error: true,
                    message: `Error setting resource! Ensure plugin is active or restart plugin!`,
                    status: 400
                };
            }
        });
    }
    //*** DB API calls *****
    listRecords(db, params = {}, type) {
        return __awaiter(this, void 0, void 0, function* () {
            let options = { include_docs: true };
            let result = {};
            let count = 0;
            //if(typeof params.limit!=='undefined') { options['limit']= params.limit }
            let entries = yield db.allDocs(options);
            entries.rows.forEach((row) => {
                if (typeof params.limit !== 'undefined' && count >= parseInt(params.limit)) { }
                else if (this.utils.passFilter(row.doc.resource, type, params)) { // ** true if entry meets criteria **
                    result[row.id] = row.doc.resource;
                    count++;
                }
            });
            return result;
        });
    }
    getRecord(db, uuid) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let entry = yield db.get(uuid);
                return entry.resource;
            }
            catch (err) {
                console.error(`Fetch ERROR: Resource ${uuid} could not be retrieved!`);
                return err;
            }
        });
    }
    deleteRecord(db, uuid) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let entry = yield db.get(uuid);
                return yield db.remove(entry._id, entry._rev);
            }
            catch (err) {
                console.error(`Delete ERROR: Resource ${uuid} could not be deleted!`);
                return err;
            }
        });
    }
    newRecord(db, uuid, doc) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let result = yield db.put({
                    _id: uuid,
                    resource: doc
                });
                return result;
            }
            catch (err) {
                console.error(`Create ERROR: Resource ${uuid} could not be created!`);
                return err;
            }
        });
    }
    updateRecord(db, uuid, doc) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let entry = yield db.get(uuid);
                let result = yield db.put({
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
        });
    }
}
exports.DBStore = DBStore;
