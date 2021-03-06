# Signal K Resources Provider Plugin:

__Resources API__ provider plugin for __Signal K Server__.

This Signal K node server plugin acts as a resource provider for the following resource types detailed in the specification:
- `resources/routes`
- `resources/waypoints`
- `resources/notes`
- `resources/regions`   

as well as allowing the user to define additional paths under `/signalk/v1/api/resources` to serve user provided resource data sets.

- _example:_ `resources/fishing`   

Each path is provisioned with `GET`, `PUT`, `POST` and `DELETE` operations enabled.

Operation of all paths is as set out in the Signal K specification.

---

Additionally, the path `/signalk/v1/api/resources` will return an array of __ALL__ available resource paths on the server, not just the ones provided by the `sk-resources-fs` plugin.

_Example:_
```
["buddies","routes","waypoints","notes","regions","tracks","fishing"]
```
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

1. __RESTART__ the server to allow the selected paths to be serviced.
---

## Data Store Options:

This plugin is designed to host / persist resource data in different data store types.

Currently the following data store types are provided:

1. `File System`: Choosing this option stores each resource in a file within a folder on your device's file system beneath the path entered in the configuration. 

    _For example:_

    Routes will be stored in `<config_path>/routes`

    Notes will be stored in `<config_path>/notes`

    __Note: Choose this option if you are moving from `GPXLoad`.__ _Setting the path to the location used by `GPXLoad` will make all your existing resources available._

2. `Database`: Choosing this option store will use a database provider as the resource store. If the value entered in `path` is a:
    - `file system path on the device`: a database store will be cretaed on the file system in the specified path.

    - `url`: a `CouchDB` compliant API will be used to interact with a database server at the specified url. 

---
## Use and Operation:

Once configured the plugin will handle all of the following requests for the enabled paths:
- HTTP GET, POST, PUT and DELETE requests
- Delta GET and PUT requests

_Please refer to the [Signal K specification](https://signalk.org/specification) for details about working with resources._
