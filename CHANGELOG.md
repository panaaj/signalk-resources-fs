# CHANGELOG: SK-RESOURCES-FS

### v1.4.0

__** BREAKING CHANGES **__ 

Now requires Signal K server v1.4x or greater!

Signal K server v1.4x now includes a `ResourceProvider` API for handling requests for the resource types defined in the Signal K specification `(routes, waypoints, notes, regions & charts)`.

This plugin has been updated to function as a `ResourceProvider` for `routes, waypoints, notes, regions`.

- __**update:**__ changing the selection of `routes, waypoints, notes, regions` no longer requires a server restart for the changes to take affect.

---
### v1.3.0

- Add capability to define additional resource paths.

- Serve list of available resource types on the server at `/signalk/v1/api/resources`.

- Add api endpoint to list the resource types provided by the plugin at `/skServer/plugins/sk-resources-fs/paths`.

### v1.2.1

- Add validation when retrieving data from file storage.

### v1.2.0

- Converted to `Typescript`.

### v1.1.0

- Added `Database` resource store option for use with `CouchDB` API compliant databases.


### v1.0.0

Initial stable release.
