# Signal K Resources Filesystem Provider:

__Resource API__ provider plugin for __Signal K Server__ that uses the device filesystem for storage.

This Signal K node server plugin acts as a resource provider for the following API paths:
- `resources/routes`
- `resources/waypoints`
- `resources/notes`
- `resources/regions`   

---
## Installation and Configuration:

1. Install the plugin from the Signal K server __AppStore__

2) Re-start the Signal K server to make the plugin configuration available 

3) In the __Server -> Plugin Config__ set the plugin to __Active__

4) Select which resource paths you want the plugin to handle: `Routes, Waypoints, Notes, Regions`.

5) Enter the filesystem path you want to host the resources. _(Note: this path will be created if it does not already exist.)_

6) Click __Submit__ 

7) __RESTART__ the server to allow the selected paths to be serviced.
---

## Use and Operation:

Once configured the plugin will handle all of the following requests for the enabled paths:
- HTTP GET, POST, PUT and DELETE requests
- Delta GET and PUT requests

_Please refer to the [Signal K specification](https://signalk.org/specification) for details about working with resources._








