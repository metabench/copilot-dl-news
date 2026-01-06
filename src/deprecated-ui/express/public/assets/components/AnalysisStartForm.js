(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/lang-tools/node_modules/lang-mini/lang-mini.js
  var require_lang_mini = __commonJS({
    "node_modules/lang-tools/node_modules/lang-mini/lang-mini.js"(exports, module) {
      var running_in_browser = typeof window !== "undefined";
      var running_in_node = !running_in_browser;
      var Readable_Stream;
      var Writable_Stream;
      var Transform_Stream;
      var get_stream = () => {
        if (running_in_node) {
          return (() => {
            const str_libname = "stream";
            const stream2 = __require(str_libname);
            Readable_Stream = stream2.Readable;
            Writable_Stream = stream2.Writable;
            Transform_Stream = stream2.Transform;
            return stream2;
          })();
        } else {
          return void 0;
        }
      };
      var stream = get_stream();
      var each = (collection, fn, context2) => {
        if (collection) {
          if (collection.__type == "collection") {
            return collection.each(fn, context2);
          }
          let ctu = true;
          let stop = function() {
            ctu = false;
          };
          if (is_array(collection)) {
            let res2 = [], res_item;
            for (let c2 = 0, l = collection.length; c2 < l; c2++) {
              res_item;
              if (ctu == false) break;
              if (context2) {
                res_item = fn.call(context2, collection[c2], c2, stop);
              } else {
                res_item = fn(collection[c2], c2, stop);
              }
              if (ctu == false) break;
              res2.push(res_item);
            }
            return res2;
          } else {
            let name, res2 = {};
            for (name in collection) {
              if (ctu === false) break;
              if (context2) {
                res2[name] = fn.call(context2, collection[name], name, stop);
              } else {
                res2[name] = fn(collection[name], name, stop);
              }
              if (ctu === false) break;
            }
            return res2;
          }
        }
      };
      var is_array = Array.isArray;
      var is_dom_node = function isDomNode(obj2) {
        return !!obj2 && typeof obj2.nodeType !== "undefined" && typeof obj2.childNodes !== "undefined";
      };
      var get_truth_map_from_arr = function(arr) {
        let res2 = {};
        each(arr, function(v, i) {
          res2[v] = true;
        });
        return res2;
      };
      var get_arr_from_truth_map = function(truth_map) {
        let res2 = [];
        each(truth_map, function(v, i) {
          res2.push(i);
        });
        return res2;
      };
      var get_map_from_arr = function(arr) {
        let res2 = {};
        for (let c2 = 0, l = arr.length; c2 < l; c2++) {
          res2[arr[c2]] = c2;
        }
        return res2;
      };
      var arr_like_to_arr = function(arr_like) {
        let res2 = new Array(arr_like.length);
        for (let c2 = 0, l = arr_like.length; c2 < l; c2++) {
          res2[c2] = arr_like[c2];
        }
        ;
        return res2;
      };
      var is_ctrl = function(obj2) {
        return typeof obj2 !== "undefined" && obj2 !== null && is_defined2(obj2.__type_name) && is_defined2(obj2.content) && is_defined2(obj2.dom);
      };
      var map_loaded_type_fn_checks = {};
      var map_loaded_type_abbreviations = {
        "object": "o",
        "number": "n",
        "string": "s",
        "function": "f",
        "boolean": "b",
        "undefined": "u",
        "null": "N",
        "array": "a",
        "arguments": "A",
        "date": "d",
        "regex": "r",
        "error": "e",
        "buffer": "B",
        "promise": "p",
        "observable": "O",
        "readable_stream": "R",
        "writable_stream": "W",
        "data_value": "V"
      };
      var using_type_plugins = false;
      var invert = (obj2) => {
        if (!is_array(obj2)) {
          let res2 = {};
          each(obj2, (v, k) => {
            res2[v] = k;
          });
          return res2;
        } else {
          console.trace();
          throw "invert(obj) not supported on arrays";
        }
      };
      var map_loaded_type_names = invert(map_loaded_type_abbreviations);
      var load_type = (name, abbreviation, fn_detect_instance) => {
        map_loaded_type_fn_checks[name] = fn_detect_instance;
        map_loaded_type_names[abbreviation] = name;
        map_loaded_type_abbreviations[name] = abbreviation;
        using_type_plugins = true;
      };
      var tof2 = (obj2, t1) => {
        let res2 = t1 || typeof obj2;
        if (using_type_plugins) {
          let res3;
          each(map_loaded_type_fn_checks, (fn_check, name, stop) => {
            if (fn_check(obj2)) {
              res3 = name;
              stop();
            }
          });
          if (res3) {
            return res3;
          }
        }
        if (res2 === "number" || res2 === "string" || res2 === "function" || res2 === "boolean") {
          return res2;
        }
        if (res2 === "object") {
          if (typeof obj2 !== "undefined") {
            if (obj2 === null) {
              return "null";
            }
            if (obj2.__type) {
              return obj2.__type;
            } else if (obj2.__type_name) {
              return obj2.__type_name;
            } else {
              if (obj2 instanceof Promise) {
                return "promise";
              }
              if (is_ctrl(obj2)) {
                return "control";
              }
              if (obj2 instanceof Date) {
                return "date";
              }
              if (is_array(obj2)) {
                return "array";
              } else {
                if (obj2 instanceof Error) {
                  res2 = "error";
                } else if (obj2 instanceof RegExp) res2 = "regex";
                if (typeof window === "undefined") {
                  if (obj2 && obj2.readInt8) res2 = "buffer";
                }
              }
              return res2;
            }
          } else {
            return "undefined";
          }
        }
        return res2;
      };
      var tf = (obj2) => {
        let res2 = typeof obj2;
        if (using_type_plugins) {
          let res3;
          each(map_loaded_type_fn_checks, (fn_check, name, stop) => {
            if (fn_check(obj2)) {
              res3 = map_loaded_type_abbreviations[name];
              stop();
            }
          });
          if (res3) {
            return res3;
          }
        }
        if (res2 === "number" || res2 === "string" || res2 === "function" || res2 === "boolean" || res2 === "undefined") {
          return res2[0];
        } else {
          if (obj2 === null) {
            return "N";
          } else {
            if (running_in_node) {
              if (obj2 instanceof Readable_Stream) {
                return "R";
              } else if (obj2 instanceof Writable_Stream) {
                return "W";
              } else if (obj2 instanceof Transform_Stream) {
                return "T";
              }
            }
            if (typeof Buffer !== "undefined" && obj2 instanceof Buffer) {
              return "B";
            } else if (obj2 instanceof Promise) {
              return "p";
            } else if (obj2 instanceof Date) {
              return "d";
            } else if (is_array(obj2)) {
              return "a";
            } else {
              if (obj2._is_observable === true) {
                return "O";
              } else {
                if (typeof obj2.callee === "function") {
                  return "A";
                } else if (obj2 instanceof Error) {
                  return "e";
                } else if (obj2 instanceof RegExp) return "r";
                return "o";
              }
            }
            return res2;
          }
        }
        console.trace();
        console.log("item", item);
        throw "type not found";
        return res2;
      };
      var atof = (arr) => {
        let res2 = new Array(arr.length);
        for (let c2 = 0, l = arr.length; c2 < l; c2++) {
          res2[c2] = tof2(arr[c2]);
        }
        return res2;
      };
      var is_defined2 = (value) => {
        return typeof value != "undefined";
      };
      var stringify = JSON.stringify;
      var _get_item_sig = (i, arr_depth) => {
        let res2;
        let t1 = typeof i;
        if (t1 === "string") {
          res2 = "s";
        } else if (t1 === "number") {
          res2 = "n";
        } else if (t1 === "boolean") {
          res2 = "b";
        } else if (t1 === "function") {
          res2 = "f";
        } else {
          let t = tof2(i, t1);
          if (t === "array") {
            if (arr_depth) {
              res2 = "[";
              for (let c2 = 0, l = i.length; c2 < l; c2++) {
                if (c2 > 0) res2 = res2 + ",";
                res2 = res2 + get_item_sig(i[c2], arr_depth - 1);
              }
              res2 = res2 + "]";
            } else {
              res2 = "a";
            }
          } else if (t === "control") {
            res2 = "c";
          } else if (t === "date") {
            res2 = "d";
          } else if (t === "observable") {
            res2 = "O";
          } else if (t === "regex") {
            res2 = "r";
          } else if (t === "buffer") {
            res2 = "B";
          } else if (t === "readable_stream") {
            res2 = "R";
          } else if (t === "writable_stream") {
            res2 = "W";
          } else if (t === "object") {
            res2 = "o";
          } else if (t === "undefined") {
            res2 = "u";
          } else {
            if (t === "collection_index") {
              return "X";
            } else if (t === "data_object") {
              if (i._abstract) {
                res2 = "~D";
              } else {
                res2 = "D";
              }
            } else {
              if (t === "data_value") {
                if (i._abstract) {
                  res2 = "~V";
                } else {
                  res2 = "V";
                }
              } else if (t === "null") {
                res2 = "!";
              } else if (t === "collection") {
                if (i._abstract) {
                  res2 = "~C";
                } else {
                  res2 = "C";
                }
              } else {
                res2 = "?";
              }
            }
          }
        }
        return res2;
      };
      var get_item_sig = (item2, arr_depth) => {
        if (arr_depth) {
          return _get_item_sig(item2, arr_depth);
        }
        const t = tof2(item2);
        if (map_loaded_type_abbreviations[t]) {
          return map_loaded_type_abbreviations[t];
        } else {
          let bt = typeof item2;
          if (bt === "object") {
            if (is_array(item2)) {
              return "a";
            } else {
              return "o";
            }
          } else {
            console.log("map_loaded_type_abbreviations type name not found", t);
            console.log("bt", bt);
            console.trace();
            throw "stop";
          }
        }
      };
      var get_a_sig = (a) => {
        let c2 = 0, l = a.length;
        let res2 = "[";
        let first = true;
        for (c2 = 0; c2 < l; c2++) {
          if (!first) {
            res2 = res2 + ",";
          }
          first = false;
          res2 = res2 + get_item_sig(a[c2]);
        }
        res2 = res2 + "]";
        return res2;
      };
      var deep_sig = (item2, max_depth = -1, depth = 0) => {
        const t = tf(item2);
        let res2 = "";
        if (t === "a") {
          const l = item2.length;
          if (max_depth === -1 || depth <= max_depth) {
            res2 = res2 + "[";
            let first = true;
            for (let c2 = 0; c2 < l; c2++) {
              if (!first) res2 = res2 + ",";
              res2 = res2 + deep_sig(item2[c2], max_depth, depth + 1);
              first = false;
            }
            res2 = res2 + "]";
          } else {
            return "a";
          }
        } else if (t === "A") {
          const l = item2.length;
          let first = true;
          for (let c2 = 0; c2 < l; c2++) {
            if (!first) res2 = res2 + ",";
            res2 = res2 + deep_sig(item2[c2], max_depth, depth + 1);
            first = false;
          }
        } else if (t === "o") {
          if (max_depth === -1 || depth <= max_depth) {
            let res3 = "{";
            let first = true;
            each(item2, (v, k) => {
              if (!first) res3 = res3 + ",";
              res3 = res3 + '"' + k + '":' + deep_sig(v, max_depth, depth + 1);
              first = false;
            });
            res3 = res3 + "}";
            return res3;
          } else {
            return "o";
          }
        } else {
          res2 = res2 + t;
        }
        return res2;
      };
      var trim_sig_brackets = function(sig) {
        if (tof2(sig) === "string") {
          if (sig.charAt(0) == "[" && sig.charAt(sig.length - 1) == "]") {
            return sig.substring(1, sig.length - 1);
          } else {
            return sig;
          }
        }
      };
      var arr_trim_undefined = function(arr_like) {
        let res2 = [];
        let last_defined = -1;
        let t, v;
        for (let c2 = 0, l = arr_like.length; c2 < l; c2++) {
          v = arr_like[c2];
          t = tof2(v);
          if (t == "undefined") {
          } else {
            last_defined = c2;
          }
        }
        for (let c2 = 0, l = arr_like.length; c2 < l; c2++) {
          if (c2 <= last_defined) {
            res2.push(arr_like[c2]);
          }
        }
        return res2;
      };
      var functional_polymorphism = function(options, fn) {
        let a0 = arguments;
        if (a0.length === 1) {
          fn = a0[0];
          options = null;
        }
        let arr_slice = Array.prototype.slice;
        let arr, sig, a2, l, a;
        return function() {
          a = arguments;
          l = a.length;
          if (l === 1) {
            sig = get_item_sig([a[0]], 1);
            a2 = [a[0]];
            a2.l = 1;
            return fn.call(this, a2, sig);
          } else if (l > 1) {
            arr = arr_trim_undefined(arr_slice.call(a, 0));
            sig = get_item_sig(arr, 1);
            arr.l = arr.length;
            return fn.call(this, arr, sig);
          } else if (a.length === 0) {
            arr = new Array(0);
            arr.l = 0;
            return fn.call(this, arr, "[]");
          }
        };
      };
      var fp = functional_polymorphism;
      var parse_sig = (str_sig, opts = {}) => {
        const sig2 = str_sig.split(", ").join(",");
        const sig_items = sig2.split(",");
        const res2 = [];
        each(sig_items, (sig_item) => {
          if (sig_item.length === 1) {
            let type_name = map_loaded_type_names[sig_item];
            res2.push({
              abbreviation: sig_item,
              type_name
            });
          } else {
            let suffix_modifiers;
            let zero_or_more = false;
            let one_or_more = false;
            let type_name = sig_item;
            const obj_res = {
              type_name
            };
            const distil_suffix_modifiers = () => {
              let last_char = type_name.substr(type_name.length - 1);
              if (last_char === "*") {
                type_name = type_name.substr(0, type_name.length - 1);
                zero_or_more = true;
                obj_res.zero_or_more = true;
                obj_res.modifiers = obj_res.modifiers || [];
                obj_res.modifiers.push("*");
                distil_suffix_modifiers();
              } else if (last_char === "+") {
                type_name = type_name.substr(0, type_name.length - 1);
                one_or_more = true;
                obj_res.one_or_more = true;
                obj_res.modifiers = obj_res.modifiers || [];
                obj_res.modifiers.push("+");
                distil_suffix_modifiers();
              } else {
              }
            };
            distil_suffix_modifiers();
            obj_res.type_name = type_name;
            res2.push(obj_res);
          }
        });
        return res2;
      };
      var mfp_not_sigs = get_truth_map_from_arr(["pre", "default", "post"]);
      var log = () => {
      };
      var combinations = (arr, arr_idxs_to_ignore) => {
        const map_ignore_idxs = {};
        if (arr_idxs_to_ignore) {
          each(arr_idxs_to_ignore, (idx_to_ignore) => {
            map_ignore_idxs[idx_to_ignore] = true;
          });
        }
        if (arr.some((subArray) => subArray.length === 0)) {
          return [];
        }
        const res2 = [];
        const l = arr.length;
        const arr_idxs_num_options = new Uint32Array(l);
        each(arr, (arr_item1, i1) => {
          arr_idxs_num_options[i1] = arr_item1.length;
        });
        const arr_current_option_idxs = new Uint32Array(l).fill(0);
        const result_from_indexes = (arr2, arg_indexes) => {
          const res3 = new Array(l);
          if (arg_indexes.length === l) {
            for (var c2 = 0; c2 < l; c2++) {
              res3[c2] = arr2[c2][arg_indexes[c2]];
            }
          } else {
            console.trace();
            throw "Arguments length mismatch";
          }
          return res3;
        };
        const incr = () => {
          for (c = l - 1; c >= 0; c--) {
            const ival = arr_current_option_idxs[c];
            const max = arr_idxs_num_options[c] - 1;
            if (ival < max) {
              arr_current_option_idxs[c]++;
              break;
            } else {
              if (c === 0) {
                return false;
              } else {
                arr_current_option_idxs.fill(0, c);
              }
            }
          }
          return true;
        };
        let vals = result_from_indexes(arr, arr_current_option_idxs);
        res2.push(vals);
        while (incr()) {
          let vals2 = result_from_indexes(arr, arr_current_option_idxs);
          res2.push(vals2);
        }
        return res2;
      };
      var map_native_types = {
        "string": true,
        "boolean": true,
        "number": true,
        "object": true
      };
      var mfp = function() {
        const a1 = arguments;
        const sig1 = get_a_sig(a1);
        let options = {};
        let fn_pre, provided_map_sig_fns, inner_map_sig_fns = {}, inner_map_parsed_sigs = {}, arr_sig_parsed_sig_fns = [], fn_post;
        let tm_sig_fns;
        let fn_default;
        let single_fn;
        let req_sig_single_fn;
        if (sig1 === "[o]") {
          provided_map_sig_fns = a1[0];
        } else if (sig1 === "[o,o]") {
          options = a1[0];
          provided_map_sig_fns = a1[1];
        } else if (sig1 === "[o,f]") {
          options = a1[0];
          single_fn = a1[1];
        } else if (sig1 === "[o,s,f]") {
          options = a1[0];
          req_sig_single_fn = a1[1];
          single_fn = a1[2];
          provided_map_sig_fns = {};
          provided_map_sig_fns[req_sig_single_fn] = single_fn;
        } else if (sig1 === "[f,o]") {
          single_fn = a1[0];
          options = a1[1];
        } else if (sig1 === "[f]") {
          single_fn = a1[0];
        } else {
          console.log("sig1", sig1);
          console.trace();
          throw "mfp NYI";
        }
        let {
          single,
          name,
          grammar,
          verb,
          noun,
          return_type,
          return_subtype,
          pure,
          main,
          skip
        } = options;
        let parsed_grammar;
        let identify, validate;
        let dsig = deep_sig;
        (() => {
          if (provided_map_sig_fns) {
            if (provided_map_sig_fns.default) fn_default = provided_map_sig_fns.default;
            each(provided_map_sig_fns, (fn, sig) => {
              if (typeof fn === "function") {
                if (!mfp_not_sigs[sig]) {
                  const parsed_sig = parse_sig(sig);
                  const arr_args_with_modifiers = [];
                  const arr_args_all_modification_versions = [];
                  each(parsed_sig, (arg, i) => {
                    arr_args_all_modification_versions[i] = [];
                    if (arg.modifiers) {
                      const arg_num_modifiers = arg.modifiers.length;
                      if (arg_num_modifiers > 1) {
                        throw "Use of more than 1 modifier is currently unsupported.";
                      } else if (arg_num_modifiers === 1) {
                        arr_args_with_modifiers.push([i, arg]);
                        const single_modifier = arg.modifiers[0];
                        if (single_modifier === "*") {
                          arr_args_all_modification_versions[i].push("");
                          arr_args_all_modification_versions[i].push(arg.abbreviation || arg.type_name);
                          const plural_name = grammar.maps.sing_plur[arg.type_name];
                          arr_args_all_modification_versions[i].push(plural_name);
                        }
                        if (single_modifier === "+") {
                          arr_args_all_modification_versions[i].push(arg.abbreviation || arg.type_name);
                          const plural_name = grammar.maps.sing_plur[arg.type_name];
                          arr_args_all_modification_versions[i].push(plural_name);
                        }
                        if (single_modifier === "?") {
                          arr_args_all_modification_versions[i].push("");
                          arr_args_all_modification_versions[i].push(arg.abbreviation || arg.type_name);
                        }
                      }
                    } else {
                      arr_args_all_modification_versions[i].push(arg.abbreviation || arg.type_name);
                    }
                  });
                  const combo_args = combinations(arr_args_all_modification_versions);
                  const combo_sigs = [];
                  let i_first_of_last_undefined = -1;
                  each(combo_args, (arg_set) => {
                    let combo_sig = "";
                    each(arg_set, (arg, i) => {
                      let lsigb4 = combo_sig.length;
                      if (i > 0) {
                        combo_sig = combo_sig + ",";
                      }
                      if (arg === "") {
                        combo_sig = combo_sig + "u";
                        if (i_first_of_last_undefined === -1) {
                          i_first_of_last_undefined = lsigb4;
                        }
                      } else {
                        combo_sig = combo_sig + arg;
                        i_first_of_last_undefined = -1;
                      }
                    });
                    if (i_first_of_last_undefined > 0) {
                      const combo_sig_no_last_undefined = combo_sig.substr(0, i_first_of_last_undefined);
                      combo_sigs.push(combo_sig_no_last_undefined);
                    }
                    combo_sigs.push(combo_sig);
                  });
                  if (combo_sigs.length > 0) {
                    each(combo_sigs, (combo_sig) => {
                      inner_map_sig_fns[combo_sig] = fn;
                    });
                  } else {
                    inner_map_sig_fns[sig] = fn;
                  }
                  inner_map_parsed_sigs[sig] = parsed_sig;
                  arr_sig_parsed_sig_fns.push([sig, parsed_sig, fn]);
                } else {
                  console.log("ommiting, not parsing sig", sig);
                }
              } else {
                console.log("fn", fn);
                console.trace();
                throw "Expected: function";
              }
              ;
            });
          }
          each(inner_map_sig_fns, (fn, sig) => {
            tm_sig_fns = tm_sig_fns || {};
            tm_sig_fns[sig] = true;
          });
        })();
        const res2 = function() {
          const a2 = arguments;
          const l2 = a2.length;
          console.log("");
          console.log("calling mfp function");
          console.log("--------------------");
          console.log("");
          let mfp_fn_call_deep_sig;
          let ltof = tof2;
          const lsig = dsig;
          let ltf = tf;
          mfp_fn_call_deep_sig = lsig(a2);
          const mfp_fn_call_shallow_sig = (() => {
            if (!a2 || a2.length === 0) return "";
            let res3 = "";
            for (let i = 0; i < a2.length; i++) {
              if (i > 0) res3 = res3 + ",";
              res3 = res3 + ltf(a2[i]);
            }
            return res3;
          })();
          let do_skip = false;
          if (skip) {
            if (skip(a2)) {
              do_skip = true;
            } else {
            }
          }
          if (!do_skip) {
            if (inner_map_sig_fns[mfp_fn_call_deep_sig]) {
              return inner_map_sig_fns[mfp_fn_call_deep_sig].apply(this, a2);
            } else if (mfp_fn_call_shallow_sig && inner_map_sig_fns[mfp_fn_call_shallow_sig]) {
              return inner_map_sig_fns[mfp_fn_call_shallow_sig].apply(this, a2);
            } else {
              let idx_last_fn = -1;
              let idx_last_obj = -1;
              each(a2, (arg, i_arg) => {
                i_arg = parseInt(i_arg, 10);
                const targ = tf(arg);
                if (targ === "o") {
                  idx_last_obj = i_arg;
                }
                if (targ === "f") {
                  idx_last_fn = i_arg;
                }
              });
              const last_arg_is_fn = idx_last_fn > -1 && idx_last_fn === a2.length - 1;
              const last_arg_is_obj = idx_last_obj > -1 && idx_last_obj === a2.length - 1;
              const second_last_arg_is_obj = idx_last_obj > -1 && idx_last_obj === a2.length - 2;
              let possible_options_obj;
              if (last_arg_is_obj) possible_options_obj = a2[idx_last_obj];
              const new_args_arrangement = [];
              for (let f = 0; f < idx_last_obj; f++) {
                new_args_arrangement.push(a2[f]);
              }
              each(possible_options_obj, (value, key) => {
                new_args_arrangement.push(value);
              });
              let naa_sig = lsig(new_args_arrangement);
              naa_sig = naa_sig.substring(1, naa_sig.length - 1);
              if (inner_map_sig_fns[naa_sig]) {
                return inner_map_sig_fns[naa_sig].apply(this, new_args_arrangement);
              } else {
                if (fn_default) {
                  return fn_default.call(this, a2, mfp_fn_call_deep_sig);
                } else {
                  if (single_fn) {
                    console.log("pre apply single_fn");
                    return single_fn.apply(this, a2);
                  } else {
                    console.log("Object.keys(inner_map_parsed_sigs)", Object.keys(inner_map_parsed_sigs));
                    console.trace();
                    console.log("mfp_fn_call_deep_sig", mfp_fn_call_deep_sig);
                    console.log("provided_map_sig_fns", provided_map_sig_fns);
                    if (provided_map_sig_fns) log("Object.keys(provided_map_sig_fns)", Object.keys(provided_map_sig_fns));
                    console.log("Object.keys(inner_map_sig_fns)", Object.keys(inner_map_sig_fns));
                    console.trace();
                    throw "no signature match found. consider using a default signature. mfp_fn_call_deep_sig: " + mfp_fn_call_deep_sig;
                  }
                }
              }
            }
          }
        };
        const _ = {};
        if (name) _.name = name;
        if (single) _.single = single;
        if (skip) _.skip = skip;
        if (grammar) _.grammar = grammar;
        if (typeof options !== "undefined" && options.async) _.async = options.async;
        if (main === true) _.main = true;
        if (return_type) _.return_type = return_type;
        if (return_subtype) _.return_subtype = return_subtype;
        if (pure) _.pure = pure;
        if (tm_sig_fns) _.map_sigs = tm_sig_fns;
        if (Object.keys(_).length > 0) {
          res2._ = _;
        }
        return res2;
      };
      var arrayify = fp(function(a, sig) {
        let param_index, num_parallel = 1, delay = 0, fn;
        let res2;
        let process_as_fn = function() {
          res2 = function() {
            let a2 = arr_like_to_arr(arguments), ts = atof(a2), t = this;
            let last_arg = a2[a2.length - 1];
            if (tof2(last_arg) == "function") {
              if (typeof param_index !== "undefined" && ts[param_index] == "array") {
                let res3 = [];
                let fns = [];
                each(a2[param_index], function(v, i) {
                  let new_params = a2.slice(0, a2.length - 1);
                  new_params[param_index] = v;
                  fns.push([t, fn, new_params]);
                });
                call_multiple_callback_functions(fns, num_parallel, delay, (err, res4) => {
                  if (err) {
                    console.trace();
                    throw err;
                  } else {
                    let a3 = [];
                    a3 = a3.concat.apply(a3, res4);
                    let callback = last_arg;
                    callback(null, a3);
                  }
                });
              } else {
                return fn.apply(t, a2);
              }
            } else {
              if (typeof param_index !== "undefined" && ts[param_index] == "array") {
                let res3 = [];
                for (let c2 = 0, l = a2[param_index].length; c2 < l; c2++) {
                  a2[param_index] = arguments[param_index][c2];
                  let result = fn.apply(t, a2);
                  res3.push(result);
                }
                return res3;
              } else {
                return fn.apply(t, a2);
              }
            }
          };
        };
        if (sig == "[o]") {
          let res3 = [];
          each(a[0], function(v, i) {
            res3.push([v, i]);
          });
        } else if (sig == "[f]") {
          param_index = 0, fn = a[0];
          process_as_fn();
        } else if (sig == "[n,f]") {
          param_index = a[0], fn = a[1];
          process_as_fn();
        } else if (sig == "[n,n,f]") {
          param_index = a[0], num_parallel = a[1], fn = a[2];
          process_as_fn();
        } else if (sig == "[n,n,n,f]") {
          param_index = a[0], num_parallel = a[1], delay = a[2], fn = a[3];
          process_as_fn();
        }
        return res2;
      });
      var mapify = (target) => {
        let tt = tof2(target);
        if (tt == "function") {
          let res2 = fp(function(a, sig) {
            let that2 = this;
            if (sig == "[o]") {
              let map = a[0];
              each(map, function(v, i) {
                target.call(that2, v, i);
              });
            } else if (sig == "[o,f]") {
              let map = a[0];
              let callback = a[1];
              let fns = [];
              each(map, function(v, i) {
                fns.push([target, [v, i]]);
              });
              call_multi(fns, function(err_multi, res_multi) {
                if (err_multi) {
                  callback(err_multi);
                } else {
                  callback(null, res_multi);
                }
              });
            } else if (a.length >= 2) {
              target.apply(this, a);
            }
          });
          return res2;
        } else if (tt == "array") {
          let res2 = {};
          if (arguments.length == 1) {
            if (is_arr_of_strs(target)) {
              each(target, function(v, i) {
                res2[v] = true;
              });
            } else {
              each(target, function(v, i) {
                res2[v[0]] = v[1];
              });
            }
          } else {
            let by_property_name = arguments[1];
            each(target, function(v, i) {
              res2[v[by_property_name]] = v;
            });
          }
          return res2;
        }
      };
      var clone = fp((a, sig) => {
        let obj2 = a[0];
        if (a.l === 1) {
          if (obj2 && typeof obj2.clone === "function") {
            return obj2.clone();
          } else {
            let t = tof2(obj2);
            if (t === "array") {
              let res2 = [];
              each(obj2, (v) => {
                res2.push(clone(v));
              });
              return res2;
            } else if (t === "undefined") {
              return void 0;
            } else if (t === "string") {
              return obj2;
            } else if (t === "number") {
              return obj2;
            } else if (t === "function") {
              return obj2;
            } else if (t === "boolean") {
              return obj2;
            } else if (t === "null") {
              return obj2;
            } else if (t === "date") {
              return new Date(obj2.getTime());
            } else if (t === "regex") {
              return new RegExp(obj2.source, obj2.flags);
            } else if (t === "buffer") {
              if (typeof Buffer !== "undefined" && Buffer.from) {
                return Buffer.from(obj2);
              } else if (obj2 && typeof obj2.slice === "function") {
                return obj2.slice(0);
              } else {
                return obj2;
              }
            } else if (t === "error") {
              const cloned_error = new obj2.constructor(obj2.message);
              cloned_error.name = obj2.name;
              cloned_error.stack = obj2.stack;
              each(obj2, (value, key) => {
                if (key !== "message" && key !== "name" && key !== "stack") {
                  cloned_error[key] = clone(value);
                }
              });
              return cloned_error;
            } else if (t === "object") {
              const res2 = {};
              each(obj2, (value, key) => {
                res2[key] = clone(value);
              });
              return res2;
            } else {
              return obj2;
            }
          }
        } else if (a.l === 2 && tof2(a[1]) === "number") {
          let res2 = [];
          for (let c2 = 0; c2 < a[1]; c2++) {
            res2.push(clone(obj2));
          }
          return res2;
        }
      });
      var set_vals = function(obj2, map) {
        each(map, function(v, i) {
          obj2[i] = v;
        });
      };
      var ll_set = (obj2, prop_name2, prop_value) => {
        let arr = prop_name2.split(".");
        let c2 = 0, l = arr.length;
        let i = obj2._ || obj2, s;
        while (c2 < l) {
          s = arr[c2];
          if (typeof i[s] == "undefined") {
            if (c2 - l == -1) {
              i[s] = prop_value;
            } else {
              i[s] = {};
            }
          } else {
            if (c2 - l == -1) {
              i[s] = prop_value;
            }
          }
          i = i[s];
          c2++;
        }
        ;
        return prop_value;
      };
      var ll_get = (a0, a1) => {
        if (a0 && a1) {
          let i = a0._ || a0;
          if (a1 == ".") {
            if (typeof i["."] == "undefined") {
              return void 0;
            } else {
              return i["."];
            }
          } else {
            let arr = a1.split(".");
            let c2 = 0, l = arr.length, s;
            while (c2 < l) {
              s = arr[c2];
              if (typeof i[s] == "undefined") {
                if (c2 - l == -1) {
                } else {
                  throw "object " + s + " not found";
                }
              } else {
                if (c2 - l == -1) {
                  return i[s];
                }
              }
              i = i[s];
              c2++;
            }
          }
        }
      };
      var truth = function(value) {
        return value === true;
      };
      var iterate_ancestor_classes = (obj2, callback) => {
        let ctu = true;
        let stop = () => {
          ctu = false;
        };
        callback(obj2, stop);
        if (obj2._superclass && ctu) {
          iterate_ancestor_classes(obj2._superclass, callback);
        }
      };
      var is_arr_of_t = function(obj2, type_name) {
        let t = tof2(obj2), tv;
        if (t === "array") {
          let res2 = true;
          each(obj2, function(v, i) {
            tv = tof2(v);
            if (tv != type_name) res2 = false;
          });
          return res2;
        } else {
          return false;
        }
      };
      var is_arr_of_arrs = function(obj2) {
        return is_arr_of_t(obj2, "array");
      };
      var is_arr_of_strs = function(obj2) {
        return is_arr_of_t(obj2, "string");
      };
      var input_processors = {};
      var output_processors = {};
      var call_multiple_callback_functions = fp(function(a, sig) {
        let arr_functions_params_pairs, callback, return_params = false;
        let delay;
        let num_parallel = 1;
        if (a.l === 1) {
        } else if (a.l === 2) {
          arr_functions_params_pairs = a[0];
          callback = a[1];
        } else if (a.l === 3) {
          if (sig === "[a,n,f]") {
            arr_functions_params_pairs = a[0];
            num_parallel = a[1];
            callback = a[2];
          } else if (sig === "[n,a,f]") {
            arr_functions_params_pairs = a[1];
            num_parallel = a[0];
            callback = a[2];
          } else if (sig === "[a,f,b]") {
            arr_functions_params_pairs = a[0];
            callback = a[1];
            return_params = a[2];
          }
        } else if (a.l === 4) {
          if (sig === "[a,n,n,f]") {
            arr_functions_params_pairs = a[0];
            num_parallel = a[1];
            delay = a[2];
            callback = a[3];
          } else if (sig == "[n,n,a,f]") {
            arr_functions_params_pairs = a[2];
            num_parallel = a[0];
            delay = a[1];
            callback = a[3];
          }
        }
        let res2 = [];
        let l = arr_functions_params_pairs.length;
        let c2 = 0;
        let count_unfinished = l;
        let num_currently_executing = 0;
        let process = (delay2) => {
          num_currently_executing++;
          let main = () => {
            let pair = arr_functions_params_pairs[c2];
            let context2;
            let fn, params, fn_callback;
            let pair_sig = get_item_sig(pair);
            let t_pair = tof2(pair);
            if (t_pair == "function") {
              fn = pair;
              params = [];
            } else {
              if (pair) {
                if (pair.length == 1) {
                }
                if (pair.length == 2) {
                  if (tof2(pair[1]) == "function") {
                    context2 = pair[0];
                    fn = pair[1];
                    params = [];
                  } else {
                    fn = pair[0];
                    params = pair[1];
                  }
                }
                if (pair.length == 3) {
                  if (tof2(pair[0]) === "function" && tof2(pair[1]) === "array" && tof2(pair[2]) === "function") {
                    fn = pair[0];
                    params = pair[1];
                    fn_callback = pair[2];
                  }
                  if (tof2(pair[1]) === "function" && tof2(pair[2]) === "array") {
                    context2 = pair[0];
                    fn = pair[1];
                    params = pair[2];
                  }
                }
                if (pair.length == 4) {
                  context2 = pair[0];
                  fn = pair[1];
                  params = pair[2];
                  fn_callback = pair[3];
                }
              } else {
              }
            }
            let i = c2;
            c2++;
            let cb = (err, res22) => {
              num_currently_executing--;
              count_unfinished--;
              if (err) {
                let stack = new Error().stack;
                callback(err);
              } else {
                if (return_params) {
                  res2[i] = [params, res22];
                } else {
                  res2[i] = res22;
                }
                if (fn_callback) {
                  fn_callback(null, res22);
                }
                if (c2 < l) {
                  if (num_currently_executing < num_parallel) {
                    process(delay2);
                  }
                } else {
                  if (count_unfinished <= 0) {
                    callback(null, res2);
                  }
                }
              }
            };
            let arr_to_call = params || [];
            arr_to_call.push(cb);
            if (fn) {
              if (context2) {
                fn.apply(context2, arr_to_call);
              } else {
                fn.apply(this, arr_to_call);
              }
            } else {
            }
          };
          if (arr_functions_params_pairs[c2]) {
            if (delay2) {
              setTimeout(main, delay2);
            } else {
              main();
            }
          }
        };
        if (arr_functions_params_pairs.length > 0) {
          while (c2 < l && num_currently_executing < num_parallel) {
            if (delay) {
              process(delay * c2);
            } else {
              process();
            }
          }
        } else {
          if (callback) {
          }
        }
      });
      var call_multi = call_multiple_callback_functions;
      var Fns = function(arr) {
        let fns = arr || [];
        fns.go = function(parallel, delay, callback) {
          let a = arguments;
          let al = a.length;
          if (al == 1) {
            call_multi(fns, a[0]);
          }
          if (al == 2) {
            call_multi(parallel, fns, delay);
          }
          if (al == 3) {
            call_multi(parallel, delay, fns, callback);
          }
        };
        return fns;
      };
      var native_constructor_tof = function(value) {
        if (value === String) {
          return "String";
        }
        if (value === Number) {
          return "Number";
        }
        if (value === Boolean) {
          return "Boolean";
        }
        if (value === Array) {
          return "Array";
        }
        if (value === Object) {
          return "Object";
        }
      };
      var sig_match = function(sig1, sig2) {
        let sig1_inner = sig1.substr(1, sig1.length - 2);
        let sig2_inner = sig2.substr(1, sig2.length - 2);
        if (sig1_inner.indexOf("[") > -1 || sig1_inner.indexOf("]") > -1 || sig2_inner.indexOf("[") > -1 || sig2_inner.indexOf("]") > -1) {
          throw "sig_match only supports flat signatures.";
        }
        let sig1_parts = sig1_inner.split(",");
        let sig2_parts = sig2_inner.split(",");
        let res2 = true;
        if (sig1_parts.length == sig2_parts.length) {
          let c2 = 0, l = sig1_parts.length, i1, i2;
          while (res2 && c2 < l) {
            i1 = sig1_parts[c2];
            i2 = sig2_parts[c2];
            if (i1 === i2) {
            } else {
              if (i1 !== "?") {
                res2 = false;
              }
            }
            c2++;
          }
          return res2;
        } else {
          return false;
        }
      };
      var remove_sig_from_arr_shell = function(sig) {
        if (sig[0] == "[" && sig[sig.length - 1] == "]") {
          return sig.substring(1, sig.length - 1);
        }
        return sig;
      };
      var str_arr_mapify = function(fn) {
        let res2 = fp(function(a, sig) {
          if (a.l == 1) {
            if (sig == "[s]") {
              let s_pn = a[0].split(" ");
              if (s_pn.length > 1) {
                return res2.call(this, s_pn);
              } else {
                return fn.call(this, a[0]);
              }
            }
            if (tof2(a[0]) == "array") {
              let res22 = {}, that2 = this;
              each(a[0], function(v, i) {
                res22[v] = fn.call(that2, v);
              });
              return res22;
            }
          }
        });
        return res2;
      };
      var to_arr_strip_keys = (obj2) => {
        let res2 = [];
        each(obj2, (v) => {
          res2.push(v);
        });
        return res2;
      };
      var arr_objs_to_arr_keys_values_table = (arr_objs) => {
        let keys = Object.keys(arr_objs[0]);
        let arr_items = [], arr_values;
        each(arr_objs, (item2) => {
          arr_items.push(to_arr_strip_keys(item2));
        });
        return [keys, arr_items];
      };
      var set_arr_tree_value = (arr_tree, arr_path, value) => {
        let item_current = arr_tree;
        let last_item_current, last_path_item;
        each(arr_path, (path_item) => {
          last_item_current = item_current;
          item_current = item_current[path_item];
          last_path_item = path_item;
        });
        last_item_current[last_path_item] = value;
      };
      var get_arr_tree_value = (arr_tree, arr_path) => {
        let item_current = arr_tree;
        each(arr_path, (path_item) => {
          item_current = item_current[path_item];
        });
        return item_current;
      };
      var deep_arr_iterate = (arr, path = [], callback) => {
        if (arguments.length === 2) {
          callback = path;
          path = [];
        }
        each(arr, (item2, i) => {
          let c_path = clone(path);
          c_path.push(i);
          let t = tof2(item2);
          if (t === "array") {
            deep_arr_iterate(item2, c_path, callback);
          } else {
            callback(c_path, item2);
          }
        });
      };
      var prom = (fn) => {
        let fn_res = function() {
          const a = arguments;
          const t_a_last = typeof a[a.length - 1];
          if (t_a_last === "function") {
            fn.apply(this, a);
          } else {
            return new Promise((resolve, reject) => {
              [].push.call(a, (err, res2) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(res2);
                }
              });
              fn.apply(this, a);
            });
          }
        };
        return fn_res;
      };
      var vectorify = (n_fn) => {
        let fn_res = fp(function(a, sig) {
          if (a.l > 2) {
            throw "stop - need to check.";
            let res2 = a[0];
            for (let c2 = 1, l = a.l; c2 < l; c2++) {
              res2 = fn_res(res2, a[c2]);
            }
            return res2;
          } else {
            if (sig === "[n,n]") {
              return n_fn(a[0], a[1]);
            } else {
              const ats = atof(a);
              if (ats[0] === "array") {
                if (ats[1] === "number") {
                  const res2 = [], n = a[1], l = a[0].length;
                  let c2;
                  for (c2 = 0; c2 < l; c2++) {
                    res2.push(fn_res(a[0][c2], n));
                  }
                  return res2;
                } else if (ats[1] === "array") {
                  if (ats[0].length !== ats[1].length) {
                    throw "vector array lengths mismatch";
                  } else {
                    const l = a[0].length, res2 = new Array(l), arr2 = a[1];
                    for (let c2 = 0; c2 < l; c2++) {
                      res2[c2] = fn_res(a[0][c2], arr2[c2]);
                    }
                    return res2;
                  }
                }
              }
            }
          }
          ;
        });
        return fn_res;
      };
      var n_add = (n1, n2) => n1 + n2;
      var n_subtract = (n1, n2) => n1 - n2;
      var n_multiply = (n1, n2) => n1 * n2;
      var n_divide = (n1, n2) => n1 / n2;
      var v_add = vectorify(n_add);
      var v_subtract = vectorify(n_subtract);
      var v_multiply = vectorify(n_multiply);
      var v_divide = vectorify(n_divide);
      var vector_magnitude = function(vector) {
        var res2 = Math.sqrt(Math.pow(vector[0], 2) + Math.pow(vector[1], 2));
        return res2;
      };
      var distance_between_points = function(points) {
        var offset = v_subtract(points[1], points[0]);
        return vector_magnitude(offset);
      };
      var map_tas_by_type = {
        "c": Uint8ClampedArray,
        "ui8": Uint8Array,
        "i16": Int16Array,
        "i32": Int32Array,
        "ui16": Uint16Array,
        "ui32": Uint32Array,
        "f32": Float32Array,
        "f64": Float64Array
      };
      var get_typed_array = function() {
        const a = arguments;
        let length, input_array;
        const type = a[0];
        if (is_array(a[1])) {
          input_array = a[1];
        } else {
          length = a[1];
        }
        const ctr = map_tas_by_type[type];
        if (ctr) {
          if (input_array) {
            return new ctr(input_array);
          } else if (length) {
            return new ctr(length);
          }
        }
      };
      var Grammar = class {
        constructor(spec) {
          const eg_spec = {
            name: "User Auth Grammar"
          };
          const {
            name
          } = spec;
          this.name = name;
          const eg_indexing = () => {
            let map_sing_plur = {};
            let map_plur_sing = {};
            let map_sing_def = {};
            let map_sig_sing = {};
            let map_sig0_sing = {};
            let map_sig1_sing = {};
            let map_sig2_sing = {};
          };
          this.maps = {
            sing_plur: {},
            plur_sing: {},
            sing_def: {},
            deep_sig_sing: {},
            obj_sig_sing: {},
            sig_levels_sing: {}
          };
          this.load_grammar(spec.def);
        }
        load_grammar(grammar_def) {
          const {
            sing_plur,
            plur_sing,
            sing_def,
            sig_levels_sing,
            deep_sig_sing,
            obj_sig_sing
          } = this.maps;
          const resolve_def = (def) => {
            const td = tf(def);
            if (td === "a") {
              const res2 = [];
              each(def, (def_item) => {
                res2.push(resolve_def(def_item));
              });
              return res2;
            } else if (td === "s") {
              if (def === "string") {
                return "string";
              } else if (def === "number") {
                return "number";
              } else if (def === "boolean") {
                return "boolean";
              } else {
                const found_sing_def = sing_def[def];
                return found_sing_def;
              }
            } else if (td === "n") {
              console.trace();
              throw "NYI";
            } else if (td === "b") {
              console.trace();
              throw "NYI";
            }
          };
          const resolved_def_to_sig = (resolved_def, level = 0) => {
            const trd = tf(resolved_def);
            if (trd === "s") {
              if (resolved_def === "string") {
                return "s";
              } else if (resolved_def === "number") {
                return "n";
              } else if (resolved_def === "boolean") {
                return "b";
              }
            } else if (trd === "a") {
              let res2 = "";
              if (level === 0) {
              } else {
                res2 = res2 + "[";
              }
              each(resolved_def, (item2, c2) => {
                if (c2 > 0) {
                  res2 = res2 + ",";
                }
                res2 = res2 + resolved_def_to_sig(item2, level + 1);
              });
              if (level === 0) {
              } else {
                res2 = res2 + "]";
              }
              return res2;
            } else {
              console.trace();
              throw "NYI";
            }
            return res;
          };
          each(grammar_def, (def1, sing_word) => {
            const {
              def,
              plural
            } = def1;
            sing_def[sing_word] = def;
            sing_plur[sing_word] = plural;
            plur_sing[plural] = sing_word;
            const tdef = tf(def);
            const resolved_def = resolve_def(def);
            const resolved_def_sig = resolved_def_to_sig(resolved_def);
            deep_sig_sing[resolved_def_sig] = deep_sig_sing[resolved_def_sig] || [];
            deep_sig_sing[resolved_def_sig].push(sing_word);
            let def_is_all_custom_types = true;
            each(def, (def_item, c2, stop) => {
              const tdi = tf(def_item);
              if (tdi === "s") {
                if (sing_def[def_item]) {
                } else {
                  def_is_all_custom_types = false;
                  stop();
                }
              } else {
                def_is_all_custom_types = false;
                stop();
              }
            });
            let obj_sig;
            if (def_is_all_custom_types) {
              obj_sig = "{";
              each(def, (def_item, c2, stop) => {
                if (c2 > 0) {
                  obj_sig = obj_sig + ",";
                }
                const resolved = resolve_def(def_item);
                const abr_resolved = resolved_def_to_sig(resolved);
                obj_sig = obj_sig + '"' + def_item + '":';
                obj_sig = obj_sig + abr_resolved;
              });
              obj_sig = obj_sig + "}";
            }
            if (obj_sig) {
              obj_sig_sing[obj_sig] = obj_sig_sing[obj_sig] || [];
              obj_sig_sing[obj_sig].push(sing_word);
            }
          });
        }
        tof(item2) {
          const {
            sing_plur,
            plur_sing,
            sing_def,
            sig_levels_sing,
            deep_sig_sing,
            obj_sig_sing
          } = this.maps;
          const titem = tf(item2);
          console.log("titem", titem);
          if (titem === "a") {
            let all_arr_items_type;
            each(item2, (subitem, c2, stop) => {
              const subitem_type = this.tof(subitem);
              console.log("subitem_type", subitem_type);
              if (c2 === 0) {
                all_arr_items_type = subitem_type;
              } else {
                if (all_arr_items_type === subitem_type) {
                } else {
                  all_arr_items_type = null;
                  stop();
                }
              }
            });
            if (all_arr_items_type) {
              console.log("has all_arr_items_type", all_arr_items_type);
              if (!map_native_types[all_arr_items_type]) {
                const res2 = sing_plur[all_arr_items_type];
                return res2;
              }
            } else {
              console.log("no all_arr_items_type");
            }
          } else {
            return tof2(item2);
          }
          const item_deep_sig = deep_sig(item2);
          console.log("Grammar tof() item_deep_sig", item_deep_sig);
          let arr_sing;
          if (titem === "a") {
            const unenclosed_sig = item_deep_sig.substring(1, item_deep_sig.length - 1);
            console.log("unenclosed_sig", unenclosed_sig);
            arr_sing = deep_sig_sing[unenclosed_sig];
          } else {
            arr_sing = deep_sig_sing[item_deep_sig];
          }
          if (arr_sing) {
            if (arr_sing.length === 1) {
              return arr_sing[0];
            } else {
              console.trace();
              throw "NYI";
            }
          }
        }
        sig(item2, max_depth = -1, depth = 0) {
          const {
            sing_plur,
            plur_sing,
            sing_def,
            sig_levels_sing,
            deep_sig_sing,
            obj_sig_sing
          } = this.maps;
          const extended_sig = (item3) => {
            const ti = tf(item3);
            let res2 = "";
            let same_grammar_type;
            const record_subitem_sigs = (item4) => {
              same_grammar_type = void 0;
              let same_sig = void 0;
              each(item4, (subitem, c2) => {
                if (c2 > 0) {
                  res2 = res2 + ",";
                }
                const sig_subitem = this.sig(subitem, max_depth, depth + 1);
                if (same_sig === void 0) {
                  same_sig = sig_subitem;
                } else {
                  if (sig_subitem !== same_sig) {
                    same_sig = false;
                    same_grammar_type = false;
                  }
                }
                if (same_sig) {
                  if (sing_def[sig_subitem]) {
                    if (same_grammar_type === void 0) {
                      same_grammar_type = sig_subitem;
                    } else {
                      if (same_grammar_type === sig_subitem) {
                      } else {
                        same_grammar_type = false;
                      }
                    }
                  } else {
                  }
                }
                res2 = res2 + sig_subitem;
              });
            };
            if (ti === "A") {
              record_subitem_sigs(item3);
              return res2;
            } else if (ti === "a") {
              record_subitem_sigs(item3);
              if (same_grammar_type) {
                const plur_name = sing_plur[same_grammar_type];
                return plur_name;
              } else {
                const found_obj_type = obj_sig_sing[res2];
                const found_deep_sig_type = deep_sig_sing[res2];
                let found_type_sing;
                if (found_deep_sig_type) {
                  if (found_deep_sig_type.length === 1) {
                    found_type_sing = found_deep_sig_type[0];
                  }
                }
                if (found_type_sing) {
                  return found_type_sing;
                } else {
                  const enclosed_res = "[" + res2 + "]";
                  return enclosed_res;
                }
              }
            } else if (ti === "o") {
              if (max_depth === -1 || depth <= max_depth) {
                res2 = res2 + "{";
                let first = true;
                each(item3, (value, key) => {
                  const vsig = this.sig(value, max_depth, depth + 1);
                  if (!first) {
                    res2 = res2 + ",";
                  } else {
                    first = false;
                  }
                  res2 = res2 + '"' + key + '":' + vsig;
                });
                res2 = res2 + "}";
                return res2;
              } else {
                return "o";
              }
            } else if (ti === "s" || ti === "n" || ti === "b") {
              return ti;
            } else {
              return ti;
            }
          };
          return extended_sig(item2);
        }
        single_forms_sig(item2) {
          const {
            sing_plur,
            plur_sing,
            sing_def,
            sig_levels_sing,
            deep_sig_sing,
            obj_sig_sing
          } = this.maps;
          let sig = this.sig(item2);
          let s_sig = sig.split(",");
          const arr_res = [];
          each(s_sig, (sig_item, c2) => {
            const sing = plur_sing[sig_item] || sig_item;
            arr_res.push(sing);
          });
          const res2 = arr_res.join(",");
          return res2;
        }
      };
      var Evented_Class = class {
        "constructor"() {
          Object.defineProperty(this, "_bound_events", {
            value: {}
          });
        }
        "raise_event"() {
          let a = Array.prototype.slice.call(arguments), sig = get_a_sig(a);
          a.l = a.length;
          let target = this;
          let c2, l, res2;
          if (sig === "[s]") {
            let target2 = this;
            let event_name = a[0];
            let bgh = this._bound_general_handler;
            let be = this._bound_events;
            res2 = [];
            if (bgh) {
              for (c2 = 0, l = bgh.length; c2 < l; c2++) {
                res2.push(bgh[c2].call(target2, event_name));
              }
            }
            if (be) {
              let bei = be[event_name];
              if (tof2(bei) == "array") {
                for (c2 = 0, l = bei.length; c2 < l; c2++) {
                  res2.push(bei[c2].call(target2));
                }
                return res2;
              }
            }
          }
          if (sig === "[s,a]") {
            let be = this._bound_events;
            let bgh = this._bound_general_handler;
            let event_name = a[0];
            res2 = [];
            if (bgh) {
              for (c2 = 0, l = bgh.length; c2 < l; c2++) {
                res2.push(bgh[c2].call(target, event_name, a[1]));
              }
            }
            if (be) {
              let bei = be[event_name];
              if (tof2(bei) === "array") {
                for (c2 = 0, l = bei.length; c2 < l; c2++) {
                  res2.push(bei[c2].call(target, a[1]));
                }
              }
            }
          }
          if (sig === "[s,b]" || sig === "[s,s]" || sig === "[s,n]" || sig === "[s,B]" || sig === "[s,O]" || sig === "[s,e]") {
            let be = this._bound_events;
            let bgh = this._bound_general_handler;
            let event_name = a[0];
            res2 = [];
            if (bgh) {
              for (c2 = 0, l = bgh.length; c2 < l; c2++) {
                res2.push(bgh[c2].call(target, event_name, a[1]));
              }
            }
            if (be) {
              let bei = be[event_name];
              if (tof2(bei) === "array") {
                for (c2 = 0, l = bei.length; c2 < l; c2++) {
                  res2.push(bei[c2].call(target, a[1]));
                }
              }
            }
          }
          if (sig === "[s,o]" || sig === "[s,?]") {
            let be = this._bound_events;
            let bgh = this._bound_general_handler;
            let event_name = a[0];
            res2 = [];
            if (bgh) {
              for (c2 = 0, l = bgh.length; c2 < l; c2++) {
                res2.push(bgh[c2].call(target, event_name, a[1]));
              }
            }
            if (be) {
              let bei = be[event_name];
              if (tof2(bei) === "array") {
                for (c2 = 0, l = bei.length; c2 < l; c2++) {
                  res2.push(bei[c2].call(target, a[1]));
                }
              }
            }
          } else {
            if (a.l > 2) {
              let event_name = a[0];
              let additional_args = [];
              let bgh_args = [event_name];
              for (c2 = 1, l = a.l; c2 < l; c2++) {
                additional_args.push(a[c2]);
                bgh_args.push(a[c2]);
              }
              let be = this._bound_events;
              let bgh = this._bound_general_handler;
              res2 = [];
              if (bgh) {
                for (c2 = 0, l = bgh.length; c2 < l; c2++) {
                  res2.push(bgh[c2].apply(target, bgh_args));
                }
              }
              if (be) {
                let bei = be[event_name];
                if (tof2(bei) == "array") {
                  if (bei.length > 0) {
                    for (c2 = 0, l = bei.length; c2 < l; c2++) {
                      if (bei[c2]) res2.push(bei[c2].apply(target, additional_args));
                    }
                    return res2;
                  } else {
                    return res2;
                  }
                }
              }
            } else {
            }
          }
          return res2;
        }
        "add_event_listener"() {
          const {
            event_events
          } = this;
          let a = Array.prototype.slice.call(arguments), sig = get_a_sig(a);
          if (sig === "[f]") {
            this._bound_general_handler = this._bound_general_handler || [];
            if (is_array(this._bound_general_handler)) {
              this._bound_general_handler.push(a[0]);
            }
            ;
          }
          if (sig === "[s,f]") {
            let event_name = a[0], fn_listener = a[1];
            if (!this._bound_events[event_name]) this._bound_events[event_name] = [];
            let bei = this._bound_events[event_name];
            if (is_array(bei)) {
              bei.push(fn_listener);
              if (event_events) {
                this.raise("add-event-listener", {
                  "name": event_name
                });
              }
            } else {
              console.trace();
              throw "Expected: array";
            }
          }
          return this;
        }
        "remove_event_listener"(event_name, fn_listener) {
          const {
            event_events
          } = this;
          if (this._bound_events) {
            let bei = this._bound_events[event_name] || [];
            if (is_array(bei)) {
              let c2 = 0, l = bei.length, found = false;
              while (!found && c2 < l) {
                if (bei[c2] === fn_listener) {
                  found = true;
                } else {
                  c2++;
                }
              }
              if (found) {
                bei.splice(c2, 1);
                if (event_events) {
                  this.raise("remove-event-listener", {
                    "name": event_name
                  });
                }
              }
            } else {
              console.trace();
              throw "Expected: array";
            }
          }
          return this;
        }
        get bound_named_event_counts() {
          const res2 = {};
          if (this._bound_events) {
            const keys = Object.keys(this._bound_events);
            each(keys, (key) => {
              res2[key] = this._bound_events[key].length;
            });
          }
          return res2;
        }
        "one"(event_name, fn_handler) {
          let inner_handler = function(e) {
            fn_handler.call(this, e);
            this.off(event_name, inner_handler);
          };
          this.on(event_name, inner_handler);
        }
        "changes"(obj_changes) {
          if (!this.map_changes) {
            this.map_changes = {};
          }
          each(obj_changes, (handler, name) => {
            this.map_changes[name] = this.map_changes[name] || [];
            this.map_changes[name].push(handler);
          });
          if (!this._using_changes) {
            this._using_changes = true;
            this.on("change", (e_change) => {
              const {
                name,
                value
              } = e_change;
              if (this.map_changes[name]) {
                each(this.map_changes[name], (h_change) => {
                  h_change(value);
                });
              }
            });
          }
        }
      };
      var p = Evented_Class.prototype;
      p.raise = p.raise_event;
      p.trigger = p.raise_event;
      p.subscribe = p.add_event_listener;
      p.on = p.add_event_listener;
      p.off = p.remove_event_listener;
      var eventify = (obj2) => {
        const bound_events = {};
        const add_event_listener = (name, handler) => {
          if (handler === void 0 && typeof name === "function") {
            handler = name;
            name = "";
          }
          if (!bound_events[name]) bound_events[name] = [];
          bound_events[name].push(handler);
        };
        const remove_event_listener = (name, handler) => {
          if (bound_events[name]) {
            const i = bound_events[name].indexOf(handler);
            if (i > -1) {
              bound_events[name].splice(i, 1);
            }
          }
        };
        const raise_event = (name, optional_param) => {
          const arr_named_events = bound_events[name];
          if (arr_named_events !== void 0) {
            if (optional_param !== void 0) {
              const l = arr_named_events.length;
              for (let c2 = 0; c2 < l; c2++) {
                arr_named_events[c2].call(obj2, optional_param);
              }
            } else {
              const l = arr_named_events.length;
              for (let c2 = 0; c2 < l; c2++) {
                arr_named_events[c2].call(obj2);
              }
            }
          }
        };
        obj2.on = obj2.add_event_listener = add_event_listener;
        obj2.off = obj2.remove_event_listener = remove_event_listener;
        obj2.raise = obj2.raise_event = raise_event;
        return obj2;
      };
      var Publisher = class extends Evented_Class {
        constructor(spec = {}) {
          super({});
          this.one("ready", () => {
            this.is_ready = true;
          });
        }
        get when_ready() {
          return new Promise((solve, jettison) => {
            if (this.is_ready === true) {
              solve();
            } else {
              this.one("ready", () => {
                solve();
              });
            }
          });
        }
      };
      var prop = (...a) => {
        let s = get_a_sig(a);
        const raise_change_events = true;
        const ifn = (item2) => typeof item2 === "function";
        if (s === "[a]") {
          each(a[0], (item_params2) => {
            prop.apply(exports, item_params2);
          });
        } else {
          if (a.length === 2) {
            if (ia(a[1])) {
              const target = a[0];
              each(a[1], (item2) => {
                if (ia(item2)) {
                  throw "NYI 468732";
                } else {
                  prop(target, item2);
                }
              });
            } else {
              const ta1 = tof2(a[1]);
              if (ta1 === "string") {
                [obj, prop_name] = a;
              } else {
                throw "NYI 468732b";
              }
            }
          } else if (a.length > 2) {
            if (is_array(a[0])) {
              throw "stop";
              let objs = a.shift();
              each(objs, (obj2) => {
                prop.apply(exports, [obj2].concat(item_params));
              });
            } else {
              let obj2, prop_name2, default_value, fn_onchange, fn_transform, fn_on_ready, options;
              const load_options = (options2) => {
                prop_name2 = prop_name2 || options2.name || options2.prop_name;
                fn_onchange = options2.fn_onchange || options2.onchange || options2.change;
                fn_transform = options2.fn_transform || options2.ontransform || options2.transform;
                fn_on_ready = options2.ready || options2.on_ready;
                default_value = default_value || options2.default_value || options2.default;
              };
              if (a.length === 2) {
                [obj2, options] = a;
                load_options(options);
              } else if (a.length === 3) {
                if (ifn(a[2])) {
                  [obj2, prop_name2, fn_onchange] = a;
                } else {
                  if (a[2].change || a[2].ready) {
                    load_options(a[2]);
                    [obj2, prop_name2] = a;
                  } else {
                    [obj2, prop_name2, default_value] = a;
                  }
                }
              } else if (a.length === 4) {
                if (ifn(a[2]) && ifn(a[3])) {
                  [obj2, prop_name2, fn_transform, fn_onchange] = a;
                } else if (ifn(a[3])) {
                  [obj2, prop_name2, default_value, fn_onchange] = a;
                } else {
                  [obj2, prop_name2, default_value, options] = a;
                  load_options(options);
                }
              } else if (a.length === 5) {
                [obj2, prop_name2, default_value, fn_transform, fn_onchange] = a;
              }
              let _prop_value;
              if (typeof default_value !== "undefined") _prop_value = default_value;
              const _silent_set = (value) => {
                let _value;
                if (fn_transform) {
                  _value = fn_transform(value);
                } else {
                  _value = value;
                }
                _prop_value = _value;
              };
              const _set = (value) => {
                let _value;
                if (fn_transform) {
                  _value = fn_transform(value);
                } else {
                  _value = value;
                }
                let old = _prop_value;
                _prop_value = _value;
                if (fn_onchange) {
                  fn_onchange({
                    old,
                    value: _prop_value
                  });
                }
                if (obj2.raise && raise_change_events) {
                  obj2.raise("change", {
                    name: prop_name2,
                    old,
                    value: _prop_value
                  });
                }
              };
              if (is_defined2(default_value)) {
                _prop_value = default_value;
              }
              const t_prop_name = tf(prop_name2);
              if (t_prop_name === "s") {
                Object.defineProperty(obj2, prop_name2, {
                  get() {
                    return _prop_value;
                  },
                  set(value) {
                    _set(value);
                  }
                });
              } else if (t_prop_name === "a") {
                const l = prop_name2.length;
                let item_prop_name;
                for (let c2 = 0; c2 < l; c2++) {
                  item_prop_name = prop_name2[c2];
                  Object.defineProperty(obj2, item_prop_name, {
                    get() {
                      return _prop_value;
                    },
                    set(value) {
                      _set(value);
                    }
                  });
                }
              } else {
                throw "Unexpected name type: " + t_prop_name;
              }
              if (fn_on_ready) {
                fn_on_ready({
                  silent_set: _silent_set
                });
              }
            }
          }
        }
      };
      var Data_Type = class {
      };
      var Functional_Data_Type = class extends Data_Type {
        constructor(spec) {
          super(spec);
          if (spec.supertype) this.supertype = spec.supertype;
          if (spec.name) this.name = spec.name;
          if (spec.abbreviated_name) this.abbreviated_name = spec.abbreviated_name;
          if (spec.named_property_access) this.named_property_access = spec.named_property_access;
          if (spec.numbered_property_access) this.numbered_property_access = spec.numbered_property_access;
          if (spec.property_names) this.property_names = spec.property_names;
          if (spec.property_data_types) this.property_data_types = spec.property_data_types;
          if (spec.wrap_properties) this.wrap_properties = spec.wrap_properties;
          if (spec.wrap_value_inner_values) this.wrap_value_inner_values = spec.wrap_value_inner_values;
          if (spec.value_js_type) this.value_js_type = spec.value_js_type;
          if (spec.abbreviated_property_names) this.abbreviated_property_names = spec.abbreviated_property_names;
          if (spec.validate) this.validate = spec.validate;
          if (spec.validate_explain) this.validate_explain = spec.validate_explain;
          if (spec.parse_string) this.parse_string = spec.parse_string;
          if (spec.parse) this.parse = spec.parse;
        }
      };
      Functional_Data_Type.number = new Functional_Data_Type({
        name: "number",
        abbreviated_name: "n",
        validate: (x) => {
          return !isNaN(x);
        },
        parse_string(str) {
          const p2 = parseFloat(str);
          if (p2 + "" === str) {
            const parsed_is_valid = this.validate(p2);
            if (parsed_is_valid) {
              return p2;
            }
          }
        }
      });
      Functional_Data_Type.integer = new Functional_Data_Type({
        name: "integer",
        abbreviated_name: "int",
        validate: (x) => {
          return Number.isInteger(x);
        },
        parse_string(str) {
          const p2 = parseInt(str, 10);
          if (!isNaN(p2) && p2.toString() === str) {
            return p2;
          }
          return void 0;
        }
      });
      var field = (...a) => {
        const raise_change_events = true;
        const ifn = (item2) => typeof item2 === "function";
        let s = get_a_sig(a);
        if (s === "[a]") {
          each(a[0], (item_params2) => {
            prop.apply(exports, item_params2);
          });
        } else {
          if (a.length > 1) {
            if (is_array(a[0])) {
              throw "stop - need to fix";
              let objs = a.shift();
              each(objs, (obj2) => {
                field.apply(exports, [obj2].concat(item_params));
              });
            } else {
              let obj2, prop_name2, data_type, default_value, fn_transform;
              if (a.length === 2) {
                [obj2, prop_name2] = a;
              } else if (a.length === 3) {
                if (a[2] instanceof Data_Type) {
                  [obj2, prop_name2, data_type, default_value] = a;
                } else {
                  if (ifn(a[2])) {
                    [obj2, prop_name2, fn_transform] = a;
                  } else {
                    [obj2, prop_name2, default_value] = a;
                  }
                }
              } else if (a.length === 4) {
                if (a[2] instanceof Data_Type) {
                  [obj2, prop_name2, data_type, default_value] = a;
                } else {
                  [obj2, prop_name2, default_value, fn_transform] = a;
                }
              }
              if (obj2 !== void 0) {
                Object.defineProperty(obj2, prop_name2, {
                  get() {
                    if (is_defined2(obj2._)) {
                      return obj2._[prop_name2];
                    } else {
                      return void 0;
                    }
                  },
                  set(value) {
                    let old = (obj2._ = obj2._ || {})[prop_name2];
                    if (old !== value) {
                      let is_valid = true;
                      if (data_type) {
                        const t_value = typeof value;
                        is_valid = data_type.validate(value);
                        if (t_value === "string") {
                          const parsed_value = data_type.parse_string(value);
                          is_valid = data_type.validate(parsed_value);
                          if (is_valid) value = parsed_value;
                        }
                        console.log("t_value", t_value);
                      }
                      if (is_valid) {
                        let _value;
                        if (fn_transform) {
                          _value = fn_transform(value);
                        } else {
                          _value = value;
                        }
                        obj2._[prop_name2] = _value;
                        if (raise_change_events) {
                          obj2.raise("change", {
                            name: prop_name2,
                            old,
                            value: _value
                          });
                        }
                      }
                    } else {
                    }
                  }
                });
                if (is_defined2(default_value)) {
                  let is_valid = true;
                  if (data_type) {
                    is_valid = data_type.validate(default_value);
                  }
                  if (is_valid) {
                    (obj2._ = obj2._ || {})[prop_name2] = default_value;
                  }
                }
              } else {
                throw "stop";
              }
            }
          }
        }
      };
      var KEYWORD_LITERALS = /* @__PURE__ */ new Set(["true", "false", "null", "undefined"]);
      var KEYWORD_OPERATORS = /* @__PURE__ */ new Set(["typeof", "void", "delete", "in", "instanceof"]);
      var MULTI_CHAR_OPERATORS = [
        "===",
        "!==",
        "==",
        "!=",
        "<=",
        ">=",
        "&&",
        "||",
        "??",
        "++",
        "--",
        "+=",
        "-=",
        "*=",
        "/=",
        "%=",
        "&=",
        "|=",
        "^=",
        "<<",
        ">>",
        ">>>",
        "**"
      ];
      var SINGLE_CHAR_OPERATORS = /* @__PURE__ */ new Set(["+", "-", "*", "/", "%", "=", "!", "<", ">", "&", "|", "^", "~"]);
      var PUNCTUATION_CHARS = /* @__PURE__ */ new Set(["(", ")", "{", "}", "[", "]", ",", ":", "?", "."]);
      var GLOBAL_SCOPE = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};
      var DEFAULT_ALLOWED_GLOBALS = ["Math"];
      var EXPRESSION_PARSER_DEFAULTS = {
        cache: true,
        cacheSize: 64,
        cacheKeyResolver: null,
        maxExpressionLength: 1e4,
        maxMemberDepth: 2,
        helpers: {},
        allowedFunctions: [],
        allowedGlobals: DEFAULT_ALLOWED_GLOBALS,
        allowCall: null,
        strict: false
      };
      var NORMALIZED_OPTIONS_FLAG = /* @__PURE__ */ Symbol("ExpressionParserOptions");
      var DISALLOWED_IDENTIFIERS = /* @__PURE__ */ new Set(["this", "new"]);
      var ExpressionParserError = class extends Error {
        constructor(code, message, details = {}) {
          super(message);
          this.name = "ExpressionParserError";
          this.code = code;
          this.details = details;
        }
      };
      var ExpressionCache = class {
        constructor(limit = 0) {
          this.limit = Math.max(0, limit || 0);
          this.map = /* @__PURE__ */ new Map();
        }
        get(key) {
          if (!this.limit || !this.map.has(key)) {
            return void 0;
          }
          const value = this.map.get(key);
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
        set(key, value) {
          if (!this.limit) {
            return;
          }
          if (this.map.has(key)) {
            this.map.delete(key);
          }
          this.map.set(key, value);
          while (this.map.size > this.limit) {
            const oldestKey = this.map.keys().next().value;
            this.map.delete(oldestKey);
          }
        }
        clear() {
          this.map.clear();
        }
        get size() {
          return this.map.size;
        }
      };
      var Tokenizer = class {
        constructor(expression) {
          this.expression = typeof expression === "string" ? expression : String(expression || "");
          this.length = this.expression.length;
          this.position = 0;
          this.line = 1;
          this.column = 1;
        }
        tokenize() {
          const tokens = [];
          if (!this.expression.trim()) {
            return tokens;
          }
          while (!this.isAtEnd()) {
            this.skipWhitespace();
            if (this.isAtEnd()) break;
            const ch = this.peek();
            if (this.isIdentifierStart(ch)) {
              tokens.push(this.tokenizeIdentifier());
            } else if (this.isDigit(ch) || ch === "." && this.isDigit(this.peek(1))) {
              tokens.push(this.tokenizeNumber());
            } else if (ch === '"' || ch === "'") {
              tokens.push(this.tokenizeString());
            } else if (this.isOperatorStart(ch)) {
              tokens.push(this.tokenizeOperator());
            } else if (PUNCTUATION_CHARS.has(ch)) {
              tokens.push(this.tokenizePunctuation());
            } else {
              this.throwError("TOKEN_INVALID_CHAR", `Unexpected character: ${ch}`);
            }
          }
          return tokens;
        }
        isAtEnd() {
          return this.position >= this.length;
        }
        skipWhitespace() {
          while (!this.isAtEnd()) {
            const ch = this.peek();
            if (/\s/.test(ch)) {
              this.advance();
              continue;
            }
            if (ch === "/" && this.peek(1) === "/") {
              while (!this.isAtEnd() && this.peek() !== "\n") {
                this.advance();
              }
              continue;
            }
            if (ch === "/" && this.peek(1) === "*") {
              this.advance();
              this.advance();
              while (!this.isAtEnd()) {
                if (this.peek() === "*" && this.peek(1) === "/") {
                  this.advance();
                  this.advance();
                  break;
                }
                this.advance();
              }
              continue;
            }
            break;
          }
        }
        peek(offset = 0) {
          if (this.position + offset >= this.length) return "\0";
          return this.expression[this.position + offset];
        }
        advance() {
          if (this.isAtEnd()) {
            return "\0";
          }
          const char = this.expression[this.position++];
          if (char === "\n") {
            this.line += 1;
            this.column = 1;
          } else {
            this.column += 1;
          }
          return char;
        }
        getLocationSnapshot() {
          return { index: this.position, line: this.line, column: this.column };
        }
        createToken(type, value, start, end) {
          return { type, value, start, end };
        }
        throwError(code, message) {
          throw new ExpressionParserError(code, message, { location: this.getLocationSnapshot() });
        }
        isIdentifierStart(ch) {
          return /[A-Za-z_$]/.test(ch);
        }
        isIdentifierPart(ch) {
          return /[A-Za-z0-9_$]/.test(ch);
        }
        isDigit(ch) {
          return /[0-9]/.test(ch);
        }
        isOperatorStart(ch) {
          if (ch === "." && this.peek(1) === "." && this.peek(2) === ".") {
            this.throwError("SYNTAX_UNSUPPORTED", "Spread syntax is not supported");
          }
          if (ch === "?" && this.peek(1) === "?") {
            return true;
          }
          return SINGLE_CHAR_OPERATORS.has(ch);
        }
        tokenizeIdentifier() {
          const start = this.getLocationSnapshot();
          let value = "";
          while (!this.isAtEnd() && this.isIdentifierPart(this.peek())) {
            value += this.advance();
          }
          const end = this.getLocationSnapshot();
          if (KEYWORD_LITERALS.has(value)) {
            return this.createToken("KEYWORD", value, start, end);
          }
          if (KEYWORD_OPERATORS.has(value)) {
            return this.createToken("OPERATOR", value, start, end);
          }
          return this.createToken("IDENTIFIER", value, start, end);
        }
        tokenizeNumber() {
          const start = this.getLocationSnapshot();
          let value = "";
          let hasDot = false;
          while (!this.isAtEnd()) {
            const ch = this.peek();
            if (this.isDigit(ch)) {
              value += this.advance();
            } else if (ch === "." && !hasDot) {
              hasDot = true;
              value += this.advance();
            } else {
              break;
            }
          }
          const end = this.getLocationSnapshot();
          return this.createToken("NUMBER", Number(value), start, end);
        }
        tokenizeString() {
          const quote = this.advance();
          const start = this.getLocationSnapshot();
          let value = "";
          while (!this.isAtEnd()) {
            const ch = this.advance();
            if (ch === quote) {
              return this.createToken("STRING", value, start, this.getLocationSnapshot());
            }
            if (ch === "\\") {
              const next = this.advance();
              switch (next) {
                case "n":
                  value += "\n";
                  break;
                case "r":
                  value += "\r";
                  break;
                case "t":
                  value += "	";
                  break;
                case "\\":
                  value += "\\";
                  break;
                case '"':
                  value += '"';
                  break;
                case "'":
                  value += "'";
                  break;
                default:
                  value += next;
              }
            } else {
              value += ch;
            }
          }
          this.throwError("TOKEN_UNTERMINATED_STRING", "Unterminated string literal");
        }
        tokenizeOperator() {
          const remaining = this.expression.slice(this.position);
          const start = this.getLocationSnapshot();
          for (const op of MULTI_CHAR_OPERATORS) {
            if (remaining.startsWith(op)) {
              if (op === "=>") {
                this.throwError("SYNTAX_UNSUPPORTED", "Arrow functions are not supported");
              }
              this.position += op.length;
              this.column += op.length;
              return this.createToken("OPERATOR", op, start, this.getLocationSnapshot());
            }
          }
          const ch = this.advance();
          if (ch === "=" && this.peek() === ">") {
            this.throwError("SYNTAX_UNSUPPORTED", "Arrow functions are not supported");
          }
          if (!SINGLE_CHAR_OPERATORS.has(ch) && ch !== "?") {
            this.throwError("TOKEN_UNEXPECTED_OPERATOR", "Unexpected operator");
          }
          return this.createToken("OPERATOR", ch, start, this.getLocationSnapshot());
        }
        tokenizePunctuation() {
          const start = this.getLocationSnapshot();
          const ch = this.advance();
          if (ch === "." && this.peek() === "." && this.peek(1) === ".") {
            this.throwError("SYNTAX_UNSUPPORTED", "Spread syntax is not supported");
          }
          return this.createToken("PUNCTUATION", ch, start, this.getLocationSnapshot());
        }
      };
      var Parser = class {
        constructor(tokens, options = {}) {
          this.tokens = tokens;
          this.pos = 0;
          this.maxMemberDepth = options.maxMemberDepth || EXPRESSION_PARSER_DEFAULTS.maxMemberDepth;
          const disallowed = new Set(DISALLOWED_IDENTIFIERS);
          if (options.disallowedIdentifiers) {
            options.disallowedIdentifiers.forEach((identifier) => disallowed.add(identifier));
          }
          this.disallowedIdentifiers = disallowed;
        }
        parse() {
          if (!this.tokens.length) {
            throw new ExpressionParserError("EMPTY_EXPRESSION", "Empty expression");
          }
          const ast = this.parseExpression();
          if (!this.isAtEnd()) {
            this.error("UNEXPECTED_TOKEN", `Unexpected token: ${this.peek().value}`, this.peek());
          }
          return ast;
        }
        parseExpression() {
          return this.parseConditionalExpression();
        }
        parseConditionalExpression() {
          let expr = this.parseLogicalOrExpression();
          if (this.matchPunctuation("?")) {
            const consequent = this.parseExpression();
            this.consume("PUNCTUATION", ":");
            const alternate = this.parseExpression();
            expr = {
              type: "ConditionalExpression",
              test: expr,
              consequent,
              alternate
            };
          }
          return expr;
        }
        parseLogicalOrExpression() {
          let expr = this.parseLogicalAndExpression();
          while (this.matchOperator("||")) {
            const operator = this.previous().value;
            const right = this.parseLogicalAndExpression();
            expr = this.buildLogicalExpression(operator, expr, right);
          }
          return expr;
        }
        parseLogicalAndExpression() {
          let expr = this.parseNullishExpression();
          while (this.matchOperator("&&")) {
            const operator = this.previous().value;
            const right = this.parseNullishExpression();
            expr = this.buildLogicalExpression(operator, expr, right);
          }
          return expr;
        }
        parseNullishExpression() {
          let expr = this.parseEqualityExpression();
          while (this.matchOperator("??")) {
            const operator = this.previous().value;
            const right = this.parseEqualityExpression();
            expr = this.buildLogicalExpression(operator, expr, right);
          }
          return expr;
        }
        parseEqualityExpression() {
          let expr = this.parseRelationalExpression();
          while (this.matchOperator("===", "!==", "==", "!=")) {
            const operator = this.previous().value;
            const right = this.parseRelationalExpression();
            expr = this.buildBinaryExpression(operator, expr, right);
          }
          return expr;
        }
        parseRelationalExpression() {
          let expr = this.parseShiftExpression();
          while (this.matchOperator("<", ">", "<=", ">=", "instanceof", "in")) {
            const operator = this.previous().value;
            const right = this.parseShiftExpression();
            expr = this.buildBinaryExpression(operator, expr, right);
          }
          return expr;
        }
        parseShiftExpression() {
          let expr = this.parseAdditiveExpression();
          while (this.matchOperator("<<", ">>", ">>>")) {
            const operator = this.previous().value;
            const right = this.parseAdditiveExpression();
            expr = this.buildBinaryExpression(operator, expr, right);
          }
          return expr;
        }
        parseAdditiveExpression() {
          let expr = this.parseMultiplicativeExpression();
          while (this.matchOperator("+", "-")) {
            const operator = this.previous().value;
            const right = this.parseMultiplicativeExpression();
            expr = this.buildBinaryExpression(operator, expr, right);
          }
          return expr;
        }
        parseMultiplicativeExpression() {
          let expr = this.parseUnaryExpression();
          while (this.matchOperator("*", "/", "%")) {
            const operator = this.previous().value;
            const right = this.parseUnaryExpression();
            expr = this.buildBinaryExpression(operator, expr, right);
          }
          return expr;
        }
        parseUnaryExpression() {
          if (this.matchOperator("+", "-", "!", "~", "typeof", "void", "delete")) {
            const operator = this.previous().value;
            const argument = this.parseUnaryExpression();
            return { type: "UnaryExpression", operator, argument };
          }
          return this.parseLeftHandSideExpression();
        }
        parseLeftHandSideExpression() {
          let expr = this.parsePrimaryExpression();
          while (true) {
            if (this.matchPunctuation(".")) {
              const operatorToken = this.previous();
              const property = this.consumePropertyIdentifier();
              const depth = this.getChainDepth(expr) + 1;
              this.assertMemberDepth(depth, operatorToken);
              expr = {
                type: "MemberExpression",
                object: expr,
                property,
                computed: false
              };
              this.setChainDepth(expr, depth);
            } else if (this.matchPunctuation("[")) {
              const operatorToken = this.previous();
              const property = this.parseExpression();
              this.consume("PUNCTUATION", "]");
              const depth = this.getChainDepth(expr) + 1;
              this.assertMemberDepth(depth, operatorToken);
              expr = {
                type: "MemberExpression",
                object: expr,
                property,
                computed: true
              };
              this.setChainDepth(expr, depth);
            } else if (this.matchPunctuation("(")) {
              const args = this.parseArguments();
              expr = {
                type: "CallExpression",
                callee: expr,
                arguments: args
              };
              this.setChainDepth(expr, this.getChainDepth(expr.callee));
            } else {
              break;
            }
          }
          return expr;
        }
        parsePrimaryExpression() {
          const token = this.peek();
          if (!token) {
            this.error("UNEXPECTED_END", "Unexpected end of expression", token);
          }
          if (token.type === "NUMBER" || token.type === "STRING") {
            this.advance();
            return { type: "Literal", value: token.value };
          }
          if (token.type === "KEYWORD") {
            this.advance();
            return { type: "Literal", value: this.literalFromKeyword(token.value) };
          }
          if (token.type === "IDENTIFIER") {
            this.advance();
            this.assertIdentifierAllowed(token);
            return { type: "Identifier", value: token.value };
          }
          if (this.matchPunctuation("(")) {
            const expr = this.parseExpression();
            this.consume("PUNCTUATION", ")");
            return expr;
          }
          if (this.matchPunctuation("[")) {
            const elements = [];
            if (!this.check("PUNCTUATION", "]")) {
              do {
                elements.push(this.parseExpression());
              } while (this.matchPunctuation(","));
            }
            this.consume("PUNCTUATION", "]");
            return { type: "ArrayExpression", elements };
          }
          if (this.matchPunctuation("{")) {
            const properties = [];
            if (!this.check("PUNCTUATION", "}")) {
              do {
                const key = this.parsePropertyKey();
                this.consume("PUNCTUATION", ":");
                const value = this.parseExpression();
                properties.push({ key, value });
              } while (this.matchPunctuation(","));
            }
            this.consume("PUNCTUATION", "}");
            return { type: "ObjectExpression", properties };
          }
          this.error("UNEXPECTED_TOKEN", `Unexpected token: ${token.value}`, token);
        }
        parsePropertyKey() {
          const token = this.peek();
          if (token.type === "IDENTIFIER") {
            this.advance();
            return { type: "Identifier", value: token.value };
          }
          if (token.type === "STRING" || token.type === "NUMBER" || token.type === "KEYWORD") {
            this.advance();
            const value = token.type === "KEYWORD" ? this.literalFromKeyword(token.value) : token.value;
            return { type: "Literal", value };
          }
          this.error("INVALID_OBJECT_KEY", "Invalid object property key", token);
        }
        parseArguments() {
          const args = [];
          if (!this.check("PUNCTUATION", ")")) {
            do {
              args.push(this.parseExpression());
            } while (this.matchPunctuation(","));
          }
          this.consume("PUNCTUATION", ")");
          return args;
        }
        literalFromKeyword(value) {
          switch (value) {
            case "true":
              return true;
            case "false":
              return false;
            case "null":
              return null;
            case "undefined":
              return void 0;
            default:
              return value;
          }
        }
        consume(type, value) {
          if (this.check(type, value)) {
            return this.advance();
          }
          const expected = value ? `${type} '${value}'` : type;
          this.error("MISSING_TOKEN", `Expected ${expected}`, this.peek());
        }
        check(type, value) {
          if (this.isAtEnd()) return false;
          const token = this.peek();
          if (token.type !== type) return false;
          if (typeof value === "undefined") return true;
          return token.value === value;
        }
        matchOperator(...operators) {
          if (this.check("OPERATOR") && operators.includes(this.peek().value)) {
            this.advance();
            return true;
          }
          return false;
        }
        matchPunctuation(value) {
          if (this.check("PUNCTUATION", value)) {
            this.advance();
            return true;
          }
          return false;
        }
        consumePropertyIdentifier() {
          const token = this.peek();
          if (token.type === "IDENTIFIER") {
            this.advance();
            return { type: "Identifier", value: token.value };
          }
          if (token.type === "STRING" || token.type === "NUMBER" || token.type === "KEYWORD") {
            this.advance();
            const value = token.type === "KEYWORD" ? this.literalFromKeyword(token.value) : token.value;
            return { type: "Literal", value };
          }
          this.error("INVALID_PROPERTY", "Expected property name", token);
        }
        buildBinaryExpression(operator, left, right) {
          return { type: "BinaryExpression", operator, left, right };
        }
        buildLogicalExpression(operator, left, right) {
          return { type: "LogicalExpression", operator, left, right };
        }
        getChainDepth(node) {
          if (!node || typeof node !== "object") {
            return 0;
          }
          return node.__chainDepth || 0;
        }
        setChainDepth(node, depth) {
          if (!node || typeof node !== "object") {
            return;
          }
          Object.defineProperty(node, "__chainDepth", {
            value: depth,
            enumerable: false,
            configurable: true
          });
        }
        assertMemberDepth(depth, token) {
          if (depth > this.maxMemberDepth) {
            this.error("MEMBER_DEPTH_EXCEEDED", `Member access depth ${depth} exceeds maximum of ${this.maxMemberDepth}`, token);
          }
        }
        assertIdentifierAllowed(token) {
          if (this.disallowedIdentifiers.has(token.value)) {
            this.error("DISALLOWED_IDENTIFIER", `Identifier '${token.value}' is not allowed in expressions`, token);
          }
        }
        error(code, message, token) {
          throw new ExpressionParserError(code, message, token ? { location: token.start } : void 0);
        }
        advance() {
          if (!this.isAtEnd()) {
            this.pos += 1;
          }
          return this.tokens[this.pos - 1];
        }
        peek() {
          if (this.isAtEnd()) return null;
          return this.tokens[this.pos];
        }
        previous() {
          return this.tokens[this.pos - 1];
        }
        isAtEnd() {
          return this.pos >= this.tokens.length;
        }
      };
      var Evaluator = class {
        constructor(context2 = {}, options = {}) {
          this.context = context2 || {};
          this.helpers = options.helpers || {};
          this.strict = options.strict || false;
          this.allowCall = options.allowCall || null;
          this.allowedFunctions = new Set(options.allowedFunctions || []);
          this.allowedGlobals = new Set(options.allowedGlobals || []);
          Object.values(this.helpers).forEach((value) => {
            if (typeof value === "function") {
              this.allowedFunctions.add(value);
            }
          });
        }
        evaluate(node) {
          switch (node.type) {
            case "Literal":
              return node.value;
            case "Identifier":
              return this.evaluateIdentifier(node);
            case "MemberExpression":
              return this.evaluateMemberExpression(node);
            case "CallExpression":
              return this.evaluateCallExpression(node);
            case "UnaryExpression":
              return this.evaluateUnaryExpression(node);
            case "BinaryExpression":
              return this.evaluateBinaryExpression(node);
            case "LogicalExpression":
              return this.evaluateLogicalExpression(node);
            case "ArrayExpression":
              return node.elements.map((element) => this.evaluate(element));
            case "ObjectExpression":
              return this.evaluateObjectExpression(node);
            case "ConditionalExpression":
              return this.evaluateConditionalExpression(node);
            default:
              throw new ExpressionParserError("UNSUPPORTED_NODE", `Unsupported AST node type: ${node.type}`);
          }
        }
        evaluateIdentifier(node) {
          const name = node.value;
          if (Object.prototype.hasOwnProperty.call(this.helpers, name)) {
            return this.helpers[name];
          }
          if (this.context && Object.prototype.hasOwnProperty.call(this.context, name)) {
            return this.context[name];
          }
          if (this.allowedGlobals.has(name) && name in GLOBAL_SCOPE) {
            return GLOBAL_SCOPE[name];
          }
          if (this.strict) {
            throw new ExpressionParserError("UNDEFINED_IDENTIFIER", `Undefined identifier: ${name}`);
          }
          console.error(`Undefined identifier: ${name}`);
          return void 0;
        }
        evaluateMemberExpression(node) {
          const object = this.evaluate(node.object);
          if (object === null || object === void 0) {
            throw new ExpressionParserError("NULL_MEMBER_ACCESS", "Cannot read property of null or undefined");
          }
          const property = node.computed ? this.evaluate(node.property) : node.property.type === "Identifier" ? node.property.value : node.property.value;
          return object[property];
        }
        evaluateCallExpression(node) {
          let callee;
          let thisArg;
          if (node.callee.type === "MemberExpression") {
            const object = this.evaluate(node.callee.object);
            if (object === null || object === void 0) {
              throw new ExpressionParserError("NULL_MEMBER_CALL", "Cannot call property of null or undefined");
            }
            const property = node.callee.computed ? this.evaluate(node.callee.property) : node.callee.property.type === "Identifier" ? node.callee.property.value : node.callee.property.value;
            callee = object[property];
            thisArg = object;
          } else {
            callee = this.evaluate(node.callee);
            thisArg = void 0;
          }
          if (typeof callee !== "function") {
            throw new ExpressionParserError("CALL_NON_FUNCTION", "Attempted to call a non-function");
          }
          if (!this.isCallAllowed(callee, thisArg)) {
            throw new ExpressionParserError("CALL_NOT_ALLOWED", "Function call not allowed by policy");
          }
          const args = node.arguments.map((arg) => this.evaluate(arg));
          return callee.apply(thisArg, args);
        }
        isCallAllowed(fn, thisArg) {
          if (this.allowCall) {
            const decision = this.allowCall(fn, thisArg);
            if (decision === true) return true;
            if (decision === false) return false;
          }
          return this.allowedFunctions.has(fn);
        }
        evaluateUnaryExpression(node) {
          let argumentValue;
          if (node.operator === "delete") {
            argumentValue = node.argument;
          } else if (node.operator === "typeof" && node.argument.type === "Identifier" && !this.isIdentifierDefined(node.argument.value)) {
            argumentValue = void 0;
          } else {
            argumentValue = this.evaluate(node.argument);
          }
          switch (node.operator) {
            case "+":
              return +argumentValue;
            case "-":
              return -argumentValue;
            case "!":
              return !argumentValue;
            case "~":
              return ~argumentValue;
            case "typeof":
              if (node.argument.type === "Identifier" && !this.isIdentifierDefined(node.argument.value)) {
                return "undefined";
              }
              return typeof argumentValue;
            case "void":
              return void argumentValue;
            case "delete":
              return this.performDelete(node.argument);
            default:
              throw new ExpressionParserError("UNSUPPORTED_UNARY", `Unsupported unary operator: ${node.operator}`);
          }
        }
        isIdentifierDefined(name) {
          return Object.prototype.hasOwnProperty.call(this.helpers, name) || this.context && Object.prototype.hasOwnProperty.call(this.context, name) || this.allowedGlobals.has(name) && name in GLOBAL_SCOPE;
        }
        performDelete(argument) {
          if (argument.type === "Identifier" && this.context && typeof this.context === "object") {
            return delete this.context[argument.value];
          }
          if (argument.type === "MemberExpression") {
            const target = this.evaluate(argument.object);
            if (target === null || target === void 0) {
              return true;
            }
            const property = argument.computed ? this.evaluate(argument.property) : argument.property.type === "Identifier" ? argument.property.value : argument.property.value;
            return delete target[property];
          }
          this.evaluate(argument);
          return true;
        }
        evaluateBinaryExpression(node) {
          const left = this.evaluate(node.left);
          const right = this.evaluate(node.right);
          switch (node.operator) {
            case "+":
              return left + right;
            case "-":
              return left - right;
            case "*":
              return left * right;
            case "/":
              return left / right;
            case "%":
              return left % right;
            case "==":
              return left == right;
            case "!=":
              return left != right;
            case "===":
              return left === right;
            case "!==":
              return left !== right;
            case "<":
              return left < right;
            case ">":
              return left > right;
            case "<=":
              return left <= right;
            case ">=":
              return left >= right;
            case "in":
              return left in right;
            case "instanceof":
              return left instanceof right;
            default:
              throw new ExpressionParserError("UNSUPPORTED_BINARY", `Unsupported binary operator: ${node.operator}`);
          }
        }
        evaluateLogicalExpression(node) {
          switch (node.operator) {
            case "&&": {
              const left = this.evaluate(node.left);
              return left ? this.evaluate(node.right) : left;
            }
            case "||": {
              const left = this.evaluate(node.left);
              return left ? left : this.evaluate(node.right);
            }
            case "??": {
              const left = this.evaluate(node.left);
              return left !== null && left !== void 0 ? left : this.evaluate(node.right);
            }
            default:
              throw new ExpressionParserError("UNSUPPORTED_LOGICAL", `Unsupported logical operator: ${node.operator}`);
          }
        }
        evaluateObjectExpression(node) {
          const obj2 = {};
          node.properties.forEach((property) => {
            const key = this.evaluatePropertyKey(property.key);
            obj2[key] = this.evaluate(property.value);
          });
          return obj2;
        }
        evaluatePropertyKey(node) {
          if (node.type === "Identifier") {
            return node.value;
          }
          return node.value;
        }
        evaluateConditionalExpression(node) {
          const test = this.evaluate(node.test);
          return test ? this.evaluate(node.consequent) : this.evaluate(node.alternate);
        }
      };
      var ExpressionParser = class {
        constructor(options = {}) {
          this.options = normalizeOptions(null, options);
          const cacheLimit = this.options.cache !== false ? this.options.cacheSize : 0;
          this.astCache = new ExpressionCache(cacheLimit);
          this.valueCache = new ExpressionCache(cacheLimit);
        }
        tokenize(expression) {
          return new Tokenizer(expression).tokenize();
        }
        parse(expression, overrideOptions) {
          const options = this.ensureNormalizedOptions(overrideOptions);
          this.ensureExpressionLength(expression, options);
          const useCache = this.shouldUseCache(options);
          if (useCache) {
            const cachedAst = this.astCache.get(expression);
            if (cachedAst) {
              return cachedAst;
            }
          }
          const tokens = this.tokenize(expression);
          if (!tokens.length) {
            throw new ExpressionParserError("EMPTY_EXPRESSION", "Empty expression");
          }
          const parser = new Parser(tokens, options);
          const ast = parser.parse();
          Object.defineProperty(ast, "tokens", {
            value: tokens,
            enumerable: false,
            configurable: true
          });
          if (useCache) {
            this.astCache.set(expression, ast);
          }
          return ast;
        }
        evaluate(expression, context2 = {}, overrideOptions = {}) {
          const mergedOptions = this.mergeOptions(overrideOptions);
          const useCache = this.shouldUseCache(mergedOptions);
          if (useCache) {
            const cached = this.getCachedValue(expression, context2, mergedOptions);
            if (cached.hit) {
              return cached.value;
            }
          }
          const ast = this.parse(expression, mergedOptions);
          const evaluator = new Evaluator(context2, mergedOptions);
          const result = evaluator.evaluate(ast);
          if (useCache) {
            this.storeCachedValue(expression, context2, result, mergedOptions);
          }
          return result;
        }
        compile(expression, overrideOptions = {}) {
          const baseOptions = this.mergeOptions(overrideOptions);
          const ast = this.parse(expression, baseOptions);
          return (context2 = {}, runtimeOptions = {}) => {
            const invocationOptions = this.mergeOptions(runtimeOptions, baseOptions);
            const evaluator = new Evaluator(context2, invocationOptions);
            return evaluator.evaluate(ast);
          };
        }
        shouldUseCache(options) {
          return options.cache !== false && options.cacheSize > 0;
        }
        ensureNormalizedOptions(options) {
          if (options && options[NORMALIZED_OPTIONS_FLAG]) {
            return options;
          }
          if (!options) {
            return this.options;
          }
          return this.mergeOptions(options);
        }
        ensureExpressionLength(expression, options) {
          if (expression.length > options.maxExpressionLength) {
            throw new ExpressionParserError(
              "EXPRESSION_TOO_LONG",
              `Expression exceeds maximum length of ${options.maxExpressionLength} characters`
            );
          }
        }
        mergeOptions(override = {}, baseOptions) {
          const base = baseOptions && baseOptions[NORMALIZED_OPTIONS_FLAG] ? baseOptions : baseOptions || this.options;
          return normalizeOptions(base, override);
        }
        getCachedValue(expression, context2, options) {
          const bucket = this.valueCache.get(expression);
          if (!bucket) {
            return { hit: false };
          }
          if (this.isObjectLike(context2)) {
            if (bucket.objectCache && bucket.objectCache.has(context2)) {
              return { hit: true, value: bucket.objectCache.get(context2) };
            }
            return { hit: false };
          }
          const key = this.resolvePrimitiveKey(context2, options);
          if (key === void 0) {
            return { hit: false };
          }
          if (bucket.primitiveCache && bucket.primitiveCache.has(key)) {
            return { hit: true, value: bucket.primitiveCache.get(key) };
          }
          return { hit: false };
        }
        storeCachedValue(expression, context2, value, options) {
          if (!this.shouldUseCache(options)) {
            return;
          }
          let bucket = this.valueCache.get(expression);
          if (!bucket) {
            bucket = { objectCache: /* @__PURE__ */ new WeakMap(), primitiveCache: /* @__PURE__ */ new Map() };
            this.valueCache.set(expression, bucket);
          }
          if (this.isObjectLike(context2)) {
            bucket.objectCache.set(context2, value);
            return;
          }
          const key = this.resolvePrimitiveKey(context2, options);
          if (key === void 0) {
            return;
          }
          bucket.primitiveCache.set(key, value);
        }
        resolvePrimitiveKey(context2, options) {
          if (options.cacheKeyResolver) {
            return options.cacheKeyResolver(context2);
          }
          return context2;
        }
        isObjectLike(value) {
          return value !== null && (typeof value === "object" || typeof value === "function");
        }
        getCacheStats() {
          return {
            astEntries: this.astCache.size,
            valueEntries: this.valueCache.size
          };
        }
      };
      function normalizeOptions(baseOptions, overrideOptions = {}) {
        const base = baseOptions && baseOptions[NORMALIZED_OPTIONS_FLAG] ? baseOptions : { ...EXPRESSION_PARSER_DEFAULTS, ...baseOptions || {} };
        const helpers = { ...base.helpers || {}, ...overrideOptions.helpers || {} };
        const allowedFunctions = /* @__PURE__ */ new Set([
          ...base.allowedFunctions || [],
          ...overrideOptions.allowedFunctions || []
        ]);
        const allowedGlobals = /* @__PURE__ */ new Set([
          ...base.allowedGlobals || DEFAULT_ALLOWED_GLOBALS,
          ...overrideOptions.allowedGlobals || []
        ]);
        const normalized = {
          ...EXPRESSION_PARSER_DEFAULTS,
          ...base,
          ...overrideOptions,
          helpers,
          allowedFunctions: Array.from(allowedFunctions),
          allowedGlobals: Array.from(allowedGlobals)
        };
        Object.defineProperty(normalized, NORMALIZED_OPTIONS_FLAG, {
          value: true,
          enumerable: false
        });
        return normalized;
      }
      var lang_mini_props = {
        each,
        is_array,
        is_dom_node,
        is_ctrl,
        clone,
        get_truth_map_from_arr,
        tm: get_truth_map_from_arr,
        get_arr_from_truth_map,
        arr_trim_undefined,
        get_map_from_arr,
        arr_like_to_arr,
        tof: tof2,
        atof,
        tf,
        load_type,
        is_defined: is_defined2,
        def: is_defined2,
        Grammar,
        stringify,
        functional_polymorphism,
        fp,
        mfp,
        arrayify,
        mapify,
        str_arr_mapify,
        get_a_sig,
        deep_sig,
        get_item_sig,
        set_vals,
        truth,
        trim_sig_brackets,
        ll_set,
        ll_get,
        iterate_ancestor_classes,
        is_arr_of_t,
        is_arr_of_arrs,
        is_arr_of_strs,
        input_processors,
        output_processors,
        call_multiple_callback_functions,
        call_multi,
        multi: call_multi,
        native_constructor_tof,
        Fns,
        sig_match,
        remove_sig_from_arr_shell,
        to_arr_strip_keys,
        arr_objs_to_arr_keys_values_table,
        set_arr_tree_value,
        get_arr_tree_value,
        deep_arr_iterate,
        prom,
        combinations,
        combos: combinations,
        Evented_Class,
        eventify,
        vectorify,
        v_add,
        v_subtract,
        v_multiply,
        v_divide,
        vector_magnitude,
        distance_between_points,
        get_typed_array,
        gta: get_typed_array,
        Publisher,
        field,
        prop,
        Data_Type,
        Functional_Data_Type,
        ExpressionParser,
        ExpressionParserError
      };
      var lang_mini = new Evented_Class();
      Object.assign(lang_mini, lang_mini_props);
      lang_mini.note = (str_name, str_state, obj_properties) => {
        obj_properties = obj_properties || {};
        obj_properties.name = str_name;
        obj_properties.state = str_state;
        lang_mini.raise("note", obj_properties);
      };
      module.exports = lang_mini;
      if (__require.main === module) {
        let test_evented_class2 = function(test_data2) {
          const res2 = create_empty_test_res();
          const evented_class = new Evented_Class();
          test_data2.forEach((test_event) => {
            const event_name = test_event.event_name;
            const event_data = test_event.event_data;
            const listener = (data) => {
              if (data === event_data) {
                res2.passed.push(event_name);
              } else {
                res2.failed.push(event_name);
              }
            };
            evented_class.on(event_name, listener);
            evented_class.raise_event(event_name, event_data);
          });
          return res2;
        };
        test_evented_class = test_evented_class2;
        const test_data = [
          {
            event_name: "foo",
            event_data: "hello"
          },
          {
            event_name: "bar",
            event_data: "world"
          },
          {
            event_name: "baz",
            event_data: true
          }
        ];
        const create_empty_test_res = () => ({
          passed: [],
          failed: []
        });
        const result = test_evented_class2(test_data);
        console.log("Passed:", result.passed);
        console.log("Failed:", result.failed);
      }
      var test_evented_class;
    }
  });

  // node_modules/lang-tools/node_modules/lang-mini/lib-lang-mini.js
  var require_lib_lang_mini = __commonJS({
    "node_modules/lang-tools/node_modules/lang-mini/lib-lang-mini.js"(exports, module) {
      var lang = require_lang_mini();
      var { each, tof: tof2 } = lang;
      var Type_Signifier = class _Type_Signifier {
        // Name
        constructor(spec = {}) {
          const name = spec.name;
          Object.defineProperty(this, "name", {
            get() {
              return name;
            }
          });
          const parent = spec.parent;
          Object.defineProperty(this, "parent", {
            get() {
              return parent;
            }
          });
          const map_reserved_property_names = {
            name: true,
            parent: true
          };
          const _ = {};
          each(spec, (value, name2) => {
            if (map_reserved_property_names[name2]) {
            } else {
              _[name2] = value;
            }
          });
        }
        extend(o_extension) {
          const o = {
            parent: this
          };
          Object.assign(o, o_extension);
          const res2 = new _Type_Signifier(o_extension);
          return res2;
        }
        //  Other options?
        //  Disambiguiation? Descriptive text?
        //    Or is naming them the main thing there?
        // Color representation
        //   And that is simple, does not go into internal representation.
      };
      var Type_Representation = class _Type_Representation {
        // Name
        //  Other options?
        //  Disambiguiation? Descriptive text?
        //    Or is naming them the main thing there?
        // Color representation
        //   And that is simple, does not go into internal representation.
        // This should be able to represent types and lang features not available to JS.
        //   Names may be optional? May be autogenerated and quite long?
        constructor(spec = {}) {
          const name = spec.name;
          Object.defineProperty(this, "name", {
            get() {
              return name;
            }
          });
          const parent = spec.parent;
          Object.defineProperty(this, "parent", {
            get() {
              return parent;
            }
          });
          const _ = {};
          const map_reserved_property_names = {
            "name": true
          };
          each(spec, (value, name2) => {
            if (map_reserved_property_names[name2]) {
            } else {
              _[name2] = value;
              Object.defineProperty(this, name2, {
                get() {
                  return _[name2];
                },
                enumerable: true
              });
            }
          });
        }
        extend(o_extension) {
          const o = {
            parent: this
          };
          Object.assign(o, o_extension);
          const res2 = new _Type_Representation(o_extension);
          return res2;
        }
      };
      var st_color = new Type_Signifier({ "name": "color" });
      var st_24bit_color = st_color.extend({ "bits": 24 });
      var st_24bit_rgb_color = st_24bit_color.extend({ "components": ["red byte", "green byte", "blue byte"] });
      var tr_string = new Type_Representation({ "name": "string" });
      var tr_binary = new Type_Representation({ "name": "binary" });
      var rt_bin_24bit_rgb_color = new Type_Representation({
        // A binary type representation.
        "signifier": st_24bit_rgb_color,
        "bytes": [
          [0, "red", "ui8"],
          [1, "green", "ui8"],
          [2, "blue", "ui8"]
        ]
      });
      var rt_hex_24bit_rgb_color = new Type_Representation({
        // Likely some kind of string template.
        //  Or a function?
        //  Best to keep this function free here.
        //  Or maybe make a few quite standard ones.
        "signifier": st_24bit_rgb_color,
        // Or could just have the sequence / template literal even.
        "bytes": [
          [0, "#", "char"],
          [1, "hex(red)", "string(2)"],
          [3, "hex(green)", "string(2)"],
          [5, "hex(blue)", "string(2)"]
        ]
      });
      var st_date = new Type_Signifier({ "name": "date", "components": ["day uint", "month uint", "year int"] });
      var rt_string_date_uk_ddmmyy = new Type_Representation({
        "signifier": st_date,
        "bytes": [
          [0, "#", "char"],
          [1, "day", "string(2)"],
          [3, "/", "char"],
          [4, "month", "string(2)"],
          [6, "/", "char"],
          [7, "year", "string(2)"]
        ]
      });
      lang.Type_Signifier = Type_Signifier;
      lang.Type_Representation = Type_Representation;
      module.exports = lang;
    }
  });

  // node_modules/lang-tools/collective.js
  var require_collective = __commonJS({
    "node_modules/lang-tools/collective.js"(exports, module) {
      var { each, is_array } = require_lib_lang_mini();
      var collective = (arr) => {
        if (is_array(arr)) {
          const target = {};
          const handler2 = {
            get(target2, prop, receiver) {
              if (arr.length > 0 && arr[0] && typeof arr[0][prop] === "function") {
                return (...a) => {
                  const res3 = [];
                  each(arr, (item2) => {
                    res3.push(item2[prop](...a));
                  });
                  return res3;
                };
              }
              if (prop in arr) {
                const val = arr[prop];
                if (typeof val === "function") return val.bind(arr);
                return val;
              }
              const res2 = [];
              each(arr, (item2) => {
                res2.push(item2[prop]);
              });
              return res2;
            }
          };
          const proxy2 = new Proxy(target, handler2);
          return proxy2;
        } else {
          console.trace();
          throw "NYI";
        }
      };
      module.exports = collective;
    }
  });

  // node_modules/lang-tools/Data_Model/Data_Model.js
  var require_Data_Model = __commonJS({
    "node_modules/lang-tools/Data_Model/Data_Model.js"(exports, module) {
      var { Evented_Class } = require_lib_lang_mini();
      var Data_Model = class extends Evented_Class {
        constructor(spec = {}) {
          super(spec);
          this.__data_model = true;
          if (spec && spec.context) {
            this.context = spec.context;
          }
          if (spec && spec.name) {
            this.name = spec.name;
          }
          this.__type = "data_model";
        }
      };
      module.exports = Data_Model;
    }
  });

  // node_modules/lang-tools/Data_Model/new/tools.js
  var require_tools = __commonJS({
    "node_modules/lang-tools/Data_Model/new/tools.js"(exports, module) {
      var Data_Model = require_Data_Model();
      var { tof: tof2 } = require_lib_lang_mini();
      var more_general_equals = (that2, other) => {
        const t_that = tof2(that2), t_other = tof2(other);
        if (t_that !== t_other) return false;
        if (t_that === "number" || t_that === "string" || t_that === "boolean" || t_that === "undefined" || t_that === "null") {
          return Object.is(that2, other);
        }
        if (t_that === "array") {
          if (!Array.isArray(other) || that2.length !== other.length) return false;
          for (let i = 0; i < that2.length; i++) {
            if (!more_general_equals(that2[i], other[i])) return false;
          }
          return true;
        }
        if (that2 instanceof Data_Model && other instanceof Data_Model) {
          if (typeof that2.toJSON === "function" && typeof other.toJSON === "function") {
            return that2.toJSON() === other.toJSON();
          }
          if (that2 === other) return true;
          return false;
        }
        if (t_that === "object" && "value" in that2) {
          return more_general_equals(that2.value, other);
        }
        if (t_that === "object") {
          const keysA = Object.keys(that2);
          const keysB = Object.keys(other);
          if (keysA.length !== keysB.length) return false;
          for (const k of keysA) {
            if (!Object.prototype.hasOwnProperty.call(other, k)) return false;
            if (!more_general_equals(that2[k], other[k])) return false;
          }
          return true;
        }
        return Object.is(that2, other);
      };
      module.exports = {
        more_general_equals
      };
    }
  });

  // node_modules/lang-tools/b-plus-tree/stiffarray.js
  var require_stiffarray = __commonJS({
    "node_modules/lang-tools/b-plus-tree/stiffarray.js"(exports, module) {
      var StiffArray = function(capacity) {
        var m_public = {
          items: new Array(capacity),
          // internal storage array
          count: 0,
          // items count
          first: function() {
            if (this.count == 0) throw "StiffArray.first()";
            return this.items[0];
          },
          last: function() {
            if (this.count == 0) throw "StiffArray.last()";
            return this.items[this.count - 1];
          },
          add: function(item2) {
            if (this.count >= capacity) throw "StiffArray.add()";
            this.items[this.count++] = item2;
          },
          add_from: function(source) {
            if (this.count + source.count > capacity) throw "StiffArray.add_from()";
            for (var i = 0; i < source.count; i++) this.items[this.count++] = source.items[i];
          },
          insert: function(index, item2) {
            if (index < 0 || index > this.count) throw "StiffArray.insert(): index";
            if (this.count >= capacity) throw "StiffArray.insert(): overflow";
            for (var i = this.count; i > index; i--) this.items[i] = this.items[i - 1];
            this.items[index] = item2;
            this.count++;
          },
          removeAt: function(index) {
            if (index < 0 || index >= this.count) throw "StiffArray.removeAt()";
            this.count--;
            for (var i = index; i < this.count; i++) this.items[i] = this.items[i + 1];
          },
          removeFirst: function() {
            this.removeAt(0);
          },
          removeLast: function() {
            this.removeAt(this.count - 1);
          },
          copy_from: function(source, index, count) {
            for (var i = 0; i < count; i++) {
              this.items[i] = source.items[i + index];
            }
            this.count = count;
          },
          search_first: function(item2) {
            var cnt = this.count;
            var first = 0;
            while (cnt > 0) {
              var step = Math.floor(cnt / 2);
              var index = first + step;
              if (this.items[index] < item2) {
                first = index + 1;
                cnt -= step + 1;
              } else {
                cnt = step;
              }
            }
            if (first < this.count) {
              return { found: this.items[first] == item2, index: first };
            }
            return { found: false, index: first };
          },
          search_last: function(item2) {
            var cnt = this.count;
            var first = 0;
            while (cnt > 0) {
              var step = Math.floor(cnt / 2);
              var index = first + step;
              if (item2 >= this.items[index]) {
                first = index + 1;
                cnt -= step + 1;
              } else {
                cnt = step;
              }
            }
            if (first > 0 && first <= this.count) {
              if (this.items[first - 1] == item2) {
                return { found: true, index: first - 1 };
              }
            }
            return { found: false, index: first };
          },
          search_last_prefix: function(prefix) {
            var prefix_length = prefix.length;
            var check_prefix = function(item3) {
              if (prefix_length > item3.length) return false;
              return item3.substr(0, prefix_length) == prefix;
            };
            var cnt = this.count;
            var first = 0;
            while (cnt > 0) {
              var step = Math.floor(cnt / 2);
              var index = first + step;
              var item2 = this.items[index];
              if (prefix > item2 || check_prefix(item2)) {
                first = index + 1;
                cnt -= step + 1;
              } else {
                cnt = step;
              }
            }
            if (first > 0 && first <= this.count) {
              if (check_prefix(this.items[first - 1])) {
                return { found: true, index: first - 1 };
              }
            }
            return { found: false, index: first };
          },
          toString: function() {
            return this.items.slice(0, this.count).toString();
          }
        };
        return m_public;
      };
      module.exports = StiffArray;
    }
  });

  // node_modules/lang-tools/b-plus-tree/b-plus-tree.js
  var require_b_plus_tree = __commonJS({
    "node_modules/lang-tools/b-plus-tree/b-plus-tree.js"(exports, module) {
      var StiffArray = require_stiffarray();
      var B_Plus_Node = function(nodeCapacity) {
        var m_public = {
          isLeaf: false,
          parent: null,
          keys: new StiffArray(nodeCapacity + 1),
          // +1: to allow temporary owerflow
          children: new StiffArray(nodeCapacity + 2)
          // +2: children.length == keys.length + 1
        };
        return m_public;
      };
      var B_Plus_Leaf = function(nodeCapacity) {
        var m_public = {
          isLeaf: true,
          parent: null,
          keys: new StiffArray(nodeCapacity + 1),
          values: new StiffArray(nodeCapacity + 1),
          //
          // leafs chain:
          prevLeaf: null,
          nextLeaf: null
        };
        return m_public;
      };
      var FindInfo = (key, value, isPrefixSearch) => {
        isPrefixSearch = !!isPrefixSearch;
        var isKeyPresent = key != void 0;
        var isValuePresent = value != void 0;
        var prefixLength = 0;
        if (isPrefixSearch) {
          if (typeof key != "string") {
            isPrefixSearch = false;
          } else {
            prefixLength = key.length;
          }
        }
        return {
          key,
          // key to find (if present)
          value,
          // value to find (if present)
          isPrefixSearch,
          // prefix search mode
          leaf: null,
          // found leaf
          index: -1,
          // found leaf item index
          isKeyPresent,
          // function () { return this.key !== undefined; }, // is the search criteria contains key
          isValuePresent,
          // function () { return this.value !== undefined; }, // is the search criteria contains value
          foundKey: function() {
            return this.leaf.keys.items[this.index];
          },
          // found items's key
          foundValue: function() {
            return this.leaf.values.items[this.index];
          },
          // found item's value
          //
          prefix_length: prefixLength,
          // prefix length
          check_prefix: function() {
            if (!isPrefixSearch) return false;
            if (this.index >= this.leaf.keys.count) return false;
            var keyToCheck = this.foundKey();
            if (this.prefix_length > keyToCheck.length) return false;
            return keyToCheck.substr(0, this.prefix_length) == this.key;
          }
        };
      };
      var B_Plus_Tree = function(nodeCapacity) {
        if (nodeCapacity === void 0) nodeCapacity = 10;
        if (nodeCapacity < 4) throw "B_Plus_Tree(): node capacity must be >= 4";
        var m_public = {
          // tree root:
          root: new B_Plus_Leaf(nodeCapacity),
          //
          // leafs chain:
          firstLeaf: null,
          //
          lastLeaf: null,
          //
          // ---------------------
          //     editing:
          // ---------------------
          //
          // clear the tree:
          clear: function() {
            p_Clear();
          },
          //
          // insert(key, value)
          // insert([key, value])
          insert: function(key, value) {
            if (arguments.length == 2) {
              return p_Insert(key, value);
            } else {
              return p_Insert(key[0], key[1]);
            }
          },
          //
          // remove(key) - remove all values with given key
          // remove(key, value) - remove one value occurrence
          remove: function(key, value) {
            if (arguments.length == 2) {
              return p_Remove(key, value);
            } else {
              p_RemoveKey(key);
            }
          },
          //
          // ---------------------
          //       finding:
          // ---------------------
          //
          // findFirst() - find the very first item
          // findFirst(key) - find the first item for the given key
          // findFirst(key, value) - find the first key+value occurrence
          //
          // returns the FindInfo object:
          //    key: key,     // key to find (if present)
          //    value: value, // value to find (if present)
          //
          //    leaf: null,   // the current found leaf
          //    index: -1,    // the current found index
          //
          //    foundKey():   // the current found key
          //    foundValue(): // the current found value
          //
          findFirst: function(key, value) {
            return p_FindFirst(key, value);
          },
          //
          // find first key matching the prefix:
          findFirstPrefix: function(prefix) {
            return p_FindFirst(prefix, void 0, true);
          },
          //
          // find next search conditions occurence
          findNext: function(findInfo) {
            return p_FindNext(findInfo);
          },
          //
          // findLast() - find the very last item
          // findLast(key) - find the last item for the given key
          // findLast(key, value) - find the last key+value occurrence
          findLast: function(key, value) {
            return p_FindLast(key, value);
          },
          //
          // find last key matching the prefix:
          findLastPrefix: function(prefix) {
            return p_FindLast(prefix, void 0, true);
          },
          //
          // find previous search conditions occurence
          findPrevious: function(findInfo) {
            return p_FindPrev(findInfo);
          },
          //
          // ---------------------
          // dictionary-like usage:
          // ---------------------
          //
          // get one value by key (or null):
          getValue: function(key) {
            return p_GetValue(key);
          },
          // set one value by key (insert or update):
          setValue: function(key, value) {
            p_SetValue(key, value);
          },
          //
          //
          // ---------------------
          //   other functions:
          // ---------------------
          //
          // count() - count all values
          // count(key) - count values with the given key
          count: function(key) {
            if (arguments.length == 1) {
              return p_CountKey(key);
            } else {
              return p_Count();
            }
          },
          //
          // tree capacity:
          getCapacity: function() {
            return m_nodeMaxCount;
          },
          //
          // ---------------------
          // additional functions:
          // ---------------------
          //
          // iterate through each key + value pair
          // callback is function(key, value)
          "each": function(callback) {
            return p_each(callback);
          },
          //
          // get all keys
          "keys": function() {
            return p_keys();
          },
          //
          // get all [key, value] pairs
          "keys_and_values": function() {
            return p_keys_and_values();
          },
          //
          //
          // get keys and values by prefix
          "get_by_prefix": function(prefix) {
            return p_get_by_prefix(prefix);
          },
          //
          // get keys by prefix
          "get_keys_by_prefix": function(prefix) {
            return p_get_keys_by_prefix(prefix);
          },
          //
          // get values at key...
          "get_values_by_key": function(key) {
            return p_get_values_by_key(key);
          }
        };
        m_public.firstLeaf = m_public.root;
        m_public.lastLeaf = m_public.root;
        var m_nodeMaxCount = nodeCapacity;
        var m_nodeMinCount = Math.floor(m_nodeMaxCount / 2);
        var p_Clear = function() {
          m_public.root = new B_Plus_Leaf(m_nodeMaxCount);
          m_public.firstLeaf = m_public.root;
          m_public.lastLeaf = m_public.root;
        };
        var p_keys = function() {
          var res2 = [];
          _p_each_key(function(key) {
            res2.push(key);
          });
          return res2;
        };
        var p_keys_and_values = function() {
          var res2 = [];
          p_each(function(key, value) {
            res2.push([key, value]);
          });
          return res2;
        };
        var _p_each_key = function(callback) {
          var findInfo = p_FindFirst();
          while (findInfo != null) {
            var fk = findInfo.foundKey();
            callback(fk);
            findInfo = p_FindNext(findInfo);
          }
        };
        var p_each = function(callback) {
          var findInfo = p_FindFirst();
          var doStop = false;
          while (findInfo != null) {
            var fk = findInfo.foundKey();
            var fv = findInfo.foundValue();
            callback(fk, fv, function() {
              doStop = true;
            });
            if (doStop) {
              findInfo = null;
            } else {
              findInfo = p_FindNext(findInfo);
            }
          }
        };
        var p_Insert = function(key, value) {
          var searchResult = searchLeaf(key);
          var leaf = searchResult.node;
          leaf.keys.insert(searchResult.index, key);
          leaf.values.insert(searchResult.index, value);
          if (leaf.keys.count > m_nodeMaxCount) {
            if (leaf.prevLeaf != null && leaf.prevLeaf.keys.count < m_nodeMaxCount && leaf.prevLeaf.parent == leaf.parent) {
              rotateAmongLeavesToLeft(leaf.prevLeaf, leaf);
            } else if (leaf.nextLeaf != null && leaf.nextLeaf.keys.count < m_nodeMaxCount && leaf.nextLeaf.parent == leaf.parent) {
              rotateAmongLeavesToRight(leaf, leaf.nextLeaf);
            } else {
              splitLeaf(leaf);
            }
          }
        };
        var splitLeaf = function(leaf) {
          var leftCount = m_nodeMinCount;
          var rightCount = leaf.keys.count - leftCount;
          var newRightLeaf = new B_Plus_Leaf(m_nodeMaxCount);
          newRightLeaf.parent = leaf.parent;
          newRightLeaf.keys.copy_from(leaf.keys, leftCount, rightCount);
          newRightLeaf.values.copy_from(leaf.values, leftCount, rightCount);
          leaf.keys.count = leftCount;
          leaf.values.count = leftCount;
          newRightLeaf.nextLeaf = leaf.nextLeaf;
          if (newRightLeaf.nextLeaf != null) newRightLeaf.nextLeaf.prevLeaf = newRightLeaf;
          newRightLeaf.prevLeaf = leaf;
          leaf.nextLeaf = newRightLeaf;
          if (m_public.lastLeaf == leaf) m_public.lastLeaf = newRightLeaf;
          if (leaf.parent != null) {
            var leafIndex = calcChildIndex(leaf.parent, leaf);
            insertToParent(leaf.parent, newRightLeaf, newRightLeaf.keys.first(), leafIndex + 1);
          } else {
            createNewRoot(leaf, newRightLeaf, newRightLeaf.keys.first());
          }
        };
        var createNewRoot = function(nodeLeft, nodeRight, key) {
          var newRoot = new B_Plus_Node(m_nodeMaxCount);
          newRoot.keys.add(key);
          newRoot.children.add(nodeLeft);
          newRoot.children.add(nodeRight);
          nodeLeft.parent = newRoot;
          nodeRight.parent = newRoot;
          m_public.root = newRoot;
        };
        var insertToParent = function(parentNode, newChildNode, newChildFirstKey, newChildIndex) {
          parentNode.keys.insert(newChildIndex - 1, newChildFirstKey);
          parentNode.children.insert(newChildIndex, newChildNode);
          newChildNode.parent = parentNode;
          if (parentNode.keys.count > m_nodeMaxCount) {
            splitNode(parentNode);
          }
        };
        var splitNode = function(node) {
          var newLeftCount = m_nodeMinCount;
          var newRightCount = m_nodeMaxCount - newLeftCount;
          var middleKey = node.keys.items[newLeftCount];
          var newRightNode = new B_Plus_Node(m_nodeMaxCount);
          newRightNode.keys.copy_from(node.keys, newLeftCount + 1, newRightCount);
          newRightNode.children.copy_from(node.children, newLeftCount + 1, newRightCount + 1);
          node.keys.count = newLeftCount;
          node.children.count = newLeftCount + 1;
          for (var i = 0; i < newRightNode.children.count; i++) newRightNode.children.items[i].parent = newRightNode;
          if (node.parent == null) {
            createNewRoot(node, newRightNode, middleKey);
          } else {
            var nodeIndex = calcChildIndex(node.parent, node);
            insertToParent(node.parent, newRightNode, middleKey, nodeIndex + 1);
          }
        };
        var p_Remove = function(key, value) {
          var searchResult = searchLeafValue(key, value);
          if (!searchResult.found) return false;
          removeFromLeaf(searchResult.node, searchResult.index);
          return true;
        };
        var p_RemoveKey = function(key) {
          while (true) {
            var searchResult = searchLeaf(key);
            if (!searchResult.found) break;
            removeFromLeaf(searchResult.node, searchResult.index);
          }
        };
        var removeFromLeaf = function(leaf, index) {
          leaf.keys.removeAt(index);
          leaf.values.removeAt(index);
          if (leaf.keys.count < m_nodeMinCount) {
            if (leaf.prevLeaf != null && leaf.parent == leaf.prevLeaf.parent && leaf.prevLeaf.keys.count > m_nodeMinCount) {
              rotateAmongLeavesToRight(leaf.prevLeaf, leaf);
            } else if (leaf.nextLeaf != null && leaf.parent == leaf.nextLeaf.parent && leaf.nextLeaf.keys.count > m_nodeMinCount) {
              rotateAmongLeavesToLeft(leaf, leaf.nextLeaf);
            } else {
              mergeLeaf(leaf);
            }
          }
          return true;
        };
        var mergeLeaf = function(leaf) {
          if (leaf.parent == null) {
            return;
          }
          var leftCount = m_nodeMaxCount + 1;
          var rightCount = m_nodeMaxCount + 1;
          if (leaf.prevLeaf != null && leaf.prevLeaf.parent == leaf.parent) {
            leftCount = leaf.prevLeaf.keys.count;
          }
          if (leaf.nextLeaf != null && leaf.nextLeaf.parent == leaf.parent) {
            rightCount = leaf.nextLeaf.keys.count;
          }
          if (leftCount < rightCount) {
            if (leftCount + leaf.keys.count > m_nodeMaxCount) throw "B_Plus_Tree.mergeLeaf(): leftCount";
            mergeLeaves(leaf.prevLeaf, leaf);
          } else {
            if (rightCount + leaf.keys.count > m_nodeMaxCount) throw "B_Plus_Tree.mergeLeaf(): rightCount";
            mergeLeaves(leaf, leaf.nextLeaf);
          }
        };
        var mergeLeaves = function(leafLeft, leafRight) {
          leafLeft.keys.add_from(leafRight.keys);
          leafLeft.values.add_from(leafRight.values);
          leafLeft.nextLeaf = leafRight.nextLeaf;
          if (leafLeft.nextLeaf != null) leafLeft.nextLeaf.prevLeaf = leafLeft;
          if (m_public.lastLeaf == leafRight) m_public.lastLeaf = leafLeft;
          var parent = leafRight.parent;
          var leafRightIndex = calcChildIndex(parent, leafRight);
          parent.keys.removeAt(leafRightIndex - 1);
          parent.children.removeAt(leafRightIndex);
          if (parent.keys.count < m_nodeMinCount) {
            mergeNode(parent);
          }
          ;
        };
        var mergeNode = function(node) {
          var parent = node.parent;
          if (node.parent == null) {
            if (node.keys.count == 0) {
              m_public.root = node.children.items[0];
              m_public.root.parent = null;
            }
            return;
          }
          var nodeIndex = calcChildIndex(parent, node);
          var leftSibling = nodeIndex > 0 ? parent.children.items[nodeIndex - 1] : null;
          var rightSibling = nodeIndex + 1 < parent.children.count ? parent.children.items[nodeIndex + 1] : null;
          if (leftSibling != null && leftSibling.keys.count > m_nodeMinCount) {
            rotateAmongNodesToRight(leftSibling, node);
            return;
          }
          if (rightSibling != null && rightSibling.keys.count > m_nodeMinCount) {
            rotateAmongNodesToLeft(node, rightSibling);
            return;
          }
          var leftCount = m_nodeMaxCount + 1;
          var rightCount = m_nodeMaxCount + 1;
          if (leftSibling != null) {
            leftCount = leftSibling.keys.count;
          }
          if (rightSibling != null) {
            rightCount = rightSibling.keys.count;
          }
          if (leftCount < rightCount) {
            if (leftSibling == null) throw "B_Plus_Tree.mergeNode(): leftSibling";
            mergeNodes(leftSibling, node, nodeIndex);
          } else {
            if (rightSibling == null) throw "B_Plus_Tree.mergeNode(): rightSibling";
            mergeNodes(node, rightSibling, nodeIndex + 1);
          }
        };
        var mergeNodes = function(nodeLeft, nodeRight, nodeRightIndex) {
          var parent = nodeLeft.parent;
          for (var i = 0; i < nodeRight.children.count; i++) nodeRight.children.items[i].parent = nodeLeft;
          nodeLeft.keys.add(nodeLeft.parent.keys.items[nodeRightIndex - 1]);
          nodeLeft.keys.add_from(nodeRight.keys);
          nodeLeft.children.add_from(nodeRight.children);
          parent.keys.removeAt(nodeRightIndex - 1);
          parent.children.removeAt(nodeRightIndex);
          if (parent.keys.count < m_nodeMinCount) {
            mergeNode(parent);
          }
          ;
        };
        var p_FindFirst = function(key, value, isPrefixSearch) {
          var findInfo = FindInfo(key, value, isPrefixSearch);
          if (findInfo.isKeyPresent) {
            if (findInfo.isPrefixSearch && findInfo.isValuePresent) throw "B_Plus_Tree.p_FindFirst(): arguments error: isPrefixSearch, but value is present";
            var searchResult = findInfo.isValuePresent ? searchLeafValue(key, value) : searchLeaf(key);
            findInfo.leaf = searchResult.node;
            findInfo.index = searchResult.index;
            if (!searchResult.found) {
              if (!findInfo.check_prefix()) {
                return null;
              }
            }
          } else {
            if (findInfo.isValuePresent) throw "B_Plus_Tree.findFirst(): arguments error: key is not present, but value is present";
            findInfo.leaf = m_public.firstLeaf;
            findInfo.index = 0;
            if (findInfo.leaf.keys.count <= 0) return null;
          }
          return findInfo;
        };
        var p_FindLast = function(key, value, isPrefixSearch) {
          var findInfo = new FindInfo(key, value, isPrefixSearch);
          if (findInfo.isKeyPresent) {
            if (findInfo.isPrefixSearch && findInfo.isValuePresent) throw "B_Plus_Tree.p_FindLast(): arguments error: isPrefixSearch, but value is present";
            if (findInfo.isPrefixSearch) {
              var searchResult = searchLastLeafByPrefix(key);
              findInfo.leaf = searchResult.node;
              findInfo.index = searchResult.index;
              if (!searchResult.found) {
                return null;
              }
            } else {
              var searchResult = findInfo.isValuePresent ? searchLastLeafValue(key, value) : searchLastLeaf(key);
              findInfo.leaf = searchResult.node;
              findInfo.index = searchResult.index;
              if (!searchResult.found) {
                return null;
              }
            }
          } else {
            if (findInfo.isValuePresent) throw "B_Plus_Tree.findLast(): arguments error: key is not present, but value is present";
            findInfo.leaf = m_public.lastLeaf;
            findInfo.index = findInfo.leaf.keys.count - 1;
            if (findInfo.index < 0) return null;
          }
          return findInfo;
        };
        var findGoToNext = function(findInfo) {
          findInfo.index++;
          if (findInfo.index >= findInfo.leaf.keys.count) {
            findInfo.leaf = findInfo.leaf.nextLeaf;
            findInfo.index = 0;
          }
          return findInfo.leaf != null;
        };
        var findGoToPrev = function(findInfo) {
          findInfo.index--;
          if (findInfo.index < 0) {
            findInfo.leaf = findInfo.leaf.prevLeaf;
            if (findInfo.leaf == null) return false;
            findInfo.index = findInfo.leaf.keys.count - 1;
          }
          return true;
        };
        var p_FindNext = function(findInfo) {
          while (true) {
            if (!findGoToNext(findInfo)) return null;
            if (findInfo.isPrefixSearch) {
              if (!findInfo.check_prefix()) return null;
            } else {
              if (findInfo.isKeyPresent && findInfo.key != findInfo.foundKey()) return null;
            }
            if (findInfo.isValuePresent) {
              if (findInfo.value == findInfo.foundValue()) return findInfo;
            } else {
              return findInfo;
            }
          }
        };
        var p_FindPrev = function(findInfo) {
          while (true) {
            if (!findGoToPrev(findInfo)) return null;
            if (findInfo.isPrefixSearch) {
              if (!findInfo.check_prefix()) return null;
            } else {
              if (findInfo.isKeyPresent && findInfo.key != findInfo.foundKey()) return null;
            }
            if (findInfo.isValuePresent) {
              if (findInfo.value == findInfo.foundValue()) return findInfo;
            } else {
              return findInfo;
            }
          }
        };
        var p_get_values_by_key = function(key) {
          var res2 = [];
          var findInfo = p_FindFirst(key);
          while (findInfo != null) {
            res2.push(findInfo.foundValue());
            findInfo = p_FindNext(findInfo);
          }
          return res2;
        };
        var p_get_by_prefix = function(prefix) {
          var res2 = [];
          var findInfo = m_public.findFirstPrefix(prefix);
          while (findInfo != null) {
            res2.push([findInfo.foundKey(), findInfo.foundValue()]);
            findInfo = m_public.findNext(findInfo);
          }
          return res2;
        };
        var p_get_keys_by_prefix = function(prefix) {
          var res2 = [];
          var findInfo = m_public.findFirstPrefix(prefix);
          while (findInfo != null) {
            res2.push(findInfo.foundKey());
            findInfo = m_public.findNext(findInfo);
          }
          return res2;
        };
        var p_GetValue = function(key) {
          var searchResult = searchLeaf(key);
          if (!searchResult.found) return null;
          return searchResult.node.values.items[searchResult.index];
        };
        var p_SetValue = function(key, value) {
          var searchResult = searchLeaf(key);
          if (searchResult.found) {
            removeFromLeaf(searchResult.node, searchResult.index);
          }
          p_Insert(key, value);
        };
        var p_Count = function() {
          var result = 0;
          var leaf = m_public.firstLeaf;
          while (leaf != null) {
            result += leaf.keys.count;
            leaf = leaf.nextLeaf;
          }
          return result;
        };
        var p_CountKey = function(key) {
          var result = 0;
          var findInfo = m_public.findFirst(key);
          while (findInfo != null) {
            result++;
            findInfo = m_public.findNext(findInfo);
          }
          return result;
        };
        var rotateAmongNodesToLeft = function(leftNode, rightNode) {
          var parent = rightNode.parent;
          var rightIndex = calcChildIndex(parent, rightNode);
          leftNode.keys.add(parent.keys.items[rightIndex - 1]);
          parent.keys.items[rightIndex - 1] = rightNode.keys.first();
          rightNode.keys.removeFirst();
          rightNode.children.first().parent = leftNode;
          leftNode.children.add(rightNode.children.first());
          rightNode.children.removeFirst();
        };
        var rotateAmongNodesToRight = function(leftNode, rightNode) {
          var parent = rightNode.parent;
          var rightIndex = calcChildIndex(parent, rightNode);
          rightNode.keys.insert(0, parent.keys.items[rightIndex - 1]);
          parent.keys.items[rightIndex - 1] = leftNode.keys.last();
          leftNode.keys.removeLast();
          rightNode.children.insert(0, leftNode.children.last());
          rightNode.children.first().parent = rightNode;
          leftNode.children.removeLast();
        };
        var rotateAmongLeavesToLeft = function(leftLeaf, rightLeaf) {
          var rightIndex = calcChildIndex(rightLeaf.parent, rightLeaf);
          leftLeaf.keys.add(rightLeaf.keys.first());
          leftLeaf.values.add(rightLeaf.values.first());
          rightLeaf.keys.removeFirst();
          rightLeaf.values.removeFirst();
          rightLeaf.parent.keys.items[rightIndex - 1] = rightLeaf.keys.first();
        };
        var rotateAmongLeavesToRight = function(leftLeaf, rightLeaf) {
          var rightIndex = calcChildIndex(rightLeaf.parent, rightLeaf);
          rightLeaf.keys.insert(0, leftLeaf.keys.last());
          rightLeaf.values.insert(0, leftLeaf.values.last());
          leftLeaf.keys.removeLast();
          leftLeaf.values.removeLast();
          rightLeaf.parent.keys.items[rightIndex - 1] = rightLeaf.keys.first();
        };
        var calcChildIndex = function(node, child) {
          var key = child.keys.first();
          var searchResult = node.keys.search_first(key);
          if (!searchResult.found) {
            if (node.children.items[searchResult.index] != child) throw "B_PlusTree.calcChildIndex(): 1";
            return searchResult.index;
          }
          var index = searchResult.index;
          for (; ; ) {
            if (node.children.items[index] == child) return index;
            index++;
            if (index >= node.children.count) break;
            if (node.keys.items[index - 1] != key) break;
          }
          throw "B_PlusTree.calcChildIndex(): 2";
        };
        var searchLeaf = function(key) {
          var doSearchLeaf = function(node, key2) {
            var searchResult = node.keys.search_first(key2);
            if (node.isLeaf) {
              return { node, found: searchResult.found, index: searchResult.index };
            }
            if (searchResult.found) {
              var resultLeft = doSearchLeaf(node.children.items[searchResult.index], key2);
              if (resultLeft.found) return resultLeft;
              return doSearchLeaf(node.children.items[searchResult.index + 1], key2);
            } else {
              return doSearchLeaf(node.children.items[searchResult.index], key2);
            }
          };
          return doSearchLeaf(m_public.root, key);
        };
        var searchLastLeaf = function(key) {
          var doSearchLastLeaf = function(node, key2) {
            var searchResult = node.keys.search_last(key2);
            if (node.isLeaf) {
              return { node, found: searchResult.found, index: searchResult.index };
            }
            if (searchResult.found) {
              var resultRight = doSearchLastLeaf(node.children.items[searchResult.index + 1], key2);
              if (resultRight.found) return resultRight;
              return doSearchLastLeaf(node.children.items[searchResult.index], key2);
            } else {
              return doSearchLastLeaf(node.children.items[searchResult.index], key2);
            }
          };
          return doSearchLastLeaf(m_public.root, key);
        };
        var searchLastLeafByPrefix = function(prefix) {
          var doSearchLastLeafByPrefix = function(node, prefix2) {
            var searchResult = node.keys.search_last_prefix(prefix2);
            if (node.isLeaf) {
              return { node, found: searchResult.found, index: searchResult.index };
            }
            if (searchResult.found) {
              var resultRight = doSearchLastLeafByPrefix(node.children.items[searchResult.index + 1], prefix2);
              if (resultRight.found) return resultRight;
              return doSearchLastLeafByPrefix(node.children.items[searchResult.index], prefix2);
            } else {
              return doSearchLastLeafByPrefix(node.children.items[searchResult.index], prefix2);
            }
          };
          return doSearchLastLeafByPrefix(m_public.root, prefix);
        };
        var searchLeafValue = function(key, value) {
          var searchResult = searchLeaf(key);
          if (!searchResult.found) return searchResult;
          var valueFound = false;
          var leaf = searchResult.node;
          var index = searchResult.index;
          for (; ; ) {
            if (index >= leaf.values.count) {
              leaf = leaf.nextLeaf;
              if (leaf == null) break;
              index = 0;
            }
            if (leaf.keys.items[index] != key) break;
            if (leaf.values.items[index] == value) {
              valueFound = true;
              break;
            }
            index++;
          }
          return { node: leaf, found: valueFound, index };
        };
        var searchLastLeafValue = function(key, value) {
          var searchResult = searchLastLeaf(key);
          if (!searchResult.found) return searchResult;
          var valueFound = false;
          var leaf = searchResult.node;
          var index = searchResult.index;
          for (; ; ) {
            if (index < 0) {
              leaf = leaf.prevLeaf;
              if (leaf == null) break;
              index = leaf.values.count - 1;
            }
            if (leaf.keys.items[index] != key) break;
            if (leaf.values.items[index] == value) {
              valueFound = true;
              break;
            }
            index--;
          }
          return { node: leaf, found: valueFound, index };
        };
        return m_public;
      };
      B_Plus_Tree.FindInfo = FindInfo;
      module.exports = B_Plus_Tree;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Immutable_Data_Model.js
  var require_Immutable_Data_Model = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Immutable_Data_Model.js"(exports, module) {
      var Data_Model = require_Data_Model();
      var Immutable_Data_Model = class extends Data_Model {
        constructor(...a) {
          super(...a);
        }
      };
      module.exports = Immutable_Data_Model;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Validation_Result.js
  var require_Validation_Result = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Validation_Result.js"(exports, module) {
      var Validation_Result = class {
      };
      module.exports = Validation_Result;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Validation_Success.js
  var require_Validation_Success = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Validation_Success.js"(exports, module) {
      var Validation_Result = require_Validation_Result();
      var Validation_Success = class extends Validation_Result {
        constructor(spec) {
          super(spec);
        }
      };
      module.exports = Validation_Success;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Validation_Failure.js
  var require_Validation_Failure = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Validation_Failure.js"(exports, module) {
      var Validation_Result = require_Validation_Result();
      var Validation_Failure = class extends Validation_Result {
        constructor(spec) {
          super(spec);
        }
      };
      module.exports = Validation_Failure;
    }
  });

  // node_modules/lang-tools/Data_Model/new/setup_base_data_value_value_property.js
  var require_setup_base_data_value_value_property = __commonJS({
    "node_modules/lang-tools/Data_Model/new/setup_base_data_value_value_property.js"(exports, module) {
      var Validation_Success = require_Validation_Success();
      var Validation_Failure = require_Validation_Failure();
      var setup_base_data_value_value_property = (data_value) => {
        let local_js_value;
        const set_value_with_valid_and_changed_value = (valid_and_changed_value) => {
          const old = local_js_value;
          local_js_value = valid_and_changed_value;
          data_value.raise("change", {
            name: "value",
            old,
            value: local_js_value
          });
        };
        const create_validation_error = (validation, value) => {
          const failure = validation instanceof Validation_Failure ? validation : new Validation_Failure({ value });
          const error = new Error("Validation failed for value assignment");
          error.validation = failure;
          error.value = value;
          return error;
        };
        Object.defineProperty(data_value, "value", {
          configurable: true,
          get() {
            return local_js_value;
          },
          set(value) {
            if (data_value.transform_validate_value) {
              const obj_transform_and_validate_value_results = data_value.transform_validate_value(value);
              const validation = obj_transform_and_validate_value_results && obj_transform_and_validate_value_results.validation;
              if (!(validation instanceof Validation_Success)) {
                throw create_validation_error(validation, value);
              }
              const next_value = Object.prototype.hasOwnProperty.call(obj_transform_and_validate_value_results, "transformed_value") ? obj_transform_and_validate_value_results.transformed_value : obj_transform_and_validate_value_results.value;
              if (!Object.is(local_js_value, next_value)) {
                set_value_with_valid_and_changed_value(next_value);
              }
            } else {
              if (!Object.is(local_js_value, value)) {
                set_value_with_valid_and_changed_value(value);
              }
            }
          }
        });
      };
      module.exports = setup_base_data_value_value_property;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Base_Data_Value.js
  var require_Base_Data_Value = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Base_Data_Value.js"(exports, module) {
      var jsgui = require_lib_lang_mini();
      var { more_general_equals } = require_tools();
      var Data_Model = require_Data_Model();
      var Immutable_Data_Model = require_Immutable_Data_Model();
      var { is_defined: is_defined2, input_processors, field, tof: tof2, each } = jsgui;
      var setup_base_data_value_value_property = require_setup_base_data_value_value_property();
      var util;
      if (typeof window === "undefined") {
        const str_utl = "util";
        util = __require(str_utl);
      }
      var Base_Data_Value = class extends Data_Model {
        constructor(spec = {}) {
          super(spec);
          this.__data_value = true;
          if (spec.data_type) this.data_type = spec.data_type;
          if (spec.context) {
            this.context = spec.context;
          }
          this.__type = "data_value";
          this._relationships = {};
          const { data_type, context: context2 } = this;
          setup_base_data_value_value_property(this);
        }
        equals(other) {
          return more_general_equals(this, other);
        }
        // Maybe see about immutable mode Data_Values / Data_Models.
        //   Or do make the immutable versions of all of them!!!
        //     And could make core functionality for both the immutable and mutable versions.
        //       Mutability Independent Code.
        // Immutable_Data_Integer does seem like it would in principle be (really?) simple.
        /*
            toImmutable() {
                // May be slightly difficult / tricky / complex.
                const {context, data_type, value} = this;
        
                // Create the new item...
                // Needs to copy the inner value....?
        
                const res = new Immutable_Data_Value({
                    context, data_type, value
                });
                return res;
            }
            */
        "get"() {
          return this.value;
        }
        "toString"() {
          return this.get() + "";
        }
        // Maybe a particular stringify function?
        "toJSON"() {
          return JSON.stringify(this.get());
        }
        // Need to copy / clone the ._ value
        /*
            'clone'() {
        
                //return this.toImmutable();
            }
            */
        // This is important to the running of jsgui3.
        //   Move to the lower level of Data_Model?
        "_id"() {
          if (this.__id) return this.__id;
          if (this.context) {
            this.__id = this.context.new_id(this.__type_name || this.__type);
            return this.__id;
          }
          return void 0;
        }
      };
      module.exports = Base_Data_Value;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Value_Set_Attempt.js
  var require_Value_Set_Attempt = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Value_Set_Attempt.js"(exports, module) {
      var Value_Set_Attempt = class {
        constructor(spec = {}) {
          Object.assign(this, spec);
        }
      };
      module.exports = Value_Set_Attempt;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Immutable_Base_Data_Value.js
  var require_Immutable_Base_Data_Value = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Immutable_Base_Data_Value.js"(exports, module) {
      var jsgui = require_lib_lang_mini();
      var { more_general_equals } = require_tools();
      var Data_Model = require_Data_Model();
      var Immutable_Data_Model = require_Immutable_Data_Model();
      var { is_defined: is_defined2, input_processors, field, tof: tof2, each } = jsgui;
      var util;
      if (typeof window === "undefined") {
        const str_utl = "util";
        util = __require(str_utl);
      }
      var Immutable_Base_Data_Value = class extends Immutable_Data_Model {
        constructor(spec = {}) {
          super(spec);
          this.__data_value = true;
          if (spec.data_type) this.data_type = spec.data_type;
          if (spec.context) {
            this.context = spec.context;
          }
          this.__type = "data_value";
          this._relationships = {};
          const { data_type, context: context2 } = this;
        }
        equals(other) {
          return more_general_equals(this, other);
        }
        // Maybe see about immutable mode Data_Values / Data_Models.
        //   Or do make the immutable versions of all of them!!!
        //     And could make core functionality for both the immutable and mutable versions.
        //       Mutability Independent Code.
        // Immutable_Data_Integer does seem like it would in principle be (really?) simple.
        /*
            toImmutable() {
                // May be slightly difficult / tricky / complex.
                const {context, data_type, value} = this;
        
                // Create the new item...
                // Needs to copy the inner value....?
        
                const res = new Immutable_Data_Value({
                    context, data_type, value
                });
                return res;
            }
            */
        "get"() {
          return this.value;
        }
        "toString"() {
          return this.get() + "";
        }
        // Maybe a particular stringify function?
        "toJSON"() {
          return JSON.stringify(this.get());
        }
        // Need to copy / clone the ._ value
        /*
            'clone'() {
        
                //return this.toImmutable();
            }
            */
        // This is important to the running of jsgui3.
        //   Move to the lower level of Data_Model?
        "_id"() {
          if (this.__id) return this.__id;
          if (this.context) {
            this.__id = this.context.new_id(this.__type_name || this.__type);
          } else {
            if (!is_defined2(this.__id)) {
              throw "Immutable_Base_Data_Value should have context";
              this.__id = new_data_value_id();
            }
          }
          return this.__id;
        }
      };
      module.exports = Immutable_Base_Data_Value;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Immutable_Data_Value.js
  var require_Immutable_Data_Value = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Immutable_Data_Value.js"(exports, module) {
      var jsgui = require_lib_lang_mini();
      var { more_general_equals } = require_tools();
      var Data_Model = require_Data_Model();
      var Immutable_Data_Model = require_Immutable_Data_Model();
      var Immutable_Base_Data_Value = require_Immutable_Base_Data_Value();
      var throw_immutable_assignment = () => {
        throw new TypeError("Cannot modify immutable Data_Value");
      };
      var { is_defined: is_defined2, input_processors, field, tof: tof2, each } = jsgui;
      var util;
      if (typeof window === "undefined") {
        const str_utl = "util";
        util = __require(str_utl);
      }
      var ldarkPurple = (x) => `\x1B[38;5;54m${x}\x1B[0m`;
      var Immutable_Data_Value = class _Immutable_Data_Value extends Immutable_Base_Data_Value {
        constructor(spec = {}) {
          super(spec);
          this.__data_value = true;
          this.__immutable = true;
          this.__type_name = "data_value";
          if (spec.data_type) this.data_type = spec.data_type;
          if (spec.context) {
            this.context = spec.context;
          }
          const { data_type, context: context2 } = this;
          if (data_type) {
            const to_local_js_value = (value) => {
              if (value !== void 0) {
                const t = tof2(value);
                if (t === "number" || t === "string" || t === "boolean") {
                  return value;
                } else {
                  if (t === "array") {
                    const l = value.length;
                    const res2 = new Array(l);
                    for (let c2 = 0; c2 < l; c2++) {
                      res2[c2] = to_local_js_value(value[c2]);
                    }
                    return res2;
                  } else if (t === "data_value") {
                    return value.toImmutable();
                  } else {
                    console.log("to_local_js_value value", value);
                    console.log("t", t);
                    console.trace();
                    throw "NYI";
                  }
                }
              }
            };
            const local_js_value = to_local_js_value(spec.value);
            Object.defineProperty(this, "value", {
              get() {
                return local_js_value;
              },
              set: throw_immutable_assignment
            });
          } else {
            let value;
            if (spec.value instanceof Array) {
              value = spec.value.map((x) => {
                if (x instanceof Data_Model) {
                  return x.toImmutable();
                } else {
                  return x;
                }
              });
            } else {
              value = spec.value;
            }
            Object.defineProperty(this, "value", {
              get() {
                return value;
              },
              set: throw_immutable_assignment
            });
          }
          this.__type = "data_value";
          this._relationships = {};
        }
        equals(other) {
          return more_general_equals(this, other);
        }
        toImmutable() {
          const { context: context2, data_type, value } = this;
          const res2 = new _Immutable_Data_Value({
            context: context2,
            data_type,
            value
          });
          return res2;
        }
        "get"() {
          return this.value;
        }
        "toString"() {
          return this.get() + "";
        }
        // Maybe a particular stringify function?
        "toJSON"() {
          const t_value = tof2(this.value);
          if (t_value === "string") {
            return JSON.stringify(this.value);
          } else if (t_value === "number") {
            return this.value + "";
          } else if (t_value === "boolean") {
            this.value ? "true" : "false";
          } else if (t_value === "array") {
            let res2 = "[";
            const l = this.value.length;
            for (let c2 = 0; c2 < l; c2++) {
              const item2 = this.value[c2];
              if (c2 > 0) res2 += ",";
              if (item2.toJSON) {
                res2 += item2.toJSON();
              } else {
                res2 += JSON.stringify(item2);
              }
            }
            res2 = res2 + "]";
            return res2;
          } else if (t_value === "data_value") {
            return this.value.toJSON();
          } else if (t_value === "undefined") {
            return "null";
          } else if (t_value === "null") {
            return "null";
          } else {
            console.log("toJSON this.value", this.value);
            console.log("t_value", t_value);
            console.trace();
            throw "NYI";
          }
        }
        // Need to copy / clone the ._ value
        "clone"() {
          return this.toImmutable();
        }
        // This is important to the running of jsgui3.
        //   Move to the lower level of Data_Model?
        "_id"() {
          if (this.__id) return this.__id;
          if (this.context) {
            this.__id = this.context.new_id(this.__type_name || this.__type);
          } else {
            if (!is_defined2(this.__id)) {
              throw "Data_Value should have context";
              this.__id = new_data_value_id();
            }
          }
          return this.__id;
        }
        "toObject"() {
          return this._;
        }
      };
      if (util) {
        Immutable_Data_Value.prototype[util.inspect.custom] = function(depth, opts) {
          const { value } = this;
          if (value instanceof Array) {
            let res2 = ldarkPurple("[ ");
            let first = true;
            each(value, (item2) => {
              if (!first) {
                res2 = res2 + ldarkPurple(", ");
              } else {
                first = false;
              }
              if (item2 instanceof Data_Model) {
                const item_value = item2.value;
                res2 = res2 + ldarkPurple(item_value);
              } else [
                res2 = res2 + ldarkPurple(item2)
              ];
            });
            res2 = res2 + ldarkPurple(" ]");
            return res2;
          } else {
            return ldarkPurple(this.value);
          }
        };
      }
      module.exports = Immutable_Data_Value;
    }
  });

  // node_modules/lang-tools/Data_Model/new/setup_data_value_data_type_set.js
  var require_setup_data_value_data_type_set = __commonJS({
    "node_modules/lang-tools/Data_Model/new/setup_data_value_data_type_set.js"(exports, module) {
      var jsgui = require_lib_lang_mini();
      var { more_general_equals } = require_tools();
      var Base_Data_Value = require_Base_Data_Value();
      var Data_Model = require_Data_Model();
      var Immutable_Data_Model = require_Immutable_Data_Model();
      var Immutable_Data_Value = require_Immutable_Data_Value();
      var { is_defined: is_defined2, input_processors, field, tof: tof2, each, is_array } = jsgui;
      var Validation_Success = require_Validation_Success();
      var setup_data_value_data_type_set = (data_value, data_type) => {
        let local_js_value;
        const validation_success = (value, transformed_value) => {
          const res2 = {
            validation: new Validation_Success(),
            value
          };
          if (transformed_value !== void 0) {
            res2.transformed_value = transformed_value;
          }
          return res2;
        };
        const unwrap_data_value = (value) => value instanceof Base_Data_Value ? value.value : value;
        const is_functional_data_type = (dt) => !!dt && typeof dt.validate === "function";
        const define_string_value_property = () => {
          if (!Object.getOwnPropertyDescriptor(data_value, "value")) {
            Object.defineProperty(data_value, "value", {
              get() {
                return local_js_value;
              },
              set(value) {
                const old_value = local_js_value;
                const immu = data_value.toImmutable();
                const value_equals_current = immu.equals(value);
                if (!value_equals_current) {
                  const t_value = tof2(value);
                  let made_change = false;
                  if (t_value === "string") {
                    if (local_js_value instanceof Base_Data_Value) {
                      console.log("existing local_js_value instanceof Data_Value");
                      console.log("local_js_value.value", local_js_value.value);
                      console.log("local_js_value.data_type.name", local_js_value.data_type.name);
                      console.trace();
                      throw "NYI";
                    } else if (local_js_value === void 0) {
                      local_js_value = value;
                      made_change = true;
                    } else if (typeof local_js_value === "string") {
                      local_js_value = value;
                      made_change = true;
                    } else {
                      console.trace();
                      throw "stop";
                    }
                  } else {
                    if (value instanceof Base_Data_Value) {
                      console.log("t_value", t_value);
                      console.log("value", value);
                      console.trace();
                      throw "stop";
                    } else {
                      const tval = tof2(value);
                      if (tval === "number") {
                        local_js_value = value + "";
                        made_change = true;
                      } else {
                        console.log("-- INVALID TYPE --");
                        console.log("tof(old_value)", tof2(old_value));
                        console.log("tof(value)", tof2(value));
                        data_value.raise("validate", {
                          valid: false,
                          reason: "Invalid Type",
                          value,
                          old: local_js_value
                        });
                      }
                    }
                  }
                  if (made_change) {
                    const my_e = {
                      name: "value",
                      old: old_value,
                      value: local_js_value
                    };
                    data_value.raise("change", my_e);
                  }
                }
              }
            });
          } else {
            const transform_string_value = (raw) => {
              const candidate = unwrap_data_value(raw);
              if (candidate === void 0 || candidate === null) {
                return validation_success(candidate);
              }
              if (typeof candidate === "string") {
                return validation_success(candidate);
              }
              if (typeof candidate === "number" || typeof candidate === "boolean") {
                return validation_success(candidate, candidate + "");
              }
              return {
                validation: false,
                value: candidate
              };
            };
            data_value.transform_validate_value = transform_string_value;
          }
        };
        const define_number_value_property = () => {
          const transform_number_value = (raw) => {
            const candidate = unwrap_data_value(raw);
            if (candidate === void 0 || candidate === null) {
              return validation_success(candidate);
            }
            if (typeof candidate === "number") {
              if (Number.isNaN(candidate)) {
                return {
                  validation: false,
                  value: candidate
                };
              }
              return validation_success(candidate);
            }
            if (typeof candidate === "string") {
              const trimmed = candidate.trim();
              if (trimmed.length === 0) {
                return {
                  validation: false,
                  value: candidate
                };
              }
              const parsed = Number(trimmed);
              if (!Number.isNaN(parsed)) {
                return validation_success(candidate, parsed);
              }
              return {
                validation: false,
                value: candidate
              };
            }
            return {
              validation: false,
              value: candidate
            };
          };
          data_value.transform_validate_value = transform_number_value;
        };
        const define_data_type_typed_value_property = () => {
          const descriptor = Object.getOwnPropertyDescriptor(data_value, "value");
          if (descriptor) {
            const transform_data_type_value = (raw) => {
              const candidate = unwrap_data_value(raw);
              if (data_type.validate(candidate)) {
                return validation_success(candidate);
              }
              if (typeof candidate === "string" && typeof data_type.parse_string === "function") {
                const parsed = data_type.parse_string(candidate);
                if (parsed !== void 0 && data_type.validate(parsed)) {
                  return validation_success(candidate, parsed);
                }
              }
              return {
                validation: false,
                value: candidate
              };
            };
            data_value.transform_validate_value = transform_data_type_value;
            return;
          }
          const {
            wrap_properties,
            property_names,
            property_data_types,
            wrap_value_inner_values,
            value_js_type,
            abbreviated_property_names,
            named_property_access,
            numbered_property_access,
            parse_string
          } = data_type;
          let num_properties;
          if (property_names && property_data_types) {
            if (property_names.length === property_data_types.length) {
              num_properties = property_names.length;
              if (numbered_property_access) {
              }
            }
          } else if (property_names) {
            num_properties = property_names.length;
          }
          let _current_immutable_value, _previous_immutable_value;
          let prev_outer_value, current_outer_value;
          let _numbered_property_access_has_been_set_up = false, _named_property_access_has_been_set_up = false;
          Object.defineProperty(data_value, "value", {
            get() {
              return local_js_value;
            },
            set(value) {
              const immu = data_value.toImmutable();
              const value_equals_current = immu.equals(value);
              if (value_equals_current) {
              } else {
                const passed_first_validation = data_type.validate(value);
                let passed_validation = passed_first_validation;
                if (!passed_first_validation) {
                  const t_value = tof2(value);
                  if (t_value === "string" && data_type.parse_string) {
                    const parsed_value = data_type.parse_string(value);
                    if (parsed_value !== void 0) {
                      if (data_type.validate(parsed_value)) {
                        if (!immu.equals(parsed_value)) {
                          value = parsed_value;
                          passed_validation = true;
                        }
                      }
                    }
                  }
                }
                if (passed_validation) {
                  data_value.raise("validate", {
                    valid: true,
                    value
                  });
                } else {
                  data_value.raise("validate", {
                    valid: false,
                    value
                  });
                }
                if (passed_validation) {
                  const do_actual_set = (value2) => {
                    const array_specific_value_processing = () => {
                      if (value_js_type === Array) {
                        let t = tof2(local_js_value);
                        if (t === "undefined") {
                          const create_array_with_wrapped_items = () => {
                            if (num_properties) {
                              if (wrap_value_inner_values) {
                                if (property_data_types) {
                                  let i = 0;
                                  if (value2.__immutable) {
                                    const l = value2.length;
                                    const arr_wrapped_value_values = new Array(l);
                                    const value_value = value2.value;
                                    do_actual_set(value_value);
                                  } else {
                                    if (value2 instanceof Data_Value) {
                                      const arr_wrapped_value_values = new Array(num_properties);
                                      const arr_dv_value = value2.value;
                                      console.log("arr_dv_value", arr_dv_value);
                                      console.trace();
                                      throw "stop";
                                    } else if (is_array(value2)) {
                                      const arr_wrapped_value_values = value2.map((value3) => {
                                        const property_index = i;
                                        let property_name;
                                        if (property_names) {
                                          property_name = property_names[property_index];
                                        }
                                        const wrapped_value = new Data_Value({ context, value: value3, data_type: property_data_types[i] });
                                        wrapped_value.on("change", (e) => {
                                          const { name } = e;
                                          if (name === "value") {
                                            current_outer_value = data_value.toImmutable();
                                            const my_e2 = {
                                              name,
                                              event_originator: wrapped_value,
                                              parent_event: e,
                                              value: current_outer_value
                                            };
                                            if (property_name) {
                                              my_e2.property_name = property_name;
                                            }
                                            my_e2.property_index = property_index;
                                            data_value.raise("change", my_e2);
                                            prev_outer_value = current_outer_value;
                                          }
                                        });
                                        i++;
                                        return wrapped_value;
                                      });
                                      local_js_value = arr_wrapped_value_values;
                                      const my_e = {
                                        name: "value",
                                        old: _previous_immutable_value,
                                        value: data_value.toImmutable()
                                      };
                                      data_value.raise("change", my_e);
                                    }
                                  }
                                } else {
                                  let i = 0;
                                  const arr_wrapped_value_values = value2.map((value3) => {
                                    const property_index = i;
                                    let property_name;
                                    if (property_names) {
                                      property_name = property_names[property_index];
                                    }
                                    const wrapped_value = new Data_Value({ context, value: value3 });
                                    wrapped_value.on("change", (e) => {
                                      const { name } = e;
                                      if (name === "value") {
                                        const my_e = {
                                          name,
                                          event_originator: wrapped_value,
                                          parent_event: e,
                                          value: data_value.toImmutable()
                                        };
                                        if (property_name) {
                                          my_e.property_name = property_name;
                                        }
                                        my_e.property_index = property_index;
                                        data_value.raise("change", my_e);
                                      }
                                    });
                                    i++;
                                    return wrapped_value;
                                  });
                                  local_js_value = arr_wrapped_value_values;
                                }
                              } else {
                                local_js_value = value2;
                              }
                            } else {
                              console.trace();
                              throw "stop - number of properties not found";
                            }
                          };
                          create_array_with_wrapped_items();
                        } else if (t === "array") {
                          const t_value = tof2(value2);
                          if (t_value === "data_value") {
                            if (is_array(value2.value)) {
                              if (value2.value.length === local_js_value.length) {
                                each(value2.value, (inner_value, idx) => {
                                  if (inner_value instanceof Data_Model) {
                                    const matching_local_inner_value = local_js_value[idx];
                                    if (inner_value.equals(matching_local_inner_value)) {
                                    } else {
                                      matching_local_inner_value.value = inner_value;
                                    }
                                  } else {
                                    console.trace();
                                    throw "NYI";
                                  }
                                });
                              } else {
                                console.trace();
                                throw "NYI";
                              }
                            } else {
                              console.trace();
                              throw "NYI";
                            }
                          } else {
                            if (t_value === "array") {
                              if (local_js_value.length === value2.length) {
                                const l = value2.length;
                                let all_local_js_items_are_data_model = true, c2 = 0;
                                do {
                                  const local_item = local_js_value[c2];
                                  if (!(local_item instanceof Data_Model)) {
                                    all_local_js_items_are_data_model = false;
                                  }
                                  c2++;
                                } while (all_local_js_items_are_data_model && c2 < l);
                                if (all_local_js_items_are_data_model) {
                                  let c3 = 0;
                                  do {
                                    const local_item = local_js_value[c3];
                                    local_item.value = value2[c3];
                                    c3++;
                                  } while (c3 < l);
                                } else {
                                  console.trace();
                                  throw "NYI";
                                }
                              } else {
                                console.trace();
                                throw "NYI";
                              }
                            } else {
                              console.log("value", value2);
                              console.trace();
                              throw "NYI";
                            }
                          }
                        } else {
                        }
                      } else {
                      }
                    };
                    array_specific_value_processing();
                    const general_value_processing = () => {
                      if (local_js_value instanceof Base_Data_Value) {
                        console.log("existing local_js_value instanceof Data_Value");
                        console.log("local_js_value.value", local_js_value.value);
                        console.log("local_js_value.data_type.name", local_js_value.data_type.name);
                        console.trace();
                        throw "NYI";
                      } else if (local_js_value instanceof Array) {
                        if (value2 instanceof Data_Model) {
                          if (value2.equals(local_js_value)) {
                          } else {
                            console.log("value", value2);
                            console.log("local_js_value", local_js_value);
                            console.trace();
                            throw "NYI";
                          }
                        } else if (value2 instanceof Array) {
                          if (property_names.length === value2.length) {
                            if (property_data_types) {
                              const num_properties2 = property_names.length;
                              for (let i_property = 0; i_property < num_properties2; i_property++) {
                                const name = property_names[i_property];
                                const data_type2 = property_data_types[i_property];
                                if (local_js_value[i_property] instanceof Data_Value) {
                                  local_js_value[i_property].value = value2[i_property];
                                } else {
                                  console.trace();
                                  throw "NYI";
                                }
                              }
                              if (numbered_property_access && !_numbered_property_access_has_been_set_up) {
                                for (let i_property = 0; i_property < num_properties2; i_property++) {
                                  const name = property_names[i_property];
                                  const data_type2 = property_data_types[i_property];
                                  Object.defineProperty(data_value, i_property, {
                                    get() {
                                      return local_js_value[i_property];
                                    },
                                    set(value3) {
                                      const item_already_there = local_js_value[i_property];
                                      if (item_already_there instanceof Data_Model) {
                                        item_already_there.value = value3;
                                      } else {
                                        console.log("item_already_there", item_already_there);
                                        console.trace();
                                        throw "stop";
                                      }
                                      if (value3 instanceof Data_Model) {
                                      } else {
                                      }
                                    }
                                  });
                                }
                                Object.defineProperty(data_value, "length", {
                                  get() {
                                    return local_js_value.length;
                                  }
                                });
                                _numbered_property_access_has_been_set_up = true;
                              }
                              if (named_property_access && !_named_property_access_has_been_set_up) {
                                if (numbered_property_access) {
                                  if (property_names) {
                                    for (let i_property = 0; i_property < num_properties2; i_property++) {
                                      const name = property_names[i_property];
                                      const data_type2 = property_data_types[i_property];
                                      Object.defineProperty(data_value, name, {
                                        get() {
                                          return local_js_value[i_property];
                                        },
                                        set(value3) {
                                          const item_already_there = local_js_value[i_property];
                                          if (item_already_there instanceof Data_Model) {
                                            item_already_there.value = value3;
                                          } else {
                                            console.log("item_already_there", item_already_there);
                                            console.trace();
                                            throw "stop";
                                          }
                                        }
                                      });
                                    }
                                  }
                                  if (abbreviated_property_names) {
                                    for (let i_property = 0; i_property < num_properties2; i_property++) {
                                      const name = abbreviated_property_names[i_property];
                                      const data_type2 = property_data_types[i_property];
                                      Object.defineProperty(data_value, name, {
                                        get() {
                                          return local_js_value[i_property];
                                        },
                                        set(value3) {
                                          const item_already_there = local_js_value[i_property];
                                          if (item_already_there instanceof Data_Model) {
                                            item_already_there.value = value3;
                                          } else {
                                            console.log("item_already_there", item_already_there);
                                            console.trace();
                                            throw "stop";
                                          }
                                          if (value3 instanceof Data_Model) {
                                          } else {
                                          }
                                        }
                                      });
                                    }
                                  }
                                }
                                _named_property_access_has_been_set_up = true;
                              }
                            }
                          } else {
                            console.trace();
                            throw "NYI";
                          }
                        } else {
                          console.log("value", value2);
                          console.log("local_js_value", local_js_value);
                          console.log("value_equals_current", value_equals_current);
                          console.log("immu", immu);
                          console.trace();
                          throw "NYI";
                        }
                      } else {
                        if (value2 instanceof Data_Model) {
                          if (value2.data_type === data_value.data_type) {
                            const tvv = tof2(value2.value);
                            if (tvv === "number" || tvv === "string" || tvv === "boolean") {
                              local_js_value = value2.value;
                            } else {
                              console.trace();
                              throw "NYI";
                            }
                          } else {
                            console.trace();
                            throw "NYI";
                          }
                        } else {
                          local_js_value = value2;
                        }
                        data_value.raise("change", {
                          name: "value",
                          old: immu,
                          value: value2
                        });
                        prev_outer_value = current_outer_value;
                      }
                    };
                    general_value_processing();
                  };
                  do_actual_set(value);
                } else {
                }
              }
            }
          });
        };
        if (data_type === String) {
          define_string_value_property();
        } else if (data_type === Number) {
          define_number_value_property();
        } else if (is_functional_data_type(data_type)) {
          define_data_type_typed_value_property();
        } else {
          console.trace();
          throw "NYI";
        }
      };
      module.exports = setup_data_value_data_type_set;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Data_Value.js
  var require_Data_Value = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Data_Value.js"(exports, module) {
      var jsgui = require_lib_lang_mini();
      var { more_general_equals } = require_tools();
      var Base_Data_Value = require_Base_Data_Value();
      var Value_Set_Attempt = require_Value_Set_Attempt();
      var Data_Model = require_Data_Model();
      var Immutable_Data_Model = require_Immutable_Data_Model();
      var Immutable_Data_Value = require_Immutable_Data_Value();
      var { is_defined: is_defined2, input_processors, tof: tof2, each, is_array, Data_Type } = jsgui;
      var setup_data_value_data_type_set = require_setup_data_value_data_type_set();
      var util;
      if (typeof window === "undefined") {
        const str_utl = "util";
        util = __require(str_utl);
      }
      var lpurple = (x) => "\x1B[38;5;129m" + x + "\x1B[0m";
      var Data_Value2 = class _Data_Value extends Base_Data_Value {
        constructor(spec = {}) {
          const spec_is_plain_object = spec !== null && typeof spec === "object" && !Array.isArray(spec);
          const actual_spec = spec_is_plain_object ? spec : { value: spec };
          super(actual_spec);
          const initial_value_is_present = Object.prototype.hasOwnProperty.call(actual_spec, "value");
          const initial_value = initial_value_is_present ? actual_spec.value : void 0;
          const { data_type } = this;
          if (data_type) {
            setup_data_value_data_type_set(this, data_type);
            if (initial_value_is_present && is_defined2(initial_value)) {
              this.value = initial_value;
            }
          } else {
            if (initial_value_is_present) {
              this.value = actual_spec.value;
            }
          }
          const attempt_set_value = this.attempt_set_value = (value) => {
            const get_local_js_value_copy = () => {
              const lv = this.value;
              const tljsv = tof2(lv);
              if (tljsv === "undefined" || tljsv === "string" || tljsv === "number" || tljsv === "array" || tljsv === "object" || tljsv === "data_value") {
                return lv;
              } else {
                return lv;
              }
            };
            const old_local_js_value = get_local_js_value_copy();
            const old_equals_new = more_general_equals(old_local_js_value, value);
            if (old_equals_new === true) {
              return new Value_Set_Attempt({ success: false, equal_values: true });
            }
            try {
              this.value = value;
            } catch (error) {
              return new Value_Set_Attempt({ success: false, value: old_local_js_value, error });
            }
            const new_local_js_value = get_local_js_value_copy();
            const changed = !more_general_equals(old_local_js_value, new_local_js_value);
            return new Value_Set_Attempt({
              success: changed,
              old: old_local_js_value,
              value: new_local_js_value
            });
          };
          this.__type = "data_value";
          this._relationships = {};
        }
        toImmutable() {
          const { context: context2, data_type, value } = this;
          const res2 = new Immutable_Data_Value({
            context: context2,
            data_type,
            value
          });
          return res2;
        }
        "toObject"() {
          return this._;
        }
        "set"(val) {
          this.value = val;
        }
        "get"() {
          return this.value;
        }
        equals(other) {
          return more_general_equals(this, other);
        }
        "toString"() {
          return this.get() + "";
        }
        "toJSON"() {
          const t_value = tof2(this.value);
          if (t_value === "string") {
            return JSON.stringify(this.value);
          } else if (t_value === "number") {
            return this.value + "";
          } else if (t_value === "boolean") {
            this.value ? "true" : "false";
          } else if (t_value === "array") {
            return JSON.stringify(this.value);
          } else if (t_value === "data_value") {
            return this.value.toJSON();
          } else if (t_value === "undefined") {
            return "null";
          } else if (t_value === "null") {
            return "null";
          } else {
            console.log("toJSON this.value", this.value);
            console.log("t_value", t_value);
            console.trace();
            throw "NYI";
          }
        }
        "clone"() {
          console.trace();
          throw "NYI";
          var res2 = new _Data_Value({
            "value": this._
          });
          return res2;
        }
        "_id"() {
          if (this.__id) return this.__id;
          if (this.context) {
            this.__id = this.context.new_id(this.__type_name || this.__type);
            return this.__id;
          }
          return void 0;
        }
      };
      var ensure_sync_state = (data_value) => {
        if (!data_value.__sync_state) {
          Object.defineProperty(data_value, "__sync_state", {
            value: {
              updatingFrom: /* @__PURE__ */ new Set()
            },
            enumerable: false
          });
        }
        return data_value.__sync_state;
      };
      var has_defined_value = (data_value) => typeof data_value.value !== "undefined";
      var copy_initial_value = (from, to) => {
        const source_state = ensure_sync_state(from);
        source_state.updatingFrom.add(to);
        try {
          to.value = from.value;
        } finally {
          source_state.updatingFrom.delete(to);
        }
      };
      var propagate_sync_value = (source, target) => {
        source.on("change", (e) => {
          if (e.name !== "value") {
            return;
          }
          const { updatingFrom } = ensure_sync_state(target);
          if (updatingFrom.has(source)) {
            return;
          }
          updatingFrom.add(source);
          try {
            target.value = e.value;
          } finally {
            updatingFrom.delete(source);
          }
        });
      };
      var align_initial_values = (a, b) => {
        const a_has_value = has_defined_value(a);
        const b_has_value = has_defined_value(b);
        if (a_has_value && !b_has_value) {
          copy_initial_value(a, b);
        } else if (!a_has_value && b_has_value) {
          copy_initial_value(b, a);
        }
      };
      Data_Value2.sync = (a, b) => {
        if (a instanceof Base_Data_Value && b instanceof Base_Data_Value) {
          propagate_sync_value(a, b);
          propagate_sync_value(b, a);
          align_initial_values(a, b);
        } else {
          console.trace();
          throw "Unexpected types";
        }
      };
      if (util) {
        Data_Value2.prototype[util.inspect.custom] = function(depth, opts) {
          const { value } = this;
          const tv = tof2(value);
          if (tv === "number" || tv === "string" || tv === "boolean") {
            return lpurple(value);
          } else {
            if (value instanceof Array) {
              let res2 = lpurple("[ ");
              let first = true;
              each(value, (item2) => {
                if (!first) {
                  res2 = res2 + lpurple(", ");
                } else {
                  first = false;
                }
                if (item2 instanceof Data_Model) {
                  const item_value = item2.value;
                  res2 = res2 + lpurple(item_value);
                } else [
                  res2 = res2 + lpurple(item2)
                ];
              });
              res2 = res2 + lpurple(" ]");
              return res2;
            } else if (value instanceof Data_Model) {
              return value[util.inspect.custom]();
            } else {
              return lpurple(this.value);
            }
          }
        };
      }
      module.exports = Data_Value2;
    }
  });

  // node_modules/lang-tools/Data_Model/Mini_Context.js
  var require_Mini_Context = __commonJS({
    "node_modules/lang-tools/Data_Model/Mini_Context.js"(exports, module) {
      var Mini_Context = class {
        // Need quite a simple mechanism to get IDs for objects.
        // They will be typed objects/
        constructor(spec) {
          const map_typed_counts = /* @__PURE__ */ Object.create(null);
          this.new_id = (str_type = "item") => {
            const current = map_typed_counts[str_type] || 0;
            map_typed_counts[str_type] = current + 1;
            return `${str_type}_${current}`;
          };
        }
        "make"(abstract_object) {
          if (abstract_object._abstract) {
            var constructor = abstract_object.constructor;
            var aos = abstract_object._spec;
            aos.abstract = null;
            aos.context = this;
            var res2 = new constructor(aos);
            return res2;
          } else {
            throw "Object must be abstract, having ._abstract == true";
          }
        }
      };
      module.exports = Mini_Context;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Data_Object.js
  var require_Data_Object = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Data_Object.js"(exports, module) {
      var jsgui = require_lib_lang_mini();
      var { each, tof: tof2, is_defined: is_defined2, get_a_sig, ll_get } = jsgui;
      var Mini_Context = require_Mini_Context();
      var Data_Model = require_Data_Model();
      var Data_Value2 = require_Data_Value();
      jsgui.__data_id_method = "init";
      var Data_Object = class extends Data_Model {
        constructor(spec = {}, fields) {
          super(spec);
          this._ = this._ || {};
          if (spec.id) {
            this.__id = spec.id;
          }
          if (spec.__id) {
            this.__id = spec.__id;
          }
          this.__type_name = spec.__type_name || "data_object";
          if (fields) this.set_fields_from_spec(fields, spec);
          this.__data_object = true;
          if (spec.abstract === true) {
            this._abstract = true;
            var tSpec = tof2(spec);
            if (tSpec == "function") {
              this._type_constructor = spec;
            } else if (tSpec == "object") {
              this._spec = spec;
            }
          } else {
            var t_spec = tof2(spec);
            this.__type = "data_object";
            if (t_spec === "object" || t_spec === "control") {
              if (spec.context) {
                this.context = spec.context;
              }
              if (spec.id) {
                this.__id = spec.id;
              }
              if (spec._id) {
                this.__id = spec._id;
              }
              if (spec.__id) {
                this.__id = spec.__id;
              }
            } else if (t_spec == "data_object") {
              if (spec.context) this.context = spec.context;
            }
            if (is_defined2(spec.parent)) {
              this.parent = spec.parent;
            }
            if (this.context) {
              this.init_default_events();
            }
            const reserved_keys = {
              "context": true,
              "id": true,
              "_id": true,
              "__id": true,
              "parent": true,
              "__type": true,
              "__type_name": true,
              "abstract": true,
              "data_def": true,
              "load_array": true,
              "items": true,
              "fn_index": true,
              "constraint": true,
              "index_by": true,
              "accepts": true
            };
            if (t_spec === "object" && spec) {
              Object.keys(spec).forEach((key) => {
                if (reserved_keys[key] || key.startsWith("__")) return;
                this.set(key, spec[key], true);
              });
            }
          }
        }
        "set_fields_from_spec"(fields, spec) {
          const normalized = [];
          if (Array.isArray(fields)) {
            each(fields, (field) => {
              if (Array.isArray(field)) {
                normalized.push(field);
              } else if (typeof field === "object" && field.name) {
                normalized.push([field.name, field.type, field.default]);
              }
            });
          } else if (typeof fields === "object") {
            each(fields, (val, key) => {
              if (Array.isArray(val)) {
                normalized.push([key, val[0], val[1]]);
              } else {
                normalized.push([key, val]);
              }
            });
          }
          each(normalized, (field) => {
            const field_name = field[0];
            const field_default = field[2];
            let value_to_set;
            if (spec && typeof spec[field_name] !== "undefined") {
              value_to_set = spec[field_name];
            } else if (typeof field_default !== "undefined") {
              value_to_set = field_default;
            }
            if (typeof value_to_set !== "undefined") {
              if (typeof this.set === "function") {
                this.set(field_name, value_to_set, true);
              } else {
                this._[field_name] = value_to_set;
              }
            }
          });
        }
        "init_default_events"() {
        }
        /*
             'data_def': fp(function(a, sig) {
             if (sig == '[o]') {
             // create the new data_def constraint.
        
        
             }
             }),
             */
        "keys"() {
          return Object.keys(this._);
        }
        // fromJSON
        "toJSON"() {
          var res2 = [];
          res2.push("Data_Object(" + JSON.stringify(this._) + ")");
          return res2.join("");
        }
        // using_fields_connection()
        //  will search up the object heirachy, to see if the Data_Objects fields need to be connected through the use of functions.
        //  that will make the fields easy to change by calling a function. Should make things much faster to access than when programming with Backbone.
        // then will connect the fields with connect_fields()
        /*
        'using_fields_connection'() {
            var res = false;
            iterate_ancestor_classes(this.constructor, function (a_class, stop) {
                if (is_defined(a_class._connect_fields)) {
                    res = a_class._connect_fields;
                    stop();
                }
            });
            return res;
        }
        */
        // using _relationships or whatever
        get parent() {
          return this._parent;
        }
        set parent(value) {
          return this._parent = value;
        }
        "_id"() {
          if (this.__id) return this.__id;
          if (this.context) {
            this.__id = this.context.new_id(this.__type_name || this.__type);
          } else {
            if (this._abstract) {
              return void 0;
            } else if (!is_defined2(this.__id)) {
              return void 0;
            }
          }
          return this.__id;
        }
        // Problems with name (fields).
        //  Fields are given as a description of the fields.
        //   Gets more complicated when we have a function to access the fields as well.
        //   What if we want to override that function?
        // Will call it field
        //  18/12/2016 - Getting rid of this confusion, will mostly remove / greatly simplify field functionality.
        //  Just need to know which fields any class has, keeping track of this will use some data structures like Sorted_KVS,
        //   but not much complex code within this part.
        // Not so sure what a field function will do right now.
        //  Does not seem like such an essential part of the API.
        //   Can just define the fields, then they act a bit differently.
        //   Have field handling in Data_Object.
        //   Collection would have the same field capabilities. Fields should not be so important anyway.
        // 18/12/2016 Will remove constraints, then make them much more functional.
        //  Go through the keys....
        "each"(callback) {
          each(this._, callback);
        }
        // could make this polymorphic so that it
        //   sibling_index I think.
        "position_within"(parent) {
          var p_id = parent._id();
          if (this._parents && is_defined2(this._parents[p_id])) {
            var parent_rel_info = this._parents[p_id];
            var pos_within = parent_rel_info[1];
            return pos_within;
          }
        }
        // Maybe just 'remove' function.
        //  This may be needed with multiple parents, which are not being used at the moment.
        // ???? late 2023
        "remove_from"(parent) {
          var p_id = parent._id();
          if (this._parents && is_defined2(this._parents[p_id])) {
            var parent = this._parents[p_id][0];
            var pos_within = this._parents[p_id][1];
            var item2 = parent._arr[pos_within];
            parent.remove(pos_within);
            delete this._parents[p_id];
          }
        }
        //  
        // Maybe only do this with the fields anyway
        "load_from_spec"(spec, arr_item_names) {
          console.trace();
          throw "Deprecated in new Data_Object version";
          each(arr_item_names, (v) => {
            var spec_item = spec[v];
            if (is_defined2(spec_item)) {
              this.set(v, spec_item);
            }
          });
        }
        // They will be treated as values in many cases anyway.
        //  Will turn them to different types of object where possible.
        /*
            'value'() {
                var a = arguments; a.l = arguments.length; var sig = get_a_sig(a, 1);
                // could operate like both get and set, but does not return data_objects, returns the value itself.
                var name;
                //var res;
                if (sig === '[s]') {
                    name = a[0];
                    var possibly_dobj = this.get(name);
                    //var t_obj = tof(possibly_dobj);
        
                    if (possibly_dobj) {
                        if (possibly_dobj.value && typeof possibly_dobj.value === 'function') {
                            return possibly_dobj.value();
                        } else {
                            return possibly_dobj;
                        }
                    }
                }
            }
            */
        // Get could be greatly simplified as well.
        //  Input and output processing will be more streamlined in a functional way.
        // 19/12/2016 - Not using get or set nearly as much anyway.
        "get"() {
          var a = arguments;
          a.l = arguments.length;
          var sig = get_a_sig(a, 1);
          var do_typed_processing = false;
          if (do_typed_processing) {
            if (a.l === 0) {
              var output_obj = jsgui.output_processors[this.__type_name](this._);
              return output_obj;
            } else {
              console.log("a", a);
              console.trace();
              throw "not yet implemented";
            }
          } else {
            if (sig == "[s,f]") {
              throw "Asyncronous access not allowed on Data_Object get.";
              var res2 = this.get(a[0]);
              var callback = a[1];
              if (typeof res2 == "function") {
                res2(callback);
              } else {
                return res2;
              }
            } else if (sig == "[s]") {
              var res2 = ll_get(this, a[0]);
              return res2;
            } else if (a.l === 0) {
              return this._;
            }
          }
        }
        "ensure_data_value"(property_name, default_value) {
          if (this._abstract) return void 0;
          if (!property_name || typeof property_name !== "string") throw "property_name expected: string";
          if (property_name.indexOf(".") > -1 && property_name !== ".") throw "ensure_data_value does not support dotted paths (yet)";
          const has_key = this._ && Object.prototype.hasOwnProperty.call(this._, property_name);
          const existing = has_key ? this._[property_name] : void 0;
          if (existing && existing.__data_value) return existing;
          const initial_value = has_key ? existing : default_value;
          const dv = new Data_Value2({
            value: initial_value
          });
          this._[property_name] = dv;
          return dv;
        }
        // Or don't use / support get and set for the moment?
        //   Only use property / field access?
        //   Define property, with getter and setter, seems like a more cleanly defined system.
        // May see about making a new simplified implementation of this and running it through tests.
        //   Though the new Data_Value seems like the more appropriate way for the moment.
        // May look into seeing where Data_Value is used in the current system too.
        //   Could see about further incorportating its use (in places).
        //'set': fp(function(a, sig) {
        "set"() {
          var a = arguments;
          a.l = arguments.length;
          var sig = get_a_sig(a, 1);
          if (this._abstract) return false;
          var that2 = this, res2;
          var input_processors = jsgui.input_processors;
          if (a.l === 2 || a.l === 3) {
            var property_name = a[0], value = a[1];
            var ta2 = tof2(a[2]);
            var silent = false;
            var source;
            if (ta2 == "string" || ta2 == "boolean") {
              silent = a[2];
            }
            if (ta2 == "control") {
              source = a[2];
            }
            if (!this._initializing && this._map_read_only && this._map_read_only[property_name]) {
              throw 'Property "' + property_name + '" is read-only.';
            } else {
              var split_pn = property_name.split(".");
              if (split_pn.length > 1 && property_name != ".") {
                var spn_first = split_pn[0];
                var spn_arr_next = split_pn.slice(1);
                var data_object_next = this.get(spn_first);
                if (data_object_next) {
                  res2 = data_object_next.set(spn_arr_next.join("."), value);
                  if (!silent) {
                    const bubbled_stored = this.get(property_name);
                    var e_change = {
                      "name": property_name,
                      // Back-compat: bubbled events historically provided the input value.
                      "value": value,
                      // MVVM-friendly additions:
                      "data_value": bubbled_stored && bubbled_stored.__data_value ? bubbled_stored : void 0,
                      "raw_value": bubbled_stored && bubbled_stored.__data_value ? bubbled_stored.value : bubbled_stored && typeof bubbled_stored.value === "function" ? bubbled_stored.value() : value,
                      "bubbled": true
                    };
                    if (source) {
                      e_change.source = source;
                    }
                    this.raise_event("change", e_change);
                  }
                } else {
                  throw "No data object at this level.";
                }
              } else {
                var data_object_next = this.get(property_name);
                const had_existing = is_defined2(data_object_next) && data_object_next !== null;
                const incoming_is_node = value && (value.__data_object || value.__data_value || value.__data_grid);
                const existing_is_data_value = data_object_next && data_object_next.__data_value;
                const existing_is_data_object = data_object_next && data_object_next.__data_object;
                const incoming_t = tof2(value);
                let stored;
                if (existing_is_data_value) {
                  data_object_next.set(value);
                  stored = data_object_next;
                  res2 = data_object_next;
                } else if (existing_is_data_object && incoming_t === "object" && value !== null && !incoming_is_node && incoming_t !== "array") {
                  data_object_next.set(value);
                  stored = data_object_next;
                  res2 = data_object_next;
                } else {
                  if (incoming_is_node) {
                    stored = value;
                  } else {
                    if (!had_existing) {
                      stored = this.ensure_data_value(property_name);
                      stored.set(value);
                    } else {
                      stored = value;
                    }
                  }
                  this._[property_name] = stored;
                  res2 = stored;
                }
                if (!silent) {
                  var e_change = {
                    "name": property_name,
                    // Back-compat: historically sometimes emitted Data_Value (when creating) and sometimes raw JS value (when updating).
                    "value": !had_existing ? stored : stored && stored.__data_value ? stored.value : stored && typeof stored.value === "function" ? stored.value() : stored,
                    // MVVM-friendly additions:
                    "data_value": stored && stored.__data_value ? stored : void 0,
                    "raw_value": stored && stored.__data_value ? stored.value : stored && typeof stored.value === "function" ? stored.value() : stored
                  };
                  if (source) {
                    e_change.source = source;
                  }
                  this.raise_event("change", e_change);
                }
                return had_existing ? res2 : value;
              }
            }
          } else {
            var value = a[0];
            var property_name = a[1];
            var input_processor = input_processors[this.__type_name];
            if (input_processor) {
              var processed_input = input_processor(value);
              value = processed_input;
              this._[property_name] = value;
              this.raise_event("change", {
                "value": value
              });
              return value;
            } else {
              if (sig === "[D]") {
                this._[property_name] = value;
                this.raise_event("change", [property_name, value]);
                return value;
              } else if (sig === "[o]") {
                res2 = {};
                each(a[0], function(v, i) {
                  res2[i] = that2.set(i, v);
                });
                return res2;
              } else if (sig === "[c]") {
                this._[property_name] = value;
                this.raise_event("change", [property_name, value]);
                return value;
              }
            }
          }
        }
        "has"(property_name) {
          return is_defined2(this.get(property_name));
        }
      };
      jsgui.map_classes = jsgui.map_classes || {};
      var dobj = (obj2, data_def) => {
        var cstr = Data_Object;
        var res2;
        if (data_def) {
          res2 = new cstr({
            "data_def": data_def
          });
        } else {
          res2 = new cstr({});
        }
        var tobj = tof2(obj2);
        if (tobj == "object") {
          var res_set = res2.set;
          each(obj2, (v, i) => {
            res_set.call(res2, i, v);
          });
        }
        return res2;
      };
      Data_Object.dobj = dobj;
      Data_Object.Mini_Context = Mini_Context;
      module.exports = Data_Object;
    }
  });

  // node_modules/lang-tools/sorted-kvs.js
  var require_sorted_kvs = __commonJS({
    "node_modules/lang-tools/sorted-kvs.js"(exports, module) {
      var jsgui = require_lib_lang_mini();
      var mapify = jsgui.mapify;
      var B_Plus_Tree = require_b_plus_tree();
      var Sorted_KVS = class {
        constructor(spec) {
          spec = spec || {};
          if (typeof spec.unique_keys !== "undefined") this.unique_keys = spec.unique_keys;
          this.tree = B_Plus_Tree(12);
        }
        "clear"() {
          this.tree.clear();
        }
        /*
        	'put': mapify(function (key, value) {
        		// inserting a bunch of things at once... could that be done more efficiently, such as in one traversal?
        		//  sort the items, then can skip through the tree a bit quicker?
        
        
        		var insert_res = this.tree.insert(key, value);
        		// with tree.insert - nice if we can keep the treenode as a result.
        		//  the tree does not store objects in the node.
        		//   could make the tree node hold a reference to the object?
        
        		//console.log('put insert_res ' + insert_res);
        		//this.dict[key] = value;
        	}),
        	*/
        "out"(key) {
          this.tree.remove(key);
        }
        "get"(key) {
          return this.tree.get_values_by_key(key);
        }
        "has"(key) {
          return this.key_count(key) > 0;
        }
        "get_cursor"() {
        }
        "keys"() {
          return this.tree.keys();
        }
        "keys_and_values"() {
          return this.tree.keys_and_values();
        }
        /*
        	 'values': function() {
        	 var keys = this.keys();
        	 var res = [];
        	 var that = this;
        	 console.log('keys.length ' + keys.length );
        	 console.log('keys ' + jsgui.stringify(keys));
        
        	 each(keys, function(i, v) {
        	 res.push(that.dict[v]);
        	 });
        	 return res;
        	 },
        	 */
        "key_count"(key) {
          if (typeof key !== "undefined") {
            return this.tree.count(key);
          } else {
            return this.tree.count();
          }
        }
        "get_keys_by_prefix"(prefix) {
          return this.tree.get_keys_by_prefix(prefix);
        }
        "each"(callback) {
          return this.tree.each(callback);
        }
        "get_by_prefix"(prefix) {
          return this.tree.get_by_prefix(prefix);
        }
      };
      Sorted_KVS.prototype.put = mapify(function(key, value) {
        var insert_res = this.tree.insert(key, value);
      });
      module.exports = Sorted_KVS;
    }
  });

  // node_modules/lang-tools/Data_Model/new/Collection.js
  var require_Collection = __commonJS({
    "node_modules/lang-tools/Data_Model/new/Collection.js"(exports, module) {
      var lang = require_lib_lang_mini();
      var Data_Value2 = require_Data_Value();
      var Data_Object = require_Data_Object();
      var Sorted_KVS = require_sorted_kvs();
      var dobj = Data_Object.dobj;
      var Constraint = Data_Object.Constraint;
      var each = lang.each;
      var tof2 = lang.tof;
      var is_defined2 = lang.is_defined;
      var stringify = lang.stringify;
      var get_a_sig = lang.get_a_sig;
      var native_constructor_tof = lang.native_constructor_tof;
      var dop = Data_Object.prototype;
      var Collection = class _Collection extends Data_Object {
        constructor(spec = {}, arr_values) {
          super(spec);
          this.__type = "collection";
          this.__type_name = "collection";
          var t_spec = tof2(spec);
          if (spec.abstract === true) {
            if (t_spec === "function") {
              this.constraint(spec);
            }
          } else {
            this._relationships = this._relationships || {};
            this._arr_idx = 0;
            this._arr = [];
            this.index = new Sorted_KVS();
            this.fn_index = spec.fn_index;
            if (t_spec === "array") {
              spec = {
                "load_array": spec
              };
            } else {
              if (t_spec === "function") {
                if (spec.abstract === true) {
                  this._abstract = true;
                } else {
                }
              } else if (t_spec === "string") {
                var map_native_constructors = {
                  "array": Array,
                  "boolean": Boolean,
                  "number": Number,
                  "string": String,
                  "object": Object
                };
                var nc = map_native_constructors[spec];
                if (nc) {
                  spec = {
                    "constraint": nc
                  };
                  if (nc == String) {
                    spec.index_by = "value";
                  }
                }
              }
            }
            if (is_defined2(spec.items)) {
              spec.load_array = spec.load_array || spec.items;
            }
            if (arr_values) {
              spec.load_array = arr_values;
            }
            if (is_defined2(spec.accepts)) {
              this._accepts = spec.accepts;
            }
            if (lang.__data_id_method === "init") {
              if (this.context) {
                this.__id = this.context.new_id(this.__type_name || this.__type);
                this.context.map_objects[this.__id] = this;
              } else {
              }
            }
            if (!this.__type) {
            }
            if (spec.load_array) {
              this.load_array(spec.load_array);
            }
          }
        }
        // maybe use fp, and otherwise apply with the same params and context.
        "set"(value) {
          var tval = tof2(value);
          if (tval === "data_object" || tval === "data_value" || tval === "data_model") {
            this.clear();
            return this.push(value);
          } else if (tval === "array") {
            this.clear();
            each(value, (v, i) => {
              this.push(v);
            });
          } else {
            if (tval === "collection") {
              throw "stop";
              this.clear();
              value.each(function(v, i) {
                that.push(v);
              });
            } else if (tval === "string" || tval === "number" || tval === "boolean" || tval === "null" || tval === "undefined") {
              this.clear();
              return this.push(value);
            } else {
              const Data_Object2 = require_Data_Object();
              return Data_Object2.prototype.set.call(this, value);
            }
          }
        }
        "clear"() {
          this._arr_idx = 0;
          this._arr = [];
          this.index.clear();
          this.raise("change", {
            "name": "clear"
          });
        }
        "stringify"() {
          var res2 = [];
          if (this._abstract) {
            var ncto = native_constructor_tof(this._type_constructor);
            res2.push("~Collection(");
            if (ncto) {
              res2.push(ncto);
            } else {
            }
            res2.push(")");
          } else {
            res2.push("Collection(");
            var first = true;
            this.each(function(v, i) {
              if (!first) {
                res2.push(", ");
              } else {
                first = false;
              }
              res2.push(stringify(v));
            });
            res2.push(")");
          }
          return res2.join("");
        }
        "toString"() {
          return stringify(this._arr);
        }
        "toObject"() {
          var res2 = [];
          this.each(function(v, i) {
            res2.push(v.toObject());
          });
          return res2;
        }
        "each"() {
          var a = arguments;
          a.l = arguments.length;
          var sig = get_a_sig(a, 1);
          if (sig == "[f]") {
            return each(this._arr, a[0]);
          } else {
            if (sig == "[X,f]") {
              var index = a[0];
              var callback = a[1];
              return index.each(callback);
            } else {
              if (a.l == 2) {
                return each(this._arr, a[0], a[1]);
              }
            }
          }
        }
        "_id"() {
          if (this.context) {
            this.__id = this.context.new_id(this.__type_name || this.__type);
          } else {
          }
          return this.__id;
        }
        "length"() {
          return this._arr.length;
        }
        get len() {
          return this._arr.length;
        }
        "find"() {
          var a = arguments;
          a.l = arguments.length;
          var sig = get_a_sig(a, 1);
          if (a.l == 1) {
            var pos = this.index.get(a[0])[0];
            var item2 = this._arr[pos];
            return item2;
          }
          if (sig == "[o,s]") {
            return this.index_system.find(a[0], a[1]);
          }
          if (sig == "[s,s]") {
            return this.index_system.find(a[0], a[1]);
          }
          if (sig == "[a,s]") {
            return this.index_system.find(a[0], a[1]);
          }
          if (sig == "[s,o]") {
            var propertyName = a[0];
            var query = a[1];
            var foundItems = [];
            each(this, (item3, index) => {
              if (item3.get) {
                var itemProperty = item3.get(propertyName);
              } else {
                var itemProperty = item3[propertyName];
              }
              var tip = tof2(itemProperty);
              var tip2;
              var ip2;
              if (tip === "data_value") {
                var ip2 = itemProperty.value;
                tip2 = tof2(ip2);
              } else {
                ip2 = itemProperty;
                tip2 = tip;
              }
              if (tip2 === "array") {
                each(ip2, (v, i) => {
                  var matches = obj_matches_query_obj(v, query);
                  if (matches) {
                    foundItems.push(v);
                  }
                });
              }
              ;
            });
            var res2 = new _Collection(foundItems);
            return res2;
          }
        }
        // get seems like the way to get unique values.
        "get"() {
          var a = arguments;
          a.l = arguments.length;
          var sig = get_a_sig(a, 1);
          if (sig == "[n]" || sig == "[i]") {
            return this._arr[a[0]];
          }
          if (sig == "[s]") {
            var ix_sys = this.index_system;
            var res2;
            if (ix_sys) {
              var pui = ix_sys._primary_unique_index;
              res2 = pui.get(a[0])[0];
            }
            if (res2) {
              return res2;
            }
            return Data_Object.prototype.get.apply(this, a);
          }
        }
        "insert"(item2, pos) {
          this._arr.splice(pos, 0, item2);
          this.raise("change", {
            "name": "insert",
            "item": item2,
            "value": item2,
            "pos": pos
          });
        }
        swap(item2, replacement) {
          let r_parent = replacement.parent;
          let repl_pos = replacement.parent.content.remove(replacement);
          let i_parent = item2.parent;
          let item_pos = item2.parent.content.remove(item2);
          let item_index;
          i_parent.content.insert(replacement, item_pos);
          r_parent.content.insert(item2, repl_pos);
        }
        // may have efficiencies for adding and removing multiple items at once.
        //  can be sorted for insertion into index with more rapid algorithmic time.
        "remove"() {
          var a = arguments;
          a.l = arguments.length;
          var sig = get_a_sig(a, 1);
          if (sig === "[n]") {
            var pos = a[0];
            var item2 = this._arr[pos];
            var spliced_pos = pos;
            this._arr.splice(pos, 1);
            this._arr_idx--;
            var e = {
              "target": this,
              "value": item2,
              "position": spliced_pos,
              "name": "remove"
            };
            this.raise("change", e);
            return pos;
          } else if (sig === "[s]") {
            var key = a[0];
            var obj2 = this.index_system.find([
              ["value", key]
            ]);
            var my_id = this.__id;
            var item_pos_within_this = obj2[0]._relationships[my_id];
            this._arr.splice(item_pos_within_this, 1);
            for (var c2 = item_pos_within_this, l = this._arr.length; c2 < l; c2++) {
              var item2 = this._arr[c2];
              item2._relationships[my_id]--;
            }
            var e = {
              "target": this,
              "value": obj2[0],
              "position": item_pos_within_this,
              "name": "remove"
            };
            this.raise("change", e);
          } else {
            let item_index;
            const item3 = a[0];
            let arr = this._arr, l2 = arr.length;
            if (typeof item3 === "number") {
              item_index = item3;
            } else {
              let found = false, c3 = 0;
              while (!found && c3 < l2) {
                found = arr[c3] === item3;
                if (found) {
                  item_index = c3;
                }
                c3++;
              }
              if (is_defined2(item_index)) {
                return this.remove(item_index);
              }
            }
          }
        }
        "has"(obj_key) {
          if (this.get_index(obj_key) === void 0) {
            return false;
          } else {
            return true;
          }
        }
        "get_index"() {
          var a = arguments;
          a.l = arguments.length;
          var sig = get_a_sig(a, 1);
          if (sig === "[s]") {
            if (this.index_system) {
              return this.index_system.search(a[0]);
            } else {
              if (this._arr.length === 0) {
                return void 0;
              } else {
                for (let c2 = 0; c2 < this._arr.length; c2++) {
                  const item2 = this._arr[c2];
                  if (item2?.name === a[0]) {
                    return c2;
                  }
                }
                return void 0;
              }
            }
          } else {
            console.trace();
            throw "Expected [s]";
          }
        }
        // More fp way of indexing.
        "index_by"() {
          var a = arguments;
          a.l = arguments.length;
          var sig = get_a_sig(a, 1);
          console.log("Indexing not implemented (like this)");
          console.trace();
        }
        "push"(value) {
          const { silent } = this;
          let tv = tof2(value);
          let fn_index = this.fn_index;
          let idx_key, has_idx_key = false, pos;
          if (fn_index) {
            idx_key = fn_index(value);
            has_idx_key = true;
          }
          if (tv === "object" || tv === "function") {
            pos = this._arr.length;
            this._arr.push(value);
            this._arr_idx++;
            if (!silent) {
              const e = {
                "target": this,
                "item": value,
                "value": value,
                "position": pos,
                "name": "insert"
              };
              this.raise("change", e);
            }
          } else if (tv === "data_value") {
            pos = this._arr.length;
            this._arr.push(value);
            this._arr_idx++;
            if (!silent) {
              const e = {
                "target": this,
                "item": value,
                "value": value,
                "position": pos,
                "name": "insert"
              };
              this.raise("change", e);
            }
          } else if (tv === "collection") {
            pos = this._arr.length;
            this._arr.push(value);
            this._arr_idx++;
            if (!silent) {
              const e = {
                "target": this,
                "item": value,
                "value": value,
                "position": pos,
                "name": "insert"
              };
              this.raise("change", e);
            }
          } else if (tv === "data_object" || tv === "control" || tv === "data_model") {
            pos = this._arr.length;
            this._arr.push(value);
            this._arr_idx++;
            if (!silent) {
              const e = {
                "target": this,
                "item": value,
                "value": value,
                "position": pos,
                "name": "insert"
              };
              this.raise("change", e);
            }
          } else if (tv === "array") {
            const new_coll = new _Collection(value);
            pos = this._arr.length;
            this._arr.push(new_coll);
            if (!silent) {
              const e = {
                "target": this,
                "item": value,
                "value": value,
                "position": pos,
                "name": "insert"
              };
              this.raise("change", e);
            }
          }
          if (tv === "string" || tv === "number" || tv === "boolean" || tv === "null" || tv === "undefined") {
            const dv = new Data_Value2({
              "value": value
            });
            pos = this._arr.length;
            this._arr.push(dv);
            if (!silent) {
              const e = {
                "target": this,
                "item": value,
                "value": value,
                "position": pos,
                "name": "insert"
              };
              this.raise("change", e);
            }
          }
          if (has_idx_key) {
            this.index.put(idx_key, pos);
          }
          return value;
        }
        "load_array"(arr) {
          for (var c2 = 0, l = arr.length; c2 < l; c2++) {
            this.push(arr[c2]);
          }
          this.raise("load");
        }
        "values"() {
          var a = arguments;
          a.l = a.length;
          if (a.l === 0) {
            return this._arr;
          } else {
            var stack = new Error().stack;
            throw "not yet implemented";
          }
        }
        "value"() {
          const res2 = [];
          this.each((v, i) => {
            if (v && typeof v.value !== "undefined") {
              res2.push(v.value);
            } else {
              res2.push(v);
            }
          });
          return res2;
        }
      };
      var p = Collection.prototype;
      p.add = function(value) {
        return this.push(value);
      };
      module.exports = Collection;
    }
  });

  // node_modules/lang-tools/doubly-linked-list.js
  var require_doubly_linked_list = __commonJS({
    "node_modules/lang-tools/doubly-linked-list.js"(exports, module) {
      var Node = class {
        constructor(spec) {
          this.neighbours = spec.neighbours || [];
          this.value = spec.value;
        }
        "previous"() {
          return this.neighbours[0];
        }
        "next"() {
          return this.neighbours[1];
        }
      };
      var Doubly_Linked_List = class {
        constructor(spec) {
          this.first = null;
          this.last = null;
          this.length = 0;
        }
        "each_node"(callback) {
          var node = this.first;
          var ctu = true;
          var stop = function() {
            ctu = false;
          };
          while (node && ctu) {
            callback(node, stop);
            node = node.neighbours[1];
          }
        }
        "each"(callback) {
          this.each_node(function(node, stop) {
            callback(node.value, stop);
          });
        }
        "remove"(node) {
          if (node.neighbours[0]) {
            node.neighbours[0].neighbours[1] = node.neighbours[1];
          } else {
            this.first = node.neighbours[1];
          }
          if (node.neighbours[1]) {
            node.neighbours[1].neighbours[0] = node.neighbours[0];
          } else {
            this.last = node.neighbours[0];
          }
          node.neighbours = [];
          if (node.parent == this) {
            delete node.parent;
            this.length--;
          }
        }
        // check to see if the item is a 'node' object.
        //  if it is, can insert it as a node, otherwise create the node object and insert it.
        //   a bit like wrapping values in Data_Value.
        "insert_beginning"(val) {
          if (val instanceof Node) {
            if (this.first == null) {
              this.first = val;
              this.last = val;
              val.neighbours = [];
              if (val.parent != this) {
                val.parent = this;
                this.length++;
              }
            } else {
              this.insert_before(val, this.first);
            }
            return val;
          } else {
            var node = new Node({ "value": val });
            return this.insert_beginning(node);
          }
        }
        // could use a nodify function.
        //  or ensure_data_wrapper
        "insert_before"(val, node) {
          if (val instanceof Node) {
            val.neighbours = [node.neighbours[0], node];
            if (node.neighbours[0] == null) {
              this.first = val;
            } else {
              node.neighbours[0].neighbours[1] = val;
            }
            node.neighbours[0] = val;
            if (val.parent != this) {
              val.parent = this;
              this.length++;
            }
            return val;
          } else {
            var new_node = new Node({ "value": val });
            return this.insert_before(new_node, node);
          }
        }
        "insert_after"(val, node) {
          if (val instanceof Node) {
            val.neighbours = [node, node.neighbours[1]];
            if (node.neighbours[1] == null) {
              this.last = val;
            } else {
              node.neighbours[1].neighbours[0] = val;
            }
            node.neighbours[1] = val;
            if (val.parent != this) {
              val.parent = this;
              this.length++;
            }
            return val;
          } else {
            var new_node = new Node({ "value": val });
            return this.insert_after(new_node, node);
          }
        }
        // not wrapping the item in a node?
        // want one where we are not pushing nodes, but items stored in nodes.
        //  Perhaps this is a Data_Value?
        // Or a doubly_linked_node.
        // Doubly_Linked_Node could take the form [prev, item, next]
        //  [prev, item, key, next]? probably not
        //  Maybe we could put more private variables, such as 'neighbours' as a var within the init statement.
        "push"(val) {
          if (val instanceof Node) {
            if (this.last == null) {
              this.insert_beginning(val);
            } else {
              return this.insert_after(val, this.last);
            }
            return val;
          } else {
            var new_node = new Node({ "value": val });
            return this.push(new_node);
          }
        }
      };
      Doubly_Linked_List.Node = Node;
      module.exports = Doubly_Linked_List;
    }
  });

  // node_modules/lang-tools/ordered-kvs.js
  var require_ordered_kvs = __commonJS({
    "node_modules/lang-tools/ordered-kvs.js"(exports, module) {
      var Doubly_Linked_List = require_doubly_linked_list();
      var Ordered_KVS = class {
        constructor() {
          this.dll = new Doubly_Linked_List();
          this.node_map = {};
        }
        "length"() {
          return this.dll.length;
        }
        "put"(key, value) {
          return this.push(key, value);
        }
        "get"(key) {
          var kvs_node = this.node_map[key];
          if (kvs_node) {
            return kvs_node.value;
          } else {
            return void 0;
          }
        }
        "push"(key, value) {
          var node = this.dll.push(value);
          node.key = key;
          this.node_map[key] = node;
        }
        "out"(key) {
          var node = this.node_map[key];
          delete this.node_map[key];
          this.dll.remove(node);
        }
        "each"(callback) {
          this.dll.each_node(function(node, stop) {
            callback(node.key, node.value, stop);
          });
        }
        "values"() {
          var res2 = [];
          this.each(function(key, value) {
            res2.push(value);
          });
          return res2;
        }
        "keys"() {
          var res2 = [];
          this.each(function(key, value) {
            res2.push(key);
          });
          return res2;
        }
        "keys_and_values"() {
          var res2 = [];
          this.each(function(key, value) {
            res2.push([key, value]);
          });
          return res2;
        }
        // will not need to deal with nodes on the user level.
        // want to be able to add and remove items, normally items will get pushed to the end of the list.
        // will provide a key and value in order to do this.
      };
      module.exports = Ordered_KVS;
    }
  });

  // node_modules/lang-tools/ordered-string-list.js
  var require_ordered_string_list = __commonJS({
    "node_modules/lang-tools/ordered-string-list.js"(exports, module) {
      var Ordered_String_List = class {
        constructor() {
          var arr = [];
          var dict_indexes = {};
          var reindex_dict_indexes = function() {
            dict_indexes = {};
            for (var c2 = 0, l = arr.length; c2 < l; c2++) {
              dict_indexes[arr[c2]] = c2;
            }
          };
          this.has = function(value) {
            return typeof dict_indexes[value] !== "undefined";
          };
          this.put = function(value) {
            if (this.has(value)) {
            } else {
              var index = arr.length;
              arr.push(value);
              dict_indexes[value] = index;
            }
          };
          this.out = function(value) {
            if (this.has(value)) {
              var idx = dict_indexes[value];
              arr.splice(idx, 1);
              delete dict_indexes[value];
              for (var c2 = idx, l = arr.length; c2 < l; c2++) {
                var i = arr[c2];
                dict_indexes[i]--;
              }
            }
          };
          this.toggle = function(value) {
            if (this.has(value)) {
              this.out(value);
            } else {
              this.put(value);
            }
          };
          this.move_value = function(value, index) {
            if (this.has(value) && dict_indexes[value] != index) {
              var old_index = dict_indexes[value];
              arr.splice(old_index, 1);
              arr.splice(index, 0, value);
              if (index < old_index) {
                dict_indexes[arr[index]] = index;
                for (var c2 = index + 1; c2 <= old_index; c2++) {
                  dict_indexes[arr[c2]]++;
                }
              } else if (index > old_index) {
                dict_indexes[arr[index]] = index;
                for (var c2 = old_index; c2 < index; c2++) {
                  dict_indexes[arr[c2]]--;
                }
              }
            }
          };
          this._index_scan = function() {
            for (var c2 = 0, l = arr.length; c2 < l; c2++) {
              console.log("c " + c2 + " arr[c] " + arr[c2] + " idx " + dict_indexes[arr[c2]]);
            }
            ;
          };
          this.toString = function() {
            var res2 = arr.join(" ");
            return res2;
          };
          this.toString.stringify = true;
          this.set = (function(val) {
            if (typeof val === "string") {
              arr = val.split(" ");
              reindex_dict_indexes();
            }
          });
          var a = arguments;
          if (a.length == 1) {
            var spec = a[0];
            if (typeof spec === "string") {
              this.set(spec);
            }
          }
        }
      };
      module.exports = Ordered_String_List;
    }
  });

  // node_modules/lang-tools/Data_Model/Collection.js
  var require_Collection2 = __commonJS({
    "node_modules/lang-tools/Data_Model/Collection.js"(exports, module) {
      module.exports = require_Collection();
    }
  });

  // node_modules/lang-tools/util.js
  var require_util = __commonJS({
    "node_modules/lang-tools/util.js"(exports, module) {
      var jsgui = require_lib_lang_mini();
      var Collection = require_Collection2();
      var j = jsgui;
      var each = j.each;
      var tof2 = j.tof;
      var atof = j.atof;
      var is_defined2 = j.is_defined;
      var fp = j.fp;
      var arrayify = j.arrayify;
      var mapify = j.mapify;
      var get_item_sig = j.get_item_sig;
      var vectorify = function(n_fn) {
        var fn_res = fp(function(a, sig) {
          if (a.l > 2) {
            var res2 = a[0];
            for (var c2 = 1, l = a.l; c2 < l; c2++) {
              res2 = fn_res(res2, a[c2]);
            }
            return res2;
          } else {
            if (sig == "[n,n]") {
              return n_fn(a[0], a[1]);
            } else {
              var ats = atof(a);
              if (ats[0] == "array") {
                if (ats[1] == "number") {
                  var res2 = [], n = a[1];
                  each(a[0], function(v, i) {
                    res2.push(fn_res(v, n));
                  });
                  return res2;
                }
                if (ats[1] == "array") {
                  if (ats[0].length != ats[1].length) {
                    throw "vector array lengths mismatch";
                  } else {
                    var res2 = [], arr2 = a[1];
                    each(a[0], function(v, i) {
                      res2.push(fn_res(v, arr2[i]));
                    });
                    return res2;
                  }
                }
              }
            }
          }
        });
        return fn_res;
      };
      var n_add = function(n1, n2) {
        return n1 + n2;
      };
      var n_subtract = function(n1, n2) {
        return n1 - n2;
      };
      var n_multiply = function(n1, n2) {
        return n1 * n2;
      };
      var n_divide = function(n1, n2) {
        return n1 / n2;
      };
      var v_add = vectorify(n_add);
      var v_subtract = vectorify(n_subtract);
      var v_multiply = vectorify(n_multiply);
      var v_divide = vectorify(n_divide);
      var vector_magnitude = function(vector) {
        var res2 = Math.sqrt(Math.pow(vector[0], 2) + Math.pow(vector[1], 2));
        return res2;
      };
      var distance_between_points = function(points) {
        var offset = v_subtract(points[1], points[0]);
        return vector_magnitude(offset);
      };
      var execute_on_each_simple = function(items, fn) {
        var res2 = [], that2 = this;
        each(items, function(i, v) {
          res2.push(fn.call(that2, i));
        });
        return res2;
      };
      var filter_map_by_regex = function(map, regex) {
        var res2 = {};
        each(map, function(v, i) {
          if (i.match(regex)) {
            res2[i] = v;
          }
        });
        return res2;
      };
      var npx = arrayify(function(value) {
        var res2, a = arguments, t = tof2(a[0]);
        if (t === "string") {
          res2 = a[0];
        } else if (t === "number") {
          res2 = a[0] + "px";
        }
        return res2;
      });
      var no_px = arrayify(fp(function(a, sig) {
        var re = /px$/, res2;
        if (sig == "[s]" && re.test(a[0])) {
          res2 = parseInt(a[0]);
        } else {
          res2 = a[0];
        }
        ;
        return res2;
      }));
      var arr_ltrb = ["left", "top", "right", "bottom"];
      var str_arr_mapify = function(fn) {
        var res2 = fp(function(a, sig) {
          if (a.l == 1) {
            if (sig == "[s]") {
              var s_pn = a[0].split(" ");
              if (s_pn.length > 1) {
                return res2.call(this, s_pn);
              } else {
                return fn.call(this, a[0]);
              }
            }
            if (tof2(a[0]) == "array") {
              var res22 = {}, that2 = this;
              each(a[0], function(i, v) {
                res22[v] = fn.call(that2, v);
              });
              return res22;
            }
          }
        });
        return res2;
      };
      var arr_hex_chars = [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "A",
        "B",
        "C",
        "D",
        "E",
        "F"
      ];
      var dict_hex_to_bin = {
        "0": 0,
        "1": 1,
        "2": 2,
        "3": 3,
        "4": 4,
        "5": 5,
        "6": 6,
        "7": 7,
        "8": 8,
        "9": 9,
        "A": 10,
        "B": 11,
        "C": 12,
        "D": 13,
        "E": 14,
        "F": 15
      };
      var str_hex_to_int = function(str_hex) {
        str_hex = str_hex.toUpperCase();
        var i = str_hex.length;
        var res2 = 0, exp = 1;
        while (i--) {
          var i_part = dict_hex_to_bin[str_hex.charAt(i)];
          var ip2 = i_part * exp;
          res2 = res2 + ip2;
          exp = exp * 16;
        }
        ;
        return res2;
      };
      var byte_int_to_str_hex_2 = function(byte_int) {
        var a = Math.floor(byte_int / 16), b = byte_int % 16, sa = arr_hex_chars[a], sb = arr_hex_chars[b], res2 = sa + sb;
        return res2;
      };
      var arr_rgb_to_str_hex_6 = function(arr_rgb) {
        var r = byte_int_to_str_hex_2(arr_rgb[0]);
        var res2 = r + byte_int_to_str_hex_2(arr_rgb[1]) + byte_int_to_str_hex_2(arr_rgb[2]);
        return res2;
      };
      var arr_rgb_to_css_hex_6 = function(arr_rgb) {
        return "#" + arr_rgb_to_str_hex_6(arr_rgb);
      };
      var input_processors = {};
      var validators = {
        "number": function(value) {
          return tof2(value) == "number";
        }
      };
      var extend = jsgui.extend;
      var fp = jsgui.fp;
      var stringify = jsgui.stringify;
      var tof2 = jsgui.tof;
      var data_types_info = {
        "color": ["indexed_array", [
          ["red", "number"],
          ["green", "number"],
          ["blue", "number"]
        ]],
        "oltrb": ["optional_array", ["left", "top", "right", "bottom"]]
      };
      jsgui.data_types_info = data_types_info;
      var color_preprocessor_parser = fp(function(a, sig) {
        if (sig == "[s]") {
          var input = a[0];
          var rx_hex = /(#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2}))/;
          var m = input.match(rx_hex);
          if (m) {
            var r = jsgui.str_hex_to_int(m[2]);
            var g = jsgui.str_hex_to_int(m[3]);
            var b = jsgui.str_hex_to_int(m[4]);
            var res2 = [r, g, b];
            return res2;
          }
        }
      });
      input_processors["optional_array"] = fp(function(a, sig) {
        if (a.l == 2) {
          var oa_params = a[0], input = a[1];
          if (tof2(input) == "array") {
            if (input.length <= oa_params.length) {
              return input;
            }
          } else {
            return input;
          }
        }
        if (a.l == 3) {
          var oa_params = a[0], items_data_type_name = a[1], input = a[2];
          var input_processor_for_items = jsgui.input_processors[items_data_type_name];
          if (tof2(input) == "array") {
            if (input.length <= oa_params.length) {
              var res2 = [];
              each(input, function(i, v) {
                res2.push(input_processor_for_items(v));
              });
              return res2;
            }
          } else {
            return input_processor_for_items(input);
          }
        }
      });
      input_processors["indexed_array"] = fp(function(a, sig) {
        console.log("indexed_array sig", sig);
        if (a.l == 2) {
          var ia_params = a[0], input = a[1];
          if (tof2(input) == "array") {
            if (input.length <= ia_params.length) {
              return input;
            }
          }
        }
        if (a.l == 3) {
          var ia_params = a[0], items_data_type_name = a[1], input = a[2];
          var input_processor_for_items = jsgui.input_processors[items_data_type_name];
          if (tof2(input) == "array") {
            if (input.length <= ia_params.length) {
              var res2 = [];
              each(input, function(i, v) {
                res2.push(input_processor_for_items(v));
              });
              return res2;
            }
          }
        }
      });
      input_processors["n_units"] = function(str_units, input) {
        if (tof2(input) == "number") {
          return [input, str_units];
        }
        if (tof2(input) == "string") {
          var rx_n_units = /^(\d+)(\w+)$/;
          var match = input.match(rx_n_units);
          if (match) {
            return [parseInt(match[1]), match[2]];
          }
          rx_n_units = /^(\d*\.\d+)(\w+)$/;
          match = input.match(rx_n_units);
          if (match) {
            return [parseFloat(match[1]), match[2]];
          }
        }
      };
      var dti_color = jsgui.data_types_info["color"];
      input_processors["color"] = function(input) {
        var res2;
        console.log("processing color input: " + stringify(input));
        var input_sig = get_item_sig(input, 2);
        if (input_sig == "[s]") {
          res2 = color_preprocessor_parser(input[0]);
        }
        if (input_sig == "[n,n,n]") {
          res2 = input;
        }
        console.log("res " + stringify(res2));
        console.log("color input_processors output", res2);
        return res2;
      };
      jsgui.output_processors["color"] = function(jsgui_color) {
        var res2 = jsgui.arr_rgb_to_css_hex_6(jsgui_color);
        return res2;
      };
      var group = function() {
        var a = arguments;
        if (a.length == 1 && tof2(a[0]) == "array") {
          return group.apply(this, a[0]);
        }
        var res2;
        for (var c2 = 0, l = a.length; c2 < l; c2++) {
          var item2 = a[c2];
          if (c2 == 0) {
            res2 = new Collection({ "context": item2.context });
          }
          res2.push(item2);
        }
        var C = a[0].constructor;
        var p = C.prototype;
        var i;
        for (i in p) {
          var tpi = tof2(p[i]);
          if (tpi == "function") {
            (function(i2) {
              if (i2 != "each" && i2 != "get" && i2 != "add_event_listener") {
                res2[i2] = function() {
                  var a2 = arguments;
                  res2.each(function(v, i22) {
                    v[i2].apply(v, a2);
                  });
                };
              }
            })(i);
          }
        }
        return res2;
      };
      var true_vals = function(map) {
        var res2 = [];
        for (var i in map) {
          if (map[i]) res2.push(map[i]);
        }
        return res2;
      };
      var Ui16toUi32 = (ui16) => {
        let res2 = new Uint32Array(ui16.length / 2);
        let dv = new DataView(ui16.buffer);
        let l = ui16.length;
        let hl = l / 2;
        let resw = 0;
        for (let c2 = 0; c2 < hl; c2++) {
          res2[resw++] = dv.getUint32(c2 * 4);
        }
        return res2;
      };
      var Ui32toUi16 = (ui32) => {
        let res2 = new Uint16Array(ui32.length * 2);
        let dv = new DataView(ui32.buffer);
        let l = ui32.length;
        let resw = 0;
        for (let c2 = 0; c2 < l; c2++) {
          res2[resw++] = dv.getUint16(c2 * 4 + 2);
          res2[resw++] = dv.getUint16(c2 * 4);
        }
        console.log("res", res2);
        return res2;
      };
      var util = {
        "Ui16toUi32": Ui16toUi32,
        "Ui32toUi16": Ui32toUi16,
        "vectorify": vectorify,
        "v_add": v_add,
        "v_subtract": v_subtract,
        "v_multiply": v_multiply,
        "v_divide": v_divide,
        "vector_magnitude": vector_magnitude,
        "distance_between_points": distance_between_points,
        "execute_on_each_simple": execute_on_each_simple,
        "mapify": mapify,
        "filter_map_by_regex": filter_map_by_regex,
        "atof": atof,
        "npx": npx,
        "no_px": no_px,
        "str_arr_mapify": str_arr_mapify,
        "arr_ltrb": arr_ltrb,
        "true_vals": true_vals,
        "validators": validators,
        "__data_id_method": "lazy",
        "str_hex_to_int": str_hex_to_int,
        "arr_rgb_to_css_hex_6": arr_rgb_to_css_hex_6,
        "group": group
      };
      module.exports = util;
    }
  });

  // node_modules/lang-tools/lang.js
  var require_lang = __commonJS({
    "node_modules/lang-tools/lang.js"(exports, module) {
      var lang_mini = require_lib_lang_mini();
      var collective = require_collective();
      var { more_general_equals } = require_tools();
      lang_mini.equals = more_general_equals;
      lang_mini.collective = collective;
      lang_mini.collect = collective;
      var Evented_Class = lang_mini.Evented_Class;
      var B_Plus_Tree = require_b_plus_tree();
      var Collection = require_Collection();
      var Data_Object = require_Data_Object();
      var Data_Value2 = require_Data_Value();
      var Data_Model = require_Data_Model();
      var Immutable_Data_Value = require_Immutable_Data_Value();
      var Immutable_Data_Model = require_Immutable_Data_Model();
      var Doubly_Linked_List = require_doubly_linked_list();
      var Ordered_KVS = require_ordered_kvs();
      var Ordered_String_List = require_ordered_string_list();
      var Sorted_KVS = require_sorted_kvs();
      var util = require_util();
      lang_mini.util = util;
      lang_mini.B_Plus_Tree = B_Plus_Tree;
      lang_mini.Collection = Collection;
      lang_mini.Data_Object = Data_Object;
      lang_mini.Data_Value = Data_Value2;
      lang_mini.Immutable_Data_Model = Immutable_Data_Model;
      lang_mini.Immutable_Data_Value = Immutable_Data_Value;
      lang_mini.Data_Model = Data_Model;
      lang_mini.Doubly_Linked_List = Doubly_Linked_List;
      lang_mini.Ordered_KVS = Ordered_KVS;
      lang_mini.Ordered_String_List = Ordered_String_List;
      lang_mini.Sorted_KVS = Sorted_KVS;
      var ec = new Evented_Class();
      Object.assign(ec, lang_mini);
      module.exports = ec;
    }
  });

  // src/deprecated-ui/express/public/components/AnalysisStartForm.js
  var import_lang_tools = __toESM(require_lang());
  function createAnalysisStartForm(container, options = {}) {
    if (!container) throw new Error("createAnalysisStartForm requires container element");
    const { onStart, onPreview } = options;
    const form = document.createElement("form");
    form.className = "analysis-start-form";
    form.innerHTML = `
    <div class="analysis-start-form__header">
      <h3 class="analysis-start-form__title">Start New Analysis</h3>
      <button type="button" class="analysis-start-form__preview-btn" title="Preview how many articles will be analyzed">
        Preview Count
      </button>
    </div>
    
    <div class="analysis-start-form__preview" style="display:none">
      <div class="analysis-start-form__preview-content">
        <strong class="analysis-start-form__preview-count">\u2014</strong>
        <span class="analysis-start-form__preview-label">articles will be analyzed</span>
      </div>
    </div>
    
    <div class="analysis-start-form__fields">
      <div class="analysis-start-form__field">
        <label for="analysisVersion">Analysis Version</label>
        <input 
          type="number" 
          id="analysisVersion" 
          name="analysisVersion" 
          value="1" 
          min="1" 
          step="1"
          title="Analysis algorithm version"
        />
      </div>
      
      <div class="analysis-start-form__field">
        <label for="pageLimit">Page Limit</label>
        <input 
          type="number" 
          id="pageLimit" 
          name="pageLimit" 
          placeholder="All pages" 
          min="1"
          title="Maximum number of pages to analyze (blank = all)"
        />
      </div>
      
      <div class="analysis-start-form__field">
        <label for="domainLimit">Domain Limit</label>
        <input 
          type="number" 
          id="domainLimit" 
          name="domainLimit" 
          placeholder="All domains" 
          min="1"
          title="Maximum number of domains to analyze (blank = all)"
        />
      </div>
    </div>
    
    <div class="analysis-start-form__flags">
      <label class="analysis-start-form__checkbox">
        <input type="checkbox" name="skipPages" />
        <span>Skip page analysis</span>
      </label>
      
      <label class="analysis-start-form__checkbox">
        <input type="checkbox" name="skipDomains" />
        <span>Skip domain analysis</span>
      </label>
      
      <label class="analysis-start-form__checkbox">
        <input type="checkbox" name="dryRun" />
        <span>Dry run (don't save changes)</span>
      </label>
      
      <label class="analysis-start-form__checkbox">
        <input type="checkbox" name="verbose" />
        <span>Verbose logging</span>
      </label>
    </div>
    
    <div class="analysis-start-form__actions">
      <button type="submit" class="analysis-start-form__submit-btn">
        Start Analysis
      </button>
    </div>
    
    <div class="analysis-start-form__status" style="display:none">
      <span class="analysis-start-form__status-text"></span>
    </div>
  `;
    container.appendChild(form);
    const previewBtn = form.querySelector(".analysis-start-form__preview-btn");
    const previewDiv = form.querySelector(".analysis-start-form__preview");
    const previewCount = form.querySelector(".analysis-start-form__preview-count");
    const submitBtn = form.querySelector(".analysis-start-form__submit-btn");
    const statusDiv = form.querySelector(".analysis-start-form__status");
    const statusText = form.querySelector(".analysis-start-form__status-text");
    function getFormData() {
      const formData = new FormData(form);
      const data = {};
      const version = formData.get("analysisVersion");
      if (version) data.analysisVersion = parseInt(version, 10);
      const pageLimit = formData.get("pageLimit");
      if (pageLimit) data.pageLimit = parseInt(pageLimit, 10);
      const domainLimit = formData.get("domainLimit");
      if (domainLimit) data.domainLimit = parseInt(domainLimit, 10);
      data.skipPages = formData.get("skipPages") === "on";
      data.skipDomains = formData.get("skipDomains") === "on";
      data.dryRun = formData.get("dryRun") === "on";
      data.verbose = formData.get("verbose") === "on";
      return data;
    }
    function showStatus(message, type = "info") {
      if (statusDiv && statusText) {
        statusText.textContent = message;
        statusDiv.style.display = "block";
        statusDiv.setAttribute("data-type", type);
        if (type === "success") {
          setTimeout(() => {
            statusDiv.style.display = "none";
          }, 5e3);
        }
      }
    }
    function hideStatus() {
      if (statusDiv) {
        statusDiv.style.display = "none";
      }
    }
    if (previewBtn && typeof onPreview === "function") {
      previewBtn.addEventListener("click", async () => {
        const data = getFormData();
        previewBtn.disabled = true;
        previewBtn.textContent = "Loading...";
        hideStatus();
        try {
          const count = await onPreview(data);
          if (previewDiv && previewCount) {
            previewCount.textContent = count.toLocaleString();
            previewDiv.style.display = "block";
          }
        } catch (err) {
          showStatus(`Preview failed: ${err.message || err}`, "error");
        } finally {
          previewBtn.disabled = false;
          previewBtn.textContent = "Preview Count";
        }
      });
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!onStart || typeof onStart !== "function") return;
      const data = getFormData();
      submitBtn.disabled = true;
      submitBtn.textContent = "Starting...";
      hideStatus();
      try {
        await onStart(data);
        showStatus("Analysis started successfully!", "success");
        if (previewDiv) {
          previewDiv.style.display = "none";
        }
      } catch (err) {
        showStatus(`Start failed: ${err.message || err}`, "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Start Analysis";
      }
    });
    return {
      /**
       * Reset form to defaults
       */
      reset() {
        form.reset();
        hideStatus();
        if (previewDiv) {
          previewDiv.style.display = "none";
        }
      },
      /**
       * Enable/disable form
       */
      setEnabled(enabled) {
        const inputs = form.querySelectorAll("input, button");
        inputs.forEach((input) => {
          input.disabled = !enabled;
        });
      },
      /**
       * Get form element
       */
      getElement() {
        return form;
      },
      /**
       * Show custom status
       */
      showStatus,
      /**
       * Hide status
       */
      hideStatus
    };
  }
})();
//# sourceMappingURL=AnalysisStartForm.js.map
