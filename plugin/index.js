"use strict";
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
const dbfacade_1 = require("./lib/dbfacade");
const filestorage_1 = require("./lib/filestorage");
const utils_1 = require("./lib/utils");
const v4_1 = __importDefault(require("uuid/v4"));
const CONFIG_SCHEMA = {
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
};
const CONFIG_UISCHEMA = {
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
};
module.exports = (server) => {
    let subscriptions = []; // stream subscriptions   
    let timers = []; // interval imers
    let utils = new utils_1.Utils();
    let plugin = {
        id: 'sk-resources-fs',
        name: 'Resources Provider (sk-resources-fs)',
        schema: () => (CONFIG_SCHEMA),
        uiSchema: () => (CONFIG_UISCHEMA),
        start: (options, restart) => { doStartup(options, restart); },
        stop: () => { doShutdown(); },
        signalKApiRoutes: (router) => { return initSKRoutes(router); }
    };
    let fsAdapter = new filestorage_1.FileStore(plugin.id);
    let dbAdapter = new dbfacade_1.DBStore(plugin.id);
    let db = dbAdapter; // active data store     
    let config = {
        API: {
            routes: false,
            waypoints: false,
            notes: false,
            regions: false
        }
    };
    const doStartup = (options, restart) => {
        try {
            server.debug(`${plugin.name} starting.......`);
            config = options || config;
            server.debug('*** Configuration ***');
            server.debug(JSON.stringify(config));
            if (!config.source) {
                db = fsAdapter;
            }
            else {
                switch (config.source) {
                    case 'db':
                        db = dbAdapter;
                        break;
                    default:
                        db = fsAdapter;
                }
            }
            // ** initialise resource storage
            db.init({ settings: config, path: server.config.configPath })
                .then((res) => {
                if (res.error) {
                    server.error(`*** ERROR: ${res.message} ***`);
                    server.setProviderError(res.message);
                }
                let ae = 'Handling:';
                ae += (config.API && config.API.routes) ? ' Routes, ' : '';
                ae += (config.API && config.API.waypoints) ? ' Waypoints, ' : '';
                ae += (config.API && config.API.notes) ? ' Notes, ' : '';
                ae += (config.API && config.API.regions) ? ' Regions, ' : '';
                server.setProviderStatus(`Started. ${ae}`);
                server.debug(`** ${plugin.name} started... ${(!res.error) ? 'OK' : 'with errors!'}`);
            })
                .catch((e) => {
                server.debug(e);
                server.setProviderStatus(`Initialisation Error! See console for details.`);
            });
            // ** initialise Delta PUT handlers **
            setupDeltaPUT();
        }
        catch (e) {
            server.setProviderError(`Started with errors!`);
            server.error("error: " + e);
            console.error(e.stack);
            return e;
        }
    };
    const doShutdown = () => {
        server.debug(`${plugin.name} stopping.......`);
        server.debug('** Un-registering Update Handler(s) **');
        subscriptions.forEach(b => b());
        subscriptions = [];
        server.debug('** Stopping Timer(s) **');
        timers.forEach(t => clearInterval(t));
        timers = [];
        if (db) {
            db.close().then(() => server.debug(`** Store closed **`));
        }
        server.setProviderStatus(`Stopped`);
    };
    // ** Signal K Resources HTTP path handlers **
    const initSKRoutes = (router) => {
        Object.entries(config.API).forEach(ci => {
            if (ci[1]) {
                server.debug(`** Registering ${ci[0]} API paths **`);
                router.get(`/resources/${ci[0]}/meta`, (req, res) => {
                    res.json({ description: `Collection of ${ci[0]}, each named with a UUID` });
                });
                router.get(`/resources/${ci[0]}`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
                    req.query['position'] = getVesselPosition();
                    compileHttpGetResponse(req, true)
                        .then(r => {
                        if (r.statusCode >= 400) {
                            res.status(r.statusCode).send(r.message);
                        }
                        else {
                            res.json(r);
                        }
                    })
                        .catch(err => { res.status(500); });
                }));
                router.get(`/resources/${ci[0]}/${utils.uuidPrefix}*-*-*-*-*`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
                    compileHttpGetResponse(req)
                        .then(r => {
                        if (r.statusCode >= 400) {
                            res.status(r.statusCode).send(r.message);
                        }
                        else {
                            res.json(r);
                        }
                    })
                        .catch(err => { res.status(500); });
                }));
                router.post(`/resources/${ci[0]}`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
                    let p = formatActionRequest(req);
                    actionResourceRequest('', p.path, p.value)
                        .then((r) => {
                        if (r.statusCode >= 400) {
                            res.status(r.statusCode).send(r.message);
                        }
                        else {
                            res.json(r);
                        }
                    })
                        .catch(err => { res.status(500); });
                }));
                router.put(`/resources/${ci[0]}/${utils.uuidPrefix}*-*-*-*-*`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
                    let p = formatActionRequest(req);
                    actionResourceRequest('', p.path, p.value)
                        .then((r) => {
                        if (r.statusCode >= 400) {
                            res.status(r.statusCode).send(r.message);
                        }
                        else {
                            res.json(r);
                        }
                    })
                        .catch(err => { res.status(500); });
                }));
                router.delete(`/resources/${ci[0]}/${utils.uuidPrefix}*-*-*-*-*`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
                    let p = formatActionRequest(req, true);
                    actionResourceRequest('', p.path, p.value)
                        .then((r) => {
                        if (r.statusCode >= 400) {
                            res.status(r.statusCode).send(r.message);
                        }
                        else {
                            res.json(r);
                        }
                    })
                        .catch(err => { res.status(500); });
                }));
            }
        });
        return router;
    };
    // *** SETUP ROUTE HANDLING **************************************
    // ** register DELTA PUT handlers **
    const setupDeltaPUT = () => {
        if (server.registerPutHandler) {
            Object.entries(config.API).forEach(ci => {
                if (ci[1]) {
                    server.debug(`** Registering ${ci[0]}  DELTA Action Handler **`);
                    server.debug(`** resources.${ci[0]} **`);
                    server.registerPutHandler('vessels.self', `resources.${ci[0]}`, doActionHandler);
                }
            });
        }
    };
    // ** DELTA PUT action handler **
    const doActionHandler = (context, path, value, cb) => {
        server.debug('DELTA PUT ACTION');
        actionResourceRequest(context, path, value).then(result => {
            console.log('*** CALLBACK: sending COMPLETE ***');
            cb(result);
        });
        console.log('*** sending PENDING ***');
        return { state: 'PENDING', statusCode: 202, message: 'PENDING' };
    };
    // *** RESOURCE PROCESSING **************************************
    /** compile http api get response
     * req: http request object
     * list: true: resource list, false: single entry
     * *******************************/
    const compileHttpGetResponse = (req, list = false) => __awaiter(void 0, void 0, void 0, function* () {
        let err = {
            state: 'COMPLETED',
            message: `Cannot GET ${req.path}`,
            statusCode: 404
        };
        let p = parsePath(req.path);
        if (!p.type) {
            return err;
        }
        if (list) { // retrieve resource list
            let r = yield db.getResources(p.type, null, req.query);
            if (typeof r.error === 'undefined') {
                return r;
            }
            else {
                return err;
            }
        }
        else { // retrieve resource entry
            let r = yield db.getResources(p.type, p.uuid);
            if (p.attribute) { // extract resource attribute value
                let a = eval(`r.${p.attribute}`);
                if (a) {
                    return a;
                }
                else {
                    return err;
                }
            }
            else {
                return r;
            }
        }
    });
    // ** parse provided path to resource type, uuid and attributes
    const parsePath = (path) => {
        let res = {
            type: null,
            uuid: null,
            attribute: null
        };
        let a = path.split('/');
        res.type = a[2]; // set resource type
        if (utils.isUUID(a[a.length - 1])) {
            res.uuid = a[a.length - 1];
        }
        else {
            if (utils.isUUID(a[3])) {
                server.debug(a[3]);
                res.uuid = a[3].slice(a[3].lastIndexOf(':') + 1);
                res.attribute = a.slice(4).join('.');
            }
        }
        server.debug(res);
        return res;
    };
    /** format http request path for action request
     * forDelete: true= returned value=null, false= returned value= req.body
     * returns: { path: string, value: {id: string} } **/
    const formatActionRequest = (req, forDelete = false) => {
        let result = { path: null, value: {} };
        let id;
        let p = req.path.slice(1).split('/');
        if (p.length == 2) {
            result.path = p.join('.');
            id = utils.uuidPrefix + v4_1.default();
        }
        else {
            result.path = p.slice(0, 2).join('.');
            id = p[2];
        }
        result.value[id] = (forDelete) ? null
            : (typeof req.body.value !== 'undefined') ? req.body.value : req.body;
        server.debug('** FORMATTED ACTION REQUEST: **');
        server.debug(result);
        return result;
    };
    /** handle Resource POST, PUT, DELETE requests
     * http: false: WS formatted status, true: http formatted status **/
    const actionResourceRequest = (context, path, value) => __awaiter(void 0, void 0, void 0, function* () {
        if (path[0] == '.') {
            path = path.slice(1);
        }
        server.debug(`Path= ${JSON.stringify(path)}, value= ${JSON.stringify(value)}`);
        let r = {};
        let p = path.split('.');
        let ok = false;
        let result;
        if (config.API) {
            Object.entries(config.API).forEach(i => {
                if (path.indexOf(i[0]) != -1 && i[1]) {
                    ok = true;
                }
            });
        }
        if (ok) { // enabled resource type
            r.type = (p.length > 1) ? p[1] : p[0]; // ** get resource type from path **
            let v = Object.entries(value); // ** value= { uuid: { resource_data} }
            r.id = v[0][0]; // uuid
            r.value = v[0][1]; // resource_data
            // ** test for valid resource identifier
            if (!utils.isUUID(r.id)) {
                return {
                    state: 'COMPLETED',
                    statusCode: 400,
                    message: `Invalid resource id!`
                };
            }
        }
        else {
            return {
                state: 'COMPLETED',
                statusCode: 400,
                message: `Invalid path!`
            };
        }
        switch (r.type) {
            case 'routes':
            case 'waypoints':
            case 'notes':
            case 'regions':
                let dbop = yield db.setResource(r);
                if (typeof dbop.error === 'undefined') { // OK
                    sendDelta(r);
                    result = { state: 'COMPLETED', message: 'COMPLETED', statusCode: 200 };
                }
                else { // error
                    result = {
                        state: 'COMPLETED',
                        statusCode: 502,
                        message: `Error updating resource!`
                    };
                }
                break;
            default:
                result = {
                    state: 'COMPLETED',
                    statusCode: 400,
                    message: `Invalid resource type (${r.type})!`
                };
        }
        return result;
    });
    // ** send delta message for resource
    const sendDelta = (r) => {
        let key = r.id;
        let p = `resources.${r.type}.${key}`;
        let val = [{ path: p, value: r.value }];
        server.debug(`****** Send Delta: ******`);
        server.debug(JSON.stringify({ updates: [{ values: val }] }));
        server.handleMessage(plugin.id, { updates: [{ values: val }] });
    };
    const getVesselPosition = () => {
        let p = server.getSelfPath('navigation.position');
        return (p && p.value) ? [p.value.longitude, p.value.latitude] : null;
    };
    return plugin;
};
