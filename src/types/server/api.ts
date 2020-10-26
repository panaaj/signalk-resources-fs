import { DeltaUpdate, DeltaNotification } from './delta';

export enum ServerRoles {
    master= "master",
    main= "main",
    aux= "aux",
    slave= "slave"
}

  
export interface ServerAPI extends 
                                DeltaManager,
                                ProviderStatusLogger,
                                ActionManager,
                                HistoryManager, StreamManagerHolder {
    getSelfPath: (path: string) => void
    getPath: (path: string) => void
    putSelfPath: (aPath: string, value: any, updateCb: () => void) => Promise<any>
    putPath: (
        aPath: string,
        value: number | string | object | boolean,
        updateCb: (err?: Error) => void
    ) => Promise<any>
    queryRequest: (requestId: string) => Promise<any>
    error: (msg: string) => void
    debug: (msg: string) => void
    handleMessage: (
        id: string | null, 
        msg: DeltaUpdate | DeltaNotification
    ) => void
    savePluginOptions: (
        configuration: object,
        cb: (err: any | null) => void
    ) => void
    readPluginOptions: () => object
    getDataDirPath: () => string
    registerPutHandler: (
        context: string,
        path: string,
        callback: (
            context: string,
            path: string,
            value: any,
            actionResultCallback: (actionResult: ActionResult) => void
        ) => ActionResult
    ) => void
    config: { configPath:string }
}

export interface ActionResult {
    state: string
    statusCode: number
    message?: string
    resultStatus?: number
}

interface StreamManager {
    getBus: (path: string | void) => any
    getSelfBus: (path: string | void) => any
    getSelfStream: (path: string | void) => any
    getAvailablePaths: () => string[]
}

interface StreamManagerHolder {
    streambundle: StreamManager
}

interface DeltaManager {
    registerDeltaInputHandler: (
        handler: (delta: object, next: (delta: object) => void) => void
    ) => void
}

interface ProviderStatusLogger {
    setPluginStatus: (pluginId: string, status?: string) => void
    setPluginError: (pluginId: string, status?: string) => void
    setProviderStatus: (providerId: string, status?: string) => void
    setProviderError: (providerId: string, status?: string) => void
}

interface ProviderManager extends ProviderStatusLogger {
    getProviderStatus: () => [{ id: string; message: string }]
    providerStatus: { [providerId: string]: string }
}

interface ActionManager {
    registerActionHandler: (
        context: string,
        path: string,
        id: string,
        callback: (
            context: string,
            path: string,
            value: any,
            actionResultCallback: (actionResult: ActionResult) => void
        ) => ActionResult
    ) => void
}

interface HistoryProvider {
    hasAnydata: (options: object, cb: (hasResults: boolean) => void) => void
    getHistory: (date: Date, path: string, cb: (deltas: object[]) => void) => void
    streamHistory: (
        spark: any,
        options: object,
        onDelta: (delta: object) => void
    ) => void
}

interface HistoryManager {
    registerHistoryProvider: (provider: HistoryProvider) => void
    unregisterHistoryProvider: (provider: HistoryProvider) => void
}
