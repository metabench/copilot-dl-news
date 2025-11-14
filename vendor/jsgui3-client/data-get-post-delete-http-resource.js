// Data_Resource could be separated from jsgui3.

var jsgui = require('jsgui3-html');
var Client_Resource = require('./resource');

const fnl = require('fnl');
const {prom_or_cb} = fnl;


/*
var stringify = jsgui.stringify,
    each = jsgui.each,
    arrayify = jsgui.arrayify,
    tof = jsgui.tof;
var filter_map_by_regex = jsgui.filter_map_by_regex;
var Class = jsgui.Class,
    Data_Object = jsgui.Data_Object,
    Enhanced_Data_Object = jsgui.Enhanced_Data_Object;
var fp = jsgui.fp,
    is_defined = jsgui.is_defined;
var Collection = jsgui.Collection;
*/

// Client_Server_Resource_Connection

// data-resource-pool on npm
//  resource-pool already taken

// Data_Resource could build differently on the client?
//  Or have Browser_Data_Resource
//  WebClient_Data_Resource
//  Browser sounds most accurate


// HTTP_Data_Resource

// Some may work with websockets.


// WS_Data_Resources
//  Or the pool

// Want it so that all of the resources are available through a single websockets connection.
// Then it will be a matter of choosing the service method(s).

// In some cases websockets will be better than SSE.
//  Could try binary encoding and message envelopes over websockets.


// Direct HTTP connection to the server here.
// Consider HTTPS as well.

// General purpose and extendable UI for observables and events will be very useful.
//  Should work on that soon.

// Will be like a full screen application. Slightly similar layout to VS code and other editors.
//  Definitely need to do more work on the editor / documents etor view
//  Items_Editor
//  Editor_UI

// Could be its own project.
//  jsgui3-editor-ui
//  jsgui3-multiview

//  make an advanced view system that is much like vs code.
//  make it work full-screen / large window, also as electron app.
//   react-native too?


// Need to make a general purpose business / productivity multiview.
//  Then hook it up with online data
//   Such as for loading and saving docs
//   A file tree
//  Viewing long-running processes
//  Viewing medium-running processes ie downloads and their logs

// Having a variety of (functional) data adapters on the server-side to connect the data (channels) in the app to the db / data storage.

// resource.adapter = ...
//  an adapter proprty on some data resources to connect them with specific DBs / DB instances.

// Should allow for (Data) Transformation Resource too.

// get-post remote resource. Or remotely available. Or http resource.


// resource connection type:
//  local-fn, http?

// Data_Get_Post_Resource?
// Data_KV_Resource?

// Data_Get_Post_Delete_HTTP_Resource

class Data_Get_Post_Delete_HTTP_Resource extends Client_Resource {

    // Obersvable download...?
    //  Can we get the amount downloaded / uploaded in the browser api yet?

    constructor(spec) {
        super(spec);
        this.data = {};
    }
    get(key, callback) {
        // Some get operations could return observables.
        // generally will just be done with an HTTP request.
        return prom_or_cb((solve, jettison) => {
            jsgui.http('/resources/' + key, (err, res_http) => {
                if (err) {
                    jettison(err);
                } else {
                    solve(res_http);
                }
            });
        }, callback);
    }

    // Saving values to the server.

    post(key, value, callback) {
        return prom_or_cb((solve, jettison) => {

            // HTTP compression of posts within the browser would be nice too.

            jsgui.http_post('/resources/' + key, value, (err, res_http) => {
                if (err) {
                    console.log('err', err);
                    jettison(err);
                } else {
                    solve(res_http);
                }
            });
        }, callback);
    }

    delete(key, callback) {
        return prom_or_cb((solve, jettison) => {
            jsgui.http_delete('/resources/' + key, (err, res_http) => {
                if (err) {
                    console.log('err', err);
                    jettison(err);
                } else {
                    solve(res_http);
                }
            });
        }, callback);
    }
}

module.exports = (Data_Get_Post_Delete_HTTP_Resource);