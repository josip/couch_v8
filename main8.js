// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License.  You may obtain a copy
// of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  See the
// License for the specific language governing permissions and limitations under
// the License.

var cmd;
var funs = [];        // holds functions used for computation
var map_results = []; // holds temporary emitted values during doc map

var sandbox = null;

// emit() and sum() are implemented in C++

log = function(message) {
  print(toJSON({log: toJSON(message)}));
}

// mimeparse.js
// http://code.google.com/p/mimeparse/
// Code with comments: http://mimeparse.googlecode.com/svn/trunk/mimeparse.js
// Tests: http://mimeparse.googlecode.com/svn/trunk/mimeparse-js-test.html
// Ported from version 0.1.2

var Mimeparse = (function() {
  function strip(string) {
    return string.replace(/^\s+/, '').replace(/\s+$/, '')
  };
  function parseRanges(ranges) {
    var parsedRanges = [], rangeParts = ranges.split(",");
    for (var i=0; i < rangeParts.length; i++) {
      parsedRanges.push(publicMethods.parseMediaRange(rangeParts[i]))
    };
    return parsedRanges;
  };
  var publicMethods = {
    parseMimeType : function(mimeType) {
      var fullType, typeParts, params = {}, parts = mimeType.split(';');
      for (var i=0; i < parts.length; i++) {
        var p = parts[i].split('=');
        if (p.length == 2) {
          params[strip(p[0])] = strip(p[1]);
        }
      };
      fullType = parts[0].replace(/^\s+/, '').replace(/\s+$/, '');
      if (fullType == '*') fullType = '*/*';
      typeParts = fullType.split('/');
      return [typeParts[0], typeParts[1], params];
    },
    parseMediaRange : function(range) {
      var q, parsedType = this.parseMimeType(range);
      if (!parsedType[2]['q']) {
        parsedType[2]['q'] = '1';
      } else {
        q = parseFloat(parsedType[2]['q']);
        if (isNaN(q)) {
          parsedType[2]['q'] = '1';
        } else if (q > 1 || q < 0) {
          parsedType[2]['q'] = '1';
        }
      }
      return parsedType;
    },
    fitnessAndQualityParsed : function(mimeType, parsedRanges) {
      var bestFitness = -1, bestFitQ = 0, target = this.parseMediaRange(mimeType);
      var targetType = target[0], targetSubtype = target[1], targetParams = target[2];

      for (var i=0; i < parsedRanges.length; i++) {
        var parsed = parsedRanges[i];
        var type = parsed[0], subtype = parsed[1], params = parsed[2];
        if ((type == targetType || type == "*" || targetType == "*") &&
          (subtype == targetSubtype || subtype == "*" || targetSubtype == "*")) {
          var matchCount = 0;
          for (param in targetParams) {
            if (param != 'q' && params[param] && params[param] == targetParams[param]) {
              matchCount += 1;
            }
          }

          var fitness = (type == targetType) ? 100 : 0;
          fitness += (subtype == targetSubtype) ? 10 : 0;
          fitness += matchCount;

          if (fitness > bestFitness) {
            bestFitness = fitness;
            bestFitQ = params["q"];
          }
        }
      };
      return [bestFitness, parseFloat(bestFitQ)];
    },
    qualityParsed : function(mimeType, parsedRanges) {
      return this.fitnessAndQualityParsed(mimeType, parsedRanges)[1];
    },
    quality : function(mimeType, ranges) {
      return this.qualityParsed(mimeType, parseRanges(ranges));
    },

    // Takes a list of supported mime-types and finds the best
    // match for all the media-ranges listed in header. The value of
    // header must be a string that conforms to the format of the
    // HTTP Accept: header. The value of 'supported' is a list of
    // mime-types.
    //
    // >>> bestMatch(['application/xbel+xml', 'text/xml'], 'text/*;q=0.5,*/*; q=0.1')
    // 'text/xml'
    bestMatch : function(supported, header) {
      var parsedHeader = parseRanges(header);
      var weighted = [];
      for (var i=0; i < supported.length; i++) {
        weighted.push([publicMethods.fitnessAndQualityParsed(supported[i], parsedHeader), supported[i]])
      };
      weighted.sort();
      return weighted[weighted.length-1][0][1] ? weighted[weighted.length-1][1] : '';
    }
  }
  return publicMethods;
})();

// this function provides a shortcut for managing responses by Accept header
respondWith = function(req, responders) {
  var accept = req.headers["Accept"];
  if (accept) {
    var provides = [];
    for (key in responders) {
      if (mimesByKey[key]) {
        provides = provides.concat(mimesByKey[key]);
      }
    }
    var bestMime = Mimeparse.bestMatch(provides, accept);
    var bestKey = keysByMime[bestMime];
    var rFunc = responders[bestKey];
    if (rFunc) {
      var resp = rFunc();
      resp["headers"] = resp["headers"] || {};
      resp["headers"]["Content-Type"] = bestMime;
      return resp;
    }
  }
  if (responders.fallback) {
    return responders[responders.fallback]();
  }
  throw({code:406, body:"Not Acceptable: "+accept});
}

// whoever registers last wins.
mimesByKey = {};
keysByMime = {};
registerType = function() {
  var mimes = [], key = arguments[0];
  for (var i=1; i < arguments.length; i++) {
    mimes.push(arguments[i]);
  };
  mimesByKey[key] = mimes;
  var i = mimes.length;
  while(i--) {
    keysByMime[mimes[i]] = key;
  };
};

// Some default types
// Ported from Ruby on Rails
// Build list of Mime types for HTTP responses
// http://www.iana.org/assignments/media-types/
// http://dev.rubyonrails.org/svn/rails/trunk/actionpack/lib/action_controller/mime_types.rb

registerType("all", "*/*");
registerType("text", "text/plain", "txt");
registerType("html", "text/html", "application/xhtml+xml", "xhtml");
registerType("xml", "application/xml", "text/xml", "application/x-xml");
// http://www.ietf.org/rfc/rfc4627.txt
registerType("json", "application/json", "text/x-json");
registerType("js", "text/javascript", "application/javascript", "application/x-javascript");
registerType("css", "text/css");
registerType("ics", "text/calendar");
registerType("csv", "text/csv");
registerType("rss", "application/rss+xml");
registerType("atom", "application/atom+xml");
registerType("yaml", "application/x-yaml", "text/yaml");
// just like Rails
registerType("multipart_form", "multipart/form-data");
registerType("url_encoded_form", "application/x-www-form-urlencoded");

// ok back to business.

try {
  // if possible, use evalcx (not always available)
  sandbox = evalcx('');
  sandbox.emit = emit;
  sandbox.sum = sum;
  sandbox.log = log;
  sandbox.respondWith = respondWith;
  sandbox.registerType = registerType;
} catch (e) {}

// Commands are in the form of json arrays:
// ["commandname",..optional args...]\n
//
// Responses are json values followed by a new line ("\n")

function onInput(cmd) {
  cmd = eval(cmd);

  try {
    switch (cmd[0]) {
      case "reset":
        // clear the globals and run gc
        funs = [];
        gc();
        print("true"); // indicates success
        break;
      case "add_fun":
        // The second arg is a string that will compile to a function.
        // and then we add it to funs array
        funs.push(compileFunction(cmd[1]));
        print("true");
        break;
      case "map_doc":
        // The second arg is a document. We compute all the map functions against
        // it.
        //
        // Each function can output multiple keys value, pairs for each document
        //
        // Example output of map_doc after three functions set by add_fun cmds:
        // [
        //  [["Key","Value"]],                    <- fun 1 returned 1 key value
        //  [],                                   <- fun 2 returned 0 key values
        //  [["Key1","Value1"],["Key2","Value2"]] <- fun 3 returned 2 key values
        // ]
        //
        var doc = cmd[1];
        /*
        Immutable document support temporarily removed.

        Removed because the seal function no longer works on JS 1.8 arrays,
        instead returning an error. The sealing is meant to prevent map
        functions from modifying the same document that is passed to other map
        functions. However, only map functions in the same design document are
        run together, so we have a reasonable expectation they can trust each
        other. Any map fun that can't be trusted can be placed in its own
        design document, and it cannot affect other map functions.

        recursivelySeal(doc); // seal to prevent map functions from changing doc
        */
        var buf = [];
        for (var i = 0; i < funs.length; i++) {
          map_results = [];
          try {
            funs[i](doc);
            buf.push(toJSON(map_results));
          } catch (err) {
            if (err == "fatal_error") {
              // Only if it's a "fatal_error" do we exit. What's a fatal error?
              // That's for the query to decide.
              //
              // This will make it possible for queries to completely error out,
              // by catching their own local exception and rethrowing a
              // fatal_error. But by default if they don't do error handling we
              // just eat the exception and carry on.
              throw {error: "map_runtime_error",
                  reason: "function raised fatal exception"};
            }
            print(toJSON({log: "function raised exception (" + err
              + ") with doc._id " + doc._id}));
            buf.push("[]");
          }
        }
        print("[" + buf.join(", ") + "]");
        break;

      case "rereduce":
      case "reduce":
        {
        var keys = null;
        var values = null;
        var reduceFuns = cmd[1];
        var rereduce = false;

        if (cmd[0] == "reduce") {
          var kvs = cmd[2];
          keys = new Array(kvs.length);
          values = new Array(kvs.length);
          for(var i = 0; i < kvs.length; i++) {
              keys[i] = kvs[i][0];
              values[i] = kvs[i][1];
          }
        } else {
          values = cmd[2];
          rereduce = true;
        }

        var i = j = reduceFuns.length;
        while(i--) {
          reduceFuns[i] = compileFunction(reduceFuns[i]);
        }

        var reductions = new Array(funs.length);
        for(var i = 0; i < j; i++) {
          try {
            reductions[i] = reduceFuns[i](keys, values, rereduce);
          } catch (err) {
            if (err == "fatal_error") {
              throw {error: "reduce_runtime_error",
                  reason: "function raised fatal exception"};
            }
            print(toJSON({log: "function raised exception (" + err + ")"}));
            reductions[i] = null;
          }
        }
        print("[true," + toJSON(reductions) + "]");
        }
        break;
      case "validate":
        var funSrc = cmd[1];
        var newDoc = cmd[2];
        var oldDoc = cmd[3];
        var userCtx = cmd[4];
        var validateFun = compileFunction(funSrc);
        try {
          validateFun(newDoc, oldDoc, userCtx);
          print("1");
        } catch (error) {
          print(toJSON(error));
        }
        break;
      case "show_doc":
        var funSrc = cmd[1];
        var doc = cmd[2];
        var req = cmd[3];
        try {
          var formFun = compileFunction(funSrc);
          var rendered = formFun(doc, req);
          print(toJSON(rendered));
        } catch (error) {
          // Available error fields:
          // message, fileName, lineNumber, stack, name
          log("doc show function raised error: "+error.toString());
          log("stacktrace: "+error.stack);
          try {
            print(toJSON(error));
          } catch (e) {
            print({"error":error.toString()});
          }
        }
        break;
      default:
        print(toJSON({error: "query_server_error",
            reason: "unknown command '" + cmd[0] + "'"}));
        quit();
    }
  } catch (exception) {
    print(toJSON(exception));
  }
}


function compileFunction(source) {
  try {
    var functionObject = sandbox ? evalcx(source, sandbox) : eval(source);
  } catch (err) {
    throw {error: "compilation_error",
      reason: err.toString() + " (" + source + ")"};
  }
  if (typeof(functionObject) == "function") {
    return functionObject;
  } else {
    throw {error: "compilation_error",
      reason: "expression does not eval to a function. (" + source + ")"};
  }
}

function recursivelySeal(obj) {
  seal(obj);
  for (var propname in obj) {
    if (typeof doc[propname] == "object") {
      recursivelySeal(doc[propname]);
    }
  }
}

function toJSON(val) {
  if (typeof(val) == "undefined") {
    throw "Cannot encode 'undefined' value as JSON";
  }
  var subs = {'\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f',
              '\r': '\\r', '"' : '\\"', '\\': '\\\\'};
  if (typeof(val) == "xml") { // E4X support
    val = val.toXMLString();
  }
  return {
    "Array": function(v) {
      var buf = [];
      for (var i = 0; i < v.length; i++) {
        buf.push(toJSON(v[i]));
      }
      return "[" + buf.join(",") + "]";
    },
    "Boolean": function(v) {
      return v.toString();
    },
    "Date": function(v) {
      var f = function(n) { return n < 10 ? '0' + n : n }
      return '"' + v.getUTCFullYear()   + '-' +
                 f(v.getUTCMonth() + 1) + '-' +
                 f(v.getUTCDate())      + 'T' +
                 f(v.getUTCHours())     + ':' +
                 f(v.getUTCMinutes())   + ':' +
                 f(v.getUTCSeconds())   + 'Z"';
    },
    "Number": function(v) {
      return isFinite(v) ? v.toString() : "null";
    },
    "Object": function(v) {
      if (v === null) return "null";
      var buf = [];
      for (var k in v) {
        if (!v.hasOwnProperty(k) || typeof(k) !== "string" || v[k] === undefined) {
          continue;
        }
        buf.push(toJSON(k, val) + ": " + toJSON(v[k]));
      }
      return "{" + buf.join(",") + "}";
    },
    "String": function(v) {
      if (/["\\\x00-\x1f]/.test(v)) {
        v = v.replace(/([\x00-\x1f\\"])/g, function(a, b) {
          var c = subs[b];
          if (c) return c;
          c = b.charCodeAt();
          return '\\u00' + Math.floor(c / 16).toString(16) + (c % 16).toString(16);
        });
      }
      return '"' + v + '"';
    }
  }[val != null ? val.constructor.name : "Object"](val);
}
