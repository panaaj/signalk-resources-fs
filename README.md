# Signal K Resources Plugin:

__Resource Provider__ provider plugin for __Signal K Server__.

This Signal K node server plugin is a resource provider, facilitating the storage and retrieval of the following resource types defined by the Signal K specification:
- `resources/routes`
- `resources/waypoints`
- `resources/notes`
- `resources/regions`   

as well as custom resource types provisioned as additional paths under `/signalk/v1/api/resources`.

- _example:_ `resources/fishingZones`   

Each path is provisioned with `GET`, `PUT`, `POST` and `DELETE` operations enabled.

Operation of all paths is as set out in the Signal K specification.


---
## Installation and Configuration:

1. Install the plugin from the Signal K server __AppStore__

1. Re-start the Signal K server to make the plugin configuration available 

1. In the __Server -> Plugin Config__ set the plugin to __Active__

1. Select which resource paths you want the plugin to handle: `Routes, Waypoints, Notes, Regions`.

1. Specify any additional resource paths you require.

1. Select the type of resource data store you want to use. _(See note below)_

1. Enter the file system path you want to host the resources. _(Note: this path will be created if it does not already exist.)_

1. Click __Submit__ 

---

## Data Store Options:

This plugin is designed to host / persist resource data in different data store types.

Currently the following data store types are provided:

1. `File System`: Choosing this option stores each resource in a file within a folder on your device's file system beneath the path entered in the configuration. 

    _For example:_

    Routes will be stored in `<config_path>/routes`

    Notes will be stored in `<config_path>/notes`

2. `Database`: Choosing this option store will use a database provider as the resource store. If the value entered in `path` is a:
    - `file system path on the device`: a database store will be cretaed on the file system in the specified path.

    - `url`: a `CouchDB` compliant API will be used to interact with a database server at the specified url. 

---
## Use and Operation:

Once configured the plugin register as the resource provider for the resource types enabled in the server's `Plugin Confg` screen.

The SignalK server will pass all requests _(HTTP GET, POST, PUT and DELETE)_for theses paths to the plugin.

_Please refer to the [Signal K specification](https://signalk.org/specification) and  [Signal K Server documentation](https://signalk.org/signalk-server/RESOURCE_PROVIDER_PLUGINS.md) for details about working with resources._
