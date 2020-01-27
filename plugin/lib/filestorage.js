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
// ** File Resource Store Class
class FileStore {
    constructor(pluginId = '') {
        this.utils = new utils_1.Utils();
        this.savePath = '';
        this.resources = {};
        this.pkg = { id: pluginId };
    }
    // ** check / create path to persist resources
    init(config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof config.settings.path === 'undefined') {
                this.savePath = config.path + '/resources';
            }
            else if (config.settings.path[0] == '/') {
                this.savePath = config.settings.path;
            }
            else {
                this.savePath = path_1.default.join(config.path, config.settings.path);
            }
            if (config.settings.API) {
                Object.keys(config.settings.API).forEach(i => {
                    this.resources[i] = { path: path_1.default.join(this.savePath, `/${i}`) };
                });
            }
            let p = yield this.checkPath(this.savePath);
            if (p.error) {
                return { error: true, message: `Unable to create ${this.savePath}!` };
            }
            else {
                return this.createSavePaths(config.settings.API);
            }
        });
    }
    // ** create save paths for resource types
    createSavePaths(resTypes) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('** FS createSavePaths() **');
            let result = { error: false, message: `` };
            Object.keys(this.resources).forEach(t => {
                if (resTypes[t]) {
                    fs_1.default.access(this.resources[t].path, fs_1.default.constants.W_OK | fs_1.default.constants.R_OK, err => {
                        if (err) {
                            console.log(`${this.resources[t].path} NOT available...`);
                            console.log(`Creating ${this.resources[t].path} ...`);
                            fs_1.default.mkdir(this.resources[t].path, (err) => {
                                if (err) {
                                    result.error = true;
                                    result.message += `ERROR creating ${this.resources[t].path} folder\r\n `;
                                }
                            });
                        }
                        else {
                            console.log(`${this.resources[t].path} - OK....`);
                        }
                    });
                }
            });
            return result;
        });
    }
    //** return persisted resources from storage
    getResources(type, item = null, params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = {};
            // ** parse supplied params
            params = this.utils.processParameters(params);
            if (params.error) {
                return params;
            }
            try {
                if (item) { // return specified resource
                    item = item.split(':').slice(-1)[0];
                    result = JSON.parse(fs_1.default.readFileSync(path_1.default.join(this.resources[type].path, item), 'utf8'));
                    let stats = fs_1.default.statSync(path_1.default.join(this.resources[type].path, item));
                    result['timestamp'] = stats.mtime;
                    result['$source'] = this.pkg.id;
                    return result;
                }
                else { // return matching resources
                    Object.entries(this.resources).forEach((rt) => {
                        if (!type || type == rt[0]) {
                            let files = fs_1.default.readdirSync(rt[1].path);
                            // check resource count 
                            let fcount = (params.limit && files.length > params.limit) ? params.limit : files.length;
                            for (let f in files) {
                                if (f >= fcount) {
                                    break;
                                }
                                let uuid = this.utils.uuidPrefix + files[f];
                                try {
                                    let res = JSON.parse(fs_1.default.readFileSync(path_1.default.join(rt[1].path, files[f]), 'utf8'));
                                    // ** apply param filters **
                                    if (this.utils.passFilter(res, rt[0], params)) {
                                        result[uuid] = res;
                                        let stats = fs_1.default.statSync(path_1.default.join(rt[1].path, files[f]));
                                        result[uuid]['timestamp'] = stats.mtime;
                                        result[uuid]['$source'] = this.pkg.id;
                                    }
                                }
                                catch (err) {
                                    console.log(err);
                                    return {
                                        message: `Invalid file contents: ${files[f]}`,
                                        status: 400,
                                        error: true
                                    };
                                }
                            }
                        }
                    });
                    return result;
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
    // ** save / delete (r.value==null) resource file
    setResource(r) {
        return __awaiter(this, void 0, void 0, function* () {
            let err = { error: true, message: ``, status: 404 };
            if (!this.utils.isUUID(r.id)) {
                err.message = 'Invalid resource id!';
                return err;
            }
            let fname = r.id.split(':').slice(-1)[0];
            let p = path_1.default.join(this.resources[r.type].path, fname);
            let action = (r.value === null) ? 'DELETE' : 'SAVE';
            //console.log(`******  ${r.type}: ${action} -> ${fname} ******`);
            //console.log(`******  path: ${p} ******`);
            if (r.value === null) { // ** delete file **
                return yield (() => {
                    return new Promise(resolve => {
                        fs_1.default.unlink(p, res => {
                            if (res) {
                                console.log('Error deleting resource!');
                                err.message = 'Error deleting resource!';
                                resolve(err);
                            }
                            else {
                                console.log(`** DELETED: ${r.type} entry ${fname} **`);
                                resolve({ ok: true });
                            }
                        });
                    });
                })();
            }
            else { // ** add / update file
                return yield (() => {
                    return new Promise(resolve => {
                        if (!this.utils.validateData(r)) { // ** invalid SignalK value **
                            err.message = 'Invalid resource data!';
                            resolve(err);
                        }
                        // ** test for valid SignalK value **
                        fs_1.default.writeFile(p, JSON.stringify(r.value), (error) => {
                            if (error) {
                                console.log('Error updating resource!');
                                err.message = 'Error updating resource!';
                                resolve(err);
                            }
                            else {
                                console.log(`** ${r.type} written to ${fname} **`);
                                resolve({ ok: true });
                            }
                        });
                    });
                })();
            }
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () { return true; });
    }
    // ** check path exists / create it if it doesn't **
    checkPath(path = this.savePath) {
        return new Promise((resolve) => {
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
}
exports.FileStore = FileStore;
