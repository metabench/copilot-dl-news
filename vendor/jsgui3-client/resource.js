/**
 * Created by James on 09/10/2016.
 */

// But is this part of the html client, or it uses the html client.

// The client has page context.
//  Page context has the resource pool.

// So, client-resource will need html-enh I think, but not the client system.


/*
 define(['../../web/jsgui-html-enh', './resource'],
 function(jsgui, Resource) {
 */


/*
	2018, need to implement / redo some of resources.
	will make them a bit simpler where poss
	have resource publisher middleware on the server

*/

// 2022 - considering putting compilation features into the client.
//  Would need to load in / provide the actual compilation functions.
//   jsgui3-server would load them in for server-side use automatically (a few compilers at least).
//    want to redo the way that jsgui3-server runs its compilers.
//    will be more structured, and less code used in the JavaScript resource.

// Compilers will be integrated at a relatively low level.
//  Having compilers work on the client should be OK.
//  Even compiling compilers in Rust.




// The resource may be a compiler or data transformer.
//  Seems like it's worth doing more on a ll to support that functionality.

// Loading these from Rust / C++ to WASM is part of the issue with compilers.
//  Need server-side compilation for some of it to happen.

// Looks as though variety of compilers only work on the FS.
//  Maybe would need to be adapted to operate in mem / only as function.

// Could use an /out directory.







var jsgui = require('jsgui3-html');

// Could make a separate Data_Resource
//  That Data_Resource would have the API that DR in jsgui3 now has.
//   Will use self-logging and observable / observable-like functionality for monitoring it within the app
//   Will have a fairly general and specified get / set pattern
//    Things will work in a generally restful way.
//    Could look into graphql
//     Maybe would need to be graphql resource.




var Resource = jsgui.Resource;

const fnl = require('fnl');
const prom_or_cb = fnl.prom_or_cb;

var stringify = jsgui.stringify,
	each = jsgui.each,
	arrayify = jsgui.arrayify,
	tof = jsgui.tof;


const get_a_sig = jsgui.get_a_sig;

var filter_map_by_regex = jsgui.filter_map_by_regex;
var Class = jsgui.Class,
	Data_Object = jsgui.Data_Object,
	Enhanced_Data_Object = jsgui.Enhanced_Data_Object;
var fp = jsgui.fp,
	is_defined = jsgui.is_defined;
var Collection = jsgui.Collection;

// Extends AutoStart_Resource?

// May need to change around a fair few references to make it workable.
// May need some more complicated logic to change it to the path for service.

// There can be a client app that's specifically for a resource.
//  That's a special case.
// Other client side apps will access multiple resources.
//  They can do this through a Resource_Pool.
//  There could be client-side resources that make use of information sharing between these client and server side resources.

// This client resource could reference a remote resource.

// Will have client-remote-reference resource
//  maybe just client-remote
//  will work in a similar way to remote or node-remote in terms of API, but internally it will do HTTP calls differently.
//  Possibly could just use jsgui though, have it expose the same API for node and the client.

// This one is still fairly abstract.
//  It will be the client-remote-link resource which will have the functionality.
//  client-remote-link will connect with websockets to get events
//  it will do get with http.


// A resource control will recieve events from the client resource.
//  It may also ensure it has been set up.

// Also a Resource_Client file that sets up a resource connection with a particular resource?
//  Maybe don't set up such abstract resource linking for the moment?

// With the Resource-Client architure, we could define the back-end in terms of a Resource, and not need to write various pieces of boilerplate for them
//  to communicate with each other.

// Resource_Client may be a necessary JS file.
//  Would be JavaScript that runs on a page that's for when it's the client for a single resource?

// With the clock resource, would want it to have a resource control.
//  That control could possibly speak to the resource directly.
//  It could possibly speak to a client-side resource / aggregator that then speaks to the server resource.

// Serving a page with a component that connects back to the resource...
//  I think a lot of the activity will be in the user control,
//  however, it may be that the user control will just be making use of the client-side resources or client-side resource pool.

var ends_with = function (str, suffix) {
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

// Should code in a way that allows for a (local) data transformation resource.

// resource location:
//  server (remote, needs HTTP requests)
//  local
//   within the app, available through js
//   available through a port / ports.

// The resource could be available as a local function.

// server
// local-fn

// Client_Resource_Referencing_Server
// Client_Resource_Referencing_Local

// Need to enable usage of client-side data transformation resources.
// As well as allow for their use and integration more generally into the jsgui3 system.

// Client_Resource_Referencing_Server_JSON
// Client_Resource__Server_JSON
// Client_Resource__Client_Transform_Function
//  Some functions to transform bmp <> jpeg could be in this category.


// Should not use / need Data_Object.
//  Though could improve and document Data_Object.

// May be better using observable pattern?

// A data transformation resource system for filling out HTML templates.
// Could introduce RSX at this point too.

// It maybe won't be at a URL.
//  Just needs to be available within client-side JS.

// HTTP_Resource or HTTP_Client_Resource



class Client_Resource extends Resource {
	//'fields': {
	//	'url': String
	//},
	// Subscribe?

	// Should likely work more like an observable.
	//  At least it extends evented_class

	constructor(spec = {}) {
		//this._super(spec);
		//spec = spec || {};
		super(spec);
		if (spec.meta) {
			var meta = spec.meta;
			//console.log('1) meta.url', meta.url);
			if (meta.url) this.meta.set('url', meta.url);
			if (meta.type_levels) this.meta.set('type_levels', meta.type_levels);
			//console.log('meta.name ' + meta.name);
		}

		// The data resource won't hold the data itself.
		//  (usually)
		//  It will download the data unless it's cached.

		// Will connect to the more customised server data resource.
		//  This is the interface between the client's data and the server.

		this.data = new Data_Object();
		// Not necessarily?

		//var that = this;
		// both in one parameter here?
		// Why not listen to the resource's data directly?
		//  Should not be a problem when doing it on the client?

		this.data.on('change', (property_name, property_value) => {
			//console.log('');
			//console.log('resource data change property_name', property_name);
			//console.log('property_value', property_value);
			this.trigger('change', property_name, property_value);
		});
	}

	// Set as well?

	'get' (path, callback) {
		return prom_or_cb((resolve, reject) => {
			//console.log('path', path);

			let ends_dot_json = ends_with(path, '.json');
			//console.log('ends_dot_json', ends_dot_json);
			let json_url;
			if (!ends_dot_json) {
				json_url = path + '.json';
			} else {
				json_url = path;
			}
			//console.log('this (Resource)', this);
			json_url = 'resources/' + this.name + '/' + json_url;
			//json_url = ''
			//console.log('json_url', json_url);
			jsgui.http(json_url, function (err, res) {
				if (err) {
					//callback(err);
					reject(err);
				} else {
					resolve(res);
				}
			})
		}, callback);
	}

	get status() {
		return (async () => {
			let res = await jsgui.http('/resources/' + this.name + '/status.json');
			return res;
		})();
	}
	// We don't notify it this way.
	//  Thinking of making a serparate Resource that uses websockets or sockjs. Should continue to have the normal non-sock client-side resource as well.
	///  Will not make its own HTTP connections.

	// Not that clear how this type of resource will receive these change notifications.
	//  Seems less likely that we will need this function here.
	//  06/06/2015 - about to make the socks resource connection for the client, it's going to allow for real-time updates, while using generally RESTful addressing.

	'notify_change_from_server' (property_name, property_value) {
		// needs to do some kind of silent set.
		//console.log('client resource notify_change_from_server');
		var data = this.data;
		this.data._[property_name] = property_value;

		this.data.trigger('change', property_name, property_value);
		// Or the resource listens to data changes, triggers change on itself when the data changes.
		// Or change on the resource itself I think.
	}
}

module.exports = Client_Resource;