// ** Signal K Server Plugin Interface
export interface ServerPlugin {
    name: string
    description?: string
    id: string,
    version?: string
    start: (config: object, restart: (newConfiguration: object) => void) => any
    stop: () => void
    schema: () => object | object
    uiSchema?: () => object | object
    registerWithRouter?: (router: any) => void
    signalKApiRoutes?: (router: any) => any
    enabledByDefault?: boolean
    statusMessage?: () => string
}