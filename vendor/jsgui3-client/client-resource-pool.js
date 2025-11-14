/*
 define(['../../web/jsgui-html', './client-resource', './pool'],

 function(jsgui, Resource, Resource_Pool) {
 */

 // Got a lot of this code to delete / refresh / make more concise once things are more fully working.
 //  Especially regarding parse_mount and controls.
 //   Want to shrink down the package size a lot.

 // Once the API is stable, could create a build that uses many local variables.
 //  Could make a build process that does that.
 //   Would be nice to make a core / small jsgui build that fits in 5KB compressed. 15 would be nice too etc.
 //    Much will be possible with abstractions over the patterns.


var jsgui = require('jsgui3-html');
//var Resource = require('./client-resource');
var Resource_Pool = jsgui.Resource_Pool;

const fnl = require('fnl');
const prom_or_cb = fnl.prom_or_cb;

// Client_Resource?
//  I think that makes sense, so that we have something specific which has the URL attached.
//   It is able to make HTTP requests to the server resource.

//const Data_Resource = require('./data-resource');

/*
var stringify = jsgui.stringify,
	each = jsgui.each,
	arrayify = jsgui.arrayify,
	tof = jsgui.tof;
var filter_map_by_regex = jsgui.filter_map_by_regex;
var Class = jsgui.Class,
	Data_Object = jsgui.Data_Object;
var fp = jsgui.fp,
	is_defined = jsgui.is_defined;
var Collection = jsgui.Collection;
*/

//var exec = require('child_process').exec;

// Perhaps this will have HTTP endpoints as well?
//  Maybe we can access it through url/resources/

// Perhaps a resource publisher, or a few of them could be useful.
//  HTTP_Resource_Publisher?
//  Generally publishes a resource over HTTP.
//   Will have some authorization and authentication properties, hooked up with the proper providers.

// This may be the place in which remote access to the resources is given.
//  It would make sense.
//  Perhaps it is worth using a resource publisher? Then is that a resource?
//  I think the resource pool may be the sensible point of access.


// Possibly all websocket communications for all client-side resources will go through the pool.
//  May need to specify which server in particular we connect to over websocket.
//   However, having front-end back-end servers could work well, that redirect to other servers, thereby providing one endpoint, and balance the load.

/*
var fields = {
	'url': String
};
*/
class Client_Resource_Pool extends Resource_Pool {
	//'fields': ,
	constructor(spec) {
		//this._super(spec);
		super(spec);


		// No need to start it in particular?
		//  Sometimes the data resource will operate over websockets

		//  Sometimes SSE would be better.

		//let data_resource = new Data_Resource({
		//	'name': 'Data Resource'
		//});
		//console.log('pre add data_resource', data_resource);
		//this.add(data_resource);


	}
	'start'(callback) {

		return prom_or_cb((resolve, reject) => {
			//callback(null, true);
			resolve(true);
		}, callback);


	}

}
module.exports = Client_Resource_Pool;