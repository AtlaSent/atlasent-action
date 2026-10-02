"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
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

// ../../node_modules/concat-map/index.js
var require_concat_map = __commonJS({
  "../../node_modules/concat-map/index.js"(exports2, module2) {
    module2.exports = function(xs, fn) {
      var res = [];
      for (var i = 0; i < xs.length; i++) {
        var x = fn(xs[i], i);
        if (isArray(x))
          res.push.apply(res, x);
        else
          res.push(x);
      }
      return res;
    };
    var isArray = Array.isArray || function(xs) {
      return Object.prototype.toString.call(xs) === "[object Array]";
    };
  }
});

// ../../node_modules/balanced-match/index.js
var require_balanced_match = __commonJS({
  "../../node_modules/balanced-match/index.js"(exports2, module2) {
    "use strict";
    module2.exports = balanced;
    function balanced(a, b, str) {
      if (a instanceof RegExp)
        a = maybeMatch(a, str);
      if (b instanceof RegExp)
        b = maybeMatch(b, str);
      var r = range(a, b, str);
      return r && {
        start: r[0],
        end: r[1],
        pre: str.slice(0, r[0]),
        body: str.slice(r[0] + a.length, r[1]),
        post: str.slice(r[1] + b.length)
      };
    }
    function maybeMatch(reg, str) {
      var m = str.match(reg);
      return m ? m[0] : null;
    }
    balanced.range = range;
    function range(a, b, str) {
      var begs, beg, left, right, result;
      var ai = str.indexOf(a);
      var bi = str.indexOf(b, ai + 1);
      var i = ai;
      if (ai >= 0 && bi > 0) {
        if (a === b) {
          return [ai, bi];
        }
        begs = [];
        left = str.length;
        while (i >= 0 && !result) {
          if (i == ai) {
            begs.push(i);
            ai = str.indexOf(a, i + 1);
          } else if (begs.length == 1) {
            result = [begs.pop(), bi];
          } else {
            beg = begs.pop();
            if (beg < left) {
              left = beg;
              right = bi;
            }
            bi = str.indexOf(b, i + 1);
          }
          i = ai < bi && ai >= 0 ? ai : bi;
        }
        if (begs.length) {
          result = [left, right];
        }
      }
      return result;
    }
  }
});

// ../../node_modules/brace-expansion/index.js
var require_brace_expansion = __commonJS({
  "../../node_modules/brace-expansion/index.js"(exports2, module2) {
    var concatMap = require_concat_map();
    var balanced = require_balanced_match();
    module2.exports = expandTop;
    var escSlash = "\0SLASH" + Math.random() + "\0";
    var escOpen = "\0OPEN" + Math.random() + "\0";
    var escClose = "\0CLOSE" + Math.random() + "\0";
    var escComma = "\0COMMA" + Math.random() + "\0";
    var escPeriod = "\0PERIOD" + Math.random() + "\0";
    var EXPANSION_MAX = 1e5;
    var EXPANSION_MAX_LENGTH = 4e6;
    function numeric(str) {
      return parseInt(str, 10) == str ? parseInt(str, 10) : str.charCodeAt(0);
    }
    function escapeBraces(str) {
      return str.split("\\\\").join(escSlash).split("\\{").join(escOpen).split("\\}").join(escClose).split("\\,").join(escComma).split("\\.").join(escPeriod);
    }
    function unescapeBraces(str) {
      return str.split(escSlash).join("\\").split(escOpen).join("{").split(escClose).join("}").split(escComma).join(",").split(escPeriod).join(".");
    }
    function parseCommaParts(str) {
      if (!str)
        return [""];
      var parts = [];
      var m = balanced("{", "}", str);
      if (!m)
        return str.split(",");
      var pre = m.pre;
      var body = m.body;
      var post = m.post;
      var p = pre.split(",");
      p[p.length - 1] += "{" + body + "}";
      var postParts = parseCommaParts(post);
      if (post.length) {
        p[p.length - 1] += postParts.shift();
        p.push.apply(p, postParts);
      }
      parts.push.apply(parts, p);
      return parts;
    }
    function expandTop(str, options) {
      if (!str)
        return [];
      options = options || {};
      var max = options.max == null ? EXPANSION_MAX : options.max;
      var maxLength = options.maxLength == null ? EXPANSION_MAX_LENGTH : options.maxLength;
      if (str.substr(0, 2) === "{}") {
        str = "\\{\\}" + str.substr(2);
      }
      return expand(escapeBraces(str), max, maxLength, true).map(unescapeBraces);
    }
    function embrace(str) {
      return "{" + str + "}";
    }
    function isPadded(el) {
      return /^-?0\d/.test(el);
    }
    function lte(i, y) {
      return i <= y;
    }
    function gte(i, y) {
      return i >= y;
    }
    function combine(acc, base, pre, values, max, maxLength, dropEmpties, outBase) {
      var out = [];
      var length = 0;
      for (var a = 0; a < acc.length; a++) {
        for (var v = 0; v < values.length; v++) {
          if (out.length >= max)
            return out;
          var expansion = acc[a] + pre + values[v];
          if (dropEmpties && expansion.length === base[a])
            continue;
          if (length + expansion.length > maxLength)
            return out;
          out.push(expansion);
          outBase.push(base[a]);
          length += expansion.length;
        }
      }
      return out;
    }
    function expandSequence(body, isAlphaSequence, max, maxLength) {
      var n = body.split(/\.\./);
      var N = [];
      if (n[0] === void 0 || n[1] === void 0) {
        return N;
      }
      var x = numeric(n[0]);
      var y = numeric(n[1]);
      var width = Math.max(n[0].length, n[1].length);
      var incr = n.length === 3 && n[2] !== void 0 ? Math.max(Math.abs(numeric(n[2])), 1) : 1;
      var test = lte;
      var reverse = y < x;
      if (reverse) {
        incr *= -1;
        test = gte;
      }
      var pad = n.some(isPadded);
      var length = 0;
      for (var i = x; test(i, y) && N.length < max; i += incr) {
        var c;
        if (isAlphaSequence) {
          c = String.fromCharCode(i);
          if (c === "\\") {
            c = "";
          }
        } else {
          c = String(i);
          if (pad) {
            var need = width - c.length;
            if (need > 0) {
              var z = new Array(need + 1).join("0");
              if (i < 0) {
                c = "-" + z + c.slice(1);
              } else {
                c = z + c;
              }
            }
          }
        }
        if (length + c.length > maxLength)
          break;
        N.push(c);
        length += c.length;
      }
      return N;
    }
    function expand(str, max, maxLength, isTop) {
      var acc = [""];
      var accBase = [0];
      var dropEmpties = false;
      var firstGroup = true;
      var nextBase;
      for (; ; ) {
        var m = balanced("{", "}", str);
        if (!m) {
          return combine(acc, accBase, str, [""], max, maxLength, dropEmpties, []);
        }
        var pre = m.pre;
        if (/\$$/.test(pre)) {
          return combine(acc, accBase, str, [""], max, maxLength, dropEmpties, []);
        }
        var isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
        var isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
        var isSequence = isNumericSequence || isAlphaSequence;
        var isOptions = m.body.indexOf(",") >= 0;
        if (!isSequence && !isOptions) {
          if (m.post.match(/,(?!,).*\}/)) {
            str = m.pre + "{" + m.body + escClose + m.post;
            isTop = true;
            firstGroup = true;
            dropEmpties = false;
            accBase = [];
            for (var b = 0; b < acc.length; b++) {
              accBase.push(acc[b].length);
            }
            continue;
          }
          return combine(
            acc,
            accBase,
            pre + "{" + m.body + "}" + m.post,
            [""],
            max,
            maxLength,
            dropEmpties,
            []
          );
        }
        if (firstGroup) {
          dropEmpties = isTop && !isSequence;
          firstGroup = false;
        }
        var values;
        if (isSequence) {
          values = expandSequence(m.body, isAlphaSequence, max, maxLength);
        } else {
          var n = parseCommaParts(m.body);
          if (n.length === 1 && n[0] !== void 0) {
            n = expand(n[0], max, maxLength, false).map(embrace);
            if (n.length === 1) {
              nextBase = [];
              acc = combine(
                acc,
                accBase,
                pre + n[0],
                [""],
                max,
                maxLength,
                dropEmpties && !m.post.length,
                nextBase
              );
              accBase = nextBase;
              if (!m.post.length)
                break;
              str = m.post;
              continue;
            }
          }
          var dropsEmpties = dropEmpties && !m.post.length && !pre;
          for (var d = 0; dropsEmpties && d < acc.length; d++) {
            if (acc[d].length !== accBase[d]) {
              dropsEmpties = false;
            }
          }
          values = [];
          var valuesLength = 0;
          outer:
            for (var j = 0; j < n.length; j++) {
              var expanded = expand(n[j], max, maxLength, false);
              for (var k = 0; k < expanded.length; k++) {
                var v = expanded[k];
                if (dropsEmpties && !v)
                  continue;
                if (values.length >= max || valuesLength + v.length > maxLength) {
                  break outer;
                }
                values.push(v);
                valuesLength += v.length;
              }
            }
        }
        nextBase = [];
        acc = combine(
          acc,
          accBase,
          pre,
          values,
          max,
          maxLength,
          dropEmpties && !m.post.length,
          nextBase
        );
        accBase = nextBase;
        if (!m.post.length)
          break;
        str = m.post;
      }
      return acc;
    }
  }
});

// ../../node_modules/minimatch/minimatch.js
var require_minimatch = __commonJS({
  "../../node_modules/minimatch/minimatch.js"(exports2, module2) {
    module2.exports = minimatch;
    minimatch.Minimatch = Minimatch;
    var path = function() {
      try {
        return require("path");
      } catch (e) {
      }
    }() || {
      sep: "/"
    };
    minimatch.sep = path.sep;
    var GLOBSTAR = minimatch.GLOBSTAR = Minimatch.GLOBSTAR = {};
    var expand = require_brace_expansion();
    var plTypes = {
      "!": { open: "(?:(?!(?:", close: "))[^/]*?)" },
      "?": { open: "(?:", close: ")?" },
      "+": { open: "(?:", close: ")+" },
      "*": { open: "(?:", close: ")*" },
      "@": { open: "(?:", close: ")" }
    };
    var qmark = "[^/]";
    var star = qmark + "*?";
    var twoStarDot = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?";
    var twoStarNoDot = "(?:(?!(?:\\/|^)\\.).)*?";
    var reSpecials = charSet("().*{}+?[]^$\\!");
    function charSet(s) {
      return s.split("").reduce(function(set, c) {
        set[c] = true;
        return set;
      }, {});
    }
    var slashSplit = /\/+/;
    minimatch.filter = filter;
    function filter(pattern, options) {
      options = options || {};
      return function(p, i, list) {
        return minimatch(p, pattern, options);
      };
    }
    function ext(a, b) {
      b = b || {};
      var t = {};
      Object.keys(a).forEach(function(k) {
        t[k] = a[k];
      });
      Object.keys(b).forEach(function(k) {
        t[k] = b[k];
      });
      return t;
    }
    minimatch.defaults = function(def) {
      if (!def || typeof def !== "object" || !Object.keys(def).length) {
        return minimatch;
      }
      var orig = minimatch;
      var m = function minimatch2(p, pattern, options) {
        return orig(p, pattern, ext(def, options));
      };
      m.Minimatch = function Minimatch2(pattern, options) {
        return new orig.Minimatch(pattern, ext(def, options));
      };
      m.Minimatch.defaults = function defaults(options) {
        return orig.defaults(ext(def, options)).Minimatch;
      };
      m.filter = function filter2(pattern, options) {
        return orig.filter(pattern, ext(def, options));
      };
      m.defaults = function defaults(options) {
        return orig.defaults(ext(def, options));
      };
      m.makeRe = function makeRe2(pattern, options) {
        return orig.makeRe(pattern, ext(def, options));
      };
      m.braceExpand = function braceExpand2(pattern, options) {
        return orig.braceExpand(pattern, ext(def, options));
      };
      m.match = function(list, pattern, options) {
        return orig.match(list, pattern, ext(def, options));
      };
      return m;
    };
    Minimatch.defaults = function(def) {
      return minimatch.defaults(def).Minimatch;
    };
    function minimatch(p, pattern, options) {
      assertValidPattern(pattern);
      if (!options)
        options = {};
      if (!options.nocomment && pattern.charAt(0) === "#") {
        return false;
      }
      return new Minimatch(pattern, options).match(p);
    }
    function Minimatch(pattern, options) {
      if (!(this instanceof Minimatch)) {
        return new Minimatch(pattern, options);
      }
      assertValidPattern(pattern);
      if (!options)
        options = {};
      pattern = pattern.trim();
      if (!options.allowWindowsEscape && path.sep !== "/") {
        pattern = pattern.split(path.sep).join("/");
      }
      this.options = options;
      this.maxGlobstarRecursion = options.maxGlobstarRecursion !== void 0 ? options.maxGlobstarRecursion : 200;
      this.set = [];
      this.pattern = pattern;
      this.regexp = null;
      this.negate = false;
      this.comment = false;
      this.empty = false;
      this.partial = !!options.partial;
      this.make();
    }
    Minimatch.prototype.debug = function() {
    };
    Minimatch.prototype.make = make;
    function make() {
      var pattern = this.pattern;
      var options = this.options;
      if (!options.nocomment && pattern.charAt(0) === "#") {
        this.comment = true;
        return;
      }
      if (!pattern) {
        this.empty = true;
        return;
      }
      this.parseNegate();
      var set = this.globSet = this.braceExpand();
      if (options.debug)
        this.debug = function debug2() {
          console.error.apply(console, arguments);
        };
      this.debug(this.pattern, set);
      set = this.globParts = set.map(function(s) {
        return s.split(slashSplit);
      });
      this.debug(this.pattern, set);
      set = set.map(function(s, si, set2) {
        return s.map(this.parse, this);
      }, this);
      this.debug(this.pattern, set);
      set = set.filter(function(s) {
        return s.indexOf(false) === -1;
      });
      this.debug(this.pattern, set);
      this.set = set;
    }
    Minimatch.prototype.parseNegate = parseNegate;
    function parseNegate() {
      var pattern = this.pattern;
      var negate = false;
      var options = this.options;
      var negateOffset = 0;
      if (options.nonegate)
        return;
      for (var i = 0, l = pattern.length; i < l && pattern.charAt(i) === "!"; i++) {
        negate = !negate;
        negateOffset++;
      }
      if (negateOffset)
        this.pattern = pattern.substr(negateOffset);
      this.negate = negate;
    }
    minimatch.braceExpand = function(pattern, options) {
      return braceExpand(pattern, options);
    };
    Minimatch.prototype.braceExpand = braceExpand;
    function braceExpand(pattern, options) {
      if (!options) {
        if (this instanceof Minimatch) {
          options = this.options;
        } else {
          options = {};
        }
      }
      pattern = typeof pattern === "undefined" ? this.pattern : pattern;
      assertValidPattern(pattern);
      if (options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern)) {
        return [pattern];
      }
      return expand(pattern);
    }
    var MAX_PATTERN_LENGTH = 1024 * 64;
    var assertValidPattern = function(pattern) {
      if (typeof pattern !== "string") {
        throw new TypeError("invalid pattern");
      }
      if (pattern.length > MAX_PATTERN_LENGTH) {
        throw new TypeError("pattern is too long");
      }
    };
    Minimatch.prototype.parse = parse;
    var SUBPARSE = {};
    function parse(pattern, isSub) {
      assertValidPattern(pattern);
      var options = this.options;
      if (pattern === "**") {
        if (!options.noglobstar)
          return GLOBSTAR;
        else
          pattern = "*";
      }
      if (pattern === "")
        return "";
      var re = "";
      var hasMagic = !!options.nocase;
      var escaping = false;
      var patternListStack = [];
      var negativeLists = [];
      var stateChar;
      var inClass = false;
      var reClassStart = -1;
      var classStart = -1;
      var patternStart = pattern.charAt(0) === "." ? "" : options.dot ? "(?!(?:^|\\/)\\.{1,2}(?:$|\\/))" : "(?!\\.)";
      var self2 = this;
      function clearStateChar() {
        if (stateChar) {
          switch (stateChar) {
            case "*":
              re += star;
              hasMagic = true;
              break;
            case "?":
              re += qmark;
              hasMagic = true;
              break;
            default:
              re += "\\" + stateChar;
              break;
          }
          self2.debug("clearStateChar %j %j", stateChar, re);
          stateChar = false;
        }
      }
      for (var i = 0, len = pattern.length, c; i < len && (c = pattern.charAt(i)); i++) {
        this.debug("%s	%s %s %j", pattern, i, re, c);
        if (escaping && reSpecials[c]) {
          re += "\\" + c;
          escaping = false;
          continue;
        }
        switch (c) {
          case "/": {
            return false;
          }
          case "\\":
            clearStateChar();
            escaping = true;
            continue;
          case "?":
          case "*":
          case "+":
          case "@":
          case "!":
            this.debug("%s	%s %s %j <-- stateChar", pattern, i, re, c);
            if (inClass) {
              this.debug("  in class");
              if (c === "!" && i === classStart + 1)
                c = "^";
              re += c;
              continue;
            }
            if (c === "*" && stateChar === "*")
              continue;
            self2.debug("call clearStateChar %j", stateChar);
            clearStateChar();
            stateChar = c;
            if (options.noext)
              clearStateChar();
            continue;
          case "(":
            if (inClass) {
              re += "(";
              continue;
            }
            if (!stateChar) {
              re += "\\(";
              continue;
            }
            patternListStack.push({
              type: stateChar,
              start: i - 1,
              reStart: re.length,
              open: plTypes[stateChar].open,
              close: plTypes[stateChar].close
            });
            re += stateChar === "!" ? "(?:(?!(?:" : "(?:";
            this.debug("plType %j %j", stateChar, re);
            stateChar = false;
            continue;
          case ")":
            if (inClass || !patternListStack.length) {
              re += "\\)";
              continue;
            }
            clearStateChar();
            hasMagic = true;
            var pl = patternListStack.pop();
            re += pl.close;
            if (pl.type === "!") {
              negativeLists.push(pl);
            }
            pl.reEnd = re.length;
            continue;
          case "|":
            if (inClass || !patternListStack.length || escaping) {
              re += "\\|";
              escaping = false;
              continue;
            }
            clearStateChar();
            re += "|";
            continue;
          case "[":
            clearStateChar();
            if (inClass) {
              re += "\\" + c;
              continue;
            }
            inClass = true;
            classStart = i;
            reClassStart = re.length;
            re += c;
            continue;
          case "]":
            if (i === classStart + 1 || !inClass) {
              re += "\\" + c;
              escaping = false;
              continue;
            }
            var cs = pattern.substring(classStart + 1, i);
            try {
              RegExp("[" + cs + "]");
            } catch (er) {
              var sp = this.parse(cs, SUBPARSE);
              re = re.substr(0, reClassStart) + "\\[" + sp[0] + "\\]";
              hasMagic = hasMagic || sp[1];
              inClass = false;
              continue;
            }
            hasMagic = true;
            inClass = false;
            re += c;
            continue;
          default:
            clearStateChar();
            if (escaping) {
              escaping = false;
            } else if (reSpecials[c] && !(c === "^" && inClass)) {
              re += "\\";
            }
            re += c;
        }
      }
      if (inClass) {
        cs = pattern.substr(classStart + 1);
        sp = this.parse(cs, SUBPARSE);
        re = re.substr(0, reClassStart) + "\\[" + sp[0];
        hasMagic = hasMagic || sp[1];
      }
      for (pl = patternListStack.pop(); pl; pl = patternListStack.pop()) {
        var tail = re.slice(pl.reStart + pl.open.length);
        this.debug("setting tail", re, pl);
        tail = tail.replace(/((?:\\{2}){0,64})(\\?)\|/g, function(_, $1, $2) {
          if (!$2) {
            $2 = "\\";
          }
          return $1 + $1 + $2 + "|";
        });
        this.debug("tail=%j\n   %s", tail, tail, pl, re);
        var t = pl.type === "*" ? star : pl.type === "?" ? qmark : "\\" + pl.type;
        hasMagic = true;
        re = re.slice(0, pl.reStart) + t + "\\(" + tail;
      }
      clearStateChar();
      if (escaping) {
        re += "\\\\";
      }
      var addPatternStart = false;
      switch (re.charAt(0)) {
        case "[":
        case ".":
        case "(":
          addPatternStart = true;
      }
      for (var n = negativeLists.length - 1; n > -1; n--) {
        var nl = negativeLists[n];
        var nlBefore = re.slice(0, nl.reStart);
        var nlFirst = re.slice(nl.reStart, nl.reEnd - 8);
        var nlLast = re.slice(nl.reEnd - 8, nl.reEnd);
        var nlAfter = re.slice(nl.reEnd);
        nlLast += nlAfter;
        var openParensBefore = nlBefore.split("(").length - 1;
        var cleanAfter = nlAfter;
        for (i = 0; i < openParensBefore; i++) {
          cleanAfter = cleanAfter.replace(/\)[+*?]?/, "");
        }
        nlAfter = cleanAfter;
        var dollar = "";
        if (nlAfter === "" && isSub !== SUBPARSE) {
          dollar = "$";
        }
        var newRe = nlBefore + nlFirst + nlAfter + dollar + nlLast;
        re = newRe;
      }
      if (re !== "" && hasMagic) {
        re = "(?=.)" + re;
      }
      if (addPatternStart) {
        re = patternStart + re;
      }
      if (isSub === SUBPARSE) {
        return [re, hasMagic];
      }
      if (!hasMagic) {
        return globUnescape(pattern);
      }
      var flags = options.nocase ? "i" : "";
      try {
        var regExp = new RegExp("^" + re + "$", flags);
      } catch (er) {
        return new RegExp("$.");
      }
      regExp._glob = pattern;
      regExp._src = re;
      return regExp;
    }
    minimatch.makeRe = function(pattern, options) {
      return new Minimatch(pattern, options || {}).makeRe();
    };
    Minimatch.prototype.makeRe = makeRe;
    function makeRe() {
      if (this.regexp || this.regexp === false)
        return this.regexp;
      var set = this.set;
      if (!set.length) {
        this.regexp = false;
        return this.regexp;
      }
      var options = this.options;
      var twoStar = options.noglobstar ? star : options.dot ? twoStarDot : twoStarNoDot;
      var flags = options.nocase ? "i" : "";
      var re = set.map(function(pattern) {
        return pattern.map(function(p) {
          return p === GLOBSTAR ? twoStar : typeof p === "string" ? regExpEscape(p) : p._src;
        }).join("\\/");
      }).join("|");
      re = "^(?:" + re + ")$";
      if (this.negate)
        re = "^(?!" + re + ").*$";
      try {
        this.regexp = new RegExp(re, flags);
      } catch (ex) {
        this.regexp = false;
      }
      return this.regexp;
    }
    minimatch.match = function(list, pattern, options) {
      options = options || {};
      var mm = new Minimatch(pattern, options);
      list = list.filter(function(f) {
        return mm.match(f);
      });
      if (mm.options.nonull && !list.length) {
        list.push(pattern);
      }
      return list;
    };
    Minimatch.prototype.match = function match(f, partial) {
      if (typeof partial === "undefined")
        partial = this.partial;
      this.debug("match", f, this.pattern);
      if (this.comment)
        return false;
      if (this.empty)
        return f === "";
      if (f === "/" && partial)
        return true;
      var options = this.options;
      if (path.sep !== "/") {
        f = f.split(path.sep).join("/");
      }
      f = f.split(slashSplit);
      this.debug(this.pattern, "split", f);
      var set = this.set;
      this.debug(this.pattern, "set", set);
      var filename;
      var i;
      for (i = f.length - 1; i >= 0; i--) {
        filename = f[i];
        if (filename)
          break;
      }
      for (i = 0; i < set.length; i++) {
        var pattern = set[i];
        var file = f;
        if (options.matchBase && pattern.length === 1) {
          file = [filename];
        }
        var hit = this.matchOne(file, pattern, partial);
        if (hit) {
          if (options.flipNegate)
            return true;
          return !this.negate;
        }
      }
      if (options.flipNegate)
        return false;
      return this.negate;
    };
    Minimatch.prototype.matchOne = function(file, pattern, partial) {
      if (pattern.indexOf(GLOBSTAR) !== -1) {
        return this._matchGlobstar(file, pattern, partial, 0, 0);
      }
      return this._matchOne(file, pattern, partial, 0, 0);
    };
    Minimatch.prototype._matchGlobstar = function(file, pattern, partial, fileIndex, patternIndex) {
      var i;
      var firstgs = -1;
      for (i = patternIndex; i < pattern.length; i++) {
        if (pattern[i] === GLOBSTAR) {
          firstgs = i;
          break;
        }
      }
      var lastgs = -1;
      for (i = pattern.length - 1; i >= 0; i--) {
        if (pattern[i] === GLOBSTAR) {
          lastgs = i;
          break;
        }
      }
      var head = pattern.slice(patternIndex, firstgs);
      var body = partial ? pattern.slice(firstgs + 1) : pattern.slice(firstgs + 1, lastgs);
      var tail = partial ? [] : pattern.slice(lastgs + 1);
      if (head.length) {
        var fileHead = file.slice(fileIndex, fileIndex + head.length);
        if (!this._matchOne(fileHead, head, partial, 0, 0)) {
          return false;
        }
        fileIndex += head.length;
      }
      var fileTailMatch = 0;
      if (tail.length) {
        if (tail.length + fileIndex > file.length)
          return false;
        var tailStart = file.length - tail.length;
        if (this._matchOne(file, tail, partial, tailStart, 0)) {
          fileTailMatch = tail.length;
        } else {
          if (file[file.length - 1] !== "" || fileIndex + tail.length === file.length) {
            return false;
          }
          tailStart--;
          if (!this._matchOne(file, tail, partial, tailStart, 0)) {
            return false;
          }
          fileTailMatch = tail.length + 1;
        }
      }
      if (!body.length) {
        var sawSome = !!fileTailMatch;
        for (i = fileIndex; i < file.length - fileTailMatch; i++) {
          var f = String(file[i]);
          sawSome = true;
          if (f === "." || f === ".." || !this.options.dot && f.charAt(0) === ".") {
            return false;
          }
        }
        return partial || sawSome;
      }
      var bodySegments = [[[], 0]];
      var currentBody = bodySegments[0];
      var nonGsParts = 0;
      var nonGsPartsSums = [0];
      for (var bi = 0; bi < body.length; bi++) {
        var b = body[bi];
        if (b === GLOBSTAR) {
          nonGsPartsSums.push(nonGsParts);
          currentBody = [[], 0];
          bodySegments.push(currentBody);
        } else {
          currentBody[0].push(b);
          nonGsParts++;
        }
      }
      var idx = bodySegments.length - 1;
      var fileLength = file.length - fileTailMatch;
      for (var si = 0; si < bodySegments.length; si++) {
        bodySegments[si][1] = fileLength - (nonGsPartsSums[idx--] + bodySegments[si][0].length);
      }
      return !!this._matchGlobStarBodySections(
        file,
        bodySegments,
        fileIndex,
        0,
        partial,
        0,
        !!fileTailMatch
      );
    };
    Minimatch.prototype._matchGlobStarBodySections = function(file, bodySegments, fileIndex, bodyIndex, partial, globStarDepth, sawTail) {
      var bs = bodySegments[bodyIndex];
      if (!bs) {
        for (var i = fileIndex; i < file.length; i++) {
          sawTail = true;
          var f = file[i];
          if (f === "." || f === ".." || !this.options.dot && f.charAt(0) === ".") {
            return false;
          }
        }
        return sawTail;
      }
      var body = bs[0];
      var after = bs[1];
      while (fileIndex <= after) {
        var m = this._matchOne(
          file.slice(0, fileIndex + body.length),
          body,
          partial,
          fileIndex,
          0
        );
        if (m && globStarDepth < this.maxGlobstarRecursion) {
          var sub = this._matchGlobStarBodySections(
            file,
            bodySegments,
            fileIndex + body.length,
            bodyIndex + 1,
            partial,
            globStarDepth + 1,
            sawTail
          );
          if (sub !== false) {
            return sub;
          }
        }
        var f = file[fileIndex];
        if (f === "." || f === ".." || !this.options.dot && f.charAt(0) === ".") {
          return false;
        }
        fileIndex++;
      }
      return partial || null;
    };
    Minimatch.prototype._matchOne = function(file, pattern, partial, fileIndex, patternIndex) {
      var fi, pi, fl, pl;
      for (fi = fileIndex, pi = patternIndex, fl = file.length, pl = pattern.length; fi < fl && pi < pl; fi++, pi++) {
        this.debug("matchOne loop");
        var p = pattern[pi];
        var f = file[fi];
        this.debug(pattern, p, f);
        if (p === false || p === GLOBSTAR)
          return false;
        var hit;
        if (typeof p === "string") {
          hit = f === p;
          this.debug("string match", p, f, hit);
        } else {
          hit = f.match(p);
          this.debug("pattern match", p, f, hit);
        }
        if (!hit)
          return false;
      }
      if (fi === fl && pi === pl) {
        return true;
      } else if (fi === fl) {
        return partial;
      } else if (pi === pl) {
        return fi === fl - 1 && file[fi] === "";
      }
      throw new Error("wtf?");
    };
    function globUnescape(s) {
      return s.replace(/\\(.)/g, "$1");
    }
    function regExpEscape(s) {
      return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }
  }
});

// ../../node_modules/azure-pipelines-task-lib/taskcommand.js
var require_taskcommand = __commonJS({
  "../../node_modules/azure-pipelines-task-lib/taskcommand.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.commandFromString = exports2.TaskCommand = void 0;
    var CMD_PREFIX = "##vso[";
    var TaskCommand = (
      /** @class */
      function() {
        function TaskCommand2(command, properties, message) {
          if (!command) {
            command = "missing.command";
          }
          this.command = command;
          this.properties = properties;
          this.message = message;
        }
        TaskCommand2.prototype.toString = function() {
          var cmdStr = CMD_PREFIX + this.command;
          if (this.properties && Object.keys(this.properties).length > 0) {
            cmdStr += " ";
            for (var key in this.properties) {
              if (this.properties.hasOwnProperty(key)) {
                var val = this.properties[key];
                if (val) {
                  cmdStr += key + "=" + escape("" + (val || "")) + ";";
                }
              }
            }
          }
          cmdStr += "]";
          var message = "" + (this.message || "");
          cmdStr += escapedata(message);
          return cmdStr;
        };
        return TaskCommand2;
      }()
    );
    exports2.TaskCommand = TaskCommand;
    function commandFromString(commandLine) {
      var preLen = CMD_PREFIX.length;
      var lbPos = commandLine.indexOf("[");
      var rbPos = commandLine.indexOf("]");
      if (lbPos == -1 || rbPos == -1 || rbPos - lbPos < 3) {
        throw new Error("Invalid command brackets");
      }
      var cmdInfo = commandLine.substring(lbPos + 1, rbPos);
      var spaceIdx = cmdInfo.indexOf(" ");
      var command = cmdInfo;
      var properties = {};
      if (spaceIdx > 0) {
        command = cmdInfo.trim().substring(0, spaceIdx);
        var propSection = cmdInfo.trim().substring(spaceIdx + 1);
        var propLines = propSection.split(";");
        propLines.forEach(function(propLine) {
          propLine = propLine.trim();
          if (propLine.length > 0) {
            var eqIndex = propLine.indexOf("=");
            if (eqIndex == -1) {
              throw new Error("Invalid property: " + propLine);
            }
            var key = propLine.substring(0, eqIndex);
            var val = propLine.substring(eqIndex + 1);
            properties[key] = unescape(val);
          }
        });
      }
      var msg = unescapedata(commandLine.substring(rbPos + 1));
      var cmd = new TaskCommand(command, properties, msg);
      return cmd;
    }
    exports2.commandFromString = commandFromString;
    function escapedata(s) {
      return s.replace(/%/g, "%AZP25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    }
    function unescapedata(s) {
      return s.replace(/%0D/g, "\r").replace(/%0A/g, "\n").replace(/%AZP25/g, "%");
    }
    function escape(s) {
      return s.replace(/%/g, "%AZP25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/]/g, "%5D").replace(/;/g, "%3B");
    }
    function unescape(s) {
      return s.replace(/%0D/g, "\r").replace(/%0A/g, "\n").replace(/%5D/g, "]").replace(/%3B/g, ";").replace(/%AZP25/g, "%");
    }
  }
});

// ../../node_modules/azure-pipelines-task-lib/vault.js
var require_vault = __commonJS({
  "../../node_modules/azure-pipelines-task-lib/vault.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Vault = void 0;
    var fs = require("fs");
    var path = require("path");
    var crypto = require("crypto");
    var algorithm = "aes-256-ctr";
    var encryptEncoding = "hex";
    var unencryptedEncoding = "utf8";
    var Vault = (
      /** @class */
      function() {
        function Vault2(keyPath) {
          this._keyFile = path.join(keyPath, ".taskkey");
          this._store = {};
          this.genKey();
        }
        Vault2.prototype.initialize = function() {
        };
        Vault2.prototype.storeSecret = function(name, data) {
          if (!name || name.length == 0) {
            return false;
          }
          name = name.toLowerCase();
          if (!data || data.length == 0) {
            if (this._store.hasOwnProperty(name)) {
              delete this._store[name];
            }
            return false;
          }
          var key = this.getKey();
          var iv = crypto.randomBytes(16);
          var cipher = crypto.createCipheriv(algorithm, key, iv);
          var crypted = cipher.update(data, unencryptedEncoding, encryptEncoding);
          var cryptedFinal = cipher.final(encryptEncoding);
          this._store[name] = iv.toString(encryptEncoding) + crypted + cryptedFinal;
          return true;
        };
        Vault2.prototype.retrieveSecret = function(name) {
          var secret;
          name = (name || "").toLowerCase();
          if (this._store.hasOwnProperty(name)) {
            var key = this.getKey();
            var data = this._store[name];
            var ivDataBuffer = Buffer.from(data, encryptEncoding);
            var iv = ivDataBuffer.slice(0, 16);
            var encryptedText = ivDataBuffer.slice(16);
            var decipher = crypto.createDecipheriv(algorithm, key, iv);
            var dec = decipher.update(encryptedText);
            var decFinal = decipher.final(unencryptedEncoding);
            secret = dec + decFinal;
          }
          return secret;
        };
        Vault2.prototype.getKey = function() {
          var key = fs.readFileSync(this._keyFile).toString("utf8");
          return crypto.createHash("sha256").update(key).digest();
        };
        Vault2.prototype.genKey = function() {
          fs.writeFileSync(this._keyFile, crypto.randomUUID(), { encoding: "utf8" });
        };
        return Vault2;
      }()
    );
    exports2.Vault = Vault;
  }
});

// ../../node_modules/semver/semver.js
var require_semver = __commonJS({
  "../../node_modules/semver/semver.js"(exports2, module2) {
    exports2 = module2.exports = SemVer;
    var debug2;
    if (typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG)) {
      debug2 = function() {
        var args = Array.prototype.slice.call(arguments, 0);
        args.unshift("SEMVER");
        console.log.apply(console, args);
      };
    } else {
      debug2 = function() {
      };
    }
    exports2.SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var re = exports2.re = [];
    var safeRe = exports2.safeRe = [];
    var src = exports2.src = [];
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    function makeSafeRe(value) {
      for (var i2 = 0; i2 < safeRegexReplacements.length; i2++) {
        var token = safeRegexReplacements[i2][0];
        var max = safeRegexReplacements[i2][1];
        value = value.split(token + "*").join(token + "{0," + max + "}").split(token + "+").join(token + "{1," + max + "}");
      }
      return value;
    }
    var NUMERICIDENTIFIER = R++;
    src[NUMERICIDENTIFIER] = "0|[1-9]\\d*";
    var NUMERICIDENTIFIERLOOSE = R++;
    src[NUMERICIDENTIFIERLOOSE] = "\\d+";
    var NONNUMERICIDENTIFIER = R++;
    src[NONNUMERICIDENTIFIER] = "\\d*[a-zA-Z-]" + LETTERDASHNUMBER + "*";
    var MAINVERSION = R++;
    src[MAINVERSION] = "(" + src[NUMERICIDENTIFIER] + ")\\.(" + src[NUMERICIDENTIFIER] + ")\\.(" + src[NUMERICIDENTIFIER] + ")";
    var MAINVERSIONLOOSE = R++;
    src[MAINVERSIONLOOSE] = "(" + src[NUMERICIDENTIFIERLOOSE] + ")\\.(" + src[NUMERICIDENTIFIERLOOSE] + ")\\.(" + src[NUMERICIDENTIFIERLOOSE] + ")";
    var PRERELEASEIDENTIFIER = R++;
    src[PRERELEASEIDENTIFIER] = "(?:" + src[NUMERICIDENTIFIER] + "|" + src[NONNUMERICIDENTIFIER] + ")";
    var PRERELEASEIDENTIFIERLOOSE = R++;
    src[PRERELEASEIDENTIFIERLOOSE] = "(?:" + src[NUMERICIDENTIFIERLOOSE] + "|" + src[NONNUMERICIDENTIFIER] + ")";
    var PRERELEASE = R++;
    src[PRERELEASE] = "(?:-(" + src[PRERELEASEIDENTIFIER] + "(?:\\." + src[PRERELEASEIDENTIFIER] + ")*))";
    var PRERELEASELOOSE = R++;
    src[PRERELEASELOOSE] = "(?:-?(" + src[PRERELEASEIDENTIFIERLOOSE] + "(?:\\." + src[PRERELEASEIDENTIFIERLOOSE] + ")*))";
    var BUILDIDENTIFIER = R++;
    src[BUILDIDENTIFIER] = LETTERDASHNUMBER + "+";
    var BUILD = R++;
    src[BUILD] = "(?:\\+(" + src[BUILDIDENTIFIER] + "(?:\\." + src[BUILDIDENTIFIER] + ")*))";
    var FULL = R++;
    var FULLPLAIN = "v?" + src[MAINVERSION] + src[PRERELEASE] + "?" + src[BUILD] + "?";
    src[FULL] = "^" + FULLPLAIN + "$";
    var LOOSEPLAIN = "[v=\\s]*" + src[MAINVERSIONLOOSE] + src[PRERELEASELOOSE] + "?" + src[BUILD] + "?";
    var LOOSE = R++;
    src[LOOSE] = "^" + LOOSEPLAIN + "$";
    var GTLT = R++;
    src[GTLT] = "((?:<|>)?=?)";
    var XRANGEIDENTIFIERLOOSE = R++;
    src[XRANGEIDENTIFIERLOOSE] = src[NUMERICIDENTIFIERLOOSE] + "|x|X|\\*";
    var XRANGEIDENTIFIER = R++;
    src[XRANGEIDENTIFIER] = src[NUMERICIDENTIFIER] + "|x|X|\\*";
    var XRANGEPLAIN = R++;
    src[XRANGEPLAIN] = "[v=\\s]*(" + src[XRANGEIDENTIFIER] + ")(?:\\.(" + src[XRANGEIDENTIFIER] + ")(?:\\.(" + src[XRANGEIDENTIFIER] + ")(?:" + src[PRERELEASE] + ")?" + src[BUILD] + "?)?)?";
    var XRANGEPLAINLOOSE = R++;
    src[XRANGEPLAINLOOSE] = "[v=\\s]*(" + src[XRANGEIDENTIFIERLOOSE] + ")(?:\\.(" + src[XRANGEIDENTIFIERLOOSE] + ")(?:\\.(" + src[XRANGEIDENTIFIERLOOSE] + ")(?:" + src[PRERELEASELOOSE] + ")?" + src[BUILD] + "?)?)?";
    var XRANGE = R++;
    src[XRANGE] = "^" + src[GTLT] + "\\s*" + src[XRANGEPLAIN] + "$";
    var XRANGELOOSE = R++;
    src[XRANGELOOSE] = "^" + src[GTLT] + "\\s*" + src[XRANGEPLAINLOOSE] + "$";
    var COERCE = R++;
    src[COERCE] = "(?:^|[^\\d])(\\d{1," + MAX_SAFE_COMPONENT_LENGTH + "})(?:\\.(\\d{1," + MAX_SAFE_COMPONENT_LENGTH + "}))?(?:\\.(\\d{1," + MAX_SAFE_COMPONENT_LENGTH + "}))?(?:$|[^\\d])";
    var LONETILDE = R++;
    src[LONETILDE] = "(?:~>?)";
    var TILDETRIM = R++;
    src[TILDETRIM] = "(\\s*)" + src[LONETILDE] + "\\s+";
    re[TILDETRIM] = new RegExp(src[TILDETRIM], "g");
    safeRe[TILDETRIM] = new RegExp(makeSafeRe(src[TILDETRIM]), "g");
    var tildeTrimReplace = "$1~";
    var TILDE = R++;
    src[TILDE] = "^" + src[LONETILDE] + src[XRANGEPLAIN] + "$";
    var TILDELOOSE = R++;
    src[TILDELOOSE] = "^" + src[LONETILDE] + src[XRANGEPLAINLOOSE] + "$";
    var LONECARET = R++;
    src[LONECARET] = "(?:\\^)";
    var CARETTRIM = R++;
    src[CARETTRIM] = "(\\s*)" + src[LONECARET] + "\\s+";
    re[CARETTRIM] = new RegExp(src[CARETTRIM], "g");
    safeRe[CARETTRIM] = new RegExp(makeSafeRe(src[CARETTRIM]), "g");
    var caretTrimReplace = "$1^";
    var CARET = R++;
    src[CARET] = "^" + src[LONECARET] + src[XRANGEPLAIN] + "$";
    var CARETLOOSE = R++;
    src[CARETLOOSE] = "^" + src[LONECARET] + src[XRANGEPLAINLOOSE] + "$";
    var COMPARATORLOOSE = R++;
    src[COMPARATORLOOSE] = "^" + src[GTLT] + "\\s*(" + LOOSEPLAIN + ")$|^$";
    var COMPARATOR = R++;
    src[COMPARATOR] = "^" + src[GTLT] + "\\s*(" + FULLPLAIN + ")$|^$";
    var COMPARATORTRIM = R++;
    src[COMPARATORTRIM] = "(\\s*)" + src[GTLT] + "\\s*(" + LOOSEPLAIN + "|" + src[XRANGEPLAIN] + ")";
    re[COMPARATORTRIM] = new RegExp(src[COMPARATORTRIM], "g");
    safeRe[COMPARATORTRIM] = new RegExp(makeSafeRe(src[COMPARATORTRIM]), "g");
    var comparatorTrimReplace = "$1$2$3";
    var HYPHENRANGE = R++;
    src[HYPHENRANGE] = "^\\s*(" + src[XRANGEPLAIN] + ")\\s+-\\s+(" + src[XRANGEPLAIN] + ")\\s*$";
    var HYPHENRANGELOOSE = R++;
    src[HYPHENRANGELOOSE] = "^\\s*(" + src[XRANGEPLAINLOOSE] + ")\\s+-\\s+(" + src[XRANGEPLAINLOOSE] + ")\\s*$";
    var STAR = R++;
    src[STAR] = "(<|>)?=?\\s*\\*";
    for (i = 0; i < R; i++) {
      debug2(i, src[i]);
      if (!re[i]) {
        re[i] = new RegExp(src[i]);
        safeRe[i] = new RegExp(makeSafeRe(src[i]));
      }
    }
    var i;
    exports2.parse = parse;
    function parse(version, options) {
      if (!options || typeof options !== "object") {
        options = {
          loose: !!options,
          includePrerelease: false
        };
      }
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version !== "string") {
        return null;
      }
      if (version.length > MAX_LENGTH) {
        return null;
      }
      var r = options.loose ? safeRe[LOOSE] : safeRe[FULL];
      if (!r.test(version)) {
        return null;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        return null;
      }
    }
    exports2.valid = valid;
    function valid(version, options) {
      var v = parse(version, options);
      return v ? v.version : null;
    }
    exports2.clean = clean;
    function clean(version, options) {
      var s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    }
    exports2.SemVer = SemVer;
    function SemVer(version, options) {
      if (!options || typeof options !== "object") {
        options = {
          loose: !!options,
          includePrerelease: false
        };
      }
      if (version instanceof SemVer) {
        if (version.loose === options.loose) {
          return version;
        } else {
          version = version.version;
        }
      } else if (typeof version !== "string") {
        throw new TypeError("Invalid Version: " + version);
      }
      if (version.length > MAX_LENGTH) {
        throw new TypeError("version is longer than " + MAX_LENGTH + " characters");
      }
      if (!(this instanceof SemVer)) {
        return new SemVer(version, options);
      }
      debug2("SemVer", version, options);
      this.options = options;
      this.loose = !!options.loose;
      var m = version.trim().match(options.loose ? safeRe[LOOSE] : safeRe[FULL]);
      if (!m) {
        throw new TypeError("Invalid Version: " + version);
      }
      this.raw = version;
      this.major = +m[1];
      this.minor = +m[2];
      this.patch = +m[3];
      if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
        throw new TypeError("Invalid major version");
      }
      if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
        throw new TypeError("Invalid minor version");
      }
      if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
        throw new TypeError("Invalid patch version");
      }
      if (!m[4]) {
        this.prerelease = [];
      } else {
        this.prerelease = m[4].split(".").map(function(id) {
          if (/^[0-9]+$/.test(id)) {
            var num = +id;
            if (num >= 0 && num < MAX_SAFE_INTEGER) {
              return num;
            }
          }
          return id;
        });
      }
      this.build = m[5] ? m[5].split(".") : [];
      this.format();
    }
    SemVer.prototype.format = function() {
      this.version = this.major + "." + this.minor + "." + this.patch;
      if (this.prerelease.length) {
        this.version += "-" + this.prerelease.join(".");
      }
      return this.version;
    };
    SemVer.prototype.toString = function() {
      return this.version;
    };
    SemVer.prototype.compare = function(other) {
      debug2("SemVer.compare", this.version, this.options, other);
      if (!(other instanceof SemVer)) {
        other = new SemVer(other, this.options);
      }
      return this.compareMain(other) || this.comparePre(other);
    };
    SemVer.prototype.compareMain = function(other) {
      if (!(other instanceof SemVer)) {
        other = new SemVer(other, this.options);
      }
      return compareIdentifiers(this.major, other.major) || compareIdentifiers(this.minor, other.minor) || compareIdentifiers(this.patch, other.patch);
    };
    SemVer.prototype.comparePre = function(other) {
      if (!(other instanceof SemVer)) {
        other = new SemVer(other, this.options);
      }
      if (this.prerelease.length && !other.prerelease.length) {
        return -1;
      } else if (!this.prerelease.length && other.prerelease.length) {
        return 1;
      } else if (!this.prerelease.length && !other.prerelease.length) {
        return 0;
      }
      var i2 = 0;
      do {
        var a = this.prerelease[i2];
        var b = other.prerelease[i2];
        debug2("prerelease compare", i2, a, b);
        if (a === void 0 && b === void 0) {
          return 0;
        } else if (b === void 0) {
          return 1;
        } else if (a === void 0) {
          return -1;
        } else if (a === b) {
          continue;
        } else {
          return compareIdentifiers(a, b);
        }
      } while (++i2);
    };
    SemVer.prototype.inc = function(release, identifier) {
      switch (release) {
        case "premajor":
          this.prerelease.length = 0;
          this.patch = 0;
          this.minor = 0;
          this.major++;
          this.inc("pre", identifier);
          break;
        case "preminor":
          this.prerelease.length = 0;
          this.patch = 0;
          this.minor++;
          this.inc("pre", identifier);
          break;
        case "prepatch":
          this.prerelease.length = 0;
          this.inc("patch", identifier);
          this.inc("pre", identifier);
          break;
        case "prerelease":
          if (this.prerelease.length === 0) {
            this.inc("patch", identifier);
          }
          this.inc("pre", identifier);
          break;
        case "major":
          if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
            this.major++;
          }
          this.minor = 0;
          this.patch = 0;
          this.prerelease = [];
          break;
        case "minor":
          if (this.patch !== 0 || this.prerelease.length === 0) {
            this.minor++;
          }
          this.patch = 0;
          this.prerelease = [];
          break;
        case "patch":
          if (this.prerelease.length === 0) {
            this.patch++;
          }
          this.prerelease = [];
          break;
        case "pre":
          if (this.prerelease.length === 0) {
            this.prerelease = [0];
          } else {
            var i2 = this.prerelease.length;
            while (--i2 >= 0) {
              if (typeof this.prerelease[i2] === "number") {
                this.prerelease[i2]++;
                i2 = -2;
              }
            }
            if (i2 === -1) {
              this.prerelease.push(0);
            }
          }
          if (identifier) {
            if (this.prerelease[0] === identifier) {
              if (isNaN(this.prerelease[1])) {
                this.prerelease = [identifier, 0];
              }
            } else {
              this.prerelease = [identifier, 0];
            }
          }
          break;
        default:
          throw new Error("invalid increment argument: " + release);
      }
      this.format();
      this.raw = this.version;
      return this;
    };
    exports2.inc = inc;
    function inc(version, release, loose, identifier) {
      if (typeof loose === "string") {
        identifier = loose;
        loose = void 0;
      }
      try {
        return new SemVer(version, loose).inc(release, identifier).version;
      } catch (er) {
        return null;
      }
    }
    exports2.diff = diff;
    function diff(version1, version2) {
      if (eq(version1, version2)) {
        return null;
      } else {
        var v1 = parse(version1);
        var v2 = parse(version2);
        var prefix = "";
        if (v1.prerelease.length || v2.prerelease.length) {
          prefix = "pre";
          var defaultResult = "prerelease";
        }
        for (var key in v1) {
          if (key === "major" || key === "minor" || key === "patch") {
            if (v1[key] !== v2[key]) {
              return prefix + key;
            }
          }
        }
        return defaultResult;
      }
    }
    exports2.compareIdentifiers = compareIdentifiers;
    var numeric = /^[0-9]+$/;
    function compareIdentifiers(a, b) {
      var anum = numeric.test(a);
      var bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    }
    exports2.rcompareIdentifiers = rcompareIdentifiers;
    function rcompareIdentifiers(a, b) {
      return compareIdentifiers(b, a);
    }
    exports2.major = major;
    function major(a, loose) {
      return new SemVer(a, loose).major;
    }
    exports2.minor = minor;
    function minor(a, loose) {
      return new SemVer(a, loose).minor;
    }
    exports2.patch = patch;
    function patch(a, loose) {
      return new SemVer(a, loose).patch;
    }
    exports2.compare = compare;
    function compare(a, b, loose) {
      return new SemVer(a, loose).compare(new SemVer(b, loose));
    }
    exports2.compareLoose = compareLoose;
    function compareLoose(a, b) {
      return compare(a, b, true);
    }
    exports2.rcompare = rcompare;
    function rcompare(a, b, loose) {
      return compare(b, a, loose);
    }
    exports2.sort = sort;
    function sort(list, loose) {
      return list.sort(function(a, b) {
        return exports2.compare(a, b, loose);
      });
    }
    exports2.rsort = rsort;
    function rsort(list, loose) {
      return list.sort(function(a, b) {
        return exports2.rcompare(a, b, loose);
      });
    }
    exports2.gt = gt;
    function gt(a, b, loose) {
      return compare(a, b, loose) > 0;
    }
    exports2.lt = lt;
    function lt(a, b, loose) {
      return compare(a, b, loose) < 0;
    }
    exports2.eq = eq;
    function eq(a, b, loose) {
      return compare(a, b, loose) === 0;
    }
    exports2.neq = neq;
    function neq(a, b, loose) {
      return compare(a, b, loose) !== 0;
    }
    exports2.gte = gte;
    function gte(a, b, loose) {
      return compare(a, b, loose) >= 0;
    }
    exports2.lte = lte;
    function lte(a, b, loose) {
      return compare(a, b, loose) <= 0;
    }
    exports2.cmp = cmp;
    function cmp(a, op, b, loose) {
      switch (op) {
        case "===":
          if (typeof a === "object")
            a = a.version;
          if (typeof b === "object")
            b = b.version;
          return a === b;
        case "!==":
          if (typeof a === "object")
            a = a.version;
          if (typeof b === "object")
            b = b.version;
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError("Invalid operator: " + op);
      }
    }
    exports2.Comparator = Comparator;
    function Comparator(comp, options) {
      if (!options || typeof options !== "object") {
        options = {
          loose: !!options,
          includePrerelease: false
        };
      }
      if (comp instanceof Comparator) {
        if (comp.loose === !!options.loose) {
          return comp;
        } else {
          comp = comp.value;
        }
      }
      if (!(this instanceof Comparator)) {
        return new Comparator(comp, options);
      }
      comp = comp.trim().split(/\s+/).join(" ");
      debug2("comparator", comp, options);
      this.options = options;
      this.loose = !!options.loose;
      this.parse(comp);
      if (this.semver === ANY) {
        this.value = "";
      } else {
        this.value = this.operator + this.semver.version;
      }
      debug2("comp", this);
    }
    var ANY = {};
    Comparator.prototype.parse = function(comp) {
      var r = this.options.loose ? safeRe[COMPARATORLOOSE] : safeRe[COMPARATOR];
      var m = comp.match(r);
      if (!m) {
        throw new TypeError("Invalid comparator: " + comp);
      }
      this.operator = m[1];
      if (this.operator === "=") {
        this.operator = "";
      }
      if (!m[2]) {
        this.semver = ANY;
      } else {
        this.semver = new SemVer(m[2], this.options.loose);
      }
    };
    Comparator.prototype.toString = function() {
      return this.value;
    };
    Comparator.prototype.test = function(version) {
      debug2("Comparator.test", version, this.options.loose);
      if (this.semver === ANY) {
        return true;
      }
      if (typeof version === "string") {
        version = new SemVer(version, this.options);
      }
      return cmp(version, this.operator, this.semver, this.options);
    };
    Comparator.prototype.intersects = function(comp, options) {
      if (!(comp instanceof Comparator)) {
        throw new TypeError("a Comparator is required");
      }
      if (!options || typeof options !== "object") {
        options = {
          loose: !!options,
          includePrerelease: false
        };
      }
      var rangeTmp;
      if (this.operator === "") {
        rangeTmp = new Range(comp.value, options);
        return satisfies(this.value, rangeTmp, options);
      } else if (comp.operator === "") {
        rangeTmp = new Range(this.value, options);
        return satisfies(comp.semver, rangeTmp, options);
      }
      var sameDirectionIncreasing = (this.operator === ">=" || this.operator === ">") && (comp.operator === ">=" || comp.operator === ">");
      var sameDirectionDecreasing = (this.operator === "<=" || this.operator === "<") && (comp.operator === "<=" || comp.operator === "<");
      var sameSemVer = this.semver.version === comp.semver.version;
      var differentDirectionsInclusive = (this.operator === ">=" || this.operator === "<=") && (comp.operator === ">=" || comp.operator === "<=");
      var oppositeDirectionsLessThan = cmp(this.semver, "<", comp.semver, options) && ((this.operator === ">=" || this.operator === ">") && (comp.operator === "<=" || comp.operator === "<"));
      var oppositeDirectionsGreaterThan = cmp(this.semver, ">", comp.semver, options) && ((this.operator === "<=" || this.operator === "<") && (comp.operator === ">=" || comp.operator === ">"));
      return sameDirectionIncreasing || sameDirectionDecreasing || sameSemVer && differentDirectionsInclusive || oppositeDirectionsLessThan || oppositeDirectionsGreaterThan;
    };
    exports2.Range = Range;
    function Range(range, options) {
      if (!options || typeof options !== "object") {
        options = {
          loose: !!options,
          includePrerelease: false
        };
      }
      if (range instanceof Range) {
        if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
          return range;
        } else {
          return new Range(range.raw, options);
        }
      }
      if (range instanceof Comparator) {
        return new Range(range.value, options);
      }
      if (!(this instanceof Range)) {
        return new Range(range, options);
      }
      this.options = options;
      this.loose = !!options.loose;
      this.includePrerelease = !!options.includePrerelease;
      this.raw = range.trim().split(/\s+/).join(" ");
      this.set = this.raw.split("||").map(function(range2) {
        return this.parseRange(range2.trim());
      }, this).filter(function(c) {
        return c.length;
      });
      if (!this.set.length) {
        throw new TypeError("Invalid SemVer Range: " + this.raw);
      }
      this.format();
    }
    Range.prototype.format = function() {
      this.range = this.set.map(function(comps) {
        return comps.join(" ").trim();
      }).join("||").trim();
      return this.range;
    };
    Range.prototype.toString = function() {
      return this.range;
    };
    Range.prototype.parseRange = function(range) {
      var loose = this.options.loose;
      var hr = loose ? safeRe[HYPHENRANGELOOSE] : safeRe[HYPHENRANGE];
      range = range.replace(hr, hyphenReplace);
      debug2("hyphen replace", range);
      range = range.replace(safeRe[COMPARATORTRIM], comparatorTrimReplace);
      debug2("comparator trim", range, safeRe[COMPARATORTRIM]);
      range = range.replace(safeRe[TILDETRIM], tildeTrimReplace);
      range = range.replace(safeRe[CARETTRIM], caretTrimReplace);
      var compRe = loose ? safeRe[COMPARATORLOOSE] : safeRe[COMPARATOR];
      var set = range.split(" ").map(function(comp) {
        return parseComparator(comp, this.options);
      }, this).join(" ").split(/\s+/);
      if (this.options.loose) {
        set = set.filter(function(comp) {
          return !!comp.match(compRe);
        });
      }
      set = set.map(function(comp) {
        return new Comparator(comp, this.options);
      }, this);
      return set;
    };
    Range.prototype.intersects = function(range, options) {
      if (!(range instanceof Range)) {
        throw new TypeError("a Range is required");
      }
      return this.set.some(function(thisComparators) {
        return thisComparators.every(function(thisComparator) {
          return range.set.some(function(rangeComparators) {
            return rangeComparators.every(function(rangeComparator) {
              return thisComparator.intersects(rangeComparator, options);
            });
          });
        });
      });
    };
    exports2.toComparators = toComparators;
    function toComparators(range, options) {
      return new Range(range, options).set.map(function(comp) {
        return comp.map(function(c) {
          return c.value;
        }).join(" ").trim().split(" ");
      });
    }
    function parseComparator(comp, options) {
      debug2("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug2("caret", comp);
      comp = replaceTildes(comp, options);
      debug2("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug2("xrange", comp);
      comp = replaceStars(comp, options);
      debug2("stars", comp);
      return comp;
    }
    function isX(id) {
      return !id || id.toLowerCase() === "x" || id === "*";
    }
    function replaceTildes(comp, options) {
      return comp.trim().split(/\s+/).map(function(comp2) {
        return replaceTilde(comp2, options);
      }).join(" ");
    }
    function replaceTilde(comp, options) {
      var r = options.loose ? safeRe[TILDELOOSE] : safeRe[TILDE];
      return comp.replace(r, function(_, M, m, p, pr) {
        debug2("tilde", comp, _, M, m, p, pr);
        var ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = ">=" + M + ".0.0 <" + (+M + 1) + ".0.0";
        } else if (isX(p)) {
          ret = ">=" + M + "." + m + ".0 <" + M + "." + (+m + 1) + ".0";
        } else if (pr) {
          debug2("replaceTilde pr", pr);
          ret = ">=" + M + "." + m + "." + p + "-" + pr + " <" + M + "." + (+m + 1) + ".0";
        } else {
          ret = ">=" + M + "." + m + "." + p + " <" + M + "." + (+m + 1) + ".0";
        }
        debug2("tilde return", ret);
        return ret;
      });
    }
    function replaceCarets(comp, options) {
      return comp.trim().split(/\s+/).map(function(comp2) {
        return replaceCaret(comp2, options);
      }).join(" ");
    }
    function replaceCaret(comp, options) {
      debug2("caret", comp, options);
      var r = options.loose ? safeRe[CARETLOOSE] : safeRe[CARET];
      return comp.replace(r, function(_, M, m, p, pr) {
        debug2("caret", comp, _, M, m, p, pr);
        var ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = ">=" + M + ".0.0 <" + (+M + 1) + ".0.0";
        } else if (isX(p)) {
          if (M === "0") {
            ret = ">=" + M + "." + m + ".0 <" + M + "." + (+m + 1) + ".0";
          } else {
            ret = ">=" + M + "." + m + ".0 <" + (+M + 1) + ".0.0";
          }
        } else if (pr) {
          debug2("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = ">=" + M + "." + m + "." + p + "-" + pr + " <" + M + "." + m + "." + (+p + 1);
            } else {
              ret = ">=" + M + "." + m + "." + p + "-" + pr + " <" + M + "." + (+m + 1) + ".0";
            }
          } else {
            ret = ">=" + M + "." + m + "." + p + "-" + pr + " <" + (+M + 1) + ".0.0";
          }
        } else {
          debug2("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = ">=" + M + "." + m + "." + p + " <" + M + "." + m + "." + (+p + 1);
            } else {
              ret = ">=" + M + "." + m + "." + p + " <" + M + "." + (+m + 1) + ".0";
            }
          } else {
            ret = ">=" + M + "." + m + "." + p + " <" + (+M + 1) + ".0.0";
          }
        }
        debug2("caret return", ret);
        return ret;
      });
    }
    function replaceXRanges(comp, options) {
      debug2("replaceXRanges", comp, options);
      return comp.split(/\s+/).map(function(comp2) {
        return replaceXRange(comp2, options);
      }).join(" ");
    }
    function replaceXRange(comp, options) {
      comp = comp.trim();
      var r = options.loose ? safeRe[XRANGELOOSE] : safeRe[XRANGE];
      return comp.replace(r, function(ret, gtlt, M, m, p, pr) {
        debug2("xRange", comp, ret, gtlt, M, m, p, pr);
        var xM = isX(M);
        var xm = xM || isX(m);
        var xp = xm || isX(p);
        var anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          ret = gtlt + M + "." + m + "." + p;
        } else if (xm) {
          ret = ">=" + M + ".0.0 <" + (+M + 1) + ".0.0";
        } else if (xp) {
          ret = ">=" + M + "." + m + ".0 <" + M + "." + (+m + 1) + ".0";
        }
        debug2("xRange return", ret);
        return ret;
      });
    }
    function replaceStars(comp, options) {
      debug2("replaceStars", comp, options);
      return comp.trim().replace(safeRe[STAR], "");
    }
    function hyphenReplace($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr, tb) {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = ">=" + fM + ".0.0";
      } else if (isX(fp)) {
        from = ">=" + fM + "." + fm + ".0";
      } else {
        from = ">=" + from;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = "<" + (+tM + 1) + ".0.0";
      } else if (isX(tp)) {
        to = "<" + tM + "." + (+tm + 1) + ".0";
      } else if (tpr) {
        to = "<=" + tM + "." + tm + "." + tp + "-" + tpr;
      } else {
        to = "<=" + to;
      }
      return (from + " " + to).trim();
    }
    Range.prototype.test = function(version) {
      if (!version) {
        return false;
      }
      if (typeof version === "string") {
        version = new SemVer(version, this.options);
      }
      for (var i2 = 0; i2 < this.set.length; i2++) {
        if (testSet(this.set[i2], version, this.options)) {
          return true;
        }
      }
      return false;
    };
    function testSet(set, version, options) {
      for (var i2 = 0; i2 < set.length; i2++) {
        if (!set[i2].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (i2 = 0; i2 < set.length; i2++) {
          debug2(set[i2].semver);
          if (set[i2].semver === ANY) {
            continue;
          }
          if (set[i2].semver.prerelease.length > 0) {
            var allowed = set[i2].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    }
    exports2.satisfies = satisfies;
    function satisfies(version, range, options) {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    }
    exports2.maxSatisfying = maxSatisfying;
    function maxSatisfying(versions, range, options) {
      var max = null;
      var maxSV = null;
      try {
        var rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach(function(v) {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    }
    exports2.minSatisfying = minSatisfying;
    function minSatisfying(versions, range, options) {
      var min = null;
      var minSV = null;
      try {
        var rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach(function(v) {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    }
    exports2.minVersion = minVersion;
    function minVersion(range, loose) {
      range = new Range(range, loose);
      var minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (var i2 = 0; i2 < range.set.length; ++i2) {
        var comparators = range.set[i2];
        comparators.forEach(function(comparator) {
          var compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            case "":
            case ">=":
              if (!minver || gt(minver, compver)) {
                minver = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            default:
              throw new Error("Unexpected operation: " + comparator.operator);
          }
        });
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    }
    exports2.validRange = validRange;
    function validRange(range, options) {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    }
    exports2.ltr = ltr;
    function ltr(version, range, options) {
      return outside(version, range, "<", options);
    }
    exports2.gtr = gtr;
    function gtr(version, range, options) {
      return outside(version, range, ">", options);
    }
    exports2.outside = outside;
    function outside(version, range, hilo, options) {
      version = new SemVer(version, options);
      range = new Range(range, options);
      var gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (var i2 = 0; i2 < range.set.length; ++i2) {
        var comparators = range.set[i2];
        var high = null;
        var low = null;
        comparators.forEach(function(comparator) {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    }
    exports2.prerelease = prerelease;
    function prerelease(version, options) {
      var parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    }
    exports2.intersects = intersects;
    function intersects(r1, r2, options) {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2);
    }
    exports2.coerce = coerce;
    function coerce(version) {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version !== "string") {
        return null;
      }
      var match = version.match(safeRe[COERCE]);
      if (match == null) {
        return null;
      }
      return parse(match[1] + "." + (match[2] || "0") + "." + (match[3] || "0"));
    }
  }
});

// ../../node_modules/azure-pipelines-task-lib/lib-resource.js
var require_lib_resource = __commonJS({
  "../../node_modules/azure-pipelines-task-lib/lib-resource.js"(exports2, module2) {
    module2.exports = {
      "messages": {
        "LIB_CopyDirectoryWithoutRecursiveOption": "cp: cannot copy a directory '%s' without the recursive option",
        "LIB_CopyFileFailed": "Error while copying the file. Attempts left: %s",
        "LIB_DirectoryStackEmpty": "Directory stack is empty",
        "LIB_EndpointAuthNotExist": "Endpoint auth data not present: %s",
        "LIB_EndpointDataNotExist": "Endpoint data parameter %s not present: %s",
        "LIB_EndpointNotExist": "Endpoint not present: %s",
        "LIB_FailOnCode": "Failure return code: %d",
        "LIB_InputRequired": "Input required: %s",
        "LIB_InvalidEndpointAuth": "Invalid endpoint auth: %s",
        "LIB_InvalidPattern": "Invalid pattern: '%s'",
        "LIB_InvalidSecureFilesInput": "Invalid secure file input: %s",
        "LIB_LocStringNotFound": "Can\\'t find loc string for key: %s",
        "LIB_MergeTestResultNotSupported": "Merging test results from multiple files to one test run is not supported on this version of build agent for OSX/Linux, each test result file will be published as a separate test run in VSO/TFS.",
        "LIB_MkdirFailed": "Unable to create directory '%s'. %s",
        "LIB_MkdirFailedFileExists": "Unable to create directory '%s'. Conflicting file exists: '%s'",
        "LIB_MkdirFailedInvalidDriveRoot": "Unable to create directory '%s'. Root directory does not exist: '%s'",
        "LIB_MkdirFailedInvalidShare": "Unable to create directory '%s'. Unable to verify the directory exists: '%s'. If directory is a file share, please verify the share name is correct, the share is online, and the current process has permission to access the share.",
        "LIB_MultilineSecret": "Secrets cannot contain multiple lines",
        "LIB_NotFoundPreviousDirectory": "Could not find previous directory",
        "LIB_OperationFailed": "Failed %s: %s",
        "LIB_ParameterIsRequired": "%s not supplied",
        "LIB_PathHasNullByte": "Path cannot contain null bytes",
        "LIB_PathIsNotADirectory": "Path is not a directory: %s",
        "LIB_PathNotFound": "Not found %s: %s",
        "LIB_PlatformNotSupported": "Platform not supported: %s",
        "LIB_ProcessError": "There was an error when attempting to execute the process '%s'. This may indicate the process failed to start. Error: %s",
        "LIB_ProcessExitCode": "The process '%s' failed with exit code %s",
        "LIB_ProcessStderr": "The process '%s' failed because one or more lines were written to the STDERR stream",
        "LIB_ResourceFileAlreadySet": "Resource file has already set to: %s",
        "LIB_ResourceFileNotExist": "Resource file doesn\\'t exist: %s",
        "LIB_ResourceFileNotSet": "Resource file haven\\'t set, can\\'t find loc string for key: %s",
        "LIB_ReturnCode": "Return code: %d",
        "LIB_StdioNotClosed": "The STDIO streams did not close within %s seconds of the exit event from process '%s'. This may indicate a child process inherited the STDIO streams and has not yet exited.",
        "LIB_UndefinedNodeVersion": "Node version is undefined.",
        "LIB_UnhandledEx": "Unhandled: %s",
        "LIB_UseFirstGlobMatch": "Multiple workspace matches. using first.",
        "LIB_WhichNotFound_Linux": "Unable to locate executable file: '%s'. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also check the file mode to verify the file is executable.",
        "LIB_WhichNotFound_Win": "Unable to locate executable file: '%s'. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also verify the file has a valid extension for an executable file."
      },
      "localizedMessages": {
        "de-DE": {
          "loc.messages.LIB_CopyFileFailed": "Fehler beim Kopieren der Datei. Verbleibende Versuche: %s",
          "loc.messages.LIB_DirectoryStackEmpty": "Der Verzeichnisstapel ist leer.",
          "loc.messages.LIB_EndpointAuthNotExist": "Die Endpunkt-Authentifizierungsdatensind nicht vorhanden: %s",
          "loc.messages.LIB_EndpointDataNotExist": "Der Endpunkt-Datenparameter %s ist nicht vorhanden: %s",
          "loc.messages.LIB_EndpointNotExist": "Der Endpunkt ist nicht vorhanden: %s",
          "loc.messages.LIB_FailOnCode": "Fehler beim R\xFCckgabecode: %d",
          "loc.messages.LIB_InputRequired": "Eingabe erforderlich: %s",
          "loc.messages.LIB_InvalidEndpointAuth": "Ung\xFCltige Endpunktauthentifizierung: %s",
          "loc.messages.LIB_InvalidPattern": 'Ung\xFCltiges Muster: "%s"',
          "loc.messages.LIB_InvalidSecureFilesInput": "Ung\xFCltige sichere Dateiausgabe: %s",
          "loc.messages.LIB_LocStringNotFound": "Die Lokalisierungszeichenfolge f\xFCr den folgenden Schl\xFCssel wurde nicht gefunden: %s",
          "loc.messages.LIB_MergeTestResultNotSupported": "Das Mergen von Testergebnissen aus mehreren Dateien in einen Testlauf wird von dieser Version des Build-Agents f\xFCr OSX/Linux nicht unterst\xFCtzt. Jede Testergebnisdatei wird als separater Testlauf in VSO/TFS ver\xF6ffentlicht.",
          "loc.messages.LIB_MkdirFailed": 'Das Verzeichnis "%s" kann nicht erstellt werden. %s',
          "loc.messages.LIB_MkdirFailedFileExists": 'Das Verzeichnis "%s" kann nicht erstellt werden. Eine in Konflikt stehende Datei ist vorhanden: "%s"',
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": 'Das Verzeichnis "%s" kann nicht erstellt werden. Das Stammverzeichnis ist nicht vorhanden: %s',
          "loc.messages.LIB_MkdirFailedInvalidShare": 'Das Verzeichnis "%s" kann nicht erstellt werden. Es kann nicht \xFCberpr\xFCft werden, ob das Verzeichnis vorhanden ist: {%s}. Wenn das Verzeichnis eine Dateifreigabe ist, stellen Sie sicher, dass der Freigabename richtig, die Freigabe online und der aktuelle Prozess berechtigt ist, auf die Freigabe zuzugreifen.',
          "loc.messages.LIB_MultilineSecret": "Geheimnisse d\xFCrfen nicht mehrere Zeilen enthalten",
          "loc.messages.LIB_NotFoundPreviousDirectory": "Vorheriges Verzeichnis wurde nicht gefunden.",
          "loc.messages.LIB_OperationFailed": "Fehler %s: %s",
          "loc.messages.LIB_ParameterIsRequired": '"%s" wurde nicht angegeben.',
          "loc.messages.LIB_PathHasNullByte": "Der Pfad darf keine NULL-Bytes enthalten.",
          "loc.messages.LIB_PathIsNotADirectory": "Der Pfad ist kein Verzeichnis: %s",
          "loc.messages.LIB_PathNotFound": "Nicht gefunden %s: %s",
          "loc.messages.LIB_PlatformNotSupported": "Plattform wird nicht unterst\xFCtzt: %s",
          "loc.messages.LIB_ProcessError": 'Fehler beim Ausf\xFChren des Prozesses "%s". M\xF6glicherweise konnte der Prozess nicht gestartet werden. Fehler: %s',
          "loc.messages.LIB_ProcessExitCode": 'Fehler beim Prozess "%s" mit Exitcode %s.',
          "loc.messages.LIB_ProcessStderr": 'Fehler beim Prozess "%s": Mindestens eine Zeile wurde in den STDERR-Datenstrom geschrieben.',
          "loc.messages.LIB_ResourceFileAlreadySet": "Die Ressourcendatei wurde bereits festgelegt auf: %s",
          "loc.messages.LIB_ResourceFileNotExist": "Die Ressourcendatei ist nicht vorhanden: %s",
          "loc.messages.LIB_ResourceFileNotSet": "Die Ressourcendatei wurde nicht festgelegt. Die Lokalisierungszeichenfolge f\xFCr den folgenden Schl\xFCssel wurde nicht gefunden: %s",
          "loc.messages.LIB_ReturnCode": "R\xFCckgabecode: %d",
          "loc.messages.LIB_StdioNotClosed": 'Die STDIO-Datenstr\xF6me wurden nicht innerhalb von %s\xA0Sekunden nach dem Beendigungsereignis aus dem Prozess "%s" geschlossen. M\xF6glicherweise hat ein untergeordneter Prozess die STDIO-Datenstr\xF6me geerbt und wurde noch nicht beendet.',
          "loc.messages.LIB_UndefinedNodeVersion": "Die Knotenversion ist nicht definiert.",
          "loc.messages.LIB_UnhandledEx": "Ausnahmefehler: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "Mehrere Arbeitsbereich\xFCbereinstimmungen. Die erste \xDCbereinstimmung wird verwendet.",
          "loc.messages.LIB_WhichNotFound_Linux": "Ausf\xFChrbare Datei nicht gefunden: '%s'. Pr\xFCfen Sie, ob der Dateipfad vorhanden ist oder sich die Datei in einem von der PATH-Umgebungsvariablen angegebenen Verzeichnis befindet. Pr\xFCfen Sie zudem den Dateimodus, um sicherzustellen, dass die Datei ausf\xFChrbar ist.",
          "loc.messages.LIB_WhichNotFound_Win": 'Ausf\xFChrbare Datei nicht gefunden: "%s". Pr\xFCfen Sie, ob der Dateipfad vorhanden ist oder sich die Datei in einem von der PATH-Umgebungsvariablen angegebenen Verzeichnis befindet. Pr\xFCfen Sie zudem, ob die Datei eine g\xFCltige Erweiterung f\xFCr eine ausf\xFChrbare Datei aufweist.'
        },
        "en-US": {
          "loc.messages.LIB_CopyDirectoryWithoutRecursiveOption": "cp: cannot copy a directory '%s' without the recursive option",
          "loc.messages.LIB_CopyFileFailed": "Error while copying the file. Attempts left: %s",
          "loc.messages.LIB_DirectoryStackEmpty": "Directory stack is empty",
          "loc.messages.LIB_EndpointAuthNotExist": "Endpoint auth data not present: %s",
          "loc.messages.LIB_EndpointDataNotExist": "Endpoint data parameter %s not present: %s",
          "loc.messages.LIB_EndpointNotExist": "Endpoint not present: %s",
          "loc.messages.LIB_FailOnCode": "Failure return code: %d",
          "loc.messages.LIB_InputRequired": "Input required: %s",
          "loc.messages.LIB_InvalidEndpointAuth": "Invalid endpoint auth: %s",
          "loc.messages.LIB_InvalidPattern": "Invalid pattern: '%s'",
          "loc.messages.LIB_InvalidSecureFilesInput": "Invalid secure file input: %s",
          "loc.messages.LIB_LocStringNotFound": "Can\\'t find loc string for key: %s",
          "loc.messages.LIB_MergeTestResultNotSupported": "Merging test results from multiple files to one test run is not supported on this version of build agent for OSX/Linux, each test result file will be published as a separate test run in VSO/TFS.",
          "loc.messages.LIB_MkdirFailed": "Unable to create directory '%s'. %s",
          "loc.messages.LIB_MkdirFailedFileExists": "Unable to create directory '%s'. Conflicting file exists: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": "Unable to create directory '%s'. Root directory does not exist: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidShare": "Unable to create directory '%s'. Unable to verify the directory exists: '%s'. If directory is a file share, please verify the share name is correct, the share is online, and the current process has permission to access the share.",
          "loc.messages.LIB_MultilineSecret": "Secrets cannot contain multiple lines",
          "loc.messages.LIB_NotFoundPreviousDirectory": "Could not find previous directory",
          "loc.messages.LIB_OperationFailed": "Failed %s: %s",
          "loc.messages.LIB_ParameterIsRequired": "%s not supplied",
          "loc.messages.LIB_PathHasNullByte": "Path cannot contain null bytes",
          "loc.messages.LIB_PathIsNotADirectory": "Path is not a directory: %s",
          "loc.messages.LIB_PathNotFound": "Not found %s: %s",
          "loc.messages.LIB_PlatformNotSupported": "Platform not supported: %s",
          "loc.messages.LIB_ProcessError": "There was an error when attempting to execute the process '%s'. This may indicate the process failed to start. Error: %s",
          "loc.messages.LIB_ProcessExitCode": "The process '%s' failed with exit code %s",
          "loc.messages.LIB_ProcessStderr": "The process '%s' failed because one or more lines were written to the STDERR stream",
          "loc.messages.LIB_ResourceFileAlreadySet": "Resource file has already set to: %s",
          "loc.messages.LIB_ResourceFileNotExist": "Resource file doesn\\'t exist: %s",
          "loc.messages.LIB_ResourceFileNotSet": "Resource file haven\\'t set, can\\'t find loc string for key: %s",
          "loc.messages.LIB_ReturnCode": "Return code: %d",
          "loc.messages.LIB_StdioNotClosed": "The STDIO streams did not close within %s seconds of the exit event from process '%s'. This may indicate a child process inherited the STDIO streams and has not yet exited.",
          "loc.messages.LIB_UndefinedNodeVersion": "Node version is undefined.",
          "loc.messages.LIB_UnhandledEx": "Unhandled: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "Multiple workspace matches. using first.",
          "loc.messages.LIB_WhichNotFound_Linux": "Unable to locate executable file: '%s'. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also check the file mode to verify the file is executable.",
          "loc.messages.LIB_WhichNotFound_Win": "Unable to locate executable file: '%s'. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also verify the file has a valid extension for an executable file."
        },
        "es-ES": {
          "loc.messages.LIB_CopyFileFailed": "Error al copiar el archivo. Intentos restantes: %s",
          "loc.messages.LIB_DirectoryStackEmpty": "La pila de directorios est\xE1 vac\xEDa",
          "loc.messages.LIB_EndpointAuthNotExist": "Los datos de autenticaci\xF3n del punto de conexi\xF3n no existen: %s.",
          "loc.messages.LIB_EndpointDataNotExist": "El par\xE1metro %s de datos del punto de conexi\xF3n no existe: %s.",
          "loc.messages.LIB_EndpointNotExist": "No hay punto de conexi\xF3n: %s",
          "loc.messages.LIB_FailOnCode": "C\xF3digo de retorno de error: %d",
          "loc.messages.LIB_InputRequired": "Entrada requerida: %s",
          "loc.messages.LIB_InvalidEndpointAuth": "Autenticaci\xF3n de punto de conexi\xF3n no v\xE1lida: %s",
          "loc.messages.LIB_InvalidPattern": "Patr\xF3n no v\xE1lido: '%s'",
          "loc.messages.LIB_InvalidSecureFilesInput": "Entrada de archivo seguro no v\xE1lida: %s",
          "loc.messages.LIB_LocStringNotFound": "No se encuentra la cadena localizada para la clave: %s",
          "loc.messages.LIB_MergeTestResultNotSupported": "Esta versi\xF3n del agente de compilaci\xF3n para OSX/Linux no admite la fusi\xF3n mediante combinaci\xF3n de resultados de pruebas de varios archivos en una serie de pruebas. Cada archivo de resultados de pruebas se publicar\xE1 como una serie de pruebas diferente en VSO/TFS.",
          "loc.messages.LIB_MkdirFailed": "No se puede crear el directorio '%s'. %s",
          "loc.messages.LIB_MkdirFailedFileExists": "No se puede crear el directorio '%s'. Hay un conflicto entre archivos: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": "No se puede crear el directorio '%s'. El directorio ra\xEDz no existe: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidShare": "No se puede crear el directorio '%s'. No se puede comprobar si el directorio existe: '%s'. Si el directorio es un recurso compartido de archivos, compruebe que el nombre es correcto, que est\xE1 en l\xEDnea y que el proceso actual tiene permiso de acceso a este.",
          "loc.messages.LIB_MultilineSecret": "Los secretos no pueden contener varias l\xEDneas.",
          "loc.messages.LIB_NotFoundPreviousDirectory": "No se ha encontrado el directorio anterior",
          "loc.messages.LIB_OperationFailed": "Error de %s: %s",
          "loc.messages.LIB_ParameterIsRequired": "No se ha proporcionado %s",
          "loc.messages.LIB_PathHasNullByte": "La ruta de acceso no puede tener bytes nulos",
          "loc.messages.LIB_PathIsNotADirectory": "La ruta de acceso no es un directorio: %s",
          "loc.messages.LIB_PathNotFound": "No se encuentra %s: %s",
          "loc.messages.LIB_PlatformNotSupported": "No se admite la plataforma: %s",
          "loc.messages.LIB_ProcessError": 'Error al intentar ejecutar el proceso "%s". Esto puede indicar que no se pudo iniciar el proceso. Error: %s',
          "loc.messages.LIB_ProcessExitCode": 'Error del proceso "%s" con el c\xF3digo de salida %s',
          "loc.messages.LIB_ProcessStderr": 'Error del proceso "%s" porque se escribieron una o varias l\xEDneas en la secuencia STDERR',
          "loc.messages.LIB_ResourceFileAlreadySet": "El archivo de recursos se ha establecido ya en: %s",
          "loc.messages.LIB_ResourceFileNotExist": "El archivo de recursos no existe: %s",
          "loc.messages.LIB_ResourceFileNotSet": "No se ha establecido el archivo de recursos. No se encuentra la cadena localizada para la clave: %s",
          "loc.messages.LIB_ReturnCode": "C\xF3digo de retorno: %d",
          "loc.messages.LIB_StdioNotClosed": 'Las secuencias STDIO no se cerraron en un plazo de %s\xA0segundos desde el evento de salida del proceso "%s". Esto puede indicar que un proceso secundario ha heredado las secuencias STDIO y a\xFAn no se ha cerrado.',
          "loc.messages.LIB_UndefinedNodeVersion": "La versi\xF3n del nodo no est\xE1 definida.",
          "loc.messages.LIB_UnhandledEx": "No controlada: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "Hay varias coincidencias en el \xE1rea de trabajo. Se usar\xE1 la primera.",
          "loc.messages.LIB_WhichNotFound_Linux": 'No se puede encontrar el archivo ejecutable: "%s". Compruebe que la ruta de acceso del archivo existe o que el archivo se puede encontrar en un directorio especificado en la variable de entorno PATH. Revise tambi\xE9n el modo de archivo para comprobar que el archivo es ejecutable.',
          "loc.messages.LIB_WhichNotFound_Win": 'No se puede encontrar el archivo ejecutable: "%s". Compruebe que la ruta de acceso del archivo existe o que el archivo se puede encontrar en un directorio especificado en la variable de entorno PATH. Revise tambi\xE9n que el archivo tenga una extensi\xF3n v\xE1lida para un archivo ejecutable.'
        },
        "fr-FR": {
          "loc.messages.LIB_CopyFileFailed": "Erreur durant la copie du fichier. Tentatives restantes\xA0: %s",
          "loc.messages.LIB_DirectoryStackEmpty": "La pile de r\xE9pertoires est vide",
          "loc.messages.LIB_EndpointAuthNotExist": "Donn\xE9es d'authentification du point de terminaison absentes\xA0: %s",
          "loc.messages.LIB_EndpointDataNotExist": "Param\xE8tre de donn\xE9es du point de terminaison %s absent\xA0: %s",
          "loc.messages.LIB_EndpointNotExist": "Point de terminaison absent\xA0: %s",
          "loc.messages.LIB_FailOnCode": "Code de retour de l'\xE9chec\xA0: %d",
          "loc.messages.LIB_InputRequired": "Entr\xE9e n\xE9cessaire\xA0: %s",
          "loc.messages.LIB_InvalidEndpointAuth": "Authentification du point de terminaison non valide\xA0: %s",
          "loc.messages.LIB_InvalidPattern": "Mod\xE8le non valide\xA0: '%s'",
          "loc.messages.LIB_InvalidSecureFilesInput": "Entr\xE9e de fichier s\xE9curis\xE9 non valide\xA0: %s",
          "loc.messages.LIB_LocStringNotFound": "Cha\xEEne localis\xE9e introuvable pour la cl\xE9\xA0: %s",
          "loc.messages.LIB_MergeTestResultNotSupported": "La fusion des r\xE9sultats des tests de plusieurs fichiers en une seule s\xE9rie de tests n'est pas prise en charge dans cette version de l'agent de build pour OSX/Linux. Chaque fichier de r\xE9sultats des tests est publi\xE9 en tant que s\xE9rie de tests distincte dans VSO/TFS.",
          "loc.messages.LIB_MkdirFailed": "Impossible de cr\xE9er le r\xE9pertoire '%s'. %s",
          "loc.messages.LIB_MkdirFailedFileExists": "Impossible de cr\xE9er le r\xE9pertoire '%s'. Pr\xE9sence d'un fichier en conflit\xA0: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": "Impossible de cr\xE9er le r\xE9pertoire '%s'. Le r\xE9pertoire racine n'existe pas\xA0: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidShare": "Impossible de cr\xE9er le r\xE9pertoire '%s'. Impossible de v\xE9rifier l'existence du r\xE9pertoire\xA0: '%s'. Si le r\xE9pertoire est un partage de fichiers, v\xE9rifiez que le nom du partage est correct, que le partage est en ligne, et que le processus actuel est autoris\xE9 \xE0 acc\xE9der au partage.",
          "loc.messages.LIB_MultilineSecret": "Les secrets ne peuvent pas contenir plusieurs lignes",
          "loc.messages.LIB_NotFoundPreviousDirectory": "D\xE9sol\xE9, nous n\u2019avons pas pu trouver le r\xE9pertoire pr\xE9c\xE9dent",
          "loc.messages.LIB_OperationFailed": "\xC9chec de %s\xA0: %s",
          "loc.messages.LIB_ParameterIsRequired": "%s non fourni",
          "loc.messages.LIB_PathHasNullByte": "Le chemin ne peut pas contenir d'octets de valeur Null",
          "loc.messages.LIB_PathIsNotADirectory": "Le chemin d\u2019acc\xE8s n\u2019est pas un r\xE9pertoire : %s",
          "loc.messages.LIB_PathNotFound": "%s\xA0: %s introuvable",
          "loc.messages.LIB_PlatformNotSupported": "Plateforme non prise en charge\xA0: %s",
          "loc.messages.LIB_ProcessError": "Erreur durant la tentative d'ex\xE9cution du processus '%s'. Cela peut indiquer que le processus n'a pas r\xE9ussi \xE0 d\xE9marrer. Erreur\xA0: %s",
          "loc.messages.LIB_ProcessExitCode": "\xC9chec du processus '%s'. Code de sortie\xA0: %s",
          "loc.messages.LIB_ProcessStderr": "\xC9chec du processus '%s', car une ou plusieurs lignes ont \xE9t\xE9 \xE9crites dans le flux STDERR",
          "loc.messages.LIB_ResourceFileAlreadySet": "Le fichier de ressources est d\xE9j\xE0 d\xE9fini\xA0: %s",
          "loc.messages.LIB_ResourceFileNotExist": "Le fichier de ressources n'existe pas\xA0: %s",
          "loc.messages.LIB_ResourceFileNotSet": "Le fichier de ressources n'est pas d\xE9fini. La cha\xEEne localis\xE9e de la cl\xE9 est introuvable\xA0: %s",
          "loc.messages.LIB_ReturnCode": "Code de retour\xA0: %d",
          "loc.messages.LIB_StdioNotClosed": "Les flux STDIO ne se sont pas ferm\xE9s dans les %s secondes qui ont suivi l'\xE9v\xE9nement exit du processus '%s'. Cela peut indiquer qu'un processus enfant a h\xE9rit\xE9 des flux STDIO et qu'il n'est pas encore sorti.",
          "loc.messages.LIB_UndefinedNodeVersion": "La version du n\u0153ud n\u2019est pas d\xE9finie.",
          "loc.messages.LIB_UnhandledEx": "Non g\xE9r\xE9\xA0: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "Plusieurs espaces de travail correspondants. Utilisation du premier d'entre eux.",
          "loc.messages.LIB_WhichNotFound_Linux": "Impossible de localiser le fichier ex\xE9cutable\xA0: '%s'. V\xE9rifiez si le chemin du fichier existe ou si le fichier peut se trouver dans un r\xE9pertoire sp\xE9cifi\xE9 par la variable d'environnement PATH. V\xE9rifiez \xE9galement le Mode de Fichier pour d\xE9terminer si le fichier est ex\xE9cutable.",
          "loc.messages.LIB_WhichNotFound_Win": "Impossible de localiser le fichier ex\xE9cutable\xA0: '%s'. V\xE9rifiez si le chemin du fichier existe ou si le fichier peut se trouver dans un r\xE9pertoire sp\xE9cifi\xE9 par la variable d'environnement PATH. V\xE9rifiez \xE9galement si le fichier a une extension de fichier ex\xE9cutable valide."
        },
        "it-IT": {
          "loc.messages.LIB_CopyFileFailed": "Si \xE8 verificato un errore durante la copia del file. Tentativi rimasti: %s",
          "loc.messages.LIB_DirectoryStackEmpty": "Lo stack della directory \xE8 vuoto",
          "loc.messages.LIB_EndpointAuthNotExist": "I dati di autenticazione endpoint non sono presenti: %s",
          "loc.messages.LIB_EndpointDataNotExist": "Il parametro %s dei dati dell'endpoint non \xE8 presente: %s",
          "loc.messages.LIB_EndpointNotExist": "Endpoint non presente: %s",
          "loc.messages.LIB_FailOnCode": "Codice restituito dell'errore: %d",
          "loc.messages.LIB_InputRequired": "Input richiesto: %s",
          "loc.messages.LIB_InvalidEndpointAuth": "Autenticazione endpoint non valida: %s",
          "loc.messages.LIB_InvalidPattern": "Criterio non valido: '%s'",
          "loc.messages.LIB_InvalidSecureFilesInput": "L'input del file protetto non \xE8 valido: %s",
          "loc.messages.LIB_LocStringNotFound": "La stringa localizzata per la chiave %s non \xE8 stata trovata",
          "loc.messages.LIB_MergeTestResultNotSupported": "L'unione di pi\xF9 file risultanti da un'unica esecuzione dei test non \xE8 supportata in questa versione dell'agente di compilazione per OS X/Linux. Ogni file dei risultati del test verr\xE0 pubblicato come esecuzione dei test separata in VSO/TFS.",
          "loc.messages.LIB_MkdirFailed": "Non \xE8 possibile creare la directory '%s'. %s",
          "loc.messages.LIB_MkdirFailedFileExists": "Non \xE8 possibile creare la directory '%s'. Esiste un file in conflitto: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": "Non \xE8 possibile creare la directory '%s'. La directory radice non esiste: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidShare": "Non \xE8 possibile creare la directory '%s' perch\xE9 non \xE8 possibile verificarne l'esistenza: '%s'. Se la directory \xE8 una condivisione file, verificare che il nome della condivisione sia corretto, che la condivisione sia online e che il processo corrente sia autorizzato ad accedervi.",
          "loc.messages.LIB_MultilineSecret": "I segreti non possono contenere pi\xF9 righe",
          "loc.messages.LIB_NotFoundPreviousDirectory": "Non \xE8 stato possibile trovare la directory precedente",
          "loc.messages.LIB_OperationFailed": "Operazione %s non riuscita: %s",
          "loc.messages.LIB_ParameterIsRequired": "Parametro %s non fornito",
          "loc.messages.LIB_PathHasNullByte": "Il percorso non pu\xF2 contenere byte Null",
          "loc.messages.LIB_PathIsNotADirectory": "Il percorso non \xE8 una directory: %s",
          "loc.messages.LIB_PathNotFound": "Percorso %s non trovato: %s",
          "loc.messages.LIB_PlatformNotSupported": "Piattaforma non supportata: %s",
          "loc.messages.LIB_ProcessError": "Si \xE8 verificato un errore durante il tentativo di eseguire il processo '%s'. Questo errore pu\xF2 indicare che non \xE8 stato possibile avviare il processo. Errore: %s",
          "loc.messages.LIB_ProcessExitCode": "Il processo '%s' non \xE8 riuscito. Codice di uscita: %s",
          "loc.messages.LIB_ProcessStderr": "Il processo '%s' non \xE8 riuscito perch\xE9 una o pi\xF9 righe sono state scritte nel flusso STDERR",
          "loc.messages.LIB_ResourceFileAlreadySet": "Il file di risorse \xE8 gi\xE0 stato impostato su %s",
          "loc.messages.LIB_ResourceFileNotExist": "Il file di risorse non esiste: %s",
          "loc.messages.LIB_ResourceFileNotSet": "Il file di risorse non \xE8 stato impostato. La stringa localizzata per la chiave %s non \xE8 stata trovata",
          "loc.messages.LIB_ReturnCode": "Codice restituito: %d",
          "loc.messages.LIB_StdioNotClosed": "I flussi STDIO non si sono chiusi entro %s secondi dall'evento di uscita dal processo '%s'. Questa condizione pu\xF2 indicare che un processo figlio ha ereditato i flussi STDIO e non \xE8 ancora stato terminato.",
          "loc.messages.LIB_UndefinedNodeVersion": "La versione del nodo non \xE8 definita.",
          "loc.messages.LIB_UnhandledEx": "Eccezione non gestita: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "Sono presenti pi\xF9 corrispondenze dell'area di lavoro. Verr\xE0 usata la prima.",
          "loc.messages.LIB_WhichNotFound_Linux": "Il file eseguibile '%s' non \xE8 stato trovato. Verificare se il percorso di file esiste o il file \xE8 presente in una directory specificata dalla variabile di ambiente PATH. Controllare anche la modalit\xE0 file per verificare che il file sia eseguibile.",
          "loc.messages.LIB_WhichNotFound_Win": "Il file eseguibile '%s' non \xE8 stato trovato. Verificare se il percorso di file esiste o il file \xE8 presente in una directory specificata dalla variabile di ambiente PATH. Controllare anche che l'estensione sia valida per un file eseguibile."
        },
        "ja-JP": {
          "loc.messages.LIB_CopyFileFailed": "\u30D5\u30A1\u30A4\u30EB\u306E\u30B3\u30D4\u30FC\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002\u6B8B\u308A\u306E\u8A66\u884C\u56DE\u6570: %s",
          "loc.messages.LIB_DirectoryStackEmpty": "\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA \u30B9\u30BF\u30C3\u30AF\u304C\u7A7A\u3067\u3059",
          "loc.messages.LIB_EndpointAuthNotExist": "\u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u306E\u8A8D\u8A3C\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093: %s",
          "loc.messages.LIB_EndpointDataNotExist": "\u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u306E\u30C7\u30FC\u30BF \u30D1\u30E9\u30E1\u30FC\u30BF\u30FC %s \u304C\u3042\u308A\u307E\u305B\u3093: %s",
          "loc.messages.LIB_EndpointNotExist": "\u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: %s",
          "loc.messages.LIB_FailOnCode": "\u5931\u6557\u306E\u30EA\u30BF\u30FC\u30F3 \u30B3\u30FC\u30C9: %d",
          "loc.messages.LIB_InputRequired": "\u5165\u529B\u304C\u5FC5\u8981\u3067\u3059: %s",
          "loc.messages.LIB_InvalidEndpointAuth": "\u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u306E\u8A8D\u8A3C\u304C\u7121\u52B9\u3067\u3059: %s",
          "loc.messages.LIB_InvalidPattern": "\u7121\u52B9\u306A\u30D1\u30BF\u30FC\u30F3: '%s'",
          "loc.messages.LIB_InvalidSecureFilesInput": "\u7121\u52B9\u306A\u30BB\u30AD\u30E5\u30A2 \u30D5\u30A1\u30A4\u30EB\u5165\u529B: %s",
          "loc.messages.LIB_LocStringNotFound": "\u30AD\u30FC\u306E loc \u6587\u5B57\u5217\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093: %s",
          "loc.messages.LIB_MergeTestResultNotSupported": "\u8907\u6570\u306E\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u306E\u30C6\u30B9\u30C8\u7D50\u679C\u3092 1 \u3064\u306E\u30C6\u30B9\u30C8\u5B9F\u884C\u306B\u30DE\u30FC\u30B8\u3059\u308B\u51E6\u7406\u306F\u3001OSX/Linux \u7528\u306E\u30D3\u30EB\u30C9 \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u306E\u3053\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u3067\u306F\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u5404\u30C6\u30B9\u30C8\u7D50\u679C\u30D5\u30A1\u30A4\u30EB\u304C VSO/TFS \u3067\u5225\u500B\u306E\u30C6\u30B9\u30C8\u5B9F\u884C\u3068\u3057\u3066\u767A\u884C\u3055\u308C\u307E\u3059\u3002",
          "loc.messages.LIB_MkdirFailed": "\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA '%s' \u3092\u4F5C\u6210\u3067\u304D\u307E\u305B\u3093\u3002%s",
          "loc.messages.LIB_MkdirFailedFileExists": "\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA '%s' \u3092\u4F5C\u6210\u3067\u304D\u307E\u305B\u3093\u3002\u7AF6\u5408\u3059\u308B\u30D5\u30A1\u30A4\u30EB\u304C\u5B58\u5728\u3057\u307E\u3059: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": "\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA '%s' \u3092\u4F5C\u6210\u3067\u304D\u307E\u305B\u3093\u3002\u30EB\u30FC\u30C8 \u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidShare": "\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA '%s' \u3092\u4F5C\u6210\u3067\u304D\u307E\u305B\u3093\u3002\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u304C\u5B58\u5728\u3059\u308B\u3053\u3068\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093: '%s'\u3002\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u304C\u30D5\u30A1\u30A4\u30EB\u5171\u6709\u3067\u3042\u308B\u5834\u5408\u3001\u305D\u306E\u5171\u6709\u540D\u304C\u6B63\u3057\u3044\u3053\u3068\u3001\u305D\u306E\u5171\u6709\u304C\u30AA\u30F3\u30E9\u30A4\u30F3\u3067\u3042\u308B\u3053\u3068\u3001\u305D\u3057\u3066\u73FE\u5728\u306E\u30D7\u30ED\u30BB\u30B9\u306B\u305D\u306E\u5171\u6709\u3078\u306E\u30A2\u30AF\u30BB\u30B9\u8A31\u53EF\u304C\u3042\u308B\u3053\u3068\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002",
          "loc.messages.LIB_MultilineSecret": "\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u306B\u8907\u6570\u306E\u884C\u3092\u542B\u3081\u308B\u3053\u3068\u306F\u3067\u304D\u307E\u305B\u3093",
          "loc.messages.LIB_NotFoundPreviousDirectory": "\u524D\u306E\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F",
          "loc.messages.LIB_OperationFailed": "\u5931\u6557\u3057\u307E\u3057\u305F %s: %s",
          "loc.messages.LIB_ParameterIsRequired": "%s \u304C\u63D0\u4F9B\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
          "loc.messages.LIB_PathHasNullByte": "\u30D1\u30B9\u306B null \u30D0\u30A4\u30C8\u3092\u542B\u3081\u308B\u3053\u3068\u306F\u3067\u304D\u307E\u305B\u3093",
          "loc.messages.LIB_PathIsNotADirectory": "\u30D1\u30B9\u304C\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u3067\u306F\u3042\u308A\u307E\u305B\u3093: %s",
          "loc.messages.LIB_PathNotFound": "\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F %s: %s",
          "loc.messages.LIB_PlatformNotSupported": "\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u304C\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u307E\u305B\u3093: %s",
          "loc.messages.LIB_ProcessError": "\u30D7\u30ED\u30BB\u30B9 '%s' \u3092\u5B9F\u884C\u3057\u3088\u3046\u3068\u3057\u3066\u3044\u308B\u3068\u304D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002\u30D7\u30ED\u30BB\u30B9\u306E\u958B\u59CB\u306B\u5931\u6557\u3057\u305F\u304A\u305D\u308C\u304C\u3042\u308A\u307E\u3059\u3002\u30A8\u30E9\u30FC: %s",
          "loc.messages.LIB_ProcessExitCode": "\u30D7\u30ED\u30BB\u30B9 '%s' \u304C\u7D42\u4E86\u30B3\u30FC\u30C9 %s \u3067\u5931\u6557\u3057\u307E\u3057\u305F",
          "loc.messages.LIB_ProcessStderr": "1 \u3064\u4EE5\u4E0A\u306E\u884C\u304C STDERR \u30B9\u30C8\u30EA\u30FC\u30E0\u306B\u66F8\u304D\u8FBC\u307E\u308C\u305F\u305F\u3081\u3001\u30D7\u30ED\u30BB\u30B9 '%s' \u304C\u5931\u6557\u3057\u307E\u3057\u305F",
          "loc.messages.LIB_ResourceFileAlreadySet": "\u30EA\u30BD\u30FC\u30B9 \u30D5\u30A1\u30A4\u30EB\u306F\u65E2\u306B %s \u306B\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u3059",
          "loc.messages.LIB_ResourceFileNotExist": "\u30EA\u30BD\u30FC\u30B9 \u30D5\u30A1\u30A4\u30EB\u304C\u5B58\u5728\u3057\u307E\u305B\u3093: %s",
          "loc.messages.LIB_ResourceFileNotSet": "\u30EA\u30BD\u30FC\u30B9 \u30D5\u30A1\u30A4\u30EB\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u304A\u3089\u305A\u3001\u30AD\u30FC\u306E loc \u6587\u5B57\u5217\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093: %s",
          "loc.messages.LIB_ReturnCode": "\u30EA\u30BF\u30FC\u30F3 \u30B3\u30FC\u30C9: %d",
          "loc.messages.LIB_StdioNotClosed": "STDIO \u30B9\u30C8\u30EA\u30FC\u30E0\u304C\u3001\u30D7\u30ED\u30BB\u30B9 '%s' \u306E\u7D42\u4E86\u30A4\u30D9\u30F3\u30C8\u304B\u3089 %s \u79D2\u4EE5\u5185\u306B\u7D42\u4E86\u3057\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3053\u308C\u306F\u3001\u5B50\u30D7\u30ED\u30BB\u30B9\u304C STDIO \u30B9\u30C8\u30EA\u30FC\u30E0\u3092\u7D99\u627F\u3057\u3001\u307E\u3060\u7D42\u4E86\u3057\u3066\u3044\u306A\u3044\u3053\u3068\u3092\u793A\u3057\u3066\u3044\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002",
          "loc.messages.LIB_UndefinedNodeVersion": "\u30CE\u30FC\u30C9\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u304C\u5B9A\u7FA9\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
          "loc.messages.LIB_UnhandledEx": "\u672A\u51E6\u7406: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "\u8907\u6570\u306E\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u304C\u4E00\u81F4\u3057\u307E\u3059\u3002\u6700\u521D\u306E\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u304C\u4F7F\u7528\u3055\u308C\u307E\u3059\u3002",
          "loc.messages.LIB_WhichNotFound_Linux": "\u5B9F\u884C\u53EF\u80FD\u30D5\u30A1\u30A4\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093: '%s'\u3002\u30D5\u30A1\u30A4\u30EB \u30D1\u30B9\u304C\u5B58\u5728\u3059\u308B\u3053\u3068\u3001\u307E\u305F\u306F\u305D\u306E\u30D5\u30A1\u30A4\u30EB\u304C PATH \u74B0\u5883\u5909\u6570\u3067\u6307\u5B9A\u3055\u308C\u305F\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u5185\u306B\u3042\u308B\u3053\u3068\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002\u30D5\u30A1\u30A4\u30EB\u304C\u5B9F\u884C\u53EF\u80FD\u304B\u3069\u3046\u304B\u306B\u3064\u3044\u3066\u30D5\u30A1\u30A4\u30EB \u30E2\u30FC\u30C9\u3082\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002",
          "loc.messages.LIB_WhichNotFound_Win": "\u5B9F\u884C\u53EF\u80FD\u30D5\u30A1\u30A4\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093: '%s'\u3002\u30D5\u30A1\u30A4\u30EB \u30D1\u30B9\u304C\u5B58\u5728\u3059\u308B\u3053\u3068\u3001\u307E\u305F\u306F\u305D\u306E\u30D5\u30A1\u30A4\u30EB\u304C PATH \u74B0\u5883\u5909\u6570\u3067\u6307\u5B9A\u3055\u308C\u305F\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u5185\u306B\u3042\u308B\u3053\u3068\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002\u305D\u306E\u30D5\u30A1\u30A4\u30EB\u306B\u5B9F\u884C\u53EF\u80FD\u30D5\u30A1\u30A4\u30EB\u306E\u6709\u52B9\u306A\u62E1\u5F35\u5B50\u304C\u3064\u3044\u3066\u3044\u308B\u3053\u3068\u3082\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002"
        },
        "ko-KR": {
          "loc.messages.LIB_CopyFileFailed": "\uD30C\uC77C\uC744 \uBCF5\uC0AC\uD558\uB294 \uB3D9\uC548 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uB0A8\uC740 \uC2DC\uB3C4 \uD69F\uC218: %s",
          "loc.messages.LIB_DirectoryStackEmpty": "\uB514\uB809\uD130\uB9AC \uC2A4\uD0DD\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
          "loc.messages.LIB_EndpointAuthNotExist": "\uC5D4\uB4DC\uD3EC\uC778\uD2B8 \uC778\uC99D \uB370\uC774\uD130\uAC00 \uC5C6\uC74C: %s",
          "loc.messages.LIB_EndpointDataNotExist": "\uC5D4\uB4DC\uD3EC\uC778\uD2B8 \uB370\uC774\uD130 \uB9E4\uAC1C \uBCC0\uC218 %s\uC774(\uAC00) \uC5C6\uC74C: %s",
          "loc.messages.LIB_EndpointNotExist": "\uC5D4\uB4DC\uD3EC\uC778\uD2B8\uAC00 \uC5C6\uC74C: %s",
          "loc.messages.LIB_FailOnCode": "\uC2E4\uD328 \uBC18\uD658 \uCF54\uB4DC: %d",
          "loc.messages.LIB_InputRequired": "\uC785\uB825 \uD544\uC694: %s",
          "loc.messages.LIB_InvalidEndpointAuth": "\uC798\uBABB\uB41C \uC5D4\uB4DC\uD3EC\uC778\uD2B8 \uC778\uC99D: %s",
          "loc.messages.LIB_InvalidPattern": "\uC798\uBABB\uB41C \uD328\uD134: '%s'",
          "loc.messages.LIB_InvalidSecureFilesInput": "\uBCF4\uC548 \uD30C\uC77C \uC785\uB825\uC774 \uC798\uBABB\uB428: %s",
          "loc.messages.LIB_LocStringNotFound": "\uD0A4\uC5D0 \uB300\uD55C loc \uBB38\uC790\uC5F4\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC74C: %s",
          "loc.messages.LIB_MergeTestResultNotSupported": "\uC774 OSX/Linux\uC6A9 \uBE4C\uB4DC \uC5D0\uC774\uC804\uD2B8 \uBC84\uC804\uC5D0\uC11C \uC5EC\uB7EC \uD30C\uC77C\uC758 \uD14C\uC2A4\uD2B8 \uACB0\uACFC\uB97C \uD558\uB098\uC758 \uD14C\uC2A4\uD2B8 \uC2E4\uD589\uC73C\uB85C \uBCD1\uD569\uD558\uB294 \uAC83\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uAC01 \uD14C\uC2A4\uD2B8 \uACB0\uACFC \uD30C\uC77C\uC740 VSO/TFS\uC5D0\uC11C \uBCC4\uB3C4\uC758 \uD14C\uC2A4\uD2B8 \uC2E4\uD589\uC73C\uB85C \uAC8C\uC2DC\uB429\uB2C8\uB2E4.",
          "loc.messages.LIB_MkdirFailed": "'%s' \uB514\uB809\uD130\uB9AC\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. %s",
          "loc.messages.LIB_MkdirFailedFileExists": "'%s' \uB514\uB809\uD130\uB9AC\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uCDA9\uB3CC\uD558\uB294 \uD30C\uC77C '%s'\uC774(\uAC00) \uC788\uC2B5\uB2C8\uB2E4.",
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": "'%s' \uB514\uB809\uD130\uB9AC\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB8E8\uD2B8 \uB514\uB809\uD130\uB9AC '%s'\uC774(\uAC00) \uC5C6\uC2B5\uB2C8\uB2E4.",
          "loc.messages.LIB_MkdirFailedInvalidShare": "'%s' \uB514\uB809\uD130\uB9AC\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. '%s' \uB514\uB809\uD130\uB9AC\uAC00 \uC788\uB294\uC9C0 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB514\uB809\uD130\uB9AC\uAC00 \uD30C\uC77C \uACF5\uC720\uC778 \uACBD\uC6B0 \uACF5\uC720 \uC774\uB984\uC774 \uC62C\uBC14\uB974\uACE0, \uACF5\uC720\uAC00 \uC628\uB77C\uC778 \uC0C1\uD0DC\uC774\uBA70, \uD604\uC7AC \uD504\uB85C\uC138\uC2A4\uC5D0 \uACF5\uC720\uC5D0 \uC561\uC138\uC2A4\uD560 \uC218 \uC788\uB294 \uAD8C\uD55C\uC774 \uC788\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694.",
          "loc.messages.LIB_MultilineSecret": "\uBE44\uBC00\uC5D0 \uC5EC\uB7EC \uC904\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
          "loc.messages.LIB_NotFoundPreviousDirectory": "\uC774\uC804 \uB514\uB809\uD130\uB9AC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
          "loc.messages.LIB_OperationFailed": "%s \uC2E4\uD328: %s",
          "loc.messages.LIB_ParameterIsRequired": "%s\uC774(\uAC00) \uC81C\uACF5\uB418\uC9C0 \uC54A\uC74C",
          "loc.messages.LIB_PathHasNullByte": "\uACBD\uB85C\uC5D0 null \uBC14\uC774\uD2B8\uB97C \uD3EC\uD568\uD560 \uC218 \uC5C6\uC74C",
          "loc.messages.LIB_PathIsNotADirectory": "\uACBD\uB85C\uAC00 \uB514\uB809\uD130\uB9AC\uAC00 \uC544\uB2D9\uB2C8\uB2E4. %s",
          "loc.messages.LIB_PathNotFound": "%s\uC744(\uB97C) \uCC3E\uC744 \uC218 \uC5C6\uC74C: %s",
          "loc.messages.LIB_PlatformNotSupported": "\uC9C0\uC6D0\uB418\uC9C0 \uC54A\uB294 \uD50C\uB7AB\uD3FC: %s",
          "loc.messages.LIB_ProcessError": "'%s' \uD504\uB85C\uC138\uC2A4\uB97C \uC2E4\uD589\uD560 \uB54C \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC774\uB294 \uD504\uB85C\uC138\uC2A4\uB97C \uC2DC\uC791\uD558\uC9C0 \uBABB\uD588\uC74C\uC744 \uB098\uD0C0\uB0BC \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC624\uB958: %s",
          "loc.messages.LIB_ProcessExitCode": "'%s' \uD504\uB85C\uC138\uC2A4\uAC00 \uC2E4\uD328\uD568(\uC885\uB8CC \uCF54\uB4DC %s)",
          "loc.messages.LIB_ProcessStderr": "\uD558\uB098 \uC774\uC0C1\uC758 \uC904\uC774 STDERR \uC2A4\uD2B8\uB9BC\uC5D0 \uC4F0\uC600\uC73C\uBBC0\uB85C '%s' \uD504\uB85C\uC138\uC2A4\uAC00 \uC2E4\uD328\uD568",
          "loc.messages.LIB_ResourceFileAlreadySet": "\uB9AC\uC18C\uC2A4 \uD30C\uC77C\uC774 \uC774\uBBF8 \uB2E4\uC74C\uC73C\uB85C \uC124\uC815\uB428: %s",
          "loc.messages.LIB_ResourceFileNotExist": "\uB9AC\uC18C\uC2A4 \uD30C\uC77C\uC774 \uC5C6\uC74C: %s",
          "loc.messages.LIB_ResourceFileNotSet": "\uB9AC\uC18C\uC2A4 \uD30C\uC77C\uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uACE0 \uD0A4\uC5D0 \uB300\uD55C loc \uBB38\uC790\uC5F4\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC74C: %s",
          "loc.messages.LIB_ReturnCode": "\uBC18\uD658 \uCF54\uB4DC: %d",
          "loc.messages.LIB_StdioNotClosed": "STDIO \uC2A4\uD2B8\uB9BC\uC774 %s\uCD08 \uC774\uB0B4('%s' \uD504\uB85C\uC138\uC2A4\uC758 \uC885\uB8CC \uC774\uBCA4\uD2B8 \uD6C4)\uC5D0 \uB2EB\uD788\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC774\uB294 \uC790\uC2DD \uD504\uB85C\uC138\uC2A4\uAC00 STDIO \uC2A4\uD2B8\uB9BC\uC744 \uC0C1\uC18D\uD588\uC73C\uBA70 \uC544\uC9C1 \uC885\uB8CC\uB418\uC9C0 \uC54A\uC558\uC74C\uC744 \uB098\uD0C0\uB0BC \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
          "loc.messages.LIB_UndefinedNodeVersion": "\uB178\uB4DC \uBC84\uC804\uC774 \uC815\uC758\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
          "loc.messages.LIB_UnhandledEx": "\uCC98\uB9AC\uB418\uC9C0 \uC54A\uC74C: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "\uC5EC\uB7EC \uC791\uC5C5 \uC601\uC5ED\uC774 \uC77C\uCE58\uD569\uB2C8\uB2E4. \uCCAB \uBC88\uC9F8 \uC791\uC5C5 \uC601\uC5ED\uC744 \uC0AC\uC6A9\uD558\uC138\uC694.",
          "loc.messages.LIB_WhichNotFound_Linux": "\uC2E4\uD589 \uD30C\uC77C '%s'\uC744(\uB97C) \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD30C\uC77C \uACBD\uB85C\uAC00 \uC788\uB294\uC9C0 \uB610\uB294 PATH \uD658\uACBD \uBCC0\uC218\uC5D0\uC11C \uC9C0\uC815\uD55C \uB514\uB809\uD130\uB9AC \uB0B4\uC5D0\uC11C \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC788\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694. \uB610\uD55C \uD30C\uC77C \uBAA8\uB4DC\uB97C \uD655\uC778\uD558\uC5EC \uD30C\uC77C\uC744 \uC2E4\uD589\uD560 \uC218 \uC788\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694.",
          "loc.messages.LIB_WhichNotFound_Win": "\uC2E4\uD589 \uD30C\uC77C '%s'\uC744(\uB97C) \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD30C\uC77C \uACBD\uB85C\uAC00 \uC788\uB294\uC9C0 \uB610\uB294 PATH \uD658\uACBD \uBCC0\uC218\uC5D0\uC11C \uC9C0\uC815\uD55C \uB514\uB809\uD130\uB9AC \uB0B4\uC5D0\uC11C \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC788\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694. \uB610\uD55C \uD30C\uC77C\uC774 \uC2E4\uD589 \uD30C\uC77C\uC5D0 \uB300\uD574 \uC62C\uBC14\uB978 \uD655\uC7A5\uBA85\uC744 \uAC00\uC9C0\uACE0 \uC788\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694."
        },
        "ru-RU": {
          "loc.messages.LIB_CopyFileFailed": "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0438 \u0444\u0430\u0439\u043B\u0430. \u041E\u0441\u0442\u0430\u0432\u0448\u0435\u0435\u0441\u044F \u0447\u0438\u0441\u043B\u043E \u043F\u043E\u043F\u044B\u0442\u043E\u043A: %s.",
          "loc.messages.LIB_DirectoryStackEmpty": "\u0421\u0442\u0435\u043A \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043F\u0443\u0441\u0442",
          "loc.messages.LIB_EndpointAuthNotExist": "\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442 \u0434\u0430\u043D\u043D\u044B\u0435 \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u0441\u0442\u0438 \u043A\u043E\u043D\u0435\u0447\u043D\u043E\u0439 \u0442\u043E\u0447\u043A\u0438: %s",
          "loc.messages.LIB_EndpointDataNotExist": "\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440 %s \u0434\u0430\u043D\u043D\u044B\u0445 \u043A\u043E\u043D\u0435\u0447\u043D\u043E\u0439 \u0442\u043E\u0447\u043A\u0438: %s",
          "loc.messages.LIB_EndpointNotExist": "\u041A\u043E\u043D\u0435\u0447\u043D\u0430\u044F \u0442\u043E\u0447\u043A\u0430 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442: %s.",
          "loc.messages.LIB_FailOnCode": "\u041A\u043E\u0434 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0430 \u043F\u0440\u0438 \u0441\u0431\u043E\u0435: %d.",
          "loc.messages.LIB_InputRequired": "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0432\u0435\u0441\u0442\u0438 \u0434\u0430\u043D\u043D\u044B\u0435: %s.",
          "loc.messages.LIB_InvalidEndpointAuth": "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u0441\u0442\u0438 \u043A\u043E\u043D\u0435\u0447\u043D\u043E\u0439 \u0442\u043E\u0447\u043A\u0438: %s.",
          "loc.messages.LIB_InvalidPattern": '\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0448\u0430\u0431\u043B\u043E\u043D: "%s"',
          "loc.messages.LIB_InvalidSecureFilesInput": "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0435 \u0432\u0445\u043E\u0434\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u0449\u0438\u0442\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430: %s",
          "loc.messages.LIB_LocStringNotFound": "\u041D\u0435 \u0443\u0434\u0430\u0435\u0442\u0441\u044F \u043D\u0430\u0439\u0442\u0438 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u043D\u0443\u044E \u0441\u0442\u0440\u043E\u043A\u0443 \u0434\u043B\u044F \u043A\u043B\u044E\u0447\u0430: %s.",
          "loc.messages.LIB_MergeTestResultNotSupported": "\u041E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u0442\u0435\u0441\u0442\u043E\u0432 \u0438\u0437 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u0438\u0445 \u0444\u0430\u0439\u043B\u043E\u0432 \u0432 \u043E\u0434\u0438\u043D \u0442\u0435\u0441\u0442\u043E\u0432\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0432 \u044D\u0442\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u0430\u0433\u0435\u043D\u0442\u0430 \u0441\u0431\u043E\u0440\u043A\u0438 \u0434\u043B\u044F OSX/Linux. \u041A\u0430\u0436\u0434\u044B\u0439 \u0444\u0430\u0439\u043B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u0442\u0435\u0441\u0442\u0430 \u0431\u0443\u0434\u0435\u0442 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D \u0432 \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0442\u0435\u0441\u0442\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0432 VSO/TFS.",
          "loc.messages.LIB_MkdirFailed": '\u041D\u0435 \u0443\u0434\u0430\u0435\u0442\u0441\u044F \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433 "%s". %s',
          "loc.messages.LIB_MkdirFailedFileExists": '\u041D\u0435 \u0443\u0434\u0430\u0435\u0442\u0441\u044F \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433 "%s". \u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u0443\u044E\u0449\u0438\u0439 \u0444\u0430\u0439\u043B: "%s"',
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": '\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433 "%s". \u041A\u043E\u0440\u043D\u0435\u0432\u043E\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043D\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442: "%s"',
          "loc.messages.LIB_MkdirFailedInvalidShare": '\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433 "%s". \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C, \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \u043B\u0438 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 "%s". \u0415\u0441\u043B\u0438 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0444\u0430\u0439\u043B\u043E\u0432\u044B\u043C \u0440\u0435\u0441\u0443\u0440\u0441\u043E\u043C, \u0443\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E \u0438\u043C\u044F \u0440\u0435\u0441\u0443\u0440\u0441\u0430 \u0443\u043A\u0430\u0437\u0430\u043D\u043E \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E, \u043E\u043D \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0438 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0440\u043E\u0446\u0435\u0441\u0441 \u0438\u043C\u0435\u0435\u0442 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u043D\u0430 \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u043D\u0435\u043C\u0443.',
          "loc.messages.LIB_MultilineSecret": "\u0421\u0435\u043A\u0440\u0435\u0442 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043C\u043D\u043E\u0433\u043E\u0441\u0442\u0440\u043E\u0447\u043D\u044B\u043C",
          "loc.messages.LIB_NotFoundPreviousDirectory": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0439\u0442\u0438 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433",
          "loc.messages.LIB_OperationFailed": "\u0421\u0431\u043E\u0439 %s: %s.",
          "loc.messages.LIB_ParameterIsRequired": "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D %s.",
          "loc.messages.LIB_PathHasNullByte": "\u041F\u0443\u0442\u044C \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u0435 \u0431\u0430\u0439\u0442\u044B.",
          "loc.messages.LIB_PathIsNotADirectory": "\u041F\u0443\u0442\u044C \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u043E\u043C: %s",
          "loc.messages.LIB_PathNotFound": "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D %s: %s.",
          "loc.messages.LIB_PlatformNotSupported": "\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F: %s",
          "loc.messages.LIB_ProcessError": '\u041F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u043F\u044B\u0442\u043A\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u043F\u0440\u043E\u0446\u0435\u0441\u0441 "%s". \u042D\u0442\u043E \u043C\u043E\u0436\u0435\u0442 \u043E\u0437\u043D\u0430\u0447\u0430\u0442\u044C, \u0447\u0442\u043E \u043F\u0440\u043E\u0446\u0435\u0441\u0441 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C. \u041E\u0448\u0438\u0431\u043A\u0430: %s',
          "loc.messages.LIB_ProcessExitCode": '\u041F\u0440\u043E\u0438\u0437\u043E\u0448\u0435\u043B \u0441\u0431\u043E\u0439 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0430 "%s" \u0441 \u043A\u043E\u0434\u043E\u043C \u0432\u044B\u0445\u043E\u0434\u0430 %s.',
          "loc.messages.LIB_ProcessStderr": '\u041F\u0440\u043E\u0438\u0437\u043E\u0448\u0435\u043B \u0441\u0431\u043E\u0439 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0430 "%s", \u0442\u0430\u043A \u043A\u0430\u043A \u043E\u0434\u043D\u0430 \u0438\u043B\u0438 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u0440\u043E\u043A \u0431\u044B\u043B\u0438 \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u044B \u0432 \u043F\u043E\u0442\u043E\u043A STDERR.',
          "loc.messages.LIB_ResourceFileAlreadySet": "\u0424\u0430\u0439\u043B \u0440\u0435\u0441\u0443\u0440\u0441\u043E\u0432 \u0443\u0436\u0435 \u0437\u0430\u0434\u0430\u043D: %s.",
          "loc.messages.LIB_ResourceFileNotExist": "\u0424\u0430\u0439\u043B \u0440\u0435\u0441\u0443\u0440\u0441\u043E\u0432 \u043D\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442: %s.",
          "loc.messages.LIB_ResourceFileNotSet": "\u0424\u0430\u0439\u043B \u0440\u0435\u0441\u0443\u0440\u0441\u043E\u0432 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D, \u043D\u0435 \u0443\u0434\u0430\u0435\u0442\u0441\u044F \u043D\u0430\u0439\u0442\u0438 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u043D\u0443\u044E \u0441\u0442\u0440\u043E\u043A\u0443 \u0434\u043B\u044F \u043A\u043B\u044E\u0447\u0430: %s.",
          "loc.messages.LIB_ReturnCode": "\u041A\u043E\u0434 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0430: %d",
          "loc.messages.LIB_StdioNotClosed": '\u041F\u043E\u0442\u043E\u043A\u0438 STDIO \u043D\u0435 \u0431\u044B\u043B\u0438 \u0437\u0430\u043A\u0440\u044B\u0442\u044B \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 %s\xA0\u0441 \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F \u0441\u043E\u0431\u044B\u0442\u0438\u044F \u0432\u044B\u0445\u043E\u0434\u0430 \u043E\u0442 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0430 "%s". \u042D\u0442\u043E \u043C\u043E\u0436\u0435\u0442 \u0441\u0432\u0438\u0434\u0435\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u043E \u0442\u043E\u043C, \u0447\u0442\u043E \u0434\u043E\u0447\u0435\u0440\u043D\u0438\u0439 \u043F\u0440\u043E\u0446\u0435\u0441\u0441 \u0443\u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043B \u043F\u043E\u0442\u043E\u043A\u0438 STDIO \u0438 \u0435\u0449\u0435 \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B \u0440\u0430\u0431\u043E\u0442\u0443.',
          "loc.messages.LIB_UndefinedNodeVersion": "\u0412\u0435\u0440\u0441\u0438\u044F \u0443\u0437\u043B\u0430 \u043D\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0430.",
          "loc.messages.LIB_UnhandledEx": "\u041D\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "\u041D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0430 \u043F\u0435\u0440\u0432\u0430\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C.",
          "loc.messages.LIB_WhichNotFound_Linux": '\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0439\u0442\u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u044F\u0435\u043C\u044B\u0439 \u0444\u0430\u0439\u043B: "%s". \u0423\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E \u043F\u0443\u0442\u044C \u043A \u0444\u0430\u0439\u043B\u0443 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \u0438 \u0444\u0430\u0439\u043B \u043C\u043E\u0436\u043D\u043E \u043D\u0430\u0439\u0442\u0438 \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435, \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u043E\u043C \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0439 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F PATH. \u0422\u0430\u043A\u0436\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0440\u0435\u0436\u0438\u043C \u0444\u0430\u0439\u043B\u0430, \u0447\u0442\u043E\u0431\u044B \u0443\u0431\u0435\u0434\u0438\u0442\u044C\u0441\u044F, \u0447\u0442\u043E \u0444\u0430\u0439\u043B \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0438\u0441\u043F\u043E\u043B\u043D\u044F\u0435\u043C\u044B\u043C.',
          "loc.messages.LIB_WhichNotFound_Win": '\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0439\u0442\u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u044F\u0435\u043C\u044B\u0439 \u0444\u0430\u0439\u043B: "%s". \u0423\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E \u043F\u0443\u0442\u044C \u043A \u0444\u0430\u0439\u043B\u0443 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \u0438 \u0447\u0442\u043E \u0444\u0430\u0439\u043B \u043C\u043E\u0436\u043D\u043E \u043D\u0430\u0439\u0442\u0438 \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435, \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u043E\u043C \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0439 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F PATH. \u0422\u0430\u043A\u0436\u0435 \u0443\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E \u0443 \u0444\u0430\u0439\u043B\u0430 \u0435\u0441\u0442\u044C \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E\u0435 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u0438\u0441\u043F\u043E\u043B\u043D\u044F\u0435\u043C\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430.'
        },
        "zh-CN": {
          "loc.messages.LIB_CopyFileFailed": "\u590D\u5236\u6587\u4EF6\u65F6\u51FA\u9519\u3002\u5269\u4F59\u5C1D\u8BD5\u6B21\u6570: %s",
          "loc.messages.LIB_DirectoryStackEmpty": "\u76EE\u5F55\u5806\u6808\u4E3A\u7A7A",
          "loc.messages.LIB_EndpointAuthNotExist": "\u7EC8\u7ED3\u70B9\u6388\u6743\u6570\u636E\u4E0D\u5B58\u5728: %s",
          "loc.messages.LIB_EndpointDataNotExist": "\u7EC8\u7ED3\u70B9\u6570\u636E\u53C2\u6570 %s \u4E0D\u5B58\u5728: %s",
          "loc.messages.LIB_EndpointNotExist": "\u7EC8\u7ED3\u70B9\u4E0D\u5B58\u5728: %s",
          "loc.messages.LIB_FailOnCode": "\u6545\u969C\u8FD4\u56DE\u4EE3\u7801: %d",
          "loc.messages.LIB_InputRequired": "\u8F93\u5165\u5FC5\u9700\u9879: %s",
          "loc.messages.LIB_InvalidEndpointAuth": "\u7EC8\u7ED3\u70B9\u9A8C\u8BC1\u65E0\u6548: %s",
          "loc.messages.LIB_InvalidPattern": '\u65E0\u6548\u7684\u6A21\u5F0F: "%s"',
          "loc.messages.LIB_InvalidSecureFilesInput": "\u65E0\u6548\u7684\u5B89\u5168\u6587\u4EF6\u8F93\u5165: %s",
          "loc.messages.LIB_LocStringNotFound": "\u65E0\u6CD5\u627E\u5230\u5173\u952E\u5B57\u7684\u672C\u5730\u5B57\u7B26\u4E32: %s",
          "loc.messages.LIB_MergeTestResultNotSupported": "\u6B64\u7248\u672C\u7684 OSX/Linux \u751F\u6210\u4EE3\u7406\u4E0D\u652F\u6301\u6765\u81EA\u67D0\u4E2A\u6D4B\u8BD5\u8FD0\u884C\u7684\u591A\u6587\u4EF6\u5408\u5E76\u6D4B\u8BD5\u7ED3\u679C\uFF0C\u5728 VSO/TFS \u4E2D\uFF0C\u6BCF\u4E2A\u6D4B\u8BD5\u7ED3\u679C\u6587\u4EF6\u90FD\u5C06\u4F5C\u4E3A\u5355\u72EC\u7684\u6D4B\u8BD5\u8FD0\u884C\u8FDB\u884C\u53D1\u5E03\u3002",
          "loc.messages.LIB_MkdirFailed": "\u65E0\u6CD5\u521B\u5EFA\u76EE\u5F55\u201C%s\u201D\u3002%s",
          "loc.messages.LIB_MkdirFailedFileExists": "\u65E0\u6CD5\u521B\u5EFA\u76EE\u5F55\u201C%s\u201D\u3002\u5B58\u5728\u51B2\u7A81\u6587\u4EF6:\u201C%s\u201D",
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": "\u65E0\u6CD5\u521B\u5EFA\u76EE\u5F55\u201C%s\u201D\u3002\u6839\u76EE\u5F55\u4E0D\u5B58\u5728:\u201C%s\u201D",
          "loc.messages.LIB_MkdirFailedInvalidShare": "\u65E0\u6CD5\u521B\u5EFA\u76EE\u5F55\u201C%s\u201D\u3002\u65E0\u6CD5\u9A8C\u8BC1\u201C%s\u201D\u76EE\u5F55\u662F\u5426\u5B58\u5728\u3002\u5982\u679C\u76EE\u5F55\u662F\u6587\u4EF6\u5171\u4EAB\uFF0C\u8BF7\u9A8C\u8BC1\u5171\u4EAB\u540D\u79F0\u662F\u5426\u6B63\u786E\u3001\u5171\u4EAB\u662F\u5426\u5DF2\u8054\u673A\u4EE5\u53CA\u5F53\u524D\u8FDB\u7A0B\u662F\u5426\u6709\u6743\u8BBF\u95EE\u8BE5\u5171\u4EAB\u3002",
          "loc.messages.LIB_MultilineSecret": "\u5BC6\u7801\u4E0D\u80FD\u5305\u542B\u591A\u4E2A\u884C",
          "loc.messages.LIB_NotFoundPreviousDirectory": "\u627E\u4E0D\u5230\u4EE5\u524D\u7684\u76EE\u5F55",
          "loc.messages.LIB_OperationFailed": "%s \u5931\u8D25: %s",
          "loc.messages.LIB_ParameterIsRequired": "\u672A\u63D0\u4F9B %s",
          "loc.messages.LIB_PathHasNullByte": "\u8DEF\u5F84\u4E0D\u80FD\u5305\u542B null \u5B57\u8282",
          "loc.messages.LIB_PathIsNotADirectory": "\u8DEF\u5F84\u4E0D\u662F\u76EE\u5F55\uFF1A %s",
          "loc.messages.LIB_PathNotFound": "\u627E\u4E0D\u5230 %s: %s",
          "loc.messages.LIB_PlatformNotSupported": "\u5E73\u53F0\u4E0D\u53D7\u652F\u6301: %s",
          "loc.messages.LIB_ProcessError": "\u5C1D\u8BD5\u6267\u884C\u8FDB\u7A0B\u201C%s\u201D\u65F6\u51FA\u9519\u3002\u8FD9\u53EF\u80FD\u8868\u793A\u8FDB\u7A0B\u542F\u52A8\u5931\u8D25\u3002\u9519\u8BEF: %s",
          "loc.messages.LIB_ProcessExitCode": "\u8FDB\u7A0B\u201C%s\u201D\u5931\u8D25\uFF0C\u9000\u51FA\u4EE3\u7801\u4E3A %s",
          "loc.messages.LIB_ProcessStderr": "\u8FDB\u7A0B\u201C%s\u201D\u5931\u8D25\uFF0C\u56E0\u4E3A\u5DF2\u5C06\u4E00\u884C\u6216\u591A\u884C\u5199\u5165 STDERR \u6D41",
          "loc.messages.LIB_ResourceFileAlreadySet": "\u8D44\u6E90\u6587\u4EF6\u5DF2\u88AB\u8BBE\u7F6E\u4E3A %s",
          "loc.messages.LIB_ResourceFileNotExist": "\u8D44\u6E90\u6587\u4EF6\u4E0D\u5B58\u5728: %s",
          "loc.messages.LIB_ResourceFileNotSet": "\u8D44\u6E90\u6587\u4EF6\u5C1A\u672A\u8BBE\u7F6E\uFF0C\u65E0\u6CD5\u627E\u5230\u5173\u952E\u5B57\u7684\u672C\u5730\u5B57\u7B26\u4E32: %s",
          "loc.messages.LIB_ReturnCode": "\u8FD4\u56DE\u4EE3\u7801: %d",
          "loc.messages.LIB_StdioNotClosed": "STDIO \u6D41\u5728\u8FDB\u7A0B\u201C%s\u201D\u4E2D\u53D1\u751F\u9000\u51FA\u4E8B\u4EF6 %s \u79D2\u5185\u672A\u5173\u95ED \u3002\u8FD9\u53EF\u80FD\u8868\u793A\u5B50\u8FDB\u7A0B\u7EE7\u627F\u4E86 STDIO \u6D41\u4E14\u5C1A\u672A\u9000\u51FA\u3002",
          "loc.messages.LIB_UndefinedNodeVersion": "\u8282\u70B9\u7248\u672C\u672A\u5B9A\u4E49\u3002",
          "loc.messages.LIB_UnhandledEx": "\u672A\u5904\u7406: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "\u51FA\u73B0\u591A\u4E2A\u5DE5\u4F5C\u533A\u5339\u914D\u65F6\uFF0C\u4F7F\u7528\u7B2C\u4E00\u4E2A\u3002",
          "loc.messages.LIB_WhichNotFound_Linux": '\u65E0\u6CD5\u5B9A\u4F4D\u53EF\u6267\u884C\u6587\u4EF6: "%s"\u3002\u8BF7\u9A8C\u8BC1\u6587\u4EF6\u8DEF\u5F84\u662F\u5426\u5B58\u5728\u6216\u6587\u4EF6\u662F\u5426\u53EF\u5728 PATH \u73AF\u5883\u53D8\u91CF\u6307\u5B9A\u7684\u76EE\u5F55\u5185\u627E\u5230\u3002\u53E6\u8BF7\u68C0\u67E5\u6587\u4EF6\u6A21\u5F0F\u4EE5\u9A8C\u8BC1\u6587\u4EF6\u662F\u5426\u53EF\u6267\u884C\u3002',
          "loc.messages.LIB_WhichNotFound_Win": '\u65E0\u6CD5\u5B9A\u4F4D\u53EF\u6267\u884C\u6587\u4EF6: "%s"\u3002\u8BF7\u9A8C\u8BC1\u6587\u4EF6\u8DEF\u5F84\u662F\u5426\u5B58\u5728\u6216\u6587\u4EF6\u662F\u5426\u53EF\u5728 PATH \u73AF\u5883\u53D8\u91CF\u6307\u5B9A\u7684\u76EE\u5F55\u5185\u627E\u5230\u3002\u53E6\u8BF7\u9A8C\u8BC1\u8BE5\u6587\u4EF6\u662F\u5426\u5177\u6709\u53EF\u6267\u884C\u6587\u4EF6\u7684\u6709\u6548\u6269\u5C55\u540D\u3002'
        },
        "zh-TW": {
          "loc.messages.LIB_CopyFileFailed": "\u8907\u88FD\u6A94\u6848\u6642\u767C\u751F\u932F\u8AA4\u3002\u5269\u9918\u5617\u8A66\u6B21\u6578: %s",
          "loc.messages.LIB_DirectoryStackEmpty": "\u76EE\u9304\u5806\u758A\u662F\u7A7A\u7684",
          "loc.messages.LIB_EndpointAuthNotExist": "\u7AEF\u9EDE\u9A57\u8B49\u8CC7\u6599\u4E0D\u5B58\u5728: %s",
          "loc.messages.LIB_EndpointDataNotExist": "\u7AEF\u9EDE\u8CC7\u6599\u53C3\u6578 %s \u4E0D\u5B58\u5728: %s",
          "loc.messages.LIB_EndpointNotExist": "\u7AEF\u9EDE\u4E0D\u5B58\u5728: %s",
          "loc.messages.LIB_FailOnCode": "\u50B3\u56DE\u7A0B\u5F0F\u78BC\u5931\u6557: %d",
          "loc.messages.LIB_InputRequired": "\u9700\u8981\u8F38\u5165\u5167\u5BB9: %s",
          "loc.messages.LIB_InvalidEndpointAuth": "\u7AEF\u9EDE\u9A57\u8B49\u7121\u6548: %s",
          "loc.messages.LIB_InvalidPattern": "\u6A21\u5F0F\u7121\u6548: '%s'",
          "loc.messages.LIB_InvalidSecureFilesInput": "\u5B89\u5168\u6A94\u6848\u8F38\u5165\u7121\u6548: %s",
          "loc.messages.LIB_LocStringNotFound": "\u627E\u4E0D\u5230\u7D22\u5F15\u9375\u7684 loc \u5B57\u4E32: %s",
          "loc.messages.LIB_MergeTestResultNotSupported": "OSX/Linux \u7684\u6B64\u7248\u672C\u7D44\u5EFA\u4EE3\u7406\u7A0B\u5F0F\u4E0D\u652F\u63F4\u5C07\u591A\u500B\u6A94\u6848\u7684\u6E2C\u8A66\u7D50\u679C\u5408\u4F75\u81F3\u55AE\u4E00\u6E2C\u8A66\u56DE\u5408\uFF0C\u6BCF\u500B\u6E2C\u8A66\u7D50\u679C\u6A94\u6848\u5C07\u4F5C\u70BA\u500B\u5225\u6E2C\u8A66\u56DE\u5408\u5728 VSO/TFS \u4E2D\u767C\u884C\u3002",
          "loc.messages.LIB_MkdirFailed": "\u7121\u6CD5\u5EFA\u7ACB\u76EE\u9304 '%s'\u3002%s",
          "loc.messages.LIB_MkdirFailedFileExists": "\u7121\u6CD5\u5EFA\u7ACB\u76EE\u9304 '%s'\u3002\u5B58\u5728\u885D\u7A81\u7684\u6A94\u6848: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidDriveRoot": "\u7121\u6CD5\u5EFA\u7ACB\u76EE\u9304 '%s'\u3002\u6839\u76EE\u9304\u4E0D\u5B58\u5728: '%s'",
          "loc.messages.LIB_MkdirFailedInvalidShare": "\u7121\u6CD5\u5EFA\u7ACB\u76EE\u9304 '%s'\u3002\u7121\u6CD5\u9A57\u8B49\u76EE\u9304\u662F\u5426\u5B58\u5728: '%s'\u3002\u5982\u679C\u76EE\u9304\u662F\u6A94\u6848\u5171\u7528\uFF0C\u8ACB\u9A57\u8B49\u5171\u7528\u540D\u7A31\u6B63\u78BA\u3001\u5171\u7528\u5728\u7DDA\u4E0A\uFF0C\u800C\u4E14\u76EE\u524D\u7684\u6D41\u7A0B\u5177\u6709\u5B58\u53D6\u5171\u7528\u7684\u6B0A\u9650\u3002",
          "loc.messages.LIB_MultilineSecret": "\u7955\u5BC6\u4E0D\u5F97\u5305\u542B\u591A\u500B\u884C",
          "loc.messages.LIB_NotFoundPreviousDirectory": "\u627E\u4E0D\u5230\u4E4B\u524D\u7684\u76EE\u9304",
          "loc.messages.LIB_OperationFailed": "%s \u5931\u6557: %s",
          "loc.messages.LIB_ParameterIsRequired": "\u672A\u63D0\u4F9B %s",
          "loc.messages.LIB_PathHasNullByte": "\u8DEF\u5F91\u4E0D\u80FD\u5305\u542B null \u4F4D\u5143\u7D44",
          "loc.messages.LIB_PathIsNotADirectory": "\u8DEF\u5F91\u4E0D\u662F\u76EE\u9304\uFF1A %s",
          "loc.messages.LIB_PathNotFound": "\u627E\u4E0D\u5230 %s: %s",
          "loc.messages.LIB_PlatformNotSupported": "\u4E0D\u652F\u63F4\u7684\u5E73\u53F0: %s",
          "loc.messages.LIB_ProcessError": "\u5617\u8A66\u57F7\u884C\u8655\u7406\u5E8F '%s' \u6642\u767C\u751F\u932F\u8AA4\u3002\u9019\u53EF\u80FD\u8868\u793A\u8655\u7406\u5E8F\u7121\u6CD5\u555F\u52D5\u3002\u932F\u8AA4: %s",
          "loc.messages.LIB_ProcessExitCode": "\u8655\u7406\u5E8F '%s' \u5931\u6557\uFF0C\u7D50\u675F\u4EE3\u78BC\u70BA %s",
          "loc.messages.LIB_ProcessStderr": "\u56E0\u70BA STDERR \u8CC7\u6599\u6D41\u4E2D\u5BEB\u5165\u4E86\u4E00\u6216\u591A\u884C\u7A0B\u5F0F\u78BC\uFF0C\u6240\u4EE5\u8655\u7406\u5E8F '%s' \u5931\u6557",
          "loc.messages.LIB_ResourceFileAlreadySet": "\u8CC7\u6E90\u6A94\u6848\u5DF2\u8A2D\u5B9A\u81F3: %s",
          "loc.messages.LIB_ResourceFileNotExist": "\u8CC7\u6E90\u6A94\u6848\u4E0D\u5B58\u5728: %s",
          "loc.messages.LIB_ResourceFileNotSet": "\u5C1A\u672A\u8A2D\u5B9A\u8CC7\u6E90\u6A94\u6848\uFF0C\u627E\u4E0D\u5230\u7D22\u5F15\u9375\u7684 loc \u5B57\u4E32: %s",
          "loc.messages.LIB_ReturnCode": "\u50B3\u56DE\u7A0B\u5F0F\u78BC: %d",
          "loc.messages.LIB_StdioNotClosed": "STDIO \u8CC7\u6599\u6D41\u672A\u5728 %s \u79D2\u5167\u95DC\u9589 (\u5F9E\u8655\u7406\u5E8F '%s' \u7D50\u675F\u4E8B\u4EF6\u767C\u751F\u5F8C\u7B97\u8D77)\u3002\u9019\u53EF\u80FD\u8868\u793A\u5B50\u8655\u7406\u5E8F\u7E7C\u627F\u4E86 STDIO \u8CC7\u6599\u6D41\u4E14\u5C1A\u672A\u7D50\u675F\u3002",
          "loc.messages.LIB_UndefinedNodeVersion": "\u672A\u5B9A\u7FA9\u7BC0\u9EDE\u7248\u672C\u3002",
          "loc.messages.LIB_UnhandledEx": "\u672A\u7D93\u8655\u7406: %s",
          "loc.messages.LIB_UseFirstGlobMatch": "\u591A\u500B\u5DE5\u4F5C\u5340\u76F8\u7B26\u3002\u8ACB\u5148\u4F7F\u7528\u3002",
          "loc.messages.LIB_WhichNotFound_Linux": "\u627E\u4E0D\u5230\u53EF\u57F7\u884C\u6A94: '%s'\u3002\u8ACB\u78BA\u8A8D\u6A94\u6848\u8DEF\u5F91\u5B58\u5728\uFF0C\u6216\u6A94\u6848\u53EF\u4EE5\u5728 PATH \u74B0\u5883\u8B8A\u6578\u6307\u5B9A\u7684\u76EE\u9304\u4E2D\u627E\u5230\u3002\u53E6\u8ACB\u6AA2\u67E5\u6A94\u6848\u6A21\u5F0F\uFF0C\u78BA\u8A8D\u6A94\u6848\u53EF\u4EE5\u57F7\u884C\u3002",
          "loc.messages.LIB_WhichNotFound_Win": "\u627E\u4E0D\u5230\u53EF\u57F7\u884C\u6A94: '%s'\u3002\u8ACB\u78BA\u8A8D\u6A94\u6848\u8DEF\u5F91\u5B58\u5728\uFF0C\u6216\u6A94\u6848\u53EF\u4EE5\u5728 PATH \u74B0\u5883\u8B8A\u6578\u6307\u5B9A\u7684\u76EE\u9304\u4E2D\u627E\u5230\u3002\u53E6\u8ACB\u78BA\u8A8D\u6A94\u6848\u5177\u5099\u6709\u6548\u7684\u53EF\u57F7\u884C\u6A94\u526F\u6A94\u540D\u3002"
        }
      }
    };
  }
});

// ../../node_modules/azure-pipelines-task-lib/internal.js
var require_internal = __commonJS({
  "../../node_modules/azure-pipelines-task-lib/internal.js"(exports2) {
    "use strict";
    var _a;
    var _b;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isSigPipeError = exports2._exposeCertSettings = exports2._exposeProxySettings = exports2._normalizeSeparators = exports2._isRooted = exports2._getDirectoryName = exports2._ensureRooted = exports2._isUncPath = exports2._loadData = exports2._ensurePatternRooted = exports2._getFindInfoFromPattern = exports2._cloneMatchOptions = exports2._legacyFindFiles_convertPatternToRegExp = exports2._which = exports2._checkPath = exports2._exist = exports2._debug = exports2._error = exports2._warning = exports2._command = exports2._getVariableKey = exports2._getVariable = exports2._loc = exports2._setResourcePath = exports2._setErrStream = exports2._setStdStream = exports2._writeLine = exports2._truncateBeforeSensitiveKeyword = exports2._endsWith = exports2._startsWith = exports2.IssueAuditAction = exports2.IssueSource = exports2._vault = exports2._knownVariableMap = void 0;
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var minimatch = require_minimatch();
    var util = require("util");
    var tcm = require_taskcommand();
    var vm = require_vault();
    var semver = require_semver();
    var crypto = require("crypto");
    var libResource = require_lib_resource();
    exports2._knownVariableMap = {};
    var _commandCorrelationId;
    var IssueSource;
    (function(IssueSource2) {
      IssueSource2["CustomerScript"] = "CustomerScript";
      IssueSource2["TaskInternal"] = "TaskInternal";
    })(IssueSource = exports2.IssueSource || (exports2.IssueSource = {}));
    var IssueAuditAction;
    (function(IssueAuditAction2) {
      IssueAuditAction2[IssueAuditAction2["Unknown"] = 0] = "Unknown";
      IssueAuditAction2[IssueAuditAction2["ShellTasksValidation"] = 1] = "ShellTasksValidation";
    })(IssueAuditAction = exports2.IssueAuditAction || (exports2.IssueAuditAction = {}));
    if (semver.lt(process.versions.node, "4.2.0")) {
      _warning("Tasks require a new agent.  Upgrade your agent or node to 4.2.0 or later", IssueSource.TaskInternal);
    }
    function _startsWith(str, start) {
      return str.slice(0, start.length) == start;
    }
    exports2._startsWith = _startsWith;
    function _endsWith(str, end) {
      return str.slice(-end.length) == end;
    }
    exports2._endsWith = _endsWith;
    function _truncateBeforeSensitiveKeyword(str, sensitiveKeywordsPattern) {
      if (!str) {
        return str;
      }
      var index = str.search(sensitiveKeywordsPattern);
      if (index <= 0) {
        return str;
      }
      return "".concat(str.substring(0, index), "...");
    }
    exports2._truncateBeforeSensitiveKeyword = _truncateBeforeSensitiveKeyword;
    var _outStream = process.stdout;
    var _errStream = process.stderr;
    function _writeLine(str) {
      _outStream.write(str + os.EOL);
    }
    exports2._writeLine = _writeLine;
    function _setStdStream(stdStream) {
      _outStream = stdStream;
    }
    exports2._setStdStream = _setStdStream;
    function _setErrStream(errStream) {
      _errStream = errStream;
    }
    exports2._setErrStream = _setErrStream;
    var _locStringCache = {};
    var _resourceFiles = {};
    var _libResourceFileLoaded = false;
    var _resourceCulture = "en-US";
    function _getLocStrings(resourceJson, locResourceJson) {
      var locStrings = {};
      if (resourceJson && resourceJson.hasOwnProperty("messages")) {
        for (var key in resourceJson.messages) {
          if (locResourceJson && locResourceJson.hasOwnProperty("loc.messages." + key)) {
            locStrings[key] = locResourceJson["loc.messages." + key];
          } else {
            locStrings[key] = resourceJson.messages[key];
          }
        }
      }
      return locStrings;
    }
    function _loadResJson(resjsonFile) {
      var resJson;
      if (_exist(resjsonFile)) {
        var resjsonContent = fs.readFileSync(resjsonFile, "utf8").toString();
        if (resjsonContent.indexOf("\uFEFF") == 0) {
          resjsonContent = resjsonContent.slice(1);
        }
        try {
          resJson = JSON.parse(resjsonContent);
        } catch (err) {
          _debug("unable to parse resjson with err: " + err.message);
        }
      } else {
        _debug(".resjson file not found: " + resjsonFile);
      }
      return resJson;
    }
    function _loadLocStrings(resourceFile, culture) {
      var locStrings = {};
      if (_exist(resourceFile)) {
        var resourceJson = require(resourceFile);
        if (resourceJson && resourceJson.hasOwnProperty("messages")) {
          var locResourceJson;
          var localizedResourceFile = path.join(path.dirname(resourceFile), "Strings", "resources.resjson");
          var upperCulture = culture.toUpperCase();
          var cultures = [];
          try {
            cultures = fs.readdirSync(localizedResourceFile);
          } catch (ex) {
          }
          for (var i = 0; i < cultures.length; i++) {
            if (cultures[i].toUpperCase() == upperCulture) {
              localizedResourceFile = path.join(localizedResourceFile, cultures[i], "resources.resjson");
              if (_exist(localizedResourceFile)) {
                locResourceJson = _loadResJson(localizedResourceFile);
              }
              break;
            }
          }
          locStrings = _getLocStrings(resourceJson, locResourceJson);
        }
      } else {
        _warning("LIB_ResourceFile does not exist", IssueSource.TaskInternal);
      }
      return locStrings;
    }
    function _loadEmbeddedLocStrings(resourceData, culture) {
      var localizedResource;
      var upperCulture = culture.toUpperCase();
      var localizedResources = resourceData.localizedMessages || {};
      for (var localizedCulture in localizedResources) {
        if (localizedCulture.toUpperCase() == upperCulture) {
          localizedResource = localizedResources[localizedCulture];
          break;
        }
      }
      return _getLocStrings(resourceData, localizedResource);
    }
    function _setResourcePath(path2, ignoreWarnings) {
      if (ignoreWarnings === void 0) {
        ignoreWarnings = false;
      }
      if (process.env["TASKLIB_INPROC_UNITS"]) {
        _resourceFiles = {};
        _libResourceFileLoaded = false;
        _locStringCache = {};
        _resourceCulture = "en-US";
      }
      if (!_resourceFiles[path2]) {
        _checkPath(path2, "resource file path");
        _resourceFiles[path2] = path2;
        _debug("adding resource file: " + path2);
        _resourceCulture = _getVariable("system.culture") || _resourceCulture;
        var locStrs = _loadLocStrings(path2, _resourceCulture);
        for (var key in locStrs) {
          _locStringCache[key] = locStrs[key];
        }
      } else {
        if (ignoreWarnings) {
        } else {
          _warning(_loc("LIB_ResourceFileAlreadySet", path2), IssueSource.TaskInternal);
        }
      }
    }
    exports2._setResourcePath = _setResourcePath;
    function _loc(key) {
      var param = [];
      for (var _i = 1; _i < arguments.length; _i++) {
        param[_i - 1] = arguments[_i];
      }
      if (!_libResourceFileLoaded) {
        var libLocStrs = _loadEmbeddedLocStrings(libResource, _resourceCulture);
        for (var libKey in libLocStrs) {
          _locStringCache[libKey] = libLocStrs[libKey];
        }
        _libResourceFileLoaded = true;
      }
      var locString;
      ;
      if (_locStringCache.hasOwnProperty(key)) {
        locString = _locStringCache[key];
      } else {
        if (Object.keys(_resourceFiles).length <= 0) {
          _warning("Resource file haven't been set, can't find loc string for key: ".concat(key), IssueSource.TaskInternal);
        } else {
          _warning("Can't find loc string for key: ".concat(key));
        }
        locString = key;
      }
      if (param.length > 0) {
        return util.format.apply(this, [locString].concat(param));
      } else {
        return locString;
      }
    }
    exports2._loc = _loc;
    function _getVariable(name) {
      var varval;
      var info;
      var key = _getVariableKey(name);
      if (exports2._knownVariableMap.hasOwnProperty(key)) {
        info = exports2._knownVariableMap[key];
      }
      if (info && info.secret) {
        varval = exports2._vault.retrieveSecret("SECRET_" + key);
      } else {
        varval = process.env[key];
        if (!varval && name.toUpperCase() == "AGENT.JOBSTATUS") {
          varval = process.env["agent.jobstatus"];
        }
      }
      _debug(name + "=" + varval);
      return varval;
    }
    exports2._getVariable = _getVariable;
    function _getVariableKey(name) {
      if (!name) {
        throw new Error(_loc("LIB_ParameterIsRequired", "name"));
      }
      return name.replace(/\./g, "_").replace(/ /g, "_").toUpperCase();
    }
    exports2._getVariableKey = _getVariableKey;
    function _command(command, properties, message) {
      var taskCmd = new tcm.TaskCommand(command, properties, message);
      _writeLine(taskCmd.toString());
    }
    exports2._command = _command;
    function _warning(message, source, auditAction) {
      if (source === void 0) {
        source = IssueSource.TaskInternal;
      }
      _command("task.issue", {
        "type": "warning",
        "source": source,
        "correlationId": _commandCorrelationId,
        "auditAction": auditAction
      }, message);
    }
    exports2._warning = _warning;
    function _error(message, source, auditAction) {
      if (source === void 0) {
        source = IssueSource.TaskInternal;
      }
      _command("task.issue", {
        "type": "error",
        "source": source,
        "correlationId": _commandCorrelationId,
        "auditAction": auditAction
      }, message);
    }
    exports2._error = _error;
    var debugMode = ((_a = _getVariable("system.debug")) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === "true";
    var shouldCheckDebugMode = ((_b = _getVariable("DistributedTask.Tasks.Node.SkipDebugLogsWhenDebugModeOff")) === null || _b === void 0 ? void 0 : _b.toLowerCase()) === "true";
    function _debug(message) {
      if (!shouldCheckDebugMode || shouldCheckDebugMode && debugMode) {
        _command("task.debug", null, message);
      }
    }
    exports2._debug = _debug;
    function _exist(path2) {
      var exist = false;
      try {
        exist = !!(path2 && fs.statSync(path2) != null);
      } catch (err) {
        if (err && err.code === "ENOENT") {
          exist = false;
        } else {
          throw err;
        }
      }
      return exist;
    }
    exports2._exist = _exist;
    function _checkPath(p, name) {
      _debug("check path : " + p);
      if (!_exist(p)) {
        throw new Error(_loc("LIB_PathNotFound", name, p));
      }
    }
    exports2._checkPath = _checkPath;
    function _which(tool, check) {
      if (!tool) {
        throw new Error("parameter 'tool' is required");
      }
      if (check) {
        var result = _which(tool, false);
        if (result) {
          return result;
        } else {
          if (process.platform == "win32") {
            throw new Error(_loc("LIB_WhichNotFound_Win", tool));
          } else {
            throw new Error(_loc("LIB_WhichNotFound_Linux", tool));
          }
        }
      }
      _debug("which '".concat(tool, "'"));
      try {
        var extensions = [];
        if (process.platform == "win32" && process.env["PATHEXT"]) {
          for (var _i = 0, _a2 = process.env["PATHEXT"].split(path.delimiter); _i < _a2.length; _i++) {
            var extension = _a2[_i];
            if (extension) {
              extensions.push(extension);
            }
          }
        }
        if (_isRooted(tool)) {
          var filePath = _tryGetExecutablePath(tool, extensions);
          if (filePath) {
            _debug("found: '".concat(filePath, "'"));
            return filePath;
          }
          _debug("not found");
          return "";
        }
        if (tool.indexOf("/") >= 0 || process.platform == "win32" && tool.indexOf("\\") >= 0) {
          _debug("not found");
          return "";
        }
        var directories = [];
        if (process.env["PATH"]) {
          for (var _b2 = 0, _c = process.env["PATH"].split(path.delimiter); _b2 < _c.length; _b2++) {
            var p = _c[_b2];
            if (p) {
              directories.push(p);
            }
          }
        }
        for (var _d = 0, directories_1 = directories; _d < directories_1.length; _d++) {
          var directory = directories_1[_d];
          var filePath = _tryGetExecutablePath(directory + path.sep + tool, extensions);
          if (filePath) {
            _debug("found: '".concat(filePath, "'"));
            return filePath;
          }
        }
        _debug("not found");
        return "";
      } catch (err) {
        throw new Error(_loc("LIB_OperationFailed", "which", err.message));
      }
    }
    exports2._which = _which;
    function _tryGetExecutablePath(filePath, extensions) {
      try {
        var stats = fs.statSync(filePath);
        if (stats.isFile()) {
          if (process.platform == "win32") {
            var isExecutable = false;
            var fileName = path.basename(filePath);
            var dotIndex = fileName.lastIndexOf(".");
            if (dotIndex >= 0) {
              var upperExt_1 = fileName.substr(dotIndex).toUpperCase();
              if (extensions.some(function(validExt) {
                return validExt.toUpperCase() == upperExt_1;
              })) {
                return filePath;
              }
            }
          } else {
            if (isUnixExecutable(stats)) {
              return filePath;
            }
          }
        }
      } catch (err) {
        if (err.code != "ENOENT") {
          _debug("Unexpected error attempting to determine if executable file exists '".concat(filePath, "': ").concat(err));
        }
      }
      var originalFilePath = filePath;
      for (var _i = 0, extensions_1 = extensions; _i < extensions_1.length; _i++) {
        var extension = extensions_1[_i];
        var found = false;
        var filePath_1 = originalFilePath + extension;
        try {
          var stats = fs.statSync(filePath_1);
          if (stats.isFile()) {
            if (process.platform == "win32") {
              try {
                var directory = path.dirname(filePath_1);
                var upperName = path.basename(filePath_1).toUpperCase();
                for (var _a2 = 0, _b2 = fs.readdirSync(directory); _a2 < _b2.length; _a2++) {
                  var actualName = _b2[_a2];
                  if (upperName == actualName.toUpperCase()) {
                    filePath_1 = path.join(directory, actualName);
                    break;
                  }
                }
              } catch (err) {
                _debug("Unexpected error attempting to determine the actual case of the file '".concat(filePath_1, "': ").concat(err));
              }
              return filePath_1;
            } else {
              if (isUnixExecutable(stats)) {
                return filePath_1;
              }
            }
          }
        } catch (err) {
          if (err.code != "ENOENT") {
            _debug("Unexpected error attempting to determine if executable file exists '".concat(filePath_1, "': ").concat(err));
          }
        }
      }
      return "";
    }
    function isUnixExecutable(stats) {
      return (stats.mode & 1) > 0 || (stats.mode & 8) > 0 && stats.gid === process.getgid() || (stats.mode & 64) > 0 && stats.uid === process.getuid();
    }
    function _legacyFindFiles_convertPatternToRegExp(pattern) {
      pattern = (process.platform == "win32" ? pattern.replace(/\\/g, "/") : pattern).replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/\\\/\\\*\\\*\\\//g, "((/.+/)|(/))").replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*").replace(/\\\?/g, "[^/]");
      pattern = "^".concat(pattern, "$");
      var flags = process.platform == "win32" ? "i" : "";
      return new RegExp(pattern, flags);
    }
    exports2._legacyFindFiles_convertPatternToRegExp = _legacyFindFiles_convertPatternToRegExp;
    function _cloneMatchOptions(matchOptions) {
      return {
        debug: matchOptions.debug,
        nobrace: matchOptions.nobrace,
        noglobstar: matchOptions.noglobstar,
        dot: matchOptions.dot,
        noext: matchOptions.noext,
        nocase: matchOptions.nocase,
        nonull: matchOptions.nonull,
        matchBase: matchOptions.matchBase,
        nocomment: matchOptions.nocomment,
        nonegate: matchOptions.nonegate,
        flipNegate: matchOptions.flipNegate
      };
    }
    exports2._cloneMatchOptions = _cloneMatchOptions;
    function _getFindInfoFromPattern(defaultRoot, pattern, matchOptions) {
      if (!defaultRoot) {
        throw new Error("getFindRootFromPattern() parameter defaultRoot cannot be empty");
      }
      if (!pattern) {
        throw new Error("getFindRootFromPattern() parameter pattern cannot be empty");
      }
      if (!matchOptions.nobrace) {
        throw new Error("getFindRootFromPattern() expected matchOptions.nobrace to be true");
      }
      matchOptions = _cloneMatchOptions(matchOptions);
      matchOptions.nocase = false;
      if (matchOptions.matchBase && !_isRooted(pattern) && (process.platform == "win32" ? pattern.replace(/\\/g, "/") : pattern).indexOf("/") < 0) {
        return {
          adjustedPattern: pattern,
          findPath: defaultRoot,
          statOnly: false
        };
      }
      var minimatchObj = new minimatch.Minimatch(pattern, matchOptions);
      if (minimatchObj.set.length != 1) {
        throw new Error("getFindRootFromPattern() expected Minimatch(...).set.length to be 1. Actual: " + minimatchObj.set.length);
      }
      var literalSegments = [];
      for (var _i = 0, _a2 = minimatchObj.set[0]; _i < _a2.length; _i++) {
        var parsedSegment = _a2[_i];
        if (typeof parsedSegment == "string") {
          literalSegments.push(parsedSegment);
          continue;
        }
        break;
      }
      var joinedSegments = literalSegments.join("/");
      if (joinedSegments && process.platform == "win32" && _startsWith(pattern.replace(/\\/g, "/"), "//")) {
        joinedSegments = "/" + joinedSegments;
      }
      var findPath;
      if (_isRooted(pattern)) {
        findPath = joinedSegments;
      } else if (joinedSegments) {
        findPath = _ensureRooted(defaultRoot, joinedSegments);
      } else {
        findPath = defaultRoot;
      }
      if (findPath) {
        findPath = _getDirectoryName(_ensureRooted(findPath, "_"));
        findPath = _normalizeSeparators(findPath);
      }
      return {
        adjustedPattern: _ensurePatternRooted(defaultRoot, pattern),
        findPath,
        statOnly: literalSegments.length == minimatchObj.set[0].length
      };
    }
    exports2._getFindInfoFromPattern = _getFindInfoFromPattern;
    function _ensurePatternRooted(root, p) {
      if (!root) {
        throw new Error('ensurePatternRooted() parameter "root" cannot be empty');
      }
      if (!p) {
        throw new Error('ensurePatternRooted() parameter "p" cannot be empty');
      }
      if (_isRooted(p)) {
        return p;
      }
      root = _normalizeSeparators(root);
      root = (process.platform == "win32" ? root : root.replace(/\\/g, "\\\\")).replace(/(\[)(?=[^\/]+\])/g, "[[]").replace(/\?/g, "[?]").replace(/\*/g, "[*]").replace(/\+\(/g, "[+](").replace(/@\(/g, "[@](").replace(/!\(/g, "[!](");
      return _ensureRooted(root, p);
    }
    exports2._ensurePatternRooted = _ensurePatternRooted;
    function _loadData() {
      var keyPath = _getVariable("agent.TempDirectory") || _getVariable("agent.workFolder") || process.cwd();
      exports2._vault = new vm.Vault(keyPath);
      exports2._knownVariableMap = {};
      _debug("loading inputs and endpoints");
      var loaded = 0;
      for (var envvar in process.env) {
        if (_startsWith(envvar, "INPUT_") || _startsWith(envvar, "ENDPOINT_AUTH_") || _startsWith(envvar, "SECUREFILE_TICKET_") || _startsWith(envvar, "SECRET_") || _startsWith(envvar, "VSTS_TASKVARIABLE_")) {
          if (_startsWith(envvar, "SECRET_")) {
            var variableName = envvar.substring("SECRET_".length);
            if (variableName) {
              exports2._knownVariableMap[_getVariableKey(variableName)] = { name: variableName, secret: true };
            }
          }
          var value = process.env[envvar];
          if (value) {
            ++loaded;
            _debug("loading " + envvar);
            exports2._vault.storeSecret(envvar, value);
            delete process.env[envvar];
          }
        }
      }
      _debug("loaded " + loaded);
      var correlationId = process.env["COMMAND_CORRELATION_ID"];
      delete process.env["COMMAND_CORRELATION_ID"];
      _commandCorrelationId = correlationId ? String(correlationId) : "";
      var names;
      try {
        names = JSON.parse(process.env["VSTS_PUBLIC_VARIABLES"] || "[]");
      } catch (err) {
        throw new Error("Failed to parse VSTS_PUBLIC_VARIABLES as JSON. " + err);
      }
      names.forEach(function(name) {
        exports2._knownVariableMap[_getVariableKey(name)] = { name, secret: false };
      });
      delete process.env["VSTS_PUBLIC_VARIABLES"];
      try {
        names = JSON.parse(process.env["VSTS_SECRET_VARIABLES"] || "[]");
      } catch (err) {
        throw new Error("Failed to parse VSTS_SECRET_VARIABLES as JSON. " + err);
      }
      names.forEach(function(name) {
        exports2._knownVariableMap[_getVariableKey(name)] = { name, secret: true };
      });
      delete process.env["VSTS_SECRET_VARIABLES"];
      global["_vsts_task_lib_loaded"] = true;
    }
    exports2._loadData = _loadData;
    function _isUncPath(path2) {
      return /^\\\\[^\\]/.test(path2);
    }
    exports2._isUncPath = _isUncPath;
    function _ensureRooted(root, p) {
      if (!root) {
        throw new Error('ensureRooted() parameter "root" cannot be empty');
      }
      if (!p) {
        throw new Error('ensureRooted() parameter "p" cannot be empty');
      }
      if (_isRooted(p)) {
        return p;
      }
      if (process.platform == "win32" && root.match(/^[A-Z]:$/i)) {
        return root + p;
      }
      if (_endsWith(root, "/") || process.platform == "win32" && _endsWith(root, "\\")) {
      } else {
        root += path.sep;
      }
      return root + p;
    }
    exports2._ensureRooted = _ensureRooted;
    function _getDirectoryName(p) {
      if (!p) {
        return "";
      }
      p = _normalizeSeparators(p);
      if (process.platform == "win32") {
        if (/^[A-Z]:\\?[^\\]+$/i.test(p)) {
          return p.charAt(2) == "\\" ? p.substring(0, 3) : p.substring(0, 2);
        } else if (/^[A-Z]:\\?$/i.test(p)) {
          return "";
        }
        var lastSlashIndex = p.lastIndexOf("\\");
        if (lastSlashIndex < 0) {
          return "";
        } else if (p == "\\") {
          return "";
        } else if (lastSlashIndex == 0) {
          return "\\";
        } else if (/^\\\\[^\\]+(\\[^\\]*)?$/.test(p)) {
          return "";
        }
        return p.substring(0, lastSlashIndex);
      }
      if (p.indexOf("/") < 0) {
        return "";
      } else if (p == "/") {
        return "";
      } else if (_endsWith(p, "/")) {
        return p.substring(0, p.length - 1);
      }
      return path.dirname(p);
    }
    exports2._getDirectoryName = _getDirectoryName;
    function _isRooted(p) {
      p = _normalizeSeparators(p);
      if (!p) {
        throw new Error('isRooted() parameter "p" cannot be empty');
      }
      if (process.platform == "win32") {
        return _startsWith(p, "\\") || // e.g. \ or \hello or \\hello
        /^[A-Z]:/i.test(p);
      }
      return _startsWith(p, "/");
    }
    exports2._isRooted = _isRooted;
    function _normalizeSeparators(p) {
      p = p || "";
      if (process.platform == "win32") {
        p = p.replace(/\//g, "\\");
        var isUnc = /^\\\\+[^\\]/.test(p);
        return (isUnc ? "\\" : "") + p.replace(/\\\\+/g, "\\");
      }
      return p.replace(/\/\/+/g, "/");
    }
    exports2._normalizeSeparators = _normalizeSeparators;
    function _exposeProxySettings() {
      var proxyUrl = _getVariable("Agent.ProxyUrl");
      if (proxyUrl && proxyUrl.length > 0) {
        var proxyUsername = _getVariable("Agent.ProxyUsername");
        var proxyPassword = _getVariable("Agent.ProxyPassword");
        var proxyBypassHostsJson = _getVariable("Agent.ProxyBypassList");
        global["_vsts_task_lib_proxy_url"] = proxyUrl;
        global["_vsts_task_lib_proxy_username"] = proxyUsername;
        global["_vsts_task_lib_proxy_bypass"] = proxyBypassHostsJson;
        global["_vsts_task_lib_proxy_password"] = _exposeTaskLibSecret("proxy", proxyPassword || "");
        _debug("expose agent proxy configuration.");
        global["_vsts_task_lib_proxy"] = true;
      }
    }
    exports2._exposeProxySettings = _exposeProxySettings;
    function _exposeCertSettings() {
      var ca = _getVariable("Agent.CAInfo");
      if (ca) {
        global["_vsts_task_lib_cert_ca"] = ca;
      }
      var clientCert = _getVariable("Agent.ClientCert");
      if (clientCert) {
        var clientCertKey = _getVariable("Agent.ClientCertKey");
        var clientCertArchive = _getVariable("Agent.ClientCertArchive");
        var clientCertPassword = _getVariable("Agent.ClientCertPassword");
        global["_vsts_task_lib_cert_clientcert"] = clientCert;
        global["_vsts_task_lib_cert_key"] = clientCertKey;
        global["_vsts_task_lib_cert_archive"] = clientCertArchive;
        global["_vsts_task_lib_cert_passphrase"] = _exposeTaskLibSecret("cert", clientCertPassword || "");
      }
      if (ca || clientCert) {
        _debug("expose agent certificate configuration.");
        global["_vsts_task_lib_cert"] = true;
      }
      var skipCertValidation = _getVariable("Agent.SkipCertValidation") || "false";
      if (skipCertValidation) {
        global["_vsts_task_lib_skip_cert_validation"] = skipCertValidation.toUpperCase() === "TRUE";
      }
    }
    exports2._exposeCertSettings = _exposeCertSettings;
    function _exposeTaskLibSecret(keyFile, secret) {
      if (secret) {
        var encryptKey = crypto.randomBytes(32);
        var iv = crypto.randomBytes(16);
        var cipher = crypto.createCipheriv("aes-256-ctr", encryptKey, iv);
        var encryptedContent = cipher.update(secret, "utf8", "hex");
        encryptedContent += cipher.final("hex");
        var storageFile = path.join(_getVariable("Agent.TempDirectory") || _getVariable("agent.workFolder") || process.cwd(), keyFile);
        var keyAndIv = encryptKey.toString("base64") + ":" + iv.toString("base64");
        fs.writeFileSync(storageFile, keyAndIv, { encoding: "utf8" });
        return Buffer.from(storageFile).toString("base64") + ":" + Buffer.from(encryptedContent).toString("base64");
      }
    }
    function isSigPipeError(e) {
      var _a2;
      if (!e || typeof e !== "object") {
        return false;
      }
      return e.code === "EPIPE" && ((_a2 = e.syscall) === null || _a2 === void 0 ? void 0 : _a2.toUpperCase()) === "WRITE";
    }
    exports2.isSigPipeError = isSigPipeError;
  }
});

// ../../node_modules/q/q.js
var require_q = __commonJS({
  "../../node_modules/q/q.js"(exports2, module2) {
    (function(definition) {
      "use strict";
      if (typeof bootstrap === "function") {
        bootstrap("promise", definition);
      } else if (typeof exports2 === "object" && typeof module2 === "object") {
        module2.exports = definition();
      } else if (typeof define === "function" && define.amd) {
        define(definition);
      } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
          return;
        } else {
          ses.makeQ = definition;
        }
      } else if (typeof window !== "undefined" || typeof self !== "undefined") {
        var global2 = typeof window !== "undefined" ? window : self;
        var previousQ = global2.Q;
        global2.Q = definition();
        global2.Q.noConflict = function() {
          global2.Q = previousQ;
          return this;
        };
      } else {
        throw new Error("This environment was not anticipated by Q. Please file a bug.");
      }
    })(function() {
      "use strict";
      var hasStacks = false;
      try {
        throw new Error();
      } catch (e) {
        hasStacks = !!e.stack;
      }
      var qStartingLine = captureLine();
      var qFileName;
      var noop = function() {
      };
      var nextTick = function() {
        var head = { task: void 0, next: null };
        var tail = head;
        var flushing = false;
        var requestTick = void 0;
        var isNodeJS = false;
        var laterQueue = [];
        function flush() {
          var task, domain;
          while (head.next) {
            head = head.next;
            task = head.task;
            head.task = void 0;
            domain = head.domain;
            if (domain) {
              head.domain = void 0;
              domain.enter();
            }
            runSingle(task, domain);
          }
          while (laterQueue.length) {
            task = laterQueue.pop();
            runSingle(task);
          }
          flushing = false;
        }
        function runSingle(task, domain) {
          try {
            task();
          } catch (e) {
            if (isNodeJS) {
              if (domain) {
                domain.exit();
              }
              setTimeout(flush, 0);
              if (domain) {
                domain.enter();
              }
              throw e;
            } else {
              setTimeout(function() {
                throw e;
              }, 0);
            }
          }
          if (domain) {
            domain.exit();
          }
        }
        nextTick = function(task) {
          tail = tail.next = {
            task,
            domain: isNodeJS && process.domain,
            next: null
          };
          if (!flushing) {
            flushing = true;
            requestTick();
          }
        };
        if (typeof process === "object" && process.toString() === "[object process]" && process.nextTick) {
          isNodeJS = true;
          requestTick = function() {
            process.nextTick(flush);
          };
        } else if (typeof setImmediate === "function") {
          if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
          } else {
            requestTick = function() {
              setImmediate(flush);
            };
          }
        } else if (typeof MessageChannel !== "undefined") {
          var channel = new MessageChannel();
          channel.port1.onmessage = function() {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
          };
          var requestPortTick = function() {
            channel.port2.postMessage(0);
          };
          requestTick = function() {
            setTimeout(flush, 0);
            requestPortTick();
          };
        } else {
          requestTick = function() {
            setTimeout(flush, 0);
          };
        }
        nextTick.runAfter = function(task) {
          laterQueue.push(task);
          if (!flushing) {
            flushing = true;
            requestTick();
          }
        };
        return nextTick;
      }();
      var call = Function.call;
      function uncurryThis(f) {
        return function() {
          return call.apply(f, arguments);
        };
      }
      var array_slice = uncurryThis(Array.prototype.slice);
      var array_reduce = uncurryThis(
        Array.prototype.reduce || function(callback, basis) {
          var index = 0, length = this.length;
          if (arguments.length === 1) {
            do {
              if (index in this) {
                basis = this[index++];
                break;
              }
              if (++index >= length) {
                throw new TypeError();
              }
            } while (1);
          }
          for (; index < length; index++) {
            if (index in this) {
              basis = callback(basis, this[index], index);
            }
          }
          return basis;
        }
      );
      var array_indexOf = uncurryThis(
        Array.prototype.indexOf || function(value) {
          for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
              return i;
            }
          }
          return -1;
        }
      );
      var array_map = uncurryThis(
        Array.prototype.map || function(callback, thisp) {
          var self2 = this;
          var collect = [];
          array_reduce(self2, function(undefined2, value, index) {
            collect.push(callback.call(thisp, value, index, self2));
          }, void 0);
          return collect;
        }
      );
      var object_create = Object.create || function(prototype) {
        function Type() {
        }
        Type.prototype = prototype;
        return new Type();
      };
      var object_defineProperty = Object.defineProperty || function(obj, prop, descriptor) {
        obj[prop] = descriptor.value;
        return obj;
      };
      var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);
      var object_keys = Object.keys || function(object) {
        var keys = [];
        for (var key in object) {
          if (object_hasOwnProperty(object, key)) {
            keys.push(key);
          }
        }
        return keys;
      };
      var object_toString = uncurryThis(Object.prototype.toString);
      function isObject(value) {
        return value === Object(value);
      }
      function isStopIteration(exception) {
        return object_toString(exception) === "[object StopIteration]" || exception instanceof QReturnValue;
      }
      var QReturnValue;
      if (typeof ReturnValue !== "undefined") {
        QReturnValue = ReturnValue;
      } else {
        QReturnValue = function(value) {
          this.value = value;
        };
      }
      var STACK_JUMP_SEPARATOR = "From previous event:";
      function makeStackTraceLong(error2, promise2) {
        if (hasStacks && promise2.stack && typeof error2 === "object" && error2 !== null && error2.stack) {
          var stacks = [];
          for (var p = promise2; !!p; p = p.source) {
            if (p.stack && (!error2.__minimumStackCounter__ || error2.__minimumStackCounter__ > p.stackCounter)) {
              object_defineProperty(error2, "__minimumStackCounter__", { value: p.stackCounter, configurable: true });
              stacks.unshift(p.stack);
            }
          }
          stacks.unshift(error2.stack);
          var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
          var stack = filterStackString(concatedStacks);
          object_defineProperty(error2, "stack", { value: stack, configurable: true });
        }
      }
      function filterStackString(stackString) {
        var lines = stackString.split("\n");
        var desiredLines = [];
        for (var i = 0; i < lines.length; ++i) {
          var line = lines[i];
          if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
          }
        }
        return desiredLines.join("\n");
      }
      function isNodeFrame(stackLine) {
        return stackLine.indexOf("(module.js:") !== -1 || stackLine.indexOf("(node.js:") !== -1;
      }
      function getFileNameAndLineNumber(stackLine) {
        var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
        if (attempt1) {
          return [attempt1[1], Number(attempt1[2])];
        }
        var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
        if (attempt2) {
          return [attempt2[1], Number(attempt2[2])];
        }
        var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
        if (attempt3) {
          return [attempt3[1], Number(attempt3[2])];
        }
      }
      function isInternalFrame(stackLine) {
        var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);
        if (!fileNameAndLineNumber) {
          return false;
        }
        var fileName = fileNameAndLineNumber[0];
        var lineNumber = fileNameAndLineNumber[1];
        return fileName === qFileName && lineNumber >= qStartingLine && lineNumber <= qEndingLine;
      }
      function captureLine() {
        if (!hasStacks) {
          return;
        }
        try {
          throw new Error();
        } catch (e) {
          var lines = e.stack.split("\n");
          var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
          var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
          if (!fileNameAndLineNumber) {
            return;
          }
          qFileName = fileNameAndLineNumber[0];
          return fileNameAndLineNumber[1];
        }
      }
      function deprecate(callback, name, alternative) {
        return function() {
          if (typeof console !== "undefined" && typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative + " instead.", new Error("").stack);
          }
          return callback.apply(callback, arguments);
        };
      }
      function Q(value) {
        if (value instanceof Promise2) {
          return value;
        }
        if (isPromiseAlike(value)) {
          return coerce(value);
        } else {
          return fulfill(value);
        }
      }
      Q.resolve = Q;
      Q.nextTick = nextTick;
      Q.longStackSupport = false;
      var longStackCounter = 1;
      if (typeof process === "object" && process && process.env && process.env.Q_DEBUG) {
        Q.longStackSupport = true;
      }
      Q.defer = defer;
      function defer() {
        var messages = [], progressListeners = [], resolvedPromise;
        var deferred = object_create(defer.prototype);
        var promise2 = object_create(Promise2.prototype);
        promise2.promiseDispatch = function(resolve, op, operands) {
          var args = array_slice(arguments);
          if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) {
              progressListeners.push(operands[1]);
            }
          } else {
            Q.nextTick(function() {
              resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
          }
        };
        promise2.valueOf = function() {
          if (messages) {
            return promise2;
          }
          var nearerValue = nearer(resolvedPromise);
          if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue;
          }
          return nearerValue;
        };
        promise2.inspect = function() {
          if (!resolvedPromise) {
            return { state: "pending" };
          }
          return resolvedPromise.inspect();
        };
        if (Q.longStackSupport && hasStacks) {
          try {
            throw new Error();
          } catch (e) {
            promise2.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
            promise2.stackCounter = longStackCounter++;
          }
        }
        function become(newPromise) {
          resolvedPromise = newPromise;
          if (Q.longStackSupport && hasStacks) {
            promise2.source = newPromise;
          }
          array_reduce(messages, function(undefined2, message) {
            Q.nextTick(function() {
              newPromise.promiseDispatch.apply(newPromise, message);
            });
          }, void 0);
          messages = void 0;
          progressListeners = void 0;
        }
        deferred.promise = promise2;
        deferred.resolve = function(value) {
          if (resolvedPromise) {
            return;
          }
          become(Q(value));
        };
        deferred.fulfill = function(value) {
          if (resolvedPromise) {
            return;
          }
          become(fulfill(value));
        };
        deferred.reject = function(reason) {
          if (resolvedPromise) {
            return;
          }
          become(reject(reason));
        };
        deferred.notify = function(progress2) {
          if (resolvedPromise) {
            return;
          }
          array_reduce(progressListeners, function(undefined2, progressListener) {
            Q.nextTick(function() {
              progressListener(progress2);
            });
          }, void 0);
        };
        return deferred;
      }
      defer.prototype.makeNodeResolver = function() {
        var self2 = this;
        return function(error2, value) {
          if (error2) {
            self2.reject(error2);
          } else if (arguments.length > 2) {
            self2.resolve(array_slice(arguments, 1));
          } else {
            self2.resolve(value);
          }
        };
      };
      Q.Promise = promise;
      Q.promise = promise;
      function promise(resolver) {
        if (typeof resolver !== "function") {
          throw new TypeError("resolver must be a function.");
        }
        var deferred = defer();
        try {
          resolver(deferred.resolve, deferred.reject, deferred.notify);
        } catch (reason) {
          deferred.reject(reason);
        }
        return deferred.promise;
      }
      promise.race = race;
      promise.all = all;
      promise.reject = reject;
      promise.resolve = Q;
      Q.passByCopy = function(object) {
        return object;
      };
      Promise2.prototype.passByCopy = function() {
        return this;
      };
      Q.join = function(x, y) {
        return Q(x).join(y);
      };
      Promise2.prototype.join = function(that) {
        return Q([this, that]).spread(function(x, y) {
          if (x === y) {
            return x;
          } else {
            throw new Error("Q can't join: not the same: " + x + " " + y);
          }
        });
      };
      Q.race = race;
      function race(answerPs) {
        return promise(function(resolve, reject2) {
          for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject2);
          }
        });
      }
      Promise2.prototype.race = function() {
        return this.then(Q.race);
      };
      Q.makePromise = Promise2;
      function Promise2(descriptor, fallback, inspect) {
        if (fallback === void 0) {
          fallback = function(op) {
            return reject(new Error(
              "Promise does not support operation: " + op
            ));
          };
        }
        if (inspect === void 0) {
          inspect = function() {
            return { state: "unknown" };
          };
        }
        var promise2 = object_create(Promise2.prototype);
        promise2.promiseDispatch = function(resolve, op, args) {
          var result;
          try {
            if (descriptor[op]) {
              result = descriptor[op].apply(promise2, args);
            } else {
              result = fallback.call(promise2, op, args);
            }
          } catch (exception) {
            result = reject(exception);
          }
          if (resolve) {
            resolve(result);
          }
        };
        promise2.inspect = inspect;
        if (inspect) {
          var inspected = inspect();
          if (inspected.state === "rejected") {
            promise2.exception = inspected.reason;
          }
          promise2.valueOf = function() {
            var inspected2 = inspect();
            if (inspected2.state === "pending" || inspected2.state === "rejected") {
              return promise2;
            }
            return inspected2.value;
          };
        }
        return promise2;
      }
      Promise2.prototype.toString = function() {
        return "[object Promise]";
      };
      Promise2.prototype.then = function(fulfilled, rejected, progressed) {
        var self2 = this;
        var deferred = defer();
        var done = false;
        function _fulfilled(value) {
          try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
          } catch (exception) {
            return reject(exception);
          }
        }
        function _rejected(exception) {
          if (typeof rejected === "function") {
            makeStackTraceLong(exception, self2);
            try {
              return rejected(exception);
            } catch (newException) {
              return reject(newException);
            }
          }
          return reject(exception);
        }
        function _progressed(value) {
          return typeof progressed === "function" ? progressed(value) : value;
        }
        Q.nextTick(function() {
          self2.promiseDispatch(function(value) {
            if (done) {
              return;
            }
            done = true;
            deferred.resolve(_fulfilled(value));
          }, "when", [function(exception) {
            if (done) {
              return;
            }
            done = true;
            deferred.resolve(_rejected(exception));
          }]);
        });
        self2.promiseDispatch(void 0, "when", [void 0, function(value) {
          var newValue;
          var threw = false;
          try {
            newValue = _progressed(value);
          } catch (e) {
            threw = true;
            if (Q.onerror) {
              Q.onerror(e);
            } else {
              throw e;
            }
          }
          if (!threw) {
            deferred.notify(newValue);
          }
        }]);
        return deferred.promise;
      };
      Q.tap = function(promise2, callback) {
        return Q(promise2).tap(callback);
      };
      Promise2.prototype.tap = function(callback) {
        callback = Q(callback);
        return this.then(function(value) {
          return callback.fcall(value).thenResolve(value);
        });
      };
      Q.when = when;
      function when(value, fulfilled, rejected, progressed) {
        return Q(value).then(fulfilled, rejected, progressed);
      }
      Promise2.prototype.thenResolve = function(value) {
        return this.then(function() {
          return value;
        });
      };
      Q.thenResolve = function(promise2, value) {
        return Q(promise2).thenResolve(value);
      };
      Promise2.prototype.thenReject = function(reason) {
        return this.then(function() {
          throw reason;
        });
      };
      Q.thenReject = function(promise2, reason) {
        return Q(promise2).thenReject(reason);
      };
      Q.nearer = nearer;
      function nearer(value) {
        if (isPromise(value)) {
          var inspected = value.inspect();
          if (inspected.state === "fulfilled") {
            return inspected.value;
          }
        }
        return value;
      }
      Q.isPromise = isPromise;
      function isPromise(object) {
        return object instanceof Promise2;
      }
      Q.isPromiseAlike = isPromiseAlike;
      function isPromiseAlike(object) {
        return isObject(object) && typeof object.then === "function";
      }
      Q.isPending = isPending;
      function isPending(object) {
        return isPromise(object) && object.inspect().state === "pending";
      }
      Promise2.prototype.isPending = function() {
        return this.inspect().state === "pending";
      };
      Q.isFulfilled = isFulfilled;
      function isFulfilled(object) {
        return !isPromise(object) || object.inspect().state === "fulfilled";
      }
      Promise2.prototype.isFulfilled = function() {
        return this.inspect().state === "fulfilled";
      };
      Q.isRejected = isRejected;
      function isRejected(object) {
        return isPromise(object) && object.inspect().state === "rejected";
      }
      Promise2.prototype.isRejected = function() {
        return this.inspect().state === "rejected";
      };
      var unhandledReasons = [];
      var unhandledRejections = [];
      var reportedUnhandledRejections = [];
      var trackUnhandledRejections = true;
      function resetUnhandledRejections() {
        unhandledReasons.length = 0;
        unhandledRejections.length = 0;
        if (!trackUnhandledRejections) {
          trackUnhandledRejections = true;
        }
      }
      function trackRejection(promise2, reason) {
        if (!trackUnhandledRejections) {
          return;
        }
        if (typeof process === "object" && typeof process.emit === "function") {
          Q.nextTick.runAfter(function() {
            if (array_indexOf(unhandledRejections, promise2) !== -1) {
              process.emit("unhandledRejection", reason, promise2);
              reportedUnhandledRejections.push(promise2);
            }
          });
        }
        unhandledRejections.push(promise2);
        if (reason && typeof reason.stack !== "undefined") {
          unhandledReasons.push(reason.stack);
        } else {
          unhandledReasons.push("(no stack) " + reason);
        }
      }
      function untrackRejection(promise2) {
        if (!trackUnhandledRejections) {
          return;
        }
        var at = array_indexOf(unhandledRejections, promise2);
        if (at !== -1) {
          if (typeof process === "object" && typeof process.emit === "function") {
            Q.nextTick.runAfter(function() {
              var atReport = array_indexOf(reportedUnhandledRejections, promise2);
              if (atReport !== -1) {
                process.emit("rejectionHandled", unhandledReasons[at], promise2);
                reportedUnhandledRejections.splice(atReport, 1);
              }
            });
          }
          unhandledRejections.splice(at, 1);
          unhandledReasons.splice(at, 1);
        }
      }
      Q.resetUnhandledRejections = resetUnhandledRejections;
      Q.getUnhandledReasons = function() {
        return unhandledReasons.slice();
      };
      Q.stopUnhandledRejectionTracking = function() {
        resetUnhandledRejections();
        trackUnhandledRejections = false;
      };
      resetUnhandledRejections();
      Q.reject = reject;
      function reject(reason) {
        var rejection = Promise2({
          "when": function(rejected) {
            if (rejected) {
              untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
          }
        }, function fallback() {
          return this;
        }, function inspect() {
          return { state: "rejected", reason };
        });
        trackRejection(rejection, reason);
        return rejection;
      }
      Q.fulfill = fulfill;
      function fulfill(value) {
        return Promise2({
          "when": function() {
            return value;
          },
          "get": function(name) {
            return value[name];
          },
          "set": function(name, rhs) {
            value[name] = rhs;
          },
          "delete": function(name) {
            delete value[name];
          },
          "post": function(name, args) {
            if (name === null || name === void 0) {
              return value.apply(void 0, args);
            } else {
              return value[name].apply(value, args);
            }
          },
          "apply": function(thisp, args) {
            return value.apply(thisp, args);
          },
          "keys": function() {
            return object_keys(value);
          }
        }, void 0, function inspect() {
          return { state: "fulfilled", value };
        });
      }
      function coerce(promise2) {
        var deferred = defer();
        Q.nextTick(function() {
          try {
            promise2.then(deferred.resolve, deferred.reject, deferred.notify);
          } catch (exception) {
            deferred.reject(exception);
          }
        });
        return deferred.promise;
      }
      Q.master = master;
      function master(object) {
        return Promise2({
          "isDef": function() {
          }
        }, function fallback(op, args) {
          return dispatch(object, op, args);
        }, function() {
          return Q(object).inspect();
        });
      }
      Q.spread = spread;
      function spread(value, fulfilled, rejected) {
        return Q(value).spread(fulfilled, rejected);
      }
      Promise2.prototype.spread = function(fulfilled, rejected) {
        return this.all().then(function(array) {
          return fulfilled.apply(void 0, array);
        }, rejected);
      };
      Q.async = async;
      function async(makeGenerator) {
        return function() {
          function continuer(verb, arg) {
            var result;
            if (typeof StopIteration === "undefined") {
              try {
                result = generator[verb](arg);
              } catch (exception) {
                return reject(exception);
              }
              if (result.done) {
                return Q(result.value);
              } else {
                return when(result.value, callback, errback);
              }
            } else {
              try {
                result = generator[verb](arg);
              } catch (exception) {
                if (isStopIteration(exception)) {
                  return Q(exception.value);
                } else {
                  return reject(exception);
                }
              }
              return when(result, callback, errback);
            }
          }
          var generator = makeGenerator.apply(this, arguments);
          var callback = continuer.bind(continuer, "next");
          var errback = continuer.bind(continuer, "throw");
          return callback();
        };
      }
      Q.spawn = spawn;
      function spawn(makeGenerator) {
        Q.done(Q.async(makeGenerator)());
      }
      Q["return"] = _return;
      function _return(value) {
        throw new QReturnValue(value);
      }
      Q.promised = promised;
      function promised(callback) {
        return function() {
          return spread([this, all(arguments)], function(self2, args) {
            return callback.apply(self2, args);
          });
        };
      }
      Q.dispatch = dispatch;
      function dispatch(object, op, args) {
        return Q(object).dispatch(op, args);
      }
      Promise2.prototype.dispatch = function(op, args) {
        var self2 = this;
        var deferred = defer();
        Q.nextTick(function() {
          self2.promiseDispatch(deferred.resolve, op, args);
        });
        return deferred.promise;
      };
      Q.get = function(object, key) {
        return Q(object).dispatch("get", [key]);
      };
      Promise2.prototype.get = function(key) {
        return this.dispatch("get", [key]);
      };
      Q.set = function(object, key, value) {
        return Q(object).dispatch("set", [key, value]);
      };
      Promise2.prototype.set = function(key, value) {
        return this.dispatch("set", [key, value]);
      };
      Q.del = // XXX legacy
      Q["delete"] = function(object, key) {
        return Q(object).dispatch("delete", [key]);
      };
      Promise2.prototype.del = // XXX legacy
      Promise2.prototype["delete"] = function(key) {
        return this.dispatch("delete", [key]);
      };
      Q.mapply = // XXX As proposed by "Redsandro"
      Q.post = function(object, name, args) {
        return Q(object).dispatch("post", [name, args]);
      };
      Promise2.prototype.mapply = // XXX As proposed by "Redsandro"
      Promise2.prototype.post = function(name, args) {
        return this.dispatch("post", [name, args]);
      };
      Q.send = // XXX Mark Miller's proposed parlance
      Q.mcall = // XXX As proposed by "Redsandro"
      Q.invoke = function(object, name) {
        return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
      };
      Promise2.prototype.send = // XXX Mark Miller's proposed parlance
      Promise2.prototype.mcall = // XXX As proposed by "Redsandro"
      Promise2.prototype.invoke = function(name) {
        return this.dispatch("post", [name, array_slice(arguments, 1)]);
      };
      Q.fapply = function(object, args) {
        return Q(object).dispatch("apply", [void 0, args]);
      };
      Promise2.prototype.fapply = function(args) {
        return this.dispatch("apply", [void 0, args]);
      };
      Q["try"] = Q.fcall = function(object) {
        return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
      };
      Promise2.prototype.fcall = function() {
        return this.dispatch("apply", [void 0, array_slice(arguments)]);
      };
      Q.fbind = function(object) {
        var promise2 = Q(object);
        var args = array_slice(arguments, 1);
        return function fbound() {
          return promise2.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
          ]);
        };
      };
      Promise2.prototype.fbind = function() {
        var promise2 = this;
        var args = array_slice(arguments);
        return function fbound() {
          return promise2.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
          ]);
        };
      };
      Q.keys = function(object) {
        return Q(object).dispatch("keys", []);
      };
      Promise2.prototype.keys = function() {
        return this.dispatch("keys", []);
      };
      Q.all = all;
      function all(promises) {
        return when(promises, function(promises2) {
          var pendingCount = 0;
          var deferred = defer();
          array_reduce(promises2, function(undefined2, promise2, index) {
            var snapshot;
            if (isPromise(promise2) && (snapshot = promise2.inspect()).state === "fulfilled") {
              promises2[index] = snapshot.value;
            } else {
              ++pendingCount;
              when(
                promise2,
                function(value) {
                  promises2[index] = value;
                  if (--pendingCount === 0) {
                    deferred.resolve(promises2);
                  }
                },
                deferred.reject,
                function(progress2) {
                  deferred.notify({ index, value: progress2 });
                }
              );
            }
          }, void 0);
          if (pendingCount === 0) {
            deferred.resolve(promises2);
          }
          return deferred.promise;
        });
      }
      Promise2.prototype.all = function() {
        return all(this);
      };
      Q.any = any;
      function any(promises) {
        if (promises.length === 0) {
          return Q.resolve();
        }
        var deferred = Q.defer();
        var pendingCount = 0;
        array_reduce(promises, function(prev, current, index) {
          var promise2 = promises[index];
          pendingCount++;
          when(promise2, onFulfilled, onRejected, onProgress);
          function onFulfilled(result) {
            deferred.resolve(result);
          }
          function onRejected(err) {
            pendingCount--;
            if (pendingCount === 0) {
              var rejection = err || new Error("" + err);
              rejection.message = "Q can't get fulfillment value from any promise, all promises were rejected. Last error message: " + rejection.message;
              deferred.reject(rejection);
            }
          }
          function onProgress(progress2) {
            deferred.notify({
              index,
              value: progress2
            });
          }
        }, void 0);
        return deferred.promise;
      }
      Promise2.prototype.any = function() {
        return any(this);
      };
      Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
      function allResolved(promises) {
        return when(promises, function(promises2) {
          promises2 = array_map(promises2, Q);
          return when(all(array_map(promises2, function(promise2) {
            return when(promise2, noop, noop);
          })), function() {
            return promises2;
          });
        });
      }
      Promise2.prototype.allResolved = function() {
        return allResolved(this);
      };
      Q.allSettled = allSettled;
      function allSettled(promises) {
        return Q(promises).allSettled();
      }
      Promise2.prototype.allSettled = function() {
        return this.then(function(promises) {
          return all(array_map(promises, function(promise2) {
            promise2 = Q(promise2);
            function regardless() {
              return promise2.inspect();
            }
            return promise2.then(regardless, regardless);
          }));
        });
      };
      Q.fail = // XXX legacy
      Q["catch"] = function(object, rejected) {
        return Q(object).then(void 0, rejected);
      };
      Promise2.prototype.fail = // XXX legacy
      Promise2.prototype["catch"] = function(rejected) {
        return this.then(void 0, rejected);
      };
      Q.progress = progress;
      function progress(object, progressed) {
        return Q(object).then(void 0, void 0, progressed);
      }
      Promise2.prototype.progress = function(progressed) {
        return this.then(void 0, void 0, progressed);
      };
      Q.fin = // XXX legacy
      Q["finally"] = function(object, callback) {
        return Q(object)["finally"](callback);
      };
      Promise2.prototype.fin = // XXX legacy
      Promise2.prototype["finally"] = function(callback) {
        if (!callback || typeof callback.apply !== "function") {
          throw new Error("Q can't apply finally callback");
        }
        callback = Q(callback);
        return this.then(function(value) {
          return callback.fcall().then(function() {
            return value;
          });
        }, function(reason) {
          return callback.fcall().then(function() {
            throw reason;
          });
        });
      };
      Q.done = function(object, fulfilled, rejected, progress2) {
        return Q(object).done(fulfilled, rejected, progress2);
      };
      Promise2.prototype.done = function(fulfilled, rejected, progress2) {
        var onUnhandledError = function(error2) {
          Q.nextTick(function() {
            makeStackTraceLong(error2, promise2);
            if (Q.onerror) {
              Q.onerror(error2);
            } else {
              throw error2;
            }
          });
        };
        var promise2 = fulfilled || rejected || progress2 ? this.then(fulfilled, rejected, progress2) : this;
        if (typeof process === "object" && process && process.domain) {
          onUnhandledError = process.domain.bind(onUnhandledError);
        }
        promise2.then(void 0, onUnhandledError);
      };
      Q.timeout = function(object, ms, error2) {
        return Q(object).timeout(ms, error2);
      };
      Promise2.prototype.timeout = function(ms, error2) {
        var deferred = defer();
        var timeoutId = setTimeout(function() {
          if (!error2 || "string" === typeof error2) {
            error2 = new Error(error2 || "Timed out after " + ms + " ms");
            error2.code = "ETIMEDOUT";
          }
          deferred.reject(error2);
        }, ms);
        this.then(function(value) {
          clearTimeout(timeoutId);
          deferred.resolve(value);
        }, function(exception) {
          clearTimeout(timeoutId);
          deferred.reject(exception);
        }, deferred.notify);
        return deferred.promise;
      };
      Q.delay = function(object, timeout) {
        if (timeout === void 0) {
          timeout = object;
          object = void 0;
        }
        return Q(object).delay(timeout);
      };
      Promise2.prototype.delay = function(timeout) {
        return this.then(function(value) {
          var deferred = defer();
          setTimeout(function() {
            deferred.resolve(value);
          }, timeout);
          return deferred.promise;
        });
      };
      Q.nfapply = function(callback, args) {
        return Q(callback).nfapply(args);
      };
      Promise2.prototype.nfapply = function(args) {
        var deferred = defer();
        var nodeArgs = array_slice(args);
        nodeArgs.push(deferred.makeNodeResolver());
        this.fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
      };
      Q.nfcall = function(callback) {
        var args = array_slice(arguments, 1);
        return Q(callback).nfapply(args);
      };
      Promise2.prototype.nfcall = function() {
        var nodeArgs = array_slice(arguments);
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        this.fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
      };
      Q.nfbind = Q.denodeify = function(callback) {
        if (callback === void 0) {
          throw new Error("Q can't wrap an undefined function");
        }
        var baseArgs = array_slice(arguments, 1);
        return function() {
          var nodeArgs = baseArgs.concat(array_slice(arguments));
          var deferred = defer();
          nodeArgs.push(deferred.makeNodeResolver());
          Q(callback).fapply(nodeArgs).fail(deferred.reject);
          return deferred.promise;
        };
      };
      Promise2.prototype.nfbind = Promise2.prototype.denodeify = function() {
        var args = array_slice(arguments);
        args.unshift(this);
        return Q.denodeify.apply(void 0, args);
      };
      Q.nbind = function(callback, thisp) {
        var baseArgs = array_slice(arguments, 2);
        return function() {
          var nodeArgs = baseArgs.concat(array_slice(arguments));
          var deferred = defer();
          nodeArgs.push(deferred.makeNodeResolver());
          function bound() {
            return callback.apply(thisp, arguments);
          }
          Q(bound).fapply(nodeArgs).fail(deferred.reject);
          return deferred.promise;
        };
      };
      Promise2.prototype.nbind = function() {
        var args = array_slice(arguments, 0);
        args.unshift(this);
        return Q.nbind.apply(void 0, args);
      };
      Q.nmapply = // XXX As proposed by "Redsandro"
      Q.npost = function(object, name, args) {
        return Q(object).npost(name, args);
      };
      Promise2.prototype.nmapply = // XXX As proposed by "Redsandro"
      Promise2.prototype.npost = function(name, args) {
        var nodeArgs = array_slice(args || []);
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
        return deferred.promise;
      };
      Q.nsend = // XXX Based on Mark Miller's proposed "send"
      Q.nmcall = // XXX Based on "Redsandro's" proposal
      Q.ninvoke = function(object, name) {
        var nodeArgs = array_slice(arguments, 2);
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
        return deferred.promise;
      };
      Promise2.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
      Promise2.prototype.nmcall = // XXX Based on "Redsandro's" proposal
      Promise2.prototype.ninvoke = function(name) {
        var nodeArgs = array_slice(arguments, 1);
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
        return deferred.promise;
      };
      Q.nodeify = nodeify;
      function nodeify(object, nodeback) {
        return Q(object).nodeify(nodeback);
      }
      Promise2.prototype.nodeify = function(nodeback) {
        if (nodeback) {
          this.then(function(value) {
            Q.nextTick(function() {
              nodeback(null, value);
            });
          }, function(error2) {
            Q.nextTick(function() {
              nodeback(error2);
            });
          });
        } else {
          return this;
        }
      };
      Q.noConflict = function() {
        throw new Error("Q.noConflict only works when Q is used as a global");
      };
      var qEndingLine = captureLine();
      return Q;
    });
  }
});

// ../../node_modules/azure-pipelines-task-lib/toolrunner.js
var require_toolrunner = __commonJS({
  "../../node_modules/azure-pipelines-task-lib/toolrunner.js"(exports2) {
    "use strict";
    var __extends = exports2 && exports2.__extends || /* @__PURE__ */ function() {
      var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
          d2.__proto__ = b2;
        } || function(d2, b2) {
          for (var p in b2)
            if (Object.prototype.hasOwnProperty.call(b2, p))
              d2[p] = b2[p];
        };
        return extendStatics(d, b);
      };
      return function(d, b) {
        if (typeof b !== "function" && b !== null)
          throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() {
          this.constructor = d;
        }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ToolRunner = void 0;
    var Q = require_q();
    var os = require("os");
    var events = require("events");
    var child = require("child_process");
    var im = require_internal();
    var fs = require("fs");
    var ToolRunner = (
      /** @class */
      function(_super) {
        __extends(ToolRunner2, _super);
        function ToolRunner2(toolPath) {
          var _this = _super.call(this) || this;
          _this.cmdSpecialChars = [" ", "	", "&", "(", ")", "[", "]", "{", "}", "^", "=", ";", "!", "'", "+", ",", "`", "~", "|", "<", ">", '"'];
          if (!toolPath) {
            throw new Error("Parameter 'toolPath' cannot be null or empty.");
          }
          _this.toolPath = im._which(toolPath, true);
          _this.args = [];
          _this._debug("toolRunner toolPath: " + toolPath);
          return _this;
        }
        ToolRunner2.prototype._debug = function(message) {
          this.emit("debug", message);
        };
        ToolRunner2.prototype._argStringToArray = function(argString) {
          var args = [];
          var inQuotes = false;
          var escaped = false;
          var lastCharWasSpace = true;
          var arg = "";
          var append = function(c2) {
            if (escaped) {
              if (c2 !== '"') {
                arg += "\\";
              } else {
                arg.slice(0, -1);
              }
            }
            arg += c2;
            escaped = false;
          };
          for (var i = 0; i < argString.length; i++) {
            var c = argString.charAt(i);
            if (c === " " && !inQuotes) {
              if (!lastCharWasSpace) {
                args.push(arg);
                arg = "";
              }
              lastCharWasSpace = true;
              continue;
            } else {
              lastCharWasSpace = false;
            }
            if (c === '"') {
              if (!escaped) {
                inQuotes = !inQuotes;
              } else {
                append(c);
              }
              continue;
            }
            if (c === "\\" && escaped) {
              append(c);
              continue;
            }
            if (c === "\\" && inQuotes) {
              escaped = true;
              continue;
            }
            append(c);
            lastCharWasSpace = false;
          }
          if (!lastCharWasSpace) {
            args.push(arg.trim());
          }
          return args;
        };
        ToolRunner2.prototype._getCommandString = function(options, noPrefix) {
          var _this = this;
          var toolPath = this._getSpawnFileName();
          var args = this._getSpawnArgs(options);
          var cmd = noPrefix ? "" : "[command]";
          var commandParts = [];
          if (process.platform == "win32") {
            if (this._isCmdFile()) {
              commandParts.push(toolPath);
              commandParts = commandParts.concat(args);
            } else if (options.windowsVerbatimArguments) {
              commandParts.push('"'.concat(toolPath, '"'));
              commandParts = commandParts.concat(args);
            } else if (options.shell) {
              commandParts.push(this._windowsQuoteCmdArg(toolPath));
              commandParts = commandParts.concat(args);
            } else {
              commandParts.push(this._windowsQuoteCmdArg(toolPath));
              commandParts = commandParts.concat(args.map(function(arg) {
                return _this._windowsQuoteCmdArg(arg);
              }));
            }
          } else {
            commandParts.push(toolPath);
            commandParts = commandParts.concat(args);
          }
          cmd += commandParts.join(" ");
          if (this.pipeOutputToTool) {
            cmd += " | " + this.pipeOutputToTool._getCommandString(
              options,
              /*noPrefix:*/
              true
            );
          }
          return cmd;
        };
        ToolRunner2.prototype._processLineBuffer = function(data, buffer, onLine) {
          var newBuffer = buffer + data.toString();
          try {
            var eolIndex = newBuffer.indexOf(os.EOL);
            while (eolIndex > -1) {
              var line = newBuffer.substring(0, eolIndex);
              onLine(line);
              newBuffer = newBuffer.substring(eolIndex + os.EOL.length);
              eolIndex = newBuffer.indexOf(os.EOL);
            }
          } catch (err) {
            this._debug("error processing line");
          }
          return newBuffer;
        };
        ToolRunner2.prototype._wrapArg = function(arg, wrapChar) {
          if (!this._isWrapped(arg, wrapChar)) {
            return "".concat(wrapChar).concat(arg).concat(wrapChar);
          }
          return arg;
        };
        ToolRunner2.prototype._unwrapArg = function(arg, wrapChar) {
          if (this._isWrapped(arg, wrapChar)) {
            var pattern = new RegExp("(^\\\\?".concat(wrapChar, ")|(\\\\?").concat(wrapChar, "$)"), "g");
            return arg.trim().replace(pattern, "");
          }
          return arg;
        };
        ToolRunner2.prototype._isWrapped = function(arg, wrapChar) {
          var pattern = new RegExp("^\\\\?".concat(wrapChar, ".+\\\\?").concat(wrapChar, "$"));
          return pattern.test(arg.trim());
        };
        ToolRunner2.prototype._getSpawnFileName = function(options) {
          if (process.platform == "win32") {
            if (this._isCmdFile()) {
              return process.env["COMSPEC"] || "cmd.exe";
            }
          }
          if (options && options.shell) {
            return this._wrapArg(this.toolPath, '"');
          }
          return this.toolPath;
        };
        ToolRunner2.prototype._getSpawnArgs = function(options) {
          var _this = this;
          if (process.platform == "win32") {
            if (this._isCmdFile()) {
              var argline = '/D /S /C "'.concat(this._windowsQuoteCmdArg(this.toolPath));
              for (var i = 0; i < this.args.length; i++) {
                argline += " ";
                argline += options.windowsVerbatimArguments ? this.args[i] : this._windowsQuoteCmdArg(this.args[i]);
              }
              argline += '"';
              return [argline];
            }
            if (options.windowsVerbatimArguments) {
              var args_1 = this.args.slice(0);
              args_1.slice = function() {
                if (arguments.length != 1 || arguments[0] != 0) {
                  throw new Error("Unexpected arguments passed to args.slice when windowsVerbatimArguments flag is set.");
                }
                return args_1;
              };
              args_1.unshift = function() {
                if (arguments.length != 1) {
                  throw new Error("Unexpected arguments passed to args.unshift when windowsVerbatimArguments flag is set.");
                }
                return Array.prototype.unshift.call(args_1, '"'.concat(arguments[0], '"'));
              };
              return args_1;
            } else if (options.shell) {
              var args = [];
              for (var _i = 0, _a = this.args; _i < _a.length; _i++) {
                var arg = _a[_i];
                if (this._needQuotesForCmd(arg, "%")) {
                  args.push(this._wrapArg(arg, '"'));
                } else {
                  args.push(arg);
                }
              }
              return args;
            }
          } else if (options.shell) {
            return this.args.map(function(arg2) {
              if (_this._isWrapped(arg2, "'")) {
                return arg2;
              }
              arg2 = _this._unwrapArg(arg2, '"');
              arg2 = _this._escapeChar(arg2, '"');
              return _this._wrapArg(arg2, '"');
            });
          }
          return this.args;
        };
        ToolRunner2.prototype._escapeChar = function(arg, charToEscape) {
          var escChar = "\\";
          var output = "";
          var charIsEscaped = false;
          for (var _i = 0, arg_1 = arg; _i < arg_1.length; _i++) {
            var char = arg_1[_i];
            if (char === charToEscape && !charIsEscaped) {
              output += escChar + char;
            } else {
              output += char;
            }
            charIsEscaped = char === escChar && !charIsEscaped;
          }
          return output;
        };
        ToolRunner2.prototype._isCmdFile = function() {
          var upperToolPath = this.toolPath.toUpperCase();
          return im._endsWith(upperToolPath, ".CMD") || im._endsWith(upperToolPath, ".BAT");
        };
        ToolRunner2.prototype._needQuotesForCmd = function(arg, additionalChars) {
          var specialChars = this.cmdSpecialChars;
          if (additionalChars) {
            specialChars = this.cmdSpecialChars.concat(additionalChars);
          }
          var _loop_1 = function(char2) {
            if (specialChars.some(function(x) {
              return x === char2;
            })) {
              return { value: true };
            }
          };
          for (var _i = 0, arg_2 = arg; _i < arg_2.length; _i++) {
            var char = arg_2[_i];
            var state_1 = _loop_1(char);
            if (typeof state_1 === "object")
              return state_1.value;
          }
          return false;
        };
        ToolRunner2.prototype._windowsQuoteCmdArg = function(arg) {
          if (!this._isCmdFile()) {
            return this._uv_quote_cmd_arg(arg);
          }
          if (!arg) {
            return '""';
          }
          var needsQuotes = this._needQuotesForCmd(arg);
          if (!needsQuotes) {
            return arg;
          }
          var reverse = '"';
          var quote_hit = true;
          for (var i = arg.length; i > 0; i--) {
            reverse += arg[i - 1];
            if (quote_hit && arg[i - 1] == "\\") {
              reverse += "\\";
            } else if (arg[i - 1] == '"') {
              quote_hit = true;
              reverse += '"';
            } else {
              quote_hit = false;
            }
          }
          reverse += '"';
          return reverse.split("").reverse().join("");
        };
        ToolRunner2.prototype._uv_quote_cmd_arg = function(arg) {
          if (!arg) {
            return '""';
          }
          if (arg.indexOf(" ") < 0 && arg.indexOf("	") < 0 && arg.indexOf('"') < 0) {
            return arg;
          }
          if (arg.indexOf('"') < 0 && arg.indexOf("\\") < 0) {
            return '"'.concat(arg, '"');
          }
          var reverse = '"';
          var quote_hit = true;
          for (var i = arg.length; i > 0; i--) {
            reverse += arg[i - 1];
            if (quote_hit && arg[i - 1] == "\\") {
              reverse += "\\";
            } else if (arg[i - 1] == '"') {
              quote_hit = true;
              reverse += "\\";
            } else {
              quote_hit = false;
            }
          }
          reverse += '"';
          return reverse.split("").reverse().join("");
        };
        ToolRunner2.prototype._cloneExecOptions = function(options) {
          options = options || {};
          var result = {
            cwd: options.cwd || process.cwd(),
            env: options.env || process.env,
            silent: options.silent || false,
            failOnStdErr: options.failOnStdErr || false,
            ignoreReturnCode: options.ignoreReturnCode || false,
            windowsVerbatimArguments: options.windowsVerbatimArguments || false,
            shell: options.shell || false
          };
          result.outStream = options.outStream || process.stdout;
          result.errStream = options.errStream || process.stderr;
          return result;
        };
        ToolRunner2.prototype._getSpawnOptions = function(options) {
          options = options || {};
          var result = {};
          result.cwd = options.cwd;
          result.env = options.env;
          result.shell = options.shell;
          result["windowsVerbatimArguments"] = options.windowsVerbatimArguments || this._isCmdFile();
          return result;
        };
        ToolRunner2.prototype._getSpawnSyncOptions = function(options) {
          var result = {};
          result.maxBuffer = 1024 * 1024 * 1024;
          result.cwd = options.cwd;
          result.env = options.env;
          result.shell = options.shell;
          result["windowsVerbatimArguments"] = options.windowsVerbatimArguments || this._isCmdFile();
          return result;
        };
        ToolRunner2.prototype.execWithPipingAsync = function(pipeOutputToTool, options) {
          var _this = this;
          this._debug("exec tool: " + this.toolPath);
          this._debug("arguments:");
          this.args.forEach(function(arg) {
            _this._debug("   " + arg);
          });
          var success = true;
          var optionsNonNull = this._cloneExecOptions(options);
          if (!optionsNonNull.silent) {
            optionsNonNull.outStream.write(this._getCommandString(optionsNonNull) + os.EOL);
          }
          var cp;
          var toolPath = pipeOutputToTool.toolPath;
          var toolPathFirst;
          var successFirst = true;
          var returnCodeFirst;
          var fileStream;
          var waitingEvents = 0;
          var returnCode = 0;
          var error2;
          toolPathFirst = this.toolPath;
          waitingEvents++;
          var cpFirst = child.spawn(this._getSpawnFileName(optionsNonNull), this._getSpawnArgs(optionsNonNull), this._getSpawnOptions(optionsNonNull));
          waitingEvents++;
          cp = child.spawn(pipeOutputToTool._getSpawnFileName(optionsNonNull), pipeOutputToTool._getSpawnArgs(optionsNonNull), pipeOutputToTool._getSpawnOptions(optionsNonNull));
          fileStream = this.pipeOutputToFile ? fs.createWriteStream(this.pipeOutputToFile) : null;
          return new Promise(function(resolve, reject) {
            var _a, _b, _c, _d;
            if (fileStream) {
              waitingEvents++;
              fileStream.on("finish", function() {
                waitingEvents--;
                fileStream = null;
                if (waitingEvents == 0) {
                  if (error2) {
                    reject(error2);
                  } else {
                    resolve(returnCode);
                  }
                }
              });
              fileStream.on("error", function(err) {
                waitingEvents--;
                _this._debug("Failed to pipe output of ".concat(toolPathFirst, " to file ").concat(_this.pipeOutputToFile, ". Error = ").concat(err));
                fileStream = null;
                if (waitingEvents == 0) {
                  if (error2) {
                    reject(error2);
                  } else {
                    resolve(returnCode);
                  }
                }
              });
            }
            (_a = cpFirst.stdout) === null || _a === void 0 ? void 0 : _a.on("data", function(data) {
              var _a2, _b2;
              try {
                if (fileStream) {
                  fileStream.write(data);
                }
                if (!((_a2 = cp.stdin) === null || _a2 === void 0 ? void 0 : _a2.destroyed)) {
                  (_b2 = cp.stdin) === null || _b2 === void 0 ? void 0 : _b2.write(data);
                }
              } catch (err) {
                _this._debug("Failed to pipe output of " + toolPathFirst + " to " + toolPath);
                _this._debug(toolPath + " might have exited due to errors prematurely. Verify the arguments passed are valid.");
              }
            });
            (_b = cpFirst.stderr) === null || _b === void 0 ? void 0 : _b.on("data", function(data) {
              if (fileStream) {
                fileStream.write(data);
              }
              successFirst = !optionsNonNull.failOnStdErr;
              if (!optionsNonNull.silent) {
                var s = optionsNonNull.failOnStdErr ? optionsNonNull.errStream : optionsNonNull.outStream;
                s.write(data);
              }
            });
            cpFirst.on("error", function(err) {
              var _a2;
              waitingEvents--;
              if (fileStream) {
                fileStream.end();
              }
              (_a2 = cp.stdin) === null || _a2 === void 0 ? void 0 : _a2.end();
              error2 = new Error(toolPathFirst + " failed. " + err.message);
              if (waitingEvents == 0) {
                reject(error2);
              }
            });
            cpFirst.on("close", function(code, signal) {
              var _a2;
              waitingEvents--;
              if (code != 0 && !optionsNonNull.ignoreReturnCode) {
                successFirst = false;
                returnCodeFirst = code;
                returnCode = returnCodeFirst;
              }
              _this._debug("success of first tool:" + successFirst);
              if (fileStream) {
                fileStream.end();
              }
              (_a2 = cp.stdin) === null || _a2 === void 0 ? void 0 : _a2.end();
              if (waitingEvents == 0) {
                if (error2) {
                  reject(error2);
                } else {
                  resolve(returnCode);
                }
              }
            });
            var stdLineBuffer = "";
            (_c = cp.stdout) === null || _c === void 0 ? void 0 : _c.on("data", function(data) {
              _this.emit("stdout", data);
              if (!optionsNonNull.silent) {
                optionsNonNull.outStream.write(data);
              }
              stdLineBuffer = _this._processLineBuffer(data, stdLineBuffer, function(line) {
                _this.emit("stdline", line);
              });
            });
            var errLineBuffer = "";
            (_d = cp.stderr) === null || _d === void 0 ? void 0 : _d.on("data", function(data) {
              _this.emit("stderr", data);
              success = !optionsNonNull.failOnStdErr;
              if (!optionsNonNull.silent) {
                var s = optionsNonNull.failOnStdErr ? optionsNonNull.errStream : optionsNonNull.outStream;
                s.write(data);
              }
              errLineBuffer = _this._processLineBuffer(data, errLineBuffer, function(line) {
                _this.emit("errline", line);
              });
            });
            cp.on("error", function(err) {
              waitingEvents--;
              error2 = new Error(toolPath + " failed. " + err.message);
              if (waitingEvents == 0) {
                reject(error2);
              }
            });
            cp.on("close", function(code, signal) {
              waitingEvents--;
              _this._debug("rc:" + code);
              returnCode = code;
              if (stdLineBuffer.length > 0) {
                _this.emit("stdline", stdLineBuffer);
              }
              if (errLineBuffer.length > 0) {
                _this.emit("errline", errLineBuffer);
              }
              if (code != 0 && !optionsNonNull.ignoreReturnCode) {
                success = false;
              }
              _this._debug("success:" + success);
              if (!successFirst) {
                error2 = new Error(toolPathFirst + " failed with return code: " + returnCodeFirst);
              } else if (!success) {
                error2 = new Error(toolPath + " failed with return code: " + code);
              }
              if (waitingEvents == 0) {
                if (error2) {
                  reject(error2);
                } else {
                  resolve(returnCode);
                }
              }
            });
          });
        };
        ToolRunner2.prototype.execWithPiping = function(pipeOutputToTool, options) {
          var _this = this;
          var _a, _b, _c, _d;
          var defer = Q.defer();
          this._debug("exec tool: " + this.toolPath);
          this._debug("arguments:");
          this.args.forEach(function(arg) {
            _this._debug("   " + arg);
          });
          var success = true;
          var optionsNonNull = this._cloneExecOptions(options);
          if (!optionsNonNull.silent) {
            optionsNonNull.outStream.write(this._getCommandString(optionsNonNull) + os.EOL);
          }
          var cp;
          var toolPath = pipeOutputToTool.toolPath;
          var toolPathFirst;
          var successFirst = true;
          var returnCodeFirst;
          var fileStream;
          var waitingEvents = 0;
          var returnCode = 0;
          var error2;
          toolPathFirst = this.toolPath;
          waitingEvents++;
          var cpFirst = child.spawn(this._getSpawnFileName(optionsNonNull), this._getSpawnArgs(optionsNonNull), this._getSpawnOptions(optionsNonNull));
          waitingEvents++;
          cp = child.spawn(pipeOutputToTool._getSpawnFileName(optionsNonNull), pipeOutputToTool._getSpawnArgs(optionsNonNull), pipeOutputToTool._getSpawnOptions(optionsNonNull));
          fileStream = this.pipeOutputToFile ? fs.createWriteStream(this.pipeOutputToFile) : null;
          if (fileStream) {
            waitingEvents++;
            fileStream.on("finish", function() {
              waitingEvents--;
              fileStream = null;
              if (waitingEvents == 0) {
                if (error2) {
                  defer.reject(error2);
                } else {
                  defer.resolve(returnCode);
                }
              }
            });
            fileStream.on("error", function(err) {
              waitingEvents--;
              _this._debug("Failed to pipe output of ".concat(toolPathFirst, " to file ").concat(_this.pipeOutputToFile, ". Error = ").concat(err));
              fileStream = null;
              if (waitingEvents == 0) {
                if (error2) {
                  defer.reject(error2);
                } else {
                  defer.resolve(returnCode);
                }
              }
            });
          }
          (_a = cpFirst.stdout) === null || _a === void 0 ? void 0 : _a.on("data", function(data) {
            var _a2;
            try {
              if (fileStream) {
                fileStream.write(data);
              }
              (_a2 = cp.stdin) === null || _a2 === void 0 ? void 0 : _a2.write(data);
            } catch (err) {
              _this._debug("Failed to pipe output of " + toolPathFirst + " to " + toolPath);
              _this._debug(toolPath + " might have exited due to errors prematurely. Verify the arguments passed are valid.");
            }
          });
          (_b = cpFirst.stderr) === null || _b === void 0 ? void 0 : _b.on("data", function(data) {
            if (fileStream) {
              fileStream.write(data);
            }
            successFirst = !optionsNonNull.failOnStdErr;
            if (!optionsNonNull.silent) {
              var s = optionsNonNull.failOnStdErr ? optionsNonNull.errStream : optionsNonNull.outStream;
              s.write(data);
            }
          });
          cpFirst.on("error", function(err) {
            var _a2;
            waitingEvents--;
            if (fileStream) {
              fileStream.end();
            }
            (_a2 = cp.stdin) === null || _a2 === void 0 ? void 0 : _a2.end();
            error2 = new Error(toolPathFirst + " failed. " + err.message);
            if (waitingEvents == 0) {
              defer.reject(error2);
            }
          });
          cpFirst.on("close", function(code, signal) {
            var _a2;
            waitingEvents--;
            if (code != 0 && !optionsNonNull.ignoreReturnCode) {
              successFirst = false;
              returnCodeFirst = code;
              returnCode = returnCodeFirst;
            }
            _this._debug("success of first tool:" + successFirst);
            if (fileStream) {
              fileStream.end();
            }
            (_a2 = cp.stdin) === null || _a2 === void 0 ? void 0 : _a2.end();
            if (waitingEvents == 0) {
              if (error2) {
                defer.reject(error2);
              } else {
                defer.resolve(returnCode);
              }
            }
          });
          var stdLineBuffer = "";
          (_c = cp.stdout) === null || _c === void 0 ? void 0 : _c.on("data", function(data) {
            _this.emit("stdout", data);
            if (!optionsNonNull.silent) {
              optionsNonNull.outStream.write(data);
            }
            stdLineBuffer = _this._processLineBuffer(data, stdLineBuffer, function(line) {
              _this.emit("stdline", line);
            });
          });
          var errLineBuffer = "";
          (_d = cp.stderr) === null || _d === void 0 ? void 0 : _d.on("data", function(data) {
            _this.emit("stderr", data);
            success = !optionsNonNull.failOnStdErr;
            if (!optionsNonNull.silent) {
              var s = optionsNonNull.failOnStdErr ? optionsNonNull.errStream : optionsNonNull.outStream;
              s.write(data);
            }
            errLineBuffer = _this._processLineBuffer(data, errLineBuffer, function(line) {
              _this.emit("errline", line);
            });
          });
          cp.on("error", function(err) {
            waitingEvents--;
            error2 = new Error(toolPath + " failed. " + err.message);
            if (waitingEvents == 0) {
              defer.reject(error2);
            }
          });
          cp.on("close", function(code, signal) {
            waitingEvents--;
            _this._debug("rc:" + code);
            returnCode = code;
            if (stdLineBuffer.length > 0) {
              _this.emit("stdline", stdLineBuffer);
            }
            if (errLineBuffer.length > 0) {
              _this.emit("errline", errLineBuffer);
            }
            if (code != 0 && !optionsNonNull.ignoreReturnCode) {
              success = false;
            }
            _this._debug("success:" + success);
            if (!successFirst) {
              error2 = new Error(toolPathFirst + " failed with return code: " + returnCodeFirst);
            } else if (!success) {
              error2 = new Error(toolPath + " failed with return code: " + code);
            }
            if (waitingEvents == 0) {
              if (error2) {
                defer.reject(error2);
              } else {
                defer.resolve(returnCode);
              }
            }
          });
          return defer.promise;
        };
        ToolRunner2.prototype.arg = function(val) {
          if (!val) {
            return this;
          }
          if (val instanceof Array) {
            this._debug(this.toolPath + " arg: " + JSON.stringify(val));
            this.args = this.args.concat(val);
          } else if (typeof val === "string") {
            this._debug(this.toolPath + " arg: " + val);
            this.args = this.args.concat(val.trim());
          }
          return this;
        };
        ToolRunner2.prototype.line = function(val) {
          if (!val) {
            return this;
          }
          this._debug(this.toolPath + " arg: " + val);
          this.args = this.args.concat(this._argStringToArray(val));
          return this;
        };
        ToolRunner2.prototype.argIf = function(condition, val) {
          if (condition) {
            this.arg(val);
          }
          return this;
        };
        ToolRunner2.prototype.pipeExecOutputToTool = function(tool, file) {
          this.pipeOutputToTool = tool;
          this.pipeOutputToFile = file;
          return this;
        };
        ToolRunner2.prototype.execAsync = function(options) {
          var _this = this;
          var _a, _b, _c;
          if (this.pipeOutputToTool) {
            return this.execWithPipingAsync(this.pipeOutputToTool, options);
          }
          this._debug("exec tool: " + this.toolPath);
          this._debug("arguments:");
          this.args.forEach(function(arg) {
            _this._debug("   " + arg);
          });
          var optionsNonNull = this._cloneExecOptions(options);
          if (!optionsNonNull.silent) {
            optionsNonNull.outStream.write(this._getCommandString(optionsNonNull) + os.EOL);
          }
          var state = new ExecState(optionsNonNull, this.toolPath);
          state.on("debug", function(message) {
            _this._debug(message);
          });
          var stdLineBuffer = "";
          var errLineBuffer = "";
          var emitDoneEvent = function(resolve, reject) {
            state.on("done", function(error2, exitCode) {
              if (stdLineBuffer.length > 0) {
                _this.emit("stdline", stdLineBuffer);
              }
              if (errLineBuffer.length > 0) {
                _this.emit("errline", errLineBuffer);
              }
              if (cp) {
                cp.removeAllListeners();
              }
              if (error2) {
                reject(error2);
              } else {
                resolve(exitCode);
              }
            });
          };
          var cp;
          try {
            cp = child.spawn(this._getSpawnFileName(options), this._getSpawnArgs(optionsNonNull), this._getSpawnOptions(options));
          } catch (error2) {
            return new Promise(function(resolve, reject) {
              emitDoneEvent(resolve, reject);
              state.processError = error2.message;
              state.processExited = true;
              state.processClosed = true;
              state.CheckComplete();
            });
          }
          this.childProcess = cp;
          (_a = cp.stdout) === null || _a === void 0 ? void 0 : _a.on("finish", function() {
            if (!optionsNonNull.silent) {
              optionsNonNull.outStream.write(os.EOL);
            }
          });
          (_b = cp.stdout) === null || _b === void 0 ? void 0 : _b.on("data", function(data) {
            _this.emit("stdout", data);
            if (!optionsNonNull.silent) {
              optionsNonNull.outStream.write(data);
            }
            stdLineBuffer = _this._processLineBuffer(data, stdLineBuffer, function(line) {
              _this.emit("stdline", line);
            });
          });
          (_c = cp.stderr) === null || _c === void 0 ? void 0 : _c.on("data", function(data) {
            state.processStderr = true;
            _this.emit("stderr", data);
            if (!optionsNonNull.silent) {
              var s = optionsNonNull.failOnStdErr ? optionsNonNull.errStream : optionsNonNull.outStream;
              s.write(data);
            }
            errLineBuffer = _this._processLineBuffer(data, errLineBuffer, function(line) {
              _this.emit("errline", line);
            });
          });
          cp.on("error", function(err) {
            state.processError = err.message;
            state.processExited = true;
            state.processClosed = true;
            state.CheckComplete();
          });
          cp.on("exit", function(code, signal) {
            state.processExitCode = code;
            state.processExitSignal = signal;
            state.processExited = true;
            state.CheckComplete();
          });
          cp.on("close", function(code, signal) {
            state.processCloseCode = code;
            state.processCloseSignal = signal;
            state.processClosed = true;
            state.processExited = true;
            state.CheckComplete();
          });
          return new Promise(emitDoneEvent);
        };
        ToolRunner2.prototype.exec = function(options) {
          var _this = this;
          var _a, _b, _c;
          if (this.pipeOutputToTool) {
            return this.execWithPiping(this.pipeOutputToTool, options);
          }
          var defer = Q.defer();
          this._debug("exec tool: " + this.toolPath);
          this._debug("arguments:");
          this.args.forEach(function(arg) {
            _this._debug("   " + arg);
          });
          var optionsNonNull = this._cloneExecOptions(options);
          if (!optionsNonNull.silent) {
            optionsNonNull.outStream.write(this._getCommandString(optionsNonNull) + os.EOL);
          }
          var state = new ExecState(optionsNonNull, this.toolPath);
          state.on("debug", function(message) {
            _this._debug(message);
          });
          var stdLineBuffer = "";
          var errLineBuffer = "";
          state.on("done", function(error2, exitCode) {
            if (stdLineBuffer.length > 0) {
              _this.emit("stdline", stdLineBuffer);
            }
            if (errLineBuffer.length > 0) {
              _this.emit("errline", errLineBuffer);
            }
            if (cp) {
              cp.removeAllListeners();
            }
            if (error2) {
              defer.reject(error2);
            } else {
              defer.resolve(exitCode);
            }
          });
          var cp;
          try {
            cp = child.spawn(this._getSpawnFileName(options), this._getSpawnArgs(optionsNonNull), this._getSpawnOptions(options));
          } catch (error2) {
            state.processError = error2.message;
            state.processExited = true;
            state.processClosed = true;
            state.CheckComplete();
            return defer.promise;
          }
          this.childProcess = cp;
          (_a = cp.stdout) === null || _a === void 0 ? void 0 : _a.on("finish", function() {
            if (!optionsNonNull.silent) {
              optionsNonNull.outStream.write(os.EOL);
            }
          });
          (_b = cp.stdout) === null || _b === void 0 ? void 0 : _b.on("data", function(data) {
            _this.emit("stdout", data);
            if (!optionsNonNull.silent) {
              optionsNonNull.outStream.write(data);
            }
            stdLineBuffer = _this._processLineBuffer(data, stdLineBuffer, function(line) {
              _this.emit("stdline", line);
            });
          });
          (_c = cp.stderr) === null || _c === void 0 ? void 0 : _c.on("data", function(data) {
            state.processStderr = true;
            _this.emit("stderr", data);
            if (!optionsNonNull.silent) {
              var s = optionsNonNull.failOnStdErr ? optionsNonNull.errStream : optionsNonNull.outStream;
              s.write(data);
            }
            errLineBuffer = _this._processLineBuffer(data, errLineBuffer, function(line) {
              _this.emit("errline", line);
            });
          });
          cp.on("error", function(err) {
            state.processError = err.message;
            state.processExited = true;
            state.processClosed = true;
            state.CheckComplete();
          });
          cp.on("exit", function(code, signal) {
            state.processExitCode = code;
            state.processExitSignal = signal;
            state.processExited = true;
            state.CheckComplete();
          });
          cp.on("close", function(code, signal) {
            state.processCloseCode = code;
            state.processCloseSignal = signal;
            state.processClosed = true;
            state.processExited = true;
            state.CheckComplete();
          });
          return defer.promise;
        };
        ToolRunner2.prototype.execSync = function(options) {
          var _this = this;
          this._debug("exec tool: " + this.toolPath);
          this._debug("arguments:");
          this.args.forEach(function(arg) {
            _this._debug("   " + arg);
          });
          var success = true;
          options = this._cloneExecOptions(options);
          if (!options.silent) {
            options.outStream.write(this._getCommandString(options) + os.EOL);
          }
          var r = child.spawnSync(this._getSpawnFileName(options), this._getSpawnArgs(options), this._getSpawnSyncOptions(options));
          if (!options.silent && r.stdout && r.stdout.length > 0) {
            options.outStream.write(r.stdout);
          }
          if (!options.silent && r.stderr && r.stderr.length > 0) {
            options.errStream.write(r.stderr);
          }
          var res = { code: r.status, error: r.error };
          res.stdout = r.stdout ? r.stdout.toString() : "";
          res.stderr = r.stderr ? r.stderr.toString() : "";
          return res;
        };
        ToolRunner2.prototype.killChildProcess = function(signal) {
          if (signal === void 0) {
            signal = "SIGTERM";
          }
          if (this.childProcess) {
            this._debug("[killChildProcess] Signal ".concat(signal, " received"));
            this.childProcess.kill(signal);
          }
        };
        return ToolRunner2;
      }(events.EventEmitter)
    );
    exports2.ToolRunner = ToolRunner;
    var ExecState = (
      /** @class */
      function(_super) {
        __extends(ExecState2, _super);
        function ExecState2(options, toolPath) {
          var _this = _super.call(this) || this;
          _this.delay = 1e4;
          _this.timeout = null;
          if (!toolPath) {
            throw new Error("toolPath must not be empty");
          }
          _this.options = options;
          _this.toolPath = toolPath;
          var delay = process.env["TASKLIB_TEST_TOOLRUNNER_EXITDELAY"];
          if (delay) {
            _this.delay = parseInt(delay);
          }
          return _this;
        }
        ExecState2.prototype.CheckComplete = function() {
          if (this.done) {
            return;
          }
          if (this.processClosed) {
            this._setResult();
          } else if (this.processExited) {
            this.timeout = setTimeout(ExecState2.HandleTimeout, this.delay, this);
          }
        };
        ExecState2.prototype._debug = function(message) {
          this.emit("debug", message);
        };
        ExecState2.prototype._setResult = function() {
          var error2;
          if (this.processExited) {
            this._debug("Process exited with code ".concat(this.processExitCode, " and signal ").concat(this.processExitSignal, " for tool '").concat(this.toolPath, "'"));
            if (this.processError) {
              error2 = new Error(im._loc("LIB_ProcessError", this.toolPath, this.processError));
            } else if (this.processExitCode != 0 && !this.options.ignoreReturnCode) {
              error2 = new Error(im._loc("LIB_ProcessExitCode", this.toolPath, this.processExitCode));
            } else if (this.processStderr && this.options.failOnStdErr) {
              error2 = new Error(im._loc("LIB_ProcessStderr", this.toolPath));
            }
          }
          if (this.processClosed) {
            this._debug("STDIO streams have closed and received exit code ".concat(this.processCloseCode, " and signal ").concat(this.processCloseSignal, " for tool '").concat(this.toolPath, "'"));
          }
          if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
          }
          this.done = true;
          this.emit("done", error2, this.processExitCode);
        };
        ExecState2.HandleTimeout = function(state) {
          if (state.done) {
            return;
          }
          if (!state.processClosed && state.processExited) {
            console.log(im._loc("LIB_StdioNotClosed", state.delay / 1e3, state.toolPath));
            state._debug(im._loc("LIB_StdioNotClosed", state.delay / 1e3, state.toolPath));
          }
          state._setResult();
        };
        return ExecState2;
      }(events.EventEmitter)
    );
  }
});

// ../../node_modules/azure-pipelines-task-lib/task.js
var require_task = __commonJS({
  "../../node_modules/azure-pipelines-task-lib/task.js"(exports2) {
    "use strict";
    var __spreadArray = exports2 && exports2.__spreadArray || function(to, from, pack) {
      if (pack || arguments.length === 2)
        for (var i = 0, l = from.length, ar; i < l; i++) {
          if (ar || !(i in from)) {
            if (!ar)
              ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
          }
        }
      return to.concat(ar || Array.prototype.slice.call(from));
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getPlatform = exports2.osType = exports2.writeFile = exports2.exist = exports2.stats = exports2.debug = exports2.error = exports2.warning = exports2.command = exports2.setTaskVariable = exports2.getTaskVariable = exports2.getSecureFileTicket = exports2.getSecureFileName = exports2.getEndpointAuthorization = exports2.getEndpointAuthorizationParameterRequired = exports2.getEndpointAuthorizationParameter = exports2.getEndpointAuthorizationSchemeRequired = exports2.getEndpointAuthorizationScheme = exports2.getEndpointDataParameterRequired = exports2.getEndpointDataParameter = exports2.getEndpointUrlRequired = exports2.getEndpointUrl = exports2.getPathInputRequired = exports2.getPathInput = exports2.filePathSupplied = exports2.getDelimitedInput = exports2.getPipelineFeature = exports2.getBoolFeatureFlag = exports2.getBoolInput = exports2.getInputRequired = exports2.getInput = exports2.setSecret = exports2.setVariable = exports2.getVariables = exports2.assertAgent = exports2.getVariable = exports2.loc = exports2.setResourcePath = exports2.setSanitizedResult = exports2.setResult = exports2.setErrStream = exports2.setStdStream = exports2.AgentHostedMode = exports2.Platform = exports2.IssueSource = exports2.FieldType = exports2.ArtifactType = exports2.IssueType = exports2.TaskState = exports2.TaskResult = void 0;
    exports2.updateReleaseName = exports2.addBuildTag = exports2.updateBuildNumber = exports2.uploadBuildLog = exports2.associateArtifact = exports2.uploadArtifact = exports2.logIssue = exports2.logDetail = exports2.setProgress = exports2.setEndpoint = exports2.addAttachment = exports2.uploadSummary = exports2.prependPath = exports2.uploadFile = exports2.CodeCoverageEnabler = exports2.CodeCoveragePublisher = exports2.TestPublisher = exports2.getHttpCertConfiguration = exports2.getHttpProxyConfiguration = exports2.findMatch = exports2.filter = exports2.match = exports2.tool = exports2.execSync = exports2.exec = exports2.execAsync = exports2.rmRF = exports2.legacyFindFiles = exports2.find = exports2.retry = exports2.mv = exports2.cp = exports2.ls = exports2.which = exports2.resolve = exports2.mkdirP = exports2.popd = exports2.pushd = exports2.cd = exports2.checkPath = exports2.cwd = exports2.getSprint = exports2.getAgentMode = exports2.getNodeMajorVersion = void 0;
    var childProcess = require("child_process");
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var minimatch = require_minimatch();
    var im = require_internal();
    var tcm = require_taskcommand();
    var trm = require_toolrunner();
    var semver = require_semver();
    var TaskResult2;
    (function(TaskResult3) {
      TaskResult3[TaskResult3["Succeeded"] = 0] = "Succeeded";
      TaskResult3[TaskResult3["SucceededWithIssues"] = 1] = "SucceededWithIssues";
      TaskResult3[TaskResult3["Failed"] = 2] = "Failed";
      TaskResult3[TaskResult3["Cancelled"] = 3] = "Cancelled";
      TaskResult3[TaskResult3["Skipped"] = 4] = "Skipped";
    })(TaskResult2 = exports2.TaskResult || (exports2.TaskResult = {}));
    var TaskState;
    (function(TaskState2) {
      TaskState2[TaskState2["Unknown"] = 0] = "Unknown";
      TaskState2[TaskState2["Initialized"] = 1] = "Initialized";
      TaskState2[TaskState2["InProgress"] = 2] = "InProgress";
      TaskState2[TaskState2["Completed"] = 3] = "Completed";
    })(TaskState = exports2.TaskState || (exports2.TaskState = {}));
    var IssueType;
    (function(IssueType2) {
      IssueType2[IssueType2["Error"] = 0] = "Error";
      IssueType2[IssueType2["Warning"] = 1] = "Warning";
    })(IssueType = exports2.IssueType || (exports2.IssueType = {}));
    var ArtifactType;
    (function(ArtifactType2) {
      ArtifactType2[ArtifactType2["Container"] = 0] = "Container";
      ArtifactType2[ArtifactType2["FilePath"] = 1] = "FilePath";
      ArtifactType2[ArtifactType2["VersionControl"] = 2] = "VersionControl";
      ArtifactType2[ArtifactType2["GitRef"] = 3] = "GitRef";
      ArtifactType2[ArtifactType2["TfvcLabel"] = 4] = "TfvcLabel";
    })(ArtifactType = exports2.ArtifactType || (exports2.ArtifactType = {}));
    var FieldType;
    (function(FieldType2) {
      FieldType2[FieldType2["AuthParameter"] = 0] = "AuthParameter";
      FieldType2[FieldType2["DataParameter"] = 1] = "DataParameter";
      FieldType2[FieldType2["Url"] = 2] = "Url";
    })(FieldType = exports2.FieldType || (exports2.FieldType = {}));
    exports2.IssueSource = im.IssueSource;
    var Platform;
    (function(Platform2) {
      Platform2[Platform2["Windows"] = 0] = "Windows";
      Platform2[Platform2["MacOS"] = 1] = "MacOS";
      Platform2[Platform2["Linux"] = 2] = "Linux";
    })(Platform = exports2.Platform || (exports2.Platform = {}));
    var AgentHostedMode;
    (function(AgentHostedMode2) {
      AgentHostedMode2[AgentHostedMode2["Unknown"] = 0] = "Unknown";
      AgentHostedMode2[AgentHostedMode2["SelfHosted"] = 1] = "SelfHosted";
      AgentHostedMode2[AgentHostedMode2["MsHosted"] = 2] = "MsHosted";
    })(AgentHostedMode = exports2.AgentHostedMode || (exports2.AgentHostedMode = {}));
    var SPRINT_ONE_START_UTC_MS = Date.UTC(2010, 7, 14, 0, 0, 0, 0);
    var DAYS_PER_WEEK = 7;
    var DAYS_PER_SPRINT = 21;
    var MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1e3;
    exports2.setStdStream = im._setStdStream;
    exports2.setErrStream = im._setErrStream;
    function setResult2(result, message, done) {
      (0, exports2.debug)("task result: " + TaskResult2[result]);
      if (result == TaskResult2.Failed && message) {
        (0, exports2.error)(message, exports2.IssueSource.TaskInternal);
      } else if (result == TaskResult2.SucceededWithIssues && message) {
        (0, exports2.warning)(message, exports2.IssueSource.TaskInternal);
      }
      var properties = { "result": TaskResult2[result] };
      if (done) {
        properties["done"] = "true";
      }
      (0, exports2.command)("task.complete", properties, message);
    }
    exports2.setResult = setResult2;
    function setSanitizedResult(result, message, done) {
      var pattern = /password|key|secret|bearer|authorization|token|pat/i;
      var sanitizedMessage = im._truncateBeforeSensitiveKeyword(message, pattern);
      setResult2(result, sanitizedMessage, done);
    }
    exports2.setSanitizedResult = setSanitizedResult;
    process.on("uncaughtException", function(err) {
      if (!im.isSigPipeError(err)) {
        setResult2(TaskResult2.Failed, (0, exports2.loc)("LIB_UnhandledEx", err.message));
        (0, exports2.error)(String(err.stack), im.IssueSource.TaskInternal);
      }
    });
    process.on("unhandledRejection", function(reason) {
      if (reason instanceof Error) {
        throw reason;
      } else {
        throw new Error(reason);
      }
    });
    exports2.setResourcePath = im._setResourcePath;
    exports2.loc = im._loc;
    exports2.getVariable = im._getVariable;
    function assertAgent(minimum) {
      if (semver.lt(minimum, "2.104.1")) {
        throw new Error("assertAgent() requires the parameter to be 2.104.1 or higher");
      }
      var agent = (0, exports2.getVariable)("Agent.Version");
      (0, exports2.debug)("Detected Agent.Version=" + (agent ? agent : "undefined"));
      if (agent && semver.lt(agent, minimum)) {
        throw new Error("Agent version ".concat(minimum, " or higher is required. Detected Agent version: ").concat(agent));
      }
    }
    exports2.assertAgent = assertAgent;
    function getVariables() {
      return Object.keys(im._knownVariableMap).map(function(key) {
        var info = im._knownVariableMap[key];
        return { name: info.name, value: (0, exports2.getVariable)(info.name), secret: info.secret };
      });
    }
    exports2.getVariables = getVariables;
    function setVariable2(name, val, secret, isOutput) {
      if (secret === void 0) {
        secret = false;
      }
      if (isOutput === void 0) {
        isOutput = false;
      }
      var key = im._getVariableKey(name);
      if (im._knownVariableMap.hasOwnProperty(key)) {
        secret = secret || im._knownVariableMap[key].secret;
      }
      var varValue = val || "";
      (0, exports2.debug)("set " + name + "=" + (secret && varValue ? "********" : varValue));
      if (secret) {
        if (varValue && varValue.match(/\r|\n/) && "".concat(process.env["SYSTEM_UNSAFEALLOWMULTILINESECRET"]).toUpperCase() != "TRUE") {
          throw new Error((0, exports2.loc)("LIB_MultilineSecret"));
        }
        im._vault.storeSecret("SECRET_" + key, varValue);
        delete process.env[key];
      } else {
        process.env[key] = varValue;
      }
      im._knownVariableMap[key] = { name, secret };
      (0, exports2.command)("task.setvariable", { "variable": name || "", isOutput: (isOutput || false).toString(), "issecret": (secret || false).toString() }, varValue);
    }
    exports2.setVariable = setVariable2;
    function setSecret2(val) {
      if (val) {
        if (val.match(/\r|\n/) && "".concat(process.env["SYSTEM_UNSAFEALLOWMULTILINESECRET"]).toUpperCase() !== "TRUE") {
          throw new Error((0, exports2.loc)("LIB_MultilineSecret"));
        }
        (0, exports2.command)("task.setsecret", {}, val);
      }
    }
    exports2.setSecret = setSecret2;
    function getInput2(name, required) {
      var inval = im._vault.retrieveSecret("INPUT_" + im._getVariableKey(name));
      if (required && !inval) {
        throw new Error((0, exports2.loc)("LIB_InputRequired", name));
      }
      (0, exports2.debug)(name + "=" + inval);
      return inval;
    }
    exports2.getInput = getInput2;
    function getInputRequired(name) {
      return getInput2(name, true);
    }
    exports2.getInputRequired = getInputRequired;
    function getBoolInput(name, required) {
      return (getInput2(name, required) || "").toUpperCase() == "TRUE";
    }
    exports2.getBoolInput = getBoolInput;
    function getBoolFeatureFlag(ffName, defaultValue) {
      if (defaultValue === void 0) {
        defaultValue = false;
      }
      var ffValue = process.env[ffName];
      if (!ffValue) {
        (0, exports2.debug)("Feature flag ".concat(ffName, " not found. Returning ").concat(defaultValue, " as default."));
        return defaultValue;
      }
      (0, exports2.debug)("Feature flag ".concat(ffName, " = ").concat(ffValue));
      return ffValue.toLowerCase() === "true";
    }
    exports2.getBoolFeatureFlag = getBoolFeatureFlag;
    function getPipelineFeature(featureName) {
      var variableName = im._getVariableKey("DistributedTask.Tasks.".concat(featureName));
      var featureValue = process.env[variableName];
      if (!featureValue) {
        (0, exports2.debug)("Feature '".concat(featureName, "' not found. Returning false as default."));
        return false;
      }
      var boolValue = featureValue.toLowerCase() === "true";
      (0, exports2.debug)("Feature '".concat(featureName, "' = '").concat(featureValue, "'. Processed as '").concat(boolValue, "'."));
      return boolValue;
    }
    exports2.getPipelineFeature = getPipelineFeature;
    function getDelimitedInput(name, delim, required) {
      var inputVal = getInput2(name, required);
      if (!inputVal) {
        return [];
      }
      var result = [];
      inputVal.split(delim).forEach(function(x) {
        if (x) {
          result.push(x);
        }
      });
      return result;
    }
    exports2.getDelimitedInput = getDelimitedInput;
    function filePathSupplied(name) {
      var pathValue = this.resolve(this.getPathInput(name) || "");
      var repoRoot = this.resolve((0, exports2.getVariable)("build.sourcesDirectory") || (0, exports2.getVariable)("system.defaultWorkingDirectory") || "");
      var supplied = pathValue !== repoRoot;
      (0, exports2.debug)(name + "path supplied :" + supplied);
      return supplied;
    }
    exports2.filePathSupplied = filePathSupplied;
    function getPathInput(name, required, check) {
      var inval = getInput2(name, required);
      if (inval) {
        if (check) {
          (0, exports2.checkPath)(inval, name);
        }
      }
      return inval;
    }
    exports2.getPathInput = getPathInput;
    function getPathInputRequired(name, check) {
      return getPathInput(name, true, check);
    }
    exports2.getPathInputRequired = getPathInputRequired;
    function getEndpointUrl(id, optional) {
      var urlval = process.env["ENDPOINT_URL_" + id];
      if (!optional && !urlval) {
        throw new Error((0, exports2.loc)("LIB_EndpointNotExist", id));
      }
      (0, exports2.debug)(id + "=" + urlval);
      return urlval;
    }
    exports2.getEndpointUrl = getEndpointUrl;
    function getEndpointUrlRequired(id) {
      return getEndpointUrl(id, false);
    }
    exports2.getEndpointUrlRequired = getEndpointUrlRequired;
    function getEndpointDataParameter(id, key, optional) {
      var dataParamVal = process.env["ENDPOINT_DATA_" + id + "_" + key.toUpperCase()];
      if (!optional && !dataParamVal) {
        throw new Error((0, exports2.loc)("LIB_EndpointDataNotExist", id, key));
      }
      (0, exports2.debug)(id + " data " + key + " = " + dataParamVal);
      return dataParamVal;
    }
    exports2.getEndpointDataParameter = getEndpointDataParameter;
    function getEndpointDataParameterRequired(id, key) {
      return getEndpointDataParameter(id, key, false);
    }
    exports2.getEndpointDataParameterRequired = getEndpointDataParameterRequired;
    function getEndpointAuthorizationScheme(id, optional) {
      var authScheme = im._vault.retrieveSecret("ENDPOINT_AUTH_SCHEME_" + id);
      if (!optional && !authScheme) {
        throw new Error((0, exports2.loc)("LIB_EndpointAuthNotExist", id));
      }
      (0, exports2.debug)(id + " auth scheme = " + authScheme);
      return authScheme;
    }
    exports2.getEndpointAuthorizationScheme = getEndpointAuthorizationScheme;
    function getEndpointAuthorizationSchemeRequired(id) {
      return getEndpointAuthorizationScheme(id, false);
    }
    exports2.getEndpointAuthorizationSchemeRequired = getEndpointAuthorizationSchemeRequired;
    function getEndpointAuthorizationParameter(id, key, optional) {
      var authParam = im._vault.retrieveSecret("ENDPOINT_AUTH_PARAMETER_" + id + "_" + key.toUpperCase());
      if (!optional && !authParam) {
        throw new Error((0, exports2.loc)("LIB_EndpointAuthNotExist", id));
      }
      (0, exports2.debug)(id + " auth param " + key + " = " + authParam);
      return authParam;
    }
    exports2.getEndpointAuthorizationParameter = getEndpointAuthorizationParameter;
    function getEndpointAuthorizationParameterRequired(id, key) {
      return getEndpointAuthorizationParameter(id, key, false);
    }
    exports2.getEndpointAuthorizationParameterRequired = getEndpointAuthorizationParameterRequired;
    function getEndpointAuthorization(id, optional) {
      var aval = im._vault.retrieveSecret("ENDPOINT_AUTH_" + id);
      if (!optional && !aval) {
        setResult2(TaskResult2.Failed, (0, exports2.loc)("LIB_EndpointAuthNotExist", id));
      }
      (0, exports2.debug)(id + " exists " + !!aval);
      var auth;
      try {
        if (aval) {
          auth = JSON.parse(aval);
        }
      } catch (err) {
        throw new Error((0, exports2.loc)("LIB_InvalidEndpointAuth", aval));
      }
      return auth;
    }
    exports2.getEndpointAuthorization = getEndpointAuthorization;
    function getSecureFileName(id) {
      var name = process.env["SECUREFILE_NAME_" + id];
      (0, exports2.debug)("secure file name for id " + id + " = " + name);
      return name;
    }
    exports2.getSecureFileName = getSecureFileName;
    function getSecureFileTicket(id) {
      var ticket = im._vault.retrieveSecret("SECUREFILE_TICKET_" + id);
      (0, exports2.debug)("secure file ticket for id " + id + " = " + ticket);
      return ticket;
    }
    exports2.getSecureFileTicket = getSecureFileTicket;
    function getTaskVariable(name) {
      assertAgent("2.115.0");
      var inval = im._vault.retrieveSecret("VSTS_TASKVARIABLE_" + im._getVariableKey(name));
      if (inval) {
        inval = inval.trim();
      }
      (0, exports2.debug)("task variable: " + name + "=" + inval);
      return inval;
    }
    exports2.getTaskVariable = getTaskVariable;
    function setTaskVariable(name, val, secret) {
      if (secret === void 0) {
        secret = false;
      }
      assertAgent("2.115.0");
      var key = im._getVariableKey(name);
      var varValue = val || "";
      (0, exports2.debug)("set task variable: " + name + "=" + (secret && varValue ? "********" : varValue));
      im._vault.storeSecret("VSTS_TASKVARIABLE_" + key, varValue);
      delete process.env[key];
      (0, exports2.command)("task.settaskvariable", { "variable": name || "", "issecret": (secret || false).toString() }, varValue);
    }
    exports2.setTaskVariable = setTaskVariable;
    exports2.command = im._command;
    exports2.warning = im._warning;
    exports2.error = im._error;
    exports2.debug = im._debug;
    function stats(path2) {
      return fs.statSync(path2);
    }
    exports2.stats = stats;
    exports2.exist = im._exist;
    function writeFile(file, data, options) {
      if (typeof options === "string") {
        fs.writeFileSync(file, data, { encoding: options });
      } else {
        fs.writeFileSync(file, data, options);
      }
    }
    exports2.writeFile = writeFile;
    function osType() {
      return os.type();
    }
    exports2.osType = osType;
    function getPlatform() {
      switch (process.platform) {
        case "win32":
          return Platform.Windows;
        case "darwin":
          return Platform.MacOS;
        case "linux":
          return Platform.Linux;
        default:
          throw Error((0, exports2.loc)("LIB_PlatformNotSupported", process.platform));
      }
    }
    exports2.getPlatform = getPlatform;
    function getNodeMajorVersion() {
      var _a;
      var version = (_a = process === null || process === void 0 ? void 0 : process.versions) === null || _a === void 0 ? void 0 : _a.node;
      if (!version) {
        throw new Error((0, exports2.loc)("LIB_UndefinedNodeVersion"));
      }
      var parts = version.split(".").map(Number);
      if (parts.length < 1) {
        return NaN;
      }
      return parts[0];
    }
    exports2.getNodeMajorVersion = getNodeMajorVersion;
    function getAgentMode() {
      var agentCloudId = (0, exports2.getVariable)("Agent.CloudId");
      if (agentCloudId === void 0)
        return AgentHostedMode.Unknown;
      if (agentCloudId)
        return AgentHostedMode.MsHosted;
      return AgentHostedMode.SelfHosted;
    }
    exports2.getAgentMode = getAgentMode;
    function getSprint(date) {
      var targetDate = date || /* @__PURE__ */ new Date();
      var elapsedDays = Math.floor((targetDate.getTime() - SPRINT_ONE_START_UTC_MS) / MILLISECONDS_PER_DAY);
      var sprintIndex = Math.floor(elapsedDays / DAYS_PER_SPRINT);
      var dayWithinSprint = (elapsedDays % DAYS_PER_SPRINT + DAYS_PER_SPRINT) % DAYS_PER_SPRINT;
      return {
        sprint: sprintIndex + 1,
        week: Math.floor(dayWithinSprint / DAYS_PER_WEEK) + 1
      };
    }
    exports2.getSprint = getSprint;
    function cwd() {
      return process.cwd();
    }
    exports2.cwd = cwd;
    exports2.checkPath = im._checkPath;
    function cd(path2) {
      if (path2 === "-") {
        if (!process.env.OLDPWD) {
          throw new Error((0, exports2.loc)("LIB_NotFoundPreviousDirectory"));
        } else {
          path2 = process.env.OLDPWD;
        }
      }
      if (path2 === "~") {
        path2 = os.homedir();
      }
      if (!fs.existsSync(path2)) {
        throw new Error((0, exports2.loc)("LIB_PathNotFound", "cd", path2));
      }
      if (!fs.statSync(path2).isDirectory()) {
        throw new Error((0, exports2.loc)("LIB_PathIsNotADirectory", path2));
      }
      try {
        var currentPath = process.cwd();
        process.chdir(path2);
        process.env.OLDPWD = currentPath;
      } catch (error2) {
        (0, exports2.debug)((0, exports2.loc)("LIB_OperationFailed", "cd", error2));
      }
    }
    exports2.cd = cd;
    var dirStack = [];
    function getActualStack() {
      return [process.cwd()].concat(dirStack);
    }
    function pushd(dir) {
      if (dir === void 0) {
        dir = "";
      }
      var dirs = getActualStack();
      var maybeIndex = parseInt(dir);
      if (dir === "+0") {
        return dirs;
      } else if (dir.length === 0) {
        if (dirs.length > 1) {
          dirs.splice.apply(dirs, __spreadArray([0, 0], dirs.splice(1, 1), false));
        } else {
          throw new Error((0, exports2.loc)("LIB_DirectoryStackEmpty"));
        }
      } else if (!isNaN(maybeIndex)) {
        if (maybeIndex < dirStack.length + 1) {
          maybeIndex = dir.charAt(0) === "-" ? maybeIndex - 1 : maybeIndex;
        }
        dirs.splice.apply(dirs, __spreadArray([0, dirs.length], dirs.slice(maybeIndex).concat(dirs.slice(0, maybeIndex)), false));
      } else {
        dirs.unshift(dir);
      }
      var _path = path.resolve(dirs.shift());
      try {
        cd(_path);
      } catch (error2) {
        if (!fs.existsSync(_path)) {
          throw new Error((0, exports2.loc)("Not found", "pushd", _path));
        }
        throw error2;
      }
      dirStack.splice.apply(dirStack, __spreadArray([0, dirStack.length], dirs, false));
      return getActualStack();
    }
    exports2.pushd = pushd;
    function popd(index) {
      if (index === void 0) {
        index = "";
      }
      if (dirStack.length === 0) {
        throw new Error((0, exports2.loc)("LIB_DirectoryStackEmpty"));
      }
      var maybeIndex = parseInt(index);
      if (isNaN(maybeIndex)) {
        maybeIndex = 0;
      } else if (maybeIndex < dirStack.length + 1) {
        maybeIndex = index.charAt(0) === "-" ? maybeIndex - 1 : maybeIndex;
      }
      if (maybeIndex > 0 || dirStack.length + maybeIndex === 0) {
        maybeIndex = maybeIndex > 0 ? maybeIndex - 1 : maybeIndex;
        dirStack.splice(maybeIndex, 1);
      } else {
        var _path = path.resolve(dirStack.shift());
        cd(_path);
      }
      return getActualStack();
    }
    exports2.popd = popd;
    function mkdirP(p) {
      if (!p) {
        throw new Error((0, exports2.loc)("LIB_ParameterIsRequired", "p"));
      }
      var stack = [];
      var testDir = p;
      while (true) {
        if (stack.length >= Number(process.env["TASKLIB_TEST_MKDIRP_FAILSAFE"] || 1e3)) {
          (0, exports2.debug)("loop is out of control");
          fs.mkdirSync(p);
          return;
        }
        (0, exports2.debug)("testing directory '".concat(testDir, "'"));
        var stats_1 = void 0;
        try {
          stats_1 = fs.statSync(testDir);
        } catch (err) {
          if (err.code == "ENOENT") {
            var parentDir = path.dirname(testDir);
            if (testDir == parentDir) {
              throw new Error((0, exports2.loc)("LIB_MkdirFailedInvalidDriveRoot", p, testDir));
            }
            stack.push(testDir);
            testDir = parentDir;
            continue;
          } else if (err.code == "UNKNOWN") {
            throw new Error((0, exports2.loc)("LIB_MkdirFailedInvalidShare", p, testDir));
          } else {
            throw err;
          }
        }
        if (!stats_1.isDirectory()) {
          throw new Error((0, exports2.loc)("LIB_MkdirFailedFileExists", p, testDir));
        }
        break;
      }
      while (stack.length) {
        var dir = stack.pop();
        (0, exports2.debug)("mkdir '".concat(dir, "'"));
        try {
          fs.mkdirSync(dir);
        } catch (err) {
          throw new Error((0, exports2.loc)("LIB_MkdirFailed", p, err.message));
        }
      }
    }
    exports2.mkdirP = mkdirP;
    function resolve() {
      var pathSegments = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        pathSegments[_i] = arguments[_i];
      }
      var absolutePath = path.resolve.apply(this, pathSegments);
      (0, exports2.debug)("Absolute path for pathSegments: " + pathSegments + " = " + absolutePath);
      return absolutePath;
    }
    exports2.resolve = resolve;
    exports2.which = im._which;
    function ls(optionsOrPaths) {
      var paths = [];
      for (var _i = 1; _i < arguments.length; _i++) {
        paths[_i - 1] = arguments[_i];
      }
      var isRecursive = false;
      var includeHidden = false;
      if (typeof optionsOrPaths === "string" && optionsOrPaths.startsWith("-")) {
        var options = String(optionsOrPaths).toLowerCase();
        isRecursive = options.includes("r");
        includeHidden = options.includes("a");
      }
      if (Array.isArray(paths)) {
        paths = flattenArray(paths);
      }
      if (typeof optionsOrPaths !== "string" || !optionsOrPaths.startsWith("-")) {
        var pathsFromOptions = [];
        if (Array.isArray(optionsOrPaths)) {
          pathsFromOptions = optionsOrPaths;
        } else if (optionsOrPaths && typeof optionsOrPaths === "string") {
          pathsFromOptions = [optionsOrPaths];
        }
        if (paths === void 0 || paths.length === 0) {
          paths = pathsFromOptions;
        } else {
          paths.push.apply(paths, pathsFromOptions);
        }
      }
      if (paths.length === 0) {
        paths.push(path.resolve("."));
      }
      var pathsCopy = __spreadArray([], paths, true);
      var preparedPaths = [];
      var fileEntries = [];
      try {
        var remainingPaths = [];
        while (paths.length > 0) {
          var pathEntry = resolve(paths.shift());
          if (pathEntry === null || pathEntry === void 0 ? void 0 : pathEntry.includes("*")) {
            remainingPaths.push(pathEntry);
            continue;
          }
          var stats_2 = fs.lstatSync(pathEntry);
          if (stats_2.isFile()) {
            var fileName = path.basename(pathEntry);
            fileEntries.push(fileName);
          } else {
            remainingPaths.push(pathEntry);
          }
        }
        paths.push.apply(paths, remainingPaths);
        var _loop_1 = function() {
          var pathEntry2 = resolve(paths.shift());
          if (pathEntry2 === null || pathEntry2 === void 0 ? void 0 : pathEntry2.includes("*")) {
            paths.push.apply(paths, findMatch(path.dirname(pathEntry2), [path.basename(pathEntry2)]));
            return "continue";
          }
          if (fs.lstatSync(pathEntry2).isDirectory()) {
            preparedPaths.push.apply(preparedPaths, fs.readdirSync(pathEntry2).map(function(file) {
              return path.join(pathEntry2, file);
            }));
          } else {
            preparedPaths.push(pathEntry2);
          }
        };
        while (paths.length > 0) {
          _loop_1();
        }
        var entries = [];
        var _loop_2 = function() {
          var entry = preparedPaths.shift();
          var entrybasename = path.basename(entry);
          if (entry === null || entry === void 0 ? void 0 : entry.includes("*")) {
            preparedPaths.push.apply(preparedPaths, findMatch(path.dirname(entry), [entrybasename]));
            return "continue";
          }
          if (!includeHidden && entrybasename.startsWith(".") && entrybasename !== "." && entrybasename !== "..") {
            return "continue";
          }
          var baseDir = safeFind(pathsCopy, function(p) {
            return entry.startsWith(path.resolve(p));
          }) || path.resolve(".");
          if (fs.lstatSync(entry).isDirectory() && isRecursive) {
            preparedPaths.push.apply(preparedPaths, fs.readdirSync(entry).map(function(x) {
              return path.join(entry, x);
            }));
            entries.push(path.relative(baseDir, entry));
          } else {
            entries.push(path.relative(baseDir, entry));
          }
        };
        while (preparedPaths.length > 0) {
          _loop_2();
        }
        var finalResults = __spreadArray(__spreadArray([], fileEntries, true), entries, true);
        return finalResults;
      } catch (error2) {
        if (error2.code === "ENOENT") {
          throw new Error((0, exports2.loc)("LIB_PathNotFound", "ls", error2.message));
        } else {
          throw new Error((0, exports2.loc)("LIB_OperationFailed", "ls", error2));
        }
      }
    }
    exports2.ls = ls;
    function flattenArray(arr) {
      return arr.reduce(function(flat, toFlatten) {
        return flat.concat(Array.isArray(toFlatten) ? flattenArray(toFlatten) : toFlatten);
      }, []);
    }
    function cp(sourceOrOptions, destinationOrSource, optionsOrDestination, continueOnError, retryCount) {
      if (continueOnError === void 0) {
        continueOnError = false;
      }
      if (retryCount === void 0) {
        retryCount = 0;
      }
      retry(function() {
        var recursive = false;
        var force = true;
        var source = String(sourceOrOptions);
        var destination = destinationOrSource;
        var options = "";
        if (typeof sourceOrOptions === "string" && sourceOrOptions.startsWith("-")) {
          options = sourceOrOptions.toLowerCase();
          recursive = options.includes("r");
          force = !options.includes("n");
          source = destinationOrSource;
          destination = String(optionsOrDestination);
        } else if (typeof optionsOrDestination === "string" && optionsOrDestination && optionsOrDestination.startsWith("-")) {
          options = optionsOrDestination.toLowerCase();
          recursive = options.includes("r");
          force = !options.includes("n");
          source = String(sourceOrOptions);
          destination = destinationOrSource;
        }
        if (!fs.existsSync(destination) && !force) {
          throw new Error((0, exports2.loc)("LIB_PathNotFound", "cp", destination));
        }
        var isPattern = /[*?{\[]/.test(source) || /[@+!]\(/.test(source);
        if (isPattern) {
          var defaultRoot = (0, exports2.getVariable)("system.defaultWorkingDirectory") || process.cwd();
          var matches = findMatch(defaultRoot, [source], void 0, { nonegate: true, nocomment: true });
          var resolvedMatches = matches.filter(function(src2) {
            return path.resolve(src2) !== path.resolve(source);
          });
          for (var _i = 0, resolvedMatches_1 = resolvedMatches; _i < resolvedMatches_1.length; _i++) {
            var src = resolvedMatches_1[_i];
            cp(src, destination, options, continueOnError, retryCount);
          }
          if (matches.length > 0 && resolvedMatches.length === matches.length) {
            return;
          }
          if (matches.length === 0) {
            (0, exports2.debug)("No matches found for the pattern: ".concat(source, ". Fallback to check for the literal path."));
          }
        }
        var lstatSource = fs.lstatSync(source);
        if (!recursive && lstatSource.isDirectory()) {
          throw new Error((0, exports2.loc)("LIB_CopyDirectoryWithoutRecursiveOption", source));
        }
        if (!force && fs.existsSync(destination)) {
          return;
        }
        try {
          if (fs.existsSync(destination) && fs.lstatSync(destination).isDirectory()) {
            destination = path.join(destination, path.basename(source));
          }
          copyWithPreservedSymlinks(source, destination, force);
        } catch (error2) {
          throw new Error((0, exports2.loc)("LIB_OperationFailed", "cp", error2));
        }
      }, [], { retryCount, continueOnError });
    }
    exports2.cp = cp;
    var copyWithPreservedSymlinks = function(source, destination, force) {
      var lstatSource = fs.lstatSync(source);
      if (lstatSource.isSymbolicLink()) {
        var symlinkTarget = fs.readlinkSync(source);
        if (force && fs.existsSync(destination)) {
          var destStats = fs.lstatSync(destination);
          if (destStats.isSymbolicLink()) {
            fs.unlinkSync(destination);
          } else {
            fs.rmSync(destination, { recursive: true, force: true });
          }
        }
        fs.symlinkSync(symlinkTarget, destination);
      } else if (lstatSource.isFile()) {
        if (force) {
          fs.copyFileSync(source, destination);
        } else {
          fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
        }
      } else {
        var entries = fs.readdirSync(source, { withFileTypes: true });
        if (!fs.existsSync(destination)) {
          fs.mkdirSync(destination, { recursive: true });
        }
        for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
          var entry = entries_1[_i];
          var srcPath = path.join(source, entry.name);
          var destPath = path.join(destination, entry.name);
          copyWithPreservedSymlinks(srcPath, destPath, force);
        }
      }
    };
    function mv(source, dest, options, continueOnError) {
      var force = false;
      if (options && typeof options === "string" && options.startsWith("-")) {
        var lowercasedOptions = String(options).toLowerCase();
        force = lowercasedOptions.includes("f") && !lowercasedOptions.includes("n");
      }
      var sourceExists = fs.existsSync(source);
      var destExists = fs.existsSync(dest);
      var sources = [];
      try {
        if (!sourceExists) {
          if (source.includes("*")) {
            sources.push.apply(sources, findMatch(path.resolve(path.dirname(source)), [path.basename(source)]));
          } else {
            throw new Error((0, exports2.loc)("LIB_PathNotFound", "mv", source));
          }
        } else {
          sources.push(source);
        }
        if (destExists && !force) {
          throw new Error("File already exists at ".concat(dest));
        }
        for (var _i = 0, sources_1 = sources; _i < sources_1.length; _i++) {
          var source_1 = sources_1[_i];
          fs.renameSync(source_1, dest);
        }
      } catch (error2) {
        (0, exports2.debug)("mv failed");
        var errMsg = (0, exports2.loc)("LIB_OperationFailed", "mv", error2);
        (0, exports2.debug)(errMsg);
        if (!continueOnError) {
          throw new Error(errMsg);
        }
      }
    }
    exports2.mv = mv;
    function retry(func, args, retryOptions) {
      if (retryOptions === void 0) {
        retryOptions = { continueOnError: false, retryCount: 0 };
      }
      while (retryOptions.retryCount >= 0) {
        try {
          return func.apply(void 0, args);
        } catch (e) {
          if (retryOptions.retryCount <= 0) {
            if (retryOptions.continueOnError) {
              (0, exports2.warning)(e, exports2.IssueSource.TaskInternal);
              break;
            } else {
              throw e;
            }
          } else {
            (0, exports2.debug)('Attempt to execute function "'.concat(func === null || func === void 0 ? void 0 : func.name, '" failed, retries left: ').concat(retryOptions.retryCount));
            retryOptions.retryCount--;
          }
        }
      }
    }
    exports2.retry = retry;
    function _getStats(path2, followSymbolicLink, allowBrokenSymbolicLinks) {
      var stats2;
      if (followSymbolicLink) {
        try {
          stats2 = fs.statSync(path2);
        } catch (err) {
          if (err.code == "ENOENT" && allowBrokenSymbolicLinks) {
            stats2 = fs.lstatSync(path2);
            (0, exports2.debug)("  ".concat(path2, " (broken symlink)"));
          } else {
            throw err;
          }
        }
      } else {
        stats2 = fs.lstatSync(path2);
      }
      return stats2;
    }
    function find(findPath, options) {
      if (!findPath) {
        (0, exports2.debug)("no path specified");
        return [];
      }
      findPath = path.normalize(findPath);
      (0, exports2.debug)("findPath: '".concat(findPath, "'"));
      options = options || _getDefaultFindOptions();
      _debugFindOptions(options);
      try {
        fs.lstatSync(findPath);
      } catch (err) {
        if (err.code == "ENOENT") {
          (0, exports2.debug)("0 results");
          return [];
        }
        throw err;
      }
      try {
        var result = [];
        var stack = [new _FindItem(findPath, 1)];
        var traversalChain = [];
        var _loop_3 = function() {
          var item = stack.pop();
          var stats_3 = void 0;
          try {
            var isPathToSearch = !result.length;
            var followSpecifiedSymbolicLink = options.followSpecifiedSymbolicLink && isPathToSearch;
            var followSymbolicLink = options.followSymbolicLinks || followSpecifiedSymbolicLink;
            stats_3 = _getStats(item.path, followSymbolicLink, options.allowBrokenSymbolicLinks);
          } catch (err) {
            if (err.code == "ENOENT" && options.skipMissingFiles) {
              (0, exports2.warning)('No such file or directory: "'.concat(item.path, '" - skipping.'), exports2.IssueSource.TaskInternal);
              return "continue";
            }
            throw err;
          }
          result.push(item.path);
          if (stats_3.isDirectory()) {
            (0, exports2.debug)("  ".concat(item.path, " (directory)"));
            if (options.followSymbolicLinks) {
              var realPath_1;
              if (im._isUncPath(item.path)) {
                realPath_1 = retry(fs.realpathSync, [item.path], { continueOnError: false, retryCount: 5 });
              } else {
                realPath_1 = fs.realpathSync(item.path);
              }
              while (traversalChain.length >= item.level) {
                traversalChain.pop();
              }
              if (traversalChain.some(function(x) {
                return x == realPath_1;
              })) {
                (0, exports2.debug)("    cycle detected");
                return "continue";
              }
              traversalChain.push(realPath_1);
            }
            var childLevel_1 = item.level + 1;
            var childItems = fs.readdirSync(item.path).map(function(childName) {
              return new _FindItem(path.join(item.path, childName), childLevel_1);
            });
            for (var i = childItems.length - 1; i >= 0; i--) {
              stack.push(childItems[i]);
            }
          } else {
            (0, exports2.debug)("  ".concat(item.path, " (file)"));
          }
        };
        while (stack.length) {
          _loop_3();
        }
        (0, exports2.debug)("".concat(result.length, " results"));
        return result;
      } catch (err) {
        throw new Error((0, exports2.loc)("LIB_OperationFailed", "find", err.message));
      }
    }
    exports2.find = find;
    var _FindItem = (
      /** @class */
      /* @__PURE__ */ function() {
        function _FindItem2(path2, level) {
          this.path = path2;
          this.level = level;
        }
        return _FindItem2;
      }()
    );
    function _debugFindOptions(options) {
      (0, exports2.debug)("findOptions.allowBrokenSymbolicLinks: '".concat(options.allowBrokenSymbolicLinks, "'"));
      (0, exports2.debug)("findOptions.followSpecifiedSymbolicLink: '".concat(options.followSpecifiedSymbolicLink, "'"));
      (0, exports2.debug)("findOptions.followSymbolicLinks: '".concat(options.followSymbolicLinks, "'"));
      (0, exports2.debug)("findOptions.skipMissingFiles: '".concat(options.skipMissingFiles, "'"));
    }
    function _getDefaultFindOptions() {
      return {
        allowBrokenSymbolicLinks: false,
        followSpecifiedSymbolicLink: true,
        followSymbolicLinks: true,
        skipMissingFiles: false
      };
    }
    function legacyFindFiles(rootDirectory, pattern, includeFiles, includeDirectories) {
      if (!pattern) {
        throw new Error("pattern parameter cannot be empty");
      }
      (0, exports2.debug)("legacyFindFiles rootDirectory: '".concat(rootDirectory, "'"));
      (0, exports2.debug)("pattern: '".concat(pattern, "'"));
      (0, exports2.debug)("includeFiles: '".concat(includeFiles, "'"));
      (0, exports2.debug)("includeDirectories: '".concat(includeDirectories, "'"));
      if (!includeFiles && !includeDirectories) {
        includeFiles = true;
      }
      var includePatterns = [];
      var excludePatterns = [];
      pattern = pattern.replace(/;;/g, "\0");
      for (var _i = 0, _a = pattern.split(";"); _i < _a.length; _i++) {
        var pat = _a[_i];
        if (!pat) {
          continue;
        }
        pat = pat.replace(/\0/g, ";");
        var isIncludePattern = void 0;
        if (im._startsWith(pat, "+:")) {
          pat = pat.substring(2);
          isIncludePattern = true;
        } else if (im._startsWith(pat, "-:")) {
          pat = pat.substring(2);
          isIncludePattern = false;
        } else {
          isIncludePattern = true;
        }
        if (im._endsWith(pat, "/") || process.platform == "win32" && im._endsWith(pat, "\\")) {
          throw new Error((0, exports2.loc)("LIB_InvalidPattern", pat));
        }
        if (rootDirectory && !path.isAbsolute(pat)) {
          pat = path.join(rootDirectory, pat);
          if (im._endsWith(pat, "\\")) {
            pat = pat.substring(0, pat.length - 1);
          }
        }
        if (isIncludePattern) {
          includePatterns.push(pat);
        } else {
          excludePatterns.push(im._legacyFindFiles_convertPatternToRegExp(pat));
        }
      }
      var count = 0;
      var result = _legacyFindFiles_getMatchingItems(includePatterns, excludePatterns, !!includeFiles, !!includeDirectories);
      (0, exports2.debug)("all matches:");
      for (var _b = 0, result_1 = result; _b < result_1.length; _b++) {
        var resultItem = result_1[_b];
        (0, exports2.debug)(" " + resultItem);
      }
      (0, exports2.debug)("total matched: " + result.length);
      return result;
    }
    exports2.legacyFindFiles = legacyFindFiles;
    function _legacyFindFiles_getMatchingItems(includePatterns, excludePatterns, includeFiles, includeDirectories) {
      (0, exports2.debug)("getMatchingItems()");
      for (var _i = 0, includePatterns_1 = includePatterns; _i < includePatterns_1.length; _i++) {
        var pattern = includePatterns_1[_i];
        (0, exports2.debug)("includePattern: '".concat(pattern, "'"));
      }
      for (var _a = 0, excludePatterns_1 = excludePatterns; _a < excludePatterns_1.length; _a++) {
        var pattern = excludePatterns_1[_a];
        (0, exports2.debug)("excludePattern: ".concat(pattern));
      }
      (0, exports2.debug)("includeFiles: " + includeFiles);
      (0, exports2.debug)("includeDirectories: " + includeDirectories);
      var allFiles = {};
      var _loop_4 = function(pattern2) {
        var findPath = void 0;
        var starIndex = pattern2.indexOf("*");
        var questionIndex = pattern2.indexOf("?");
        if (starIndex < 0 && questionIndex < 0) {
          findPath = im._getDirectoryName(pattern2);
        } else {
          var index = Math.min(starIndex >= 0 ? starIndex : questionIndex, questionIndex >= 0 ? questionIndex : starIndex);
          findPath = im._getDirectoryName(pattern2.substring(0, index));
        }
        if (!findPath) {
          return "continue";
        }
        var patternRegex = im._legacyFindFiles_convertPatternToRegExp(pattern2);
        var items = find(findPath, { followSymbolicLinks: true }).filter(function(item) {
          if (includeFiles && includeDirectories) {
            return true;
          }
          var isDir = fs.statSync(item).isDirectory();
          return includeFiles && !isDir || includeDirectories && isDir;
        }).forEach(function(item) {
          var normalizedPath = process.platform == "win32" ? item.replace(/\\/g, "/") : item;
          var alternatePath = "".concat(normalizedPath, "/");
          var isMatch = false;
          if (patternRegex.test(normalizedPath) || includeDirectories && patternRegex.test(alternatePath)) {
            isMatch = true;
            for (var _i2 = 0, excludePatterns_2 = excludePatterns; _i2 < excludePatterns_2.length; _i2++) {
              var regex = excludePatterns_2[_i2];
              if (regex.test(normalizedPath) || includeDirectories && regex.test(alternatePath)) {
                isMatch = false;
                break;
              }
            }
          }
          if (isMatch) {
            allFiles[item] = item;
          }
        });
      };
      for (var _b = 0, includePatterns_2 = includePatterns; _b < includePatterns_2.length; _b++) {
        var pattern = includePatterns_2[_b];
        _loop_4(pattern);
      }
      return Object.keys(allFiles).sort();
    }
    function rmRF(inputPath) {
      (0, exports2.debug)("rm -rf " + inputPath);
      if (getPlatform() == Platform.Windows) {
        try {
          var lstats = fs.lstatSync(inputPath);
          if (lstats.isDirectory() && !lstats.isSymbolicLink()) {
            (0, exports2.debug)("removing directory " + inputPath);
            childProcess.execFileSync("cmd.exe", ["/c", "rd", "/s", "/q", im._normalizeSeparators(inputPath)]);
          } else if (lstats.isSymbolicLink()) {
            (0, exports2.debug)("removing symbolic link " + inputPath);
            var realPath = fs.readlinkSync(inputPath);
            if (fs.existsSync(realPath)) {
              var stats_4 = fs.statSync(realPath);
              if (stats_4.isDirectory()) {
                childProcess.execFileSync("cmd.exe", ["/c", "rd", "/s", "/q", im._normalizeSeparators(realPath)]);
                fs.unlinkSync(inputPath);
              } else {
                fs.unlinkSync(inputPath);
              }
            } else {
              (0, exports2.debug)("Symbolic link '".concat(inputPath, "' points to a non-existing target '").concat(realPath, "'. Removing the symbolic link."));
              fs.unlinkSync(inputPath);
            }
          } else {
            (0, exports2.debug)("removing file " + inputPath);
            childProcess.execFileSync("cmd.exe", ["/c", "del", "/f", "/a", im._normalizeSeparators(inputPath)]);
          }
        } catch (err) {
          (0, exports2.debug)("Error: " + err.message);
          if (err.code != "ENOENT") {
            throw new Error((0, exports2.loc)("LIB_OperationFailed", "rmRF", err.message));
          }
        }
      } else {
        var lstats = void 0;
        try {
          if (inputPath.includes("*")) {
            var entries = findMatch(path.dirname(inputPath), [path.basename(inputPath)]);
            for (var _i = 0, entries_2 = entries; _i < entries_2.length; _i++) {
              var entry = entries_2[_i];
              rmRF(entry);
            }
          } else {
            lstats = fs.lstatSync(inputPath);
            if (lstats.isDirectory() && !lstats.isSymbolicLink()) {
              (0, exports2.debug)("removing directory " + inputPath);
              fs.rmSync(inputPath, { recursive: true, force: true });
            } else if (lstats.isSymbolicLink()) {
              (0, exports2.debug)("removing symbolic link " + inputPath);
              var realPath = fs.readlinkSync(inputPath);
              if (fs.existsSync(realPath)) {
                var stats_5 = fs.statSync(realPath);
                if (stats_5.isDirectory()) {
                  fs.rmSync(realPath, { recursive: true, force: true });
                  fs.unlinkSync(inputPath);
                } else {
                  fs.unlinkSync(inputPath);
                }
              } else {
                (0, exports2.debug)("Symbolic link '".concat(inputPath, "' points to a non-existing target '").concat(realPath, "'. Removing the symbolic link."));
                fs.unlinkSync(inputPath);
              }
            } else {
              (0, exports2.debug)("removing file " + inputPath);
              fs.unlinkSync(inputPath);
            }
          }
        } catch (err) {
          (0, exports2.debug)("Error: " + err.message);
          if (err.code != "ENOENT") {
            throw new Error((0, exports2.loc)("LIB_OperationFailed", "rmRF", err.message));
          }
        }
      }
    }
    exports2.rmRF = rmRF;
    function execAsync(tool2, args, options) {
      var tr = this.tool(tool2);
      if (args) {
        if (args instanceof Array) {
          tr.arg(args);
        } else if (typeof args === "string") {
          tr.line(args);
        }
      }
      return tr.execAsync(options);
    }
    exports2.execAsync = execAsync;
    function exec(tool2, args, options) {
      var tr = this.tool(tool2);
      if (args) {
        if (args instanceof Array) {
          tr.arg(args);
        } else if (typeof args === "string") {
          tr.line(args);
        }
      }
      return tr.exec(options);
    }
    exports2.exec = exec;
    function execSync(tool2, args, options) {
      var tr = this.tool(tool2);
      if (args) {
        if (args instanceof Array) {
          tr.arg(args);
        } else if (typeof args === "string") {
          tr.line(args);
        }
      }
      return tr.execSync(options);
    }
    exports2.execSync = execSync;
    function tool(tool2) {
      var tr = new trm.ToolRunner(tool2);
      tr.on("debug", function(message) {
        (0, exports2.debug)(message);
      });
      return tr;
    }
    exports2.tool = tool;
    function match(list, patterns, patternRoot, options) {
      (0, exports2.debug)("patternRoot: '".concat(patternRoot, "'"));
      options = options || _getDefaultMatchOptions();
      _debugMatchOptions(options);
      if (typeof patterns == "string") {
        patterns = [patterns];
      }
      var map = {};
      var originalOptions = options;
      for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
        var pattern = patterns_1[_i];
        (0, exports2.debug)("pattern: '".concat(pattern, "'"));
        pattern = (pattern || "").trim();
        if (!pattern) {
          (0, exports2.debug)("skipping empty pattern");
          continue;
        }
        var options_1 = im._cloneMatchOptions(originalOptions);
        if (!options_1.nocomment && im._startsWith(pattern, "#")) {
          (0, exports2.debug)("skipping comment");
          continue;
        }
        options_1.nocomment = true;
        var negateCount = 0;
        if (!options_1.nonegate) {
          while (pattern.charAt(negateCount) == "!") {
            negateCount++;
          }
          pattern = pattern.substring(negateCount);
          if (negateCount) {
            (0, exports2.debug)("trimmed leading '!'. pattern: '".concat(pattern, "'"));
          }
        }
        var isIncludePattern = negateCount == 0 || negateCount % 2 == 0 && !options_1.flipNegate || negateCount % 2 == 1 && options_1.flipNegate;
        options_1.nonegate = true;
        options_1.flipNegate = false;
        var expanded = void 0;
        var preExpanded = pattern;
        if (options_1.nobrace) {
          expanded = [pattern];
        } else {
          (0, exports2.debug)("expanding braces");
          var convertedPattern = process.platform == "win32" ? pattern.replace(/\\/g, "/") : pattern;
          expanded = minimatch.braceExpand(convertedPattern);
        }
        options_1.nobrace = true;
        for (var _a = 0, expanded_1 = expanded; _a < expanded_1.length; _a++) {
          var pattern_1 = expanded_1[_a];
          if (expanded.length != 1 || pattern_1 != preExpanded) {
            (0, exports2.debug)("pattern: '".concat(pattern_1, "'"));
          }
          pattern_1 = (pattern_1 || "").trim();
          if (!pattern_1) {
            (0, exports2.debug)("skipping empty pattern");
            continue;
          }
          if (patternRoot && // patternRoot supplied
          !im._isRooted(pattern_1) && // AND pattern not rooted
          // AND matchBase:false or not basename only
          (!options_1.matchBase || (process.platform == "win32" ? pattern_1.replace(/\\/g, "/") : pattern_1).indexOf("/") >= 0)) {
            pattern_1 = im._ensureRooted(patternRoot, pattern_1);
            (0, exports2.debug)("rooted pattern: '".concat(pattern_1, "'"));
          }
          if (isIncludePattern) {
            (0, exports2.debug)("applying include pattern against original list");
            var matchResults = minimatch.match(list, pattern_1, options_1);
            (0, exports2.debug)(matchResults.length + " matches");
            for (var _b = 0, matchResults_1 = matchResults; _b < matchResults_1.length; _b++) {
              var matchResult = matchResults_1[_b];
              map[matchResult] = true;
            }
          } else {
            (0, exports2.debug)("applying exclude pattern against original list");
            var matchResults = minimatch.match(list, pattern_1, options_1);
            (0, exports2.debug)(matchResults.length + " matches");
            for (var _c = 0, matchResults_2 = matchResults; _c < matchResults_2.length; _c++) {
              var matchResult = matchResults_2[_c];
              delete map[matchResult];
            }
          }
        }
      }
      var result = list.filter(function(item) {
        return map.hasOwnProperty(item);
      });
      (0, exports2.debug)(result.length + " final results");
      return result;
    }
    exports2.match = match;
    function filter(pattern, options) {
      options = options || _getDefaultMatchOptions();
      return minimatch.filter(pattern, options);
    }
    exports2.filter = filter;
    function _debugMatchOptions(options) {
      (0, exports2.debug)("matchOptions.debug: '".concat(options.debug, "'"));
      (0, exports2.debug)("matchOptions.nobrace: '".concat(options.nobrace, "'"));
      (0, exports2.debug)("matchOptions.noglobstar: '".concat(options.noglobstar, "'"));
      (0, exports2.debug)("matchOptions.dot: '".concat(options.dot, "'"));
      (0, exports2.debug)("matchOptions.noext: '".concat(options.noext, "'"));
      (0, exports2.debug)("matchOptions.nocase: '".concat(options.nocase, "'"));
      (0, exports2.debug)("matchOptions.nonull: '".concat(options.nonull, "'"));
      (0, exports2.debug)("matchOptions.matchBase: '".concat(options.matchBase, "'"));
      (0, exports2.debug)("matchOptions.nocomment: '".concat(options.nocomment, "'"));
      (0, exports2.debug)("matchOptions.nonegate: '".concat(options.nonegate, "'"));
      (0, exports2.debug)("matchOptions.flipNegate: '".concat(options.flipNegate, "'"));
    }
    function _getDefaultMatchOptions() {
      return {
        debug: false,
        nobrace: true,
        noglobstar: false,
        dot: true,
        noext: false,
        nocase: process.platform == "win32",
        nonull: false,
        matchBase: false,
        nocomment: false,
        nonegate: false,
        flipNegate: false
      };
    }
    function findMatch(defaultRoot, patterns, findOptions, matchOptions) {
      defaultRoot = defaultRoot || this.getVariable("system.defaultWorkingDirectory") || process.cwd();
      (0, exports2.debug)("defaultRoot: '".concat(defaultRoot, "'"));
      patterns = patterns || [];
      patterns = typeof patterns == "string" ? [patterns] : patterns;
      findOptions = findOptions || _getDefaultFindOptions();
      _debugFindOptions(findOptions);
      matchOptions = matchOptions || _getDefaultMatchOptions();
      _debugMatchOptions(matchOptions);
      defaultRoot = im._normalizeSeparators(defaultRoot);
      var results = {};
      var originalMatchOptions = matchOptions;
      for (var _i = 0, _a = patterns || []; _i < _a.length; _i++) {
        var pattern = _a[_i];
        (0, exports2.debug)("pattern: '".concat(pattern, "'"));
        pattern = (pattern || "").trim();
        if (!pattern) {
          (0, exports2.debug)("skipping empty pattern");
          continue;
        }
        var matchOptions_1 = im._cloneMatchOptions(originalMatchOptions);
        if (!matchOptions_1.nocomment && im._startsWith(pattern, "#")) {
          (0, exports2.debug)("skipping comment");
          continue;
        }
        matchOptions_1.nocomment = true;
        var negateCount = 0;
        if (!matchOptions_1.nonegate) {
          while (pattern.charAt(negateCount) == "!") {
            negateCount++;
          }
          pattern = pattern.substring(negateCount);
          if (negateCount) {
            (0, exports2.debug)("trimmed leading '!'. pattern: '".concat(pattern, "'"));
          }
        }
        var isIncludePattern = negateCount == 0 || negateCount % 2 == 0 && !matchOptions_1.flipNegate || negateCount % 2 == 1 && matchOptions_1.flipNegate;
        matchOptions_1.nonegate = true;
        matchOptions_1.flipNegate = false;
        var expanded = void 0;
        var preExpanded = pattern;
        if (matchOptions_1.nobrace) {
          expanded = [pattern];
        } else {
          (0, exports2.debug)("expanding braces");
          var convertedPattern = process.platform == "win32" ? pattern.replace(/\\/g, "/") : pattern;
          expanded = minimatch.braceExpand(convertedPattern);
        }
        matchOptions_1.nobrace = true;
        for (var _b = 0, expanded_2 = expanded; _b < expanded_2.length; _b++) {
          var pattern_2 = expanded_2[_b];
          if (expanded.length != 1 || pattern_2 != preExpanded) {
            (0, exports2.debug)("pattern: '".concat(pattern_2, "'"));
          }
          pattern_2 = (pattern_2 || "").trim();
          if (!pattern_2) {
            (0, exports2.debug)("skipping empty pattern");
            continue;
          }
          if (isIncludePattern) {
            var findInfo = im._getFindInfoFromPattern(defaultRoot, pattern_2, matchOptions_1);
            var findPath = findInfo.findPath;
            (0, exports2.debug)("findPath: '".concat(findPath, "'"));
            if (!findPath) {
              (0, exports2.debug)("skipping empty path");
              continue;
            }
            (0, exports2.debug)("statOnly: '".concat(findInfo.statOnly, "'"));
            var findResults = [];
            if (findInfo.statOnly) {
              try {
                fs.statSync(findPath);
                findResults.push(findPath);
              } catch (err) {
                if (err.code != "ENOENT") {
                  throw err;
                }
                (0, exports2.debug)("ENOENT");
              }
            } else {
              findResults = find(findPath, findOptions);
            }
            (0, exports2.debug)("found ".concat(findResults.length, " paths"));
            (0, exports2.debug)("applying include pattern");
            if (findInfo.adjustedPattern != pattern_2) {
              (0, exports2.debug)("adjustedPattern: '".concat(findInfo.adjustedPattern, "'"));
              pattern_2 = findInfo.adjustedPattern;
            }
            var matchResults = minimatch.match(findResults, pattern_2, matchOptions_1);
            (0, exports2.debug)(matchResults.length + " matches");
            for (var _c = 0, matchResults_3 = matchResults; _c < matchResults_3.length; _c++) {
              var matchResult = matchResults_3[_c];
              var key = process.platform == "win32" ? matchResult.toUpperCase() : matchResult;
              results[key] = matchResult;
            }
          } else {
            if (matchOptions_1.matchBase && !im._isRooted(pattern_2) && (process.platform == "win32" ? pattern_2.replace(/\\/g, "/") : pattern_2).indexOf("/") < 0) {
              (0, exports2.debug)("matchBase and basename only");
            } else {
              pattern_2 = im._ensurePatternRooted(defaultRoot, pattern_2);
              (0, exports2.debug)("after ensurePatternRooted, pattern: '".concat(pattern_2, "'"));
            }
            (0, exports2.debug)("applying exclude pattern");
            var matchResults = minimatch.match(Object.keys(results).map(function(key2) {
              return results[key2];
            }), pattern_2, matchOptions_1);
            (0, exports2.debug)(matchResults.length + " matches");
            for (var _d = 0, matchResults_4 = matchResults; _d < matchResults_4.length; _d++) {
              var matchResult = matchResults_4[_d];
              var key = process.platform == "win32" ? matchResult.toUpperCase() : matchResult;
              delete results[key];
            }
          }
        }
      }
      var finalResult = Object.keys(results).map(function(key2) {
        return results[key2];
      }).sort();
      (0, exports2.debug)(finalResult.length + " final results");
      return finalResult;
    }
    exports2.findMatch = findMatch;
    function getProxyFormattedUrl(proxyUrl, proxyUsername, proxyPassword) {
      var parsedUrl = new URL(proxyUrl);
      var proxyAddress = "".concat(parsedUrl.protocol, "//").concat(parsedUrl.host);
      if (proxyUsername) {
        proxyAddress = "".concat(parsedUrl.protocol, "//").concat(proxyUsername, ":").concat(proxyPassword, "@").concat(parsedUrl.host);
      }
      return proxyAddress;
    }
    function getHttpProxyConfiguration(requestUrl) {
      var proxyUrl = (0, exports2.getVariable)("Agent.ProxyUrl");
      if (proxyUrl && proxyUrl.length > 0) {
        var proxyUsername = (0, exports2.getVariable)("Agent.ProxyUsername");
        var proxyPassword = (0, exports2.getVariable)("Agent.ProxyPassword");
        var proxyBypassHosts = JSON.parse((0, exports2.getVariable)("Agent.ProxyBypassList") || "[]");
        var bypass_1 = false;
        if (requestUrl) {
          proxyBypassHosts.forEach(function(bypassHost) {
            if (new RegExp(bypassHost, "i").test(requestUrl)) {
              bypass_1 = true;
            }
          });
        }
        if (bypass_1) {
          return null;
        } else {
          var proxyAddress = getProxyFormattedUrl(proxyUrl, proxyUsername, proxyPassword);
          return {
            proxyUrl,
            proxyUsername,
            proxyPassword,
            proxyBypassHosts,
            proxyFormattedUrl: proxyAddress
          };
        }
      } else {
        return null;
      }
    }
    exports2.getHttpProxyConfiguration = getHttpProxyConfiguration;
    function getHttpCertConfiguration() {
      var ca = (0, exports2.getVariable)("Agent.CAInfo");
      var clientCert = (0, exports2.getVariable)("Agent.ClientCert");
      if (ca || clientCert) {
        var certConfig = {};
        certConfig.caFile = ca;
        certConfig.certFile = clientCert;
        if (clientCert) {
          var clientCertKey = (0, exports2.getVariable)("Agent.ClientCertKey");
          var clientCertArchive = (0, exports2.getVariable)("Agent.ClientCertArchive");
          var clientCertPassword = (0, exports2.getVariable)("Agent.ClientCertPassword");
          certConfig.keyFile = clientCertKey;
          certConfig.certArchiveFile = clientCertArchive;
          certConfig.passphrase = clientCertPassword;
        }
        return certConfig;
      } else {
        return null;
      }
    }
    exports2.getHttpCertConfiguration = getHttpCertConfiguration;
    var TestPublisher = (
      /** @class */
      function() {
        function TestPublisher2(testRunner) {
          this.testRunner = testRunner;
        }
        TestPublisher2.prototype.publish = function(resultFiles, mergeResults, platform, config, runTitle, publishRunAttachments, testRunSystem) {
          testRunSystem = testRunSystem || "VSTSTask";
          var properties = {};
          properties["type"] = this.testRunner;
          if (mergeResults) {
            properties["mergeResults"] = mergeResults;
          }
          if (platform) {
            properties["platform"] = platform;
          }
          if (config) {
            properties["config"] = config;
          }
          if (runTitle) {
            properties["runTitle"] = runTitle;
          }
          if (publishRunAttachments) {
            properties["publishRunAttachments"] = publishRunAttachments;
          }
          if (resultFiles) {
            properties["resultFiles"] = Array.isArray(resultFiles) ? resultFiles.join() : resultFiles;
          }
          properties["testRunSystem"] = testRunSystem;
          (0, exports2.command)("results.publish", properties, "");
        };
        return TestPublisher2;
      }()
    );
    exports2.TestPublisher = TestPublisher;
    var CodeCoveragePublisher = (
      /** @class */
      function() {
        function CodeCoveragePublisher2() {
        }
        CodeCoveragePublisher2.prototype.publish = function(codeCoverageTool, summaryFileLocation, reportDirectory, additionalCodeCoverageFiles) {
          var properties = {};
          if (codeCoverageTool) {
            properties["codecoveragetool"] = codeCoverageTool;
          }
          if (summaryFileLocation) {
            properties["summaryfile"] = summaryFileLocation;
          }
          if (reportDirectory) {
            properties["reportdirectory"] = reportDirectory;
          }
          if (additionalCodeCoverageFiles) {
            properties["additionalcodecoveragefiles"] = Array.isArray(additionalCodeCoverageFiles) ? additionalCodeCoverageFiles.join() : additionalCodeCoverageFiles;
          }
          (0, exports2.command)("codecoverage.publish", properties, "");
        };
        return CodeCoveragePublisher2;
      }()
    );
    exports2.CodeCoveragePublisher = CodeCoveragePublisher;
    var CodeCoverageEnabler = (
      /** @class */
      function() {
        function CodeCoverageEnabler2(buildTool, ccTool) {
          this.buildTool = buildTool;
          this.ccTool = ccTool;
        }
        CodeCoverageEnabler2.prototype.enableCodeCoverage = function(buildProps) {
          buildProps["buildtool"] = this.buildTool;
          buildProps["codecoveragetool"] = this.ccTool;
          (0, exports2.command)("codecoverage.enable", buildProps, "");
        };
        return CodeCoverageEnabler2;
      }()
    );
    exports2.CodeCoverageEnabler = CodeCoverageEnabler;
    function uploadFile(path2) {
      (0, exports2.command)("task.uploadfile", null, path2);
    }
    exports2.uploadFile = uploadFile;
    function prependPath(path2) {
      assertAgent("2.115.0");
      (0, exports2.command)("task.prependpath", null, path2);
    }
    exports2.prependPath = prependPath;
    function uploadSummary(path2) {
      (0, exports2.command)("task.uploadsummary", null, path2);
    }
    exports2.uploadSummary = uploadSummary;
    function addAttachment(type, name, path2) {
      (0, exports2.command)("task.addattachment", { "type": type, "name": name }, path2);
    }
    exports2.addAttachment = addAttachment;
    function setEndpoint(id, field, key, value) {
      (0, exports2.command)("task.setendpoint", { "id": id, "field": FieldType[field].toLowerCase(), "key": key }, value);
    }
    exports2.setEndpoint = setEndpoint;
    function setProgress(percent, currentOperation) {
      (0, exports2.command)("task.setprogress", { "value": "".concat(percent) }, currentOperation);
    }
    exports2.setProgress = setProgress;
    function logDetail(id, message, parentId, recordType, recordName, order, startTime, finishTime, progress, state, result) {
      var properties = {
        "id": id,
        "parentid": parentId,
        "type": recordType,
        "name": recordName,
        "order": order ? order.toString() : void 0,
        "starttime": startTime,
        "finishtime": finishTime,
        "progress": progress ? progress.toString() : void 0,
        "state": state ? TaskState[state] : void 0,
        "result": result ? TaskResult2[result] : void 0
      };
      (0, exports2.command)("task.logdetail", properties, message);
    }
    exports2.logDetail = logDetail;
    function logIssue(type, message, sourcePath, lineNumber, columnNumber, errorCode) {
      var properties = {
        "type": IssueType[type].toLowerCase(),
        "code": errorCode,
        "sourcepath": sourcePath,
        "linenumber": lineNumber ? lineNumber.toString() : void 0,
        "columnnumber": columnNumber ? columnNumber.toString() : void 0
      };
      (0, exports2.command)("task.logissue", properties, message);
    }
    exports2.logIssue = logIssue;
    function uploadArtifact(containerFolder, path2, name) {
      (0, exports2.command)("artifact.upload", { "containerfolder": containerFolder, "artifactname": name }, path2);
    }
    exports2.uploadArtifact = uploadArtifact;
    function associateArtifact(name, path2, artifactType) {
      (0, exports2.command)("artifact.associate", { "type": ArtifactType[artifactType].toLowerCase(), "artifactname": name }, path2);
    }
    exports2.associateArtifact = associateArtifact;
    function uploadBuildLog(path2) {
      (0, exports2.command)("build.uploadlog", null, path2);
    }
    exports2.uploadBuildLog = uploadBuildLog;
    function updateBuildNumber(value) {
      (0, exports2.command)("build.updatebuildnumber", null, value);
    }
    exports2.updateBuildNumber = updateBuildNumber;
    function addBuildTag(value) {
      (0, exports2.command)("build.addbuildtag", null, value);
    }
    exports2.addBuildTag = addBuildTag;
    function updateReleaseName(name) {
      assertAgent("2.132.0");
      (0, exports2.command)("release.updatereleasename", null, name);
    }
    exports2.updateReleaseName = updateReleaseName;
    exports2.TaskCommand = tcm.TaskCommand;
    exports2.commandFromString = tcm.commandFromString;
    exports2.ToolRunner = trm.ToolRunner;
    if (semver.lt(process.versions.node, "4.2.0")) {
      (0, exports2.warning)("Tasks require a new agent.  Upgrade your agent or node to 4.2.0 or later", exports2.IssueSource.TaskInternal);
    }
    if (!global["_vsts_task_lib_loaded"]) {
      im._loadData();
      im._exposeProxySettings();
      im._exposeCertSettings();
    }
    function safeFind(arr, predicate) {
      for (var i = 0; i < arr.length; i++) {
        if (predicate(arr[i])) {
          return arr[i];
        }
      }
      return void 0;
    }
  }
});

// ../enforce/dist/transport.js
var require_transport = __commonJS({
  "../enforce/dist/transport.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.post = post;
    exports2.get = get;
    var node_https_1 = __importDefault(require("node:https"));
    var node_http_1 = __importDefault(require("node:http"));
    function post(url, body, headers) {
      return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const transport = parsed.protocol === "https:" ? node_https_1.default : node_http_1.default;
        const req = transport.request({
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            ...headers
          },
          timeout: 3e4
        }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
          res.on("error", reject);
        });
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timed out after 30s"));
        });
        req.write(body);
        req.end();
      });
    }
    function get(url, headers) {
      return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const transport = parsed.protocol === "https:" ? node_https_1.default : node_http_1.default;
        const req = transport.request({
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers,
          timeout: 3e4
        }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
          res.on("error", reject);
        });
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timed out after 30s"));
        });
        req.end();
      });
    }
  }
});

// ../enforce/dist/functionRegion.js
var require_functionRegion = __commonJS({
  "../enforce/dist/functionRegion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FunctionRegionConfigError = exports2.SUPPORTED_FUNCTION_REGIONS = exports2.HOSTED_RUNTIME_HOSTS = exports2.DEFAULT_FUNCTION_REGION = exports2.FUNCTION_REGION_ENV = exports2.FUNCTION_REGION_HEADER = void 0;
    exports2.parseFunctionRegion = parseFunctionRegion;
    exports2.resolveFunctionRegion = resolveFunctionRegion;
    exports2.functionRegionHeaders = functionRegionHeaders;
    exports2.FUNCTION_REGION_HEADER = "x-region";
    exports2.FUNCTION_REGION_ENV = "ATLASENT_FUNCTION_REGION";
    exports2.DEFAULT_FUNCTION_REGION = "us-west-1";
    exports2.HOSTED_RUNTIME_HOSTS = /* @__PURE__ */ new Set([
      "api.atlasent.io",
      "kttccumlnmdtupgbyfue.supabase.co",
      "lwnqpmnxpeyhpxvastku.supabase.co"
    ]);
    exports2.SUPPORTED_FUNCTION_REGIONS = /* @__PURE__ */ new Set([
      "ap-northeast-1",
      "ap-northeast-2",
      "ap-south-1",
      "ap-southeast-1",
      "ap-southeast-2",
      "ca-central-1",
      "us-east-1",
      "us-west-1",
      "us-west-2",
      "eu-central-1",
      "eu-west-1",
      "eu-west-2",
      "eu-west-3",
      "sa-east-1"
    ]);
    var FunctionRegionConfigError = class extends Error {
      constructor(value) {
        super(`Invalid function region "${value}": expected a supported region such as "${exports2.DEFAULT_FUNCTION_REGION}", or "auto" to let Supabase choose.`);
        this.name = "FunctionRegionConfigError";
      }
    };
    exports2.FunctionRegionConfigError = FunctionRegionConfigError;
    function parseFunctionRegion(value) {
      const v = value.trim();
      if (v === "auto")
        return null;
      if (exports2.SUPPORTED_FUNCTION_REGIONS.has(v))
        return v;
      throw new FunctionRegionConfigError(value);
    }
    function isHostedRuntime(url) {
      try {
        return exports2.HOSTED_RUNTIME_HOSTS.has(new URL(url).hostname.toLowerCase());
      } catch {
        return false;
      }
    }
    function resolveFunctionRegion(url, explicit, env = process.env) {
      if (explicit === null)
        return null;
      if (explicit !== void 0 && explicit.trim() !== "")
        return parseFunctionRegion(explicit);
      const fromEnv = env[exports2.FUNCTION_REGION_ENV];
      if (fromEnv !== void 0 && fromEnv.trim() !== "")
        return parseFunctionRegion(fromEnv);
      return isHostedRuntime(url) ? exports2.DEFAULT_FUNCTION_REGION : null;
    }
    function functionRegionHeaders(url, explicit, env = process.env) {
      const region = resolveFunctionRegion(url, explicit, env);
      return region ? { [exports2.FUNCTION_REGION_HEADER]: region } : {};
    }
  }
});

// ../enforce/dist/index.js
var require_dist = __commonJS({
  "../enforce/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveFunctionRegion = exports2.parseFunctionRegion = exports2.functionRegionHeaders = exports2.HOSTED_RUNTIME_HOSTS = exports2.FunctionRegionConfigError = exports2.FUNCTION_REGION_HEADER = exports2.FUNCTION_REGION_ENV = exports2.DEFAULT_FUNCTION_REGION = exports2.CLOUD_LOCUS_CONTEXT_KEYS = exports2.EnforceError = void 0;
    exports2.evaluate = evaluate2;
    exports2.verify = verify2;
    exports2.waitForApprovalResolution = waitForApprovalResolution2;
    exports2.requiredBindingsFor = requiredBindingsFor2;
    exports2.verifyPermit = verifyPermit2;
    exports2.reverifyPermit = reverifyPermit2;
    exports2.enforce = enforce;
    var transport_1 = require_transport();
    var functionRegion_1 = require_functionRegion();
    var DEFAULT_API_URL = "https://api.atlasent.io";
    function runtimeHeaders(config, url) {
      return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(0, functionRegion_1.functionRegionHeaders)(url, config.functionRegion)
      };
    }
    var EnforceError2 = class extends Error {
      phase;
      decision;
      /** Coarse verify outcome (verified | mismatch | expired | replay_blocked | invalid | …). */
      outcome;
      /** Precise verify wire code, when the failure came from verify-permit. */
      verifyErrorCode;
      mismatchFields;
      constructor(message, phase, decision = null, details) {
        super(message);
        this.name = "EnforceError";
        this.phase = phase;
        this.decision = decision;
        this.outcome = details?.outcome;
        this.verifyErrorCode = details?.verifyErrorCode;
        this.mismatchFields = details?.mismatchFields;
      }
    };
    exports2.EnforceError = EnforceError2;
    async function evaluate2(config) {
      const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
      const rawContext = { ...config.context };
      const contextSnapshot = rawContext["state_snapshot"];
      delete rawContext["state_snapshot"];
      const payload = {
        action_type: config.action,
        actor_id: config.actor,
        context: {
          // Keep environment in context for backward compat with older control plane versions.
          ...config.environment ? { environment: config.environment } : {},
          ...config.targetId ? { target_id: config.targetId } : {},
          ...rawContext
        }
      };
      if (config.actorIdentity != null)
        payload["actor_identity"] = config.actorIdentity;
      if (config.environment != null)
        payload["environment"] = config.environment;
      if (config.resource != null)
        payload["resource"] = config.resource;
      else if (config.targetId)
        payload["target_id"] = config.targetId;
      if (config.current_state != null)
        payload["current_state"] = config.current_state;
      if (config.proposed_state != null)
        payload["proposed_state"] = config.proposed_state;
      if (config.execution_binding != null)
        payload["execution_binding"] = config.execution_binding;
      const snap = config.state_snapshot ?? contextSnapshot;
      if (snap != null)
        payload["state_snapshot"] = snap;
      if (config.changePlan != null)
        payload["change_plan"] = config.changePlan;
      if (config.evidenceProfile != null)
        payload["evidence_profile"] = config.evidenceProfile;
      if (config.quorum != null)
        payload["quorum"] = config.quorum;
      if (config.approval != null)
        payload["approval"] = config.approval;
      if (config.executionPayloadHash != null) {
        payload["execution_payload_hash"] = config.executionPayloadHash;
      }
      let status;
      let body;
      try {
        ({ status, body } = await (0, transport_1.post)(`${apiUrl}/v1-evaluate`, JSON.stringify(payload), runtimeHeaders(config, apiUrl)));
      } catch (err) {
        throw new EnforceError2(`AtlaSent API unreachable: ${err instanceof Error ? err.message : String(err)}`, "evaluate");
      }
      if (status >= 500) {
        throw new EnforceError2(`Infrastructure failure (HTTP ${status})`, "evaluate");
      }
      if (status === 401 || status === 403) {
        throw new EnforceError2(`Authentication failed (HTTP ${status})`, "evaluate");
      }
      if (status === 429) {
        throw new EnforceError2("Rate limited (HTTP 429)", "evaluate");
      }
      if (status < 200 || status >= 300) {
        throw new EnforceError2(`Unexpected response (HTTP ${status})`, "evaluate");
      }
      let raw;
      try {
        raw = JSON.parse(body);
      } catch {
        throw new EnforceError2("Non-JSON response from AtlaSent API", "evaluate");
      }
      const decision = mapDecision(raw);
      if (decision.decision === "deny" && decision.denyCode === "INSUFFICIENT_APPROVALS" && config.onInsufficientApprovals && raw["signing_hint"] != null && typeof raw["signing_hint"] === "object") {
        const hint = raw["signing_hint"];
        let quorum;
        try {
          quorum = await config.onInsufficientApprovals(hint, decision.evaluationId);
        } catch {
          quorum = void 0;
        }
        if (quorum) {
          return evaluate2({ ...config, quorum, onInsufficientApprovals: void 0 });
        }
      }
      return decision;
    }
    function verify2(decision) {
      switch (decision.decision) {
        case "allow":
          return;
        case "deny":
          throw new EnforceError2(`Denied: ${decision.denyReason ?? "no reason provided"}`, "verify", decision);
        case "hold":
          throw new EnforceError2(`On hold: ${decision.holdReason ?? "awaiting approval"}`, "verify", decision);
        case "escalate":
          throw new EnforceError2("Escalated \u2014 manual review required", "verify", decision);
        default:
          throw new EnforceError2(`Unknown decision: ${String(decision.decision)}`, "verify", decision);
      }
    }
    var APPROVAL_POLL_INTERVAL_MS = 5e3;
    var CLAIMABLE_APPROVAL_STATUSES = /* @__PURE__ */ new Set(["approved", "approved_awaiting_claim"]);
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async function claimApprovalPermit(config, apiUrl, row) {
      const url = `${apiUrl}/v1/approvals/${encodeURIComponent(config.approvalId)}/claim-permit`;
      let requestBody = "{}";
      if (config.buildClaimBody) {
        let built;
        try {
          built = await config.buildClaimBody(row);
        } catch (err) {
          throw new EnforceError2(`Approval claim refused before sending: could not build the claim body (${err instanceof Error ? err.message : String(err)}) \u2014 failing closed`, "evaluate");
        }
        requestBody = JSON.stringify(built);
      }
      let status;
      let body;
      try {
        ({ status, body } = await (0, transport_1.post)(url, requestBody, runtimeHeaders(config, url)));
      } catch {
        return { claimFailure: "unreachable" };
      }
      let raw;
      try {
        const parsed = JSON.parse(body);
        raw = parsed && typeof parsed === "object" ? parsed : void 0;
      } catch {
        raw = void 0;
      }
      if (status !== 200) {
        const code = raw && typeof raw["error"] === "string" ? raw["error"] : `HTTP ${status}`;
        return { claimFailure: code };
      }
      if (!raw)
        return { claimFailure: "malformed_response" };
      const reEvaluationDecision = typeof raw["re_evaluation_decision"] === "string" ? raw["re_evaluation_decision"] : void 0;
      const permitToken = raw["permit_token"];
      if (raw["claimed"] !== true || typeof permitToken !== "string" || permitToken.length === 0) {
        return { claimFailure: "not_claimed", reEvaluationDecision };
      }
      const hash = raw["execution_hash_expected"];
      const reEvaluationId = raw["re_evaluation_id"];
      return {
        permitToken,
        reEvaluationDecision,
        executionHashExpected: typeof hash === "string" && hash.length > 0 ? hash : void 0,
        reEvaluationId: typeof reEvaluationId === "string" && reEvaluationId.length > 0 ? reEvaluationId : void 0
      };
    }
    async function waitForApprovalResolution2(config) {
      if (!config.approvalId) {
        throw new EnforceError2("Cannot wait for approval: no approvalRequestId on the hold/escalate decision", "evaluate");
      }
      const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
      const url = `${apiUrl}/v1/approvals/${encodeURIComponent(config.approvalId)}`;
      const deadline = Date.now() + config.maxWaitMs;
      while (Date.now() < deadline) {
        let status;
        let body;
        try {
          ({ status, body } = await (0, transport_1.get)(url, runtimeHeaders(config, url)));
        } catch {
          await sleep(APPROVAL_POLL_INTERVAL_MS);
          continue;
        }
        if (status === 401 || status === 403) {
          throw new EnforceError2(`Approval status poll: authentication failed (HTTP ${status})`, "evaluate");
        }
        if (status === 404) {
          throw new EnforceError2("Approval status poll: approval request not found", "evaluate");
        }
        if (status === 200) {
          let raw;
          try {
            raw = JSON.parse(body);
          } catch {
            await sleep(APPROVAL_POLL_INTERVAL_MS);
            continue;
          }
          const rowStatus = raw["status"];
          if (rowStatus && rowStatus !== "pending") {
            const polledReEvaluationDecision = raw["re_evaluation_decision"];
            if (!CLAIMABLE_APPROVAL_STATUSES.has(rowStatus)) {
              return { status: rowStatus, reEvaluationDecision: polledReEvaluationDecision };
            }
            const claimEnvironment = typeof raw["claim_environment"] === "string" ? raw["claim_environment"] : void 0;
            const claim = await claimApprovalPermit(config, apiUrl, { status: rowStatus, claimEnvironment });
            return {
              status: rowStatus,
              reEvaluationDecision: claim.reEvaluationDecision ?? polledReEvaluationDecision,
              permitToken: claim.permitToken,
              ...claim.executionHashExpected ? { executionHashExpected: claim.executionHashExpected } : {},
              ...claim.reEvaluationId ? { reEvaluationId: claim.reEvaluationId } : {},
              ...claim.claimFailure ? { claimFailure: claim.claimFailure } : {}
            };
          }
        }
        await sleep(APPROVAL_POLL_INTERVAL_MS);
      }
      throw new EnforceError2(`Approval wait timed out after ${config.maxWaitMs}ms with no human resolution \u2014 failing closed`, "evaluate");
    }
    exports2.CLOUD_LOCUS_CONTEXT_KEYS = ["aws", "azure"];
    async function postVerify(config, permitToken, decision) {
      const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
      const bodyObj = {
        permit_token: permitToken,
        action_type: config.action,
        actor_id: config.actor
      };
      if (config.environment != null)
        bodyObj["environment"] = config.environment;
      if (config.targetId != null)
        bodyObj["target_id"] = config.targetId;
      const payloadHash = decision?.executionHashExpected ?? config.executionPayloadHash;
      if (payloadHash != null)
        bodyObj["payload_hash"] = payloadHash;
      const locus = {};
      for (const key of exports2.CLOUD_LOCUS_CONTEXT_KEYS) {
        const value = config.context?.[key];
        if (value != null)
          locus[key] = value;
      }
      if (Object.keys(locus).length > 0)
        bodyObj["context"] = locus;
      const missing = (config.requiredBindings ?? []).filter((b) => bodyObj[b] == null || bodyObj[b] === "");
      if (missing.length > 0) {
        throw new EnforceError2(`verify-permit refused: required binding(s) absent: ${missing.join(", ")}`, "verify-permit", decision, { outcome: "invalid", verifyErrorCode: "MISSING_BINDING" });
      }
      let status;
      let body;
      try {
        ({ status, body } = await (0, transport_1.post)(`${apiUrl}/v1-verify-permit`, JSON.stringify(bodyObj), runtimeHeaders(config, apiUrl)));
      } catch (err) {
        throw new EnforceError2(`verify-permit unreachable: ${err instanceof Error ? err.message : String(err)}`, "verify-permit", decision);
      }
      if (status >= 500) {
        throw new EnforceError2(`verify-permit infrastructure failure (HTTP ${status})`, "verify-permit", decision);
      }
      if (status < 200 || status >= 300) {
        throw new EnforceError2(`verify-permit failed (HTTP ${status})`, "verify-permit", decision);
      }
      let raw;
      try {
        raw = JSON.parse(body);
      } catch {
        throw new EnforceError2("Non-JSON response from verify-permit", "verify-permit", decision);
      }
      const ok = raw.valid ?? raw.verified;
      return {
        verified: ok === true,
        outcome: raw.outcome,
        auditHash: raw.audit_entry_hash,
        verifyAuditHash: raw.verify_audit_hash,
        verifyErrorCode: raw.verify_error_code,
        mismatchFields: Array.isArray(raw.mismatch_fields) ? raw.mismatch_fields : void 0
      };
    }
    function requiredBindingsFor2(b) {
      const r = [];
      if (b.environment != null && b.environment !== "")
        r.push("environment");
      if (b.targetId != null && b.targetId !== "")
        r.push("target_id");
      if (b.executionPayloadHash != null && b.executionPayloadHash !== "")
        r.push("payload_hash");
      return r;
    }
    async function verifyPermit2(config, decision) {
      if (!decision.permitToken) {
        throw new EnforceError2("evaluate returned allow but no permit_token \u2014 refusing to execute without verifiable permit", "verify-permit", decision);
      }
      const r = await postVerify(config, decision.permitToken, decision);
      if (!r.verified) {
        throw new EnforceError2(`Permit verification failed (outcome=${r.outcome ?? "unknown"}${r.verifyErrorCode ? `, code=${r.verifyErrorCode}` : ""})`, "verify-permit", decision, { outcome: r.outcome, verifyErrorCode: r.verifyErrorCode, mismatchFields: r.mismatchFields });
      }
      return r;
    }
    async function reverifyPermit2(config, permitToken) {
      if (!permitToken || !permitToken.trim()) {
        throw new EnforceError2("no permit_token presented at execution boundary \u2014 refusing to execute", "verify-permit", null, { outcome: "invalid", verifyErrorCode: "MISSING_PERMIT" });
      }
      const r = await postVerify(config, permitToken, null);
      if (!r.verified) {
        throw new EnforceError2(`Permit re-verification failed at execution boundary (outcome=${r.outcome ?? "unknown"}${r.verifyErrorCode ? `, code=${r.verifyErrorCode}` : ""})`, "verify-permit", null, { outcome: r.outcome, verifyErrorCode: r.verifyErrorCode, mismatchFields: r.mismatchFields });
      }
      return r;
    }
    async function enforce(config, fn) {
      const decision = await evaluate2(config);
      verify2(decision);
      const vp = await verifyPermit2(config, decision);
      const result = await fn();
      return { result, decision, verifyOutcome: vp.outcome };
    }
    function mapDecision(raw) {
      return {
        decision: raw["decision"],
        // The real /v1-evaluate response field is `request_id` (see
        // v1-evaluate/handler.ts's `return json({ ..., request_id: effectiveRequestId, ... })`
        // — confirmed by direct source read; `evaluation_id` is never a key on the
        // HTTP response body, only an internal DB column name on approval_requests
        // and similar tables). Reading only `evaluation_id` left Decision.evaluationId
        // permanently undefined for every real evaluate call (#130). `evaluation_id`
        // is kept as a fallback in case an older or alternate response shape ever
        // emits it, same defensive-dual-name pattern this function already uses for
        // auditHash below.
        evaluationId: raw["request_id"] ?? raw["evaluation_id"],
        permitToken: raw["permit_token"],
        proofHash: raw["proof_hash"],
        executionHashExpected: raw["execution_hash_expected"] ?? raw["payload_hash"],
        riskScore: extractRiskScore(raw),
        denyReason: raw["deny_reason"],
        denyCode: raw["deny_code"],
        remediation: raw["remediation"],
        holdReason: raw["hold_reason"],
        risk_class: raw["risk_class"],
        authority_basis: raw["authority_basis"],
        escalation_id: raw["escalation_id"],
        approvalRequestId: raw["approval_request_id"],
        chainEntry: raw["chain_entry"] ?? null,
        snapshot: raw["snapshot"] ?? null,
        // Real wire field is `audit_entry_hash` (see v1-evaluate/handler.ts and
        // v1-verify-permit/handler.ts). `audit_hash` is accepted too in case an
        // older API build still emits it, but it does not exist on the current
        // response shape — reading only that name left the `audit-hash` action
        // output permanently empty.
        auditHash: raw["audit_entry_hash"] ?? raw["audit_hash"]
      };
    }
    function extractRiskScore(raw) {
      const risk = raw["risk"];
      if (risk && typeof risk === "object" && "score" in risk) {
        const score = risk.score;
        if (typeof score === "number")
          return score;
      }
      const flat = raw["risk_score"];
      if (typeof flat === "number")
        return flat;
      return void 0;
    }
    var functionRegion_2 = require_functionRegion();
    Object.defineProperty(exports2, "DEFAULT_FUNCTION_REGION", { enumerable: true, get: function() {
      return functionRegion_2.DEFAULT_FUNCTION_REGION;
    } });
    Object.defineProperty(exports2, "FUNCTION_REGION_ENV", { enumerable: true, get: function() {
      return functionRegion_2.FUNCTION_REGION_ENV;
    } });
    Object.defineProperty(exports2, "FUNCTION_REGION_HEADER", { enumerable: true, get: function() {
      return functionRegion_2.FUNCTION_REGION_HEADER;
    } });
    Object.defineProperty(exports2, "FunctionRegionConfigError", { enumerable: true, get: function() {
      return functionRegion_2.FunctionRegionConfigError;
    } });
    Object.defineProperty(exports2, "HOSTED_RUNTIME_HOSTS", { enumerable: true, get: function() {
      return functionRegion_2.HOSTED_RUNTIME_HOSTS;
    } });
    Object.defineProperty(exports2, "functionRegionHeaders", { enumerable: true, get: function() {
      return functionRegion_2.functionRegionHeaders;
    } });
    Object.defineProperty(exports2, "parseFunctionRegion", { enumerable: true, get: function() {
      return functionRegion_2.parseFunctionRegion;
    } });
    Object.defineProperty(exports2, "resolveFunctionRegion", { enumerable: true, get: function() {
      return functionRegion_2.resolveFunctionRegion;
    } });
  }
});

// src/index.ts
var tl = __toESM(require_task());

// src/gate.ts
var import_enforce = __toESM(require_dist());
var GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var RESOURCE_GROUP_RE = /^[-\w.()]{1,90}$/;
var DEPLOYMENT_NAME_RE = /^[-\w.()]{1,64}$/;
function resolveAzureLocus(subscriptionRaw, resourceGroupRaw, context, deploymentNameRaw) {
  let sub = (subscriptionRaw ?? "").trim();
  let rg = (resourceGroupRaw ?? "").trim();
  let fromContext;
  if (context["azure"] !== void 0) {
    const c = context["azure"];
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      throw new GateInputError("`context.azure` must be an object with subscription_id and resource_group");
    }
    fromContext = c;
  }
  if (!sub && !rg) {
    if (!fromContext) {
      if ((deploymentNameRaw ?? "").trim()) {
        throw new GateInputError("azureDeploymentName requires azureSubscriptionId and azureResourceGroup");
      }
      return void 0;
    }
    sub = typeof fromContext.subscription_id === "string" ? fromContext.subscription_id.trim() : "";
    rg = typeof fromContext.resource_group === "string" ? fromContext.resource_group.trim() : "";
    if (!sub || !rg) {
      throw new GateInputError("`context.azure` must carry both subscription_id and resource_group");
    }
  } else if (!sub || !rg) {
    throw new GateInputError("azureSubscriptionId and azureResourceGroup must be given together");
  }
  if (!GUID_RE.test(sub))
    throw new GateInputError("azureSubscriptionId must be a subscription GUID");
  if (!RESOURCE_GROUP_RE.test(rg) || rg.endsWith(".")) {
    throw new GateInputError("azureResourceGroup is not a valid Azure resource group name");
  }
  const locus = { subscription_id: sub.toLowerCase(), resource_group: rg.toLowerCase() };
  if (fromContext && (String(fromContext.subscription_id ?? "").trim().toLowerCase() !== locus.subscription_id || String(fromContext.resource_group ?? "").trim().toLowerCase() !== locus.resource_group)) {
    throw new GateInputError("`context.azure` disagrees with azureSubscriptionId/azureResourceGroup");
  }
  const fromInput = (deploymentNameRaw ?? "").trim();
  const ctxName = fromContext?.deployment_name;
  if (ctxName !== void 0 && typeof ctxName !== "string") {
    throw new GateInputError("`context.azure.deployment_name` must be a string");
  }
  const fromCtx = (ctxName ?? "").trim();
  if (fromInput && fromCtx && fromInput.toLowerCase() !== fromCtx.toLowerCase()) {
    throw new GateInputError("`context.azure.deployment_name` disagrees with azureDeploymentName");
  }
  const deploymentName = fromInput || fromCtx;
  if (deploymentName) {
    if (!DEPLOYMENT_NAME_RE.test(deploymentName)) {
      throw new GateInputError("azureDeploymentName is not a valid ARM deployment name (1-64 of letters, digits, _ - . ( ))");
    }
    return { ...locus, deployment_name: deploymentName };
  }
  return locus;
}
function runContext(run) {
  const out = {};
  for (const [k, v] of Object.entries(run ?? {})) {
    const t = (v ?? "").trim();
    if (t)
      out[k] = t;
  }
  return out;
}
var GateInputError = class extends Error {
};
function resolveEnvironment(explicit, apiKey, sourceBranch) {
  const trimmed = (explicit ?? "").trim();
  if (trimmed)
    return trimmed;
  if (apiKey.startsWith("ask_test_"))
    return "test";
  if (apiKey.startsWith("ask_live_"))
    return "live";
  const branch = (sourceBranch ?? "").replace(/^refs\/heads\//, "");
  return branch === "main" || branch === "master" ? "live" : "test";
}
function parseInputs(env) {
  const apiKey = (env.apiKey ?? "").trim();
  if (!apiKey) {
    throw new GateInputError(
      "Missing required environment variable: ATLASENT_API_KEY. Set it as a secret pipeline variable and map it into this task's environment, e.g. `env: { ATLASENT_API_KEY: $(AtlasentApiKey) }` on the task step."
    );
  }
  const action = (env.action ?? "").trim();
  if (!action) {
    throw new GateInputError("Missing required input: action");
  }
  const actor = (env.actor ?? "").trim() || (env.buildRequestedFor ?? "").trim() || (env.releaseRequestedFor ?? "").trim() || "unknown";
  const environment = resolveEnvironment(env.environment, apiKey, env.sourceBranch);
  let context = {};
  const contextRaw = (env.contextRaw ?? "").trim();
  if (contextRaw) {
    let parsed;
    try {
      parsed = JSON.parse(contextRaw);
    } catch {
      throw new GateInputError("`context` input is not valid JSON \u2014 expected a JSON object");
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new GateInputError("`context` input must be a JSON object");
    }
    context = parsed;
  }
  const azure = resolveAzureLocus(
    env.azureSubscriptionIdRaw,
    env.azureResourceGroupRaw,
    context,
    env.azureDeploymentNameRaw
  );
  if (azure)
    context = { ...context, azure };
  const run = runContext(env.run);
  if (Object.keys(run).length > 0 && context["azure_devops"] === void 0) {
    context = { ...context, azure_devops: run };
  }
  const approvalsFromRaw = (env.approvalsFromRaw ?? "none").trim().toLowerCase();
  const approvalsFrom = approvalsFromRaw === "pr-reviews" ? "pr-reviews" : "none";
  const waitForApproval = (env.waitForApprovalRaw ?? "false").trim().toLowerCase() === "true";
  const maxWaitMinutesParsed = parseInt((env.maxWaitMinutesRaw ?? "30").trim(), 10);
  const maxWaitMinutes = Number.isFinite(maxWaitMinutesParsed) && maxWaitMinutesParsed > 0 ? maxWaitMinutesParsed : 30;
  const mode = (env.modeRaw ?? "").trim().toLowerCase() === "evaluate-only" ? "evaluate-only" : "enforce";
  const verifyPermitOnly = (env.verifyPermitRaw ?? "false").trim().toLowerCase() === "true";
  const permitToken = (env.permitTokenRaw ?? "").trim() || void 0;
  if (verifyPermitOnly && !permitToken) {
    throw new GateInputError(
      "Missing required input: permitToken (required when verifyPermit is 'true' \u2014 pass the permitToken output from an earlier mode: evaluate-only task invocation)."
    );
  }
  return {
    apiKey,
    apiUrl: (env.apiUrl ?? "").trim() || void 0,
    action,
    actor,
    targetId: (env.targetId ?? "").trim() || void 0,
    environment,
    context,
    approvalsFrom,
    waitForApproval,
    maxWaitMinutes,
    mode,
    verifyPermitOnly,
    permitToken
  };
}
function emptyOutputs() {
  return {
    decision: "",
    verified: "false",
    permitToken: "",
    proofHash: "",
    riskScore: "",
    evaluationId: "",
    waitedForApproval: "false"
  };
}
function decisionOutputs(d, waitedForApproval) {
  return {
    decision: d.decision,
    verified: "false",
    permitToken: d.permitToken ?? "",
    proofHash: d.proofHash ?? "",
    riskScore: d.riskScore != null ? String(d.riskScore) : "",
    evaluationId: d.evaluationId ?? "",
    waitedForApproval: waitedForApproval ? "true" : "false"
  };
}
function describeError(err) {
  if (err instanceof import_enforce.EnforceError)
    return err.message;
  if (err instanceof Error)
    return err.message;
  return String(err);
}
async function runGate(inputs, log) {
  const config = {
    apiKey: inputs.apiKey,
    apiUrl: inputs.apiUrl,
    action: inputs.action,
    actor: inputs.actor,
    targetId: inputs.targetId,
    environment: inputs.environment,
    context: inputs.context,
    // Re-present every binding provided here at verify, or fail closed
    // (MISSING_BINDING) rather than silently drop it — same contract the
    // GitHub Action's single-eval path uses.
    requiredBindings: (0, import_enforce.requiredBindingsFor)({
      environment: inputs.environment,
      targetId: inputs.targetId
    })
  };
  if (inputs.verifyPermitOnly) {
    const permitToken = inputs.permitToken;
    log.info(
      `AtlaSent Gate: re-verifying permit at the execution boundary for "${inputs.action}" (actor=${inputs.actor}, environment=${inputs.environment}` + (inputs.targetId ? `, target=${inputs.targetId}` : "") + ")."
    );
    try {
      const r = await (0, import_enforce.reverifyPermit)(config, permitToken);
      log.info(
        `AtlaSent Gate: permit re-verified at the execution boundary` + (r.outcome ? ` (outcome=${r.outcome})` : "") + ". Proceeding."
      );
      return {
        ok: true,
        message: "AtlaSent Gate: permit re-verified at the execution boundary.",
        outputs: {
          decision: "allow",
          verified: "true",
          permitToken,
          proofHash: "",
          riskScore: "",
          evaluationId: "",
          waitedForApproval: "false"
        }
      };
    } catch (err) {
      return {
        ok: false,
        message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked at execution boundary (fail-closed).`,
        outputs: {
          decision: "deny",
          verified: "false",
          permitToken,
          proofHash: "",
          riskScore: "",
          evaluationId: "",
          waitedForApproval: "false"
        }
      };
    }
  }
  if (inputs.approvalsFrom === "pr-reviews") {
    log.warning(
      "approvalsFrom: pr-reviews is not implemented for Azure DevOps Pipelines in this v1 task \u2014 no approval count is auto-derived from Azure Repos pull request reviews. Pass context.approvals explicitly (e.g. from an Azure Repos PR API call in an earlier step) if your policy requires one. Proceeding as approvalsFrom: none."
    );
  }
  let decision;
  try {
    decision = await (0, import_enforce.evaluate)(config);
  } catch (err) {
    return {
      ok: false,
      message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked (fail-closed).`,
      outputs: emptyOutputs()
    };
  }
  log.info(
    `AtlaSent Gate: evaluating "${inputs.action}" for actor "${inputs.actor}" in ${inputs.environment} environment` + (inputs.targetId ? ` (target=${inputs.targetId})` : "") + ` -> decision=${decision.decision}` + (decision.evaluationId ? ` (evaluation_id=${decision.evaluationId})` : "")
  );
  let waitedForApproval = false;
  if (inputs.mode === "enforce" && inputs.waitForApproval && (decision.decision === "hold" || decision.decision === "escalate") && decision.approvalRequestId) {
    waitedForApproval = true;
    log.info(
      `AtlaSent Gate: authorization ${decision.decision.toUpperCase()} \u2014 waiting up to ${inputs.maxWaitMinutes}m for a human decision (approval_request_id=${decision.approvalRequestId}).`
    );
    let resolution;
    try {
      resolution = await (0, import_enforce.waitForApprovalResolution)({
        apiKey: inputs.apiKey,
        apiUrl: inputs.apiUrl,
        approvalId: decision.approvalRequestId,
        maxWaitMs: inputs.maxWaitMinutes * 6e4
      });
    } catch (err) {
      return {
        ok: false,
        message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked (fail-closed).`,
        outputs: decisionOutputs(decision, waitedForApproval)
      };
    }
    if (resolution.status !== "approved" || !resolution.permitToken) {
      const reason = `human approval resolved to '${resolution.status}'` + (resolution.reEvaluationDecision ? ` (fresh reevaluation: ${resolution.reEvaluationDecision})` : "") + " \u2014 deploy blocked (fail-closed).";
      return {
        ok: false,
        message: `AtlaSent Gate: Authorization DENIED: ${reason}`,
        outputs: decisionOutputs({ ...decision, decision: "deny", denyReason: reason }, waitedForApproval)
      };
    }
    decision = { ...decision, decision: "allow", permitToken: resolution.permitToken };
  }
  try {
    (0, import_enforce.verify)(decision);
  } catch (err) {
    return {
      ok: false,
      message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked (fail-closed).`,
      outputs: decisionOutputs(decision, waitedForApproval)
    };
  }
  if (inputs.mode === "evaluate-only") {
    const outputs2 = decisionOutputs(decision, waitedForApproval);
    log.info(
      "AtlaSent Gate: permit issued (not yet verified/consumed) \u2014 re-verify it at the execution boundary with verifyPermit: true before the protected step runs."
    );
    return { ok: true, message: "AtlaSent Gate: permit issued (evaluate-only mode).", outputs: outputs2 };
  }
  let verifyOutcome;
  try {
    const vp = await (0, import_enforce.verifyPermit)(config, decision);
    verifyOutcome = vp.outcome;
  } catch (err) {
    return {
      ok: false,
      message: `AtlaSent Gate: ${describeError(err)}. Deploy blocked (fail-closed).`,
      outputs: decisionOutputs(decision, waitedForApproval)
    };
  }
  const outputs = decisionOutputs(decision, waitedForApproval);
  outputs.verified = "true";
  log.info(
    `AtlaSent Gate: allowed and verified` + (verifyOutcome ? ` (outcome=${verifyOutcome})` : "") + "."
  );
  return { ok: true, message: "AtlaSent Gate: allowed and verified.", outputs };
}

// src/index.ts
var logger = {
  debug: (message) => tl.debug(message),
  info: (message) => console.log(message),
  warning: (message) => tl.warning(message),
  error: (message) => tl.error(message)
};
function setOutputs(outputs) {
  tl.setVariable("decision", outputs.decision, false, true);
  tl.setVariable("verified", outputs.verified, false, true);
  tl.setVariable("permitToken", outputs.permitToken, true, true);
  tl.setVariable("proofHash", outputs.proofHash, false, true);
  tl.setVariable("riskScore", outputs.riskScore, false, true);
  tl.setVariable("evaluationId", outputs.evaluationId, false, true);
  tl.setVariable("waitedForApproval", outputs.waitedForApproval, false, true);
  console.log(`##vso[task.setvariable variable=decision;isOutput=true]${outputs.decision}`);
  console.log(`##vso[task.setvariable variable=verified;isOutput=true]${outputs.verified}`);
  console.log(
    `##vso[task.setvariable variable=permitToken;isOutput=true;issecret=true]${outputs.permitToken}`
  );
  console.log(`##vso[task.setvariable variable=proofHash;isOutput=true]${outputs.proofHash}`);
  console.log(`##vso[task.setvariable variable=riskScore;isOutput=true]${outputs.riskScore}`);
  console.log(`##vso[task.setvariable variable=evaluationId;isOutput=true]${outputs.evaluationId}`);
  console.log(
    `##vso[task.setvariable variable=waitedForApproval;isOutput=true]${outputs.waitedForApproval}`
  );
}
async function main() {
  const rawApiKey = process.env["ATLASENT_API_KEY"];
  if (rawApiKey) {
    tl.setSecret(rawApiKey);
  }
  const rawPermitToken = tl.getInput("permitToken", false);
  if (rawPermitToken) {
    tl.setSecret(rawPermitToken);
  }
  const env = {
    apiKey: rawApiKey,
    apiUrl: tl.getInput("apiUrl", false) || process.env["ATLASENT_BASE_URL"],
    action: tl.getInput("action", false),
    actor: tl.getInput("actor", false),
    targetId: tl.getInput("targetId", false),
    environment: tl.getInput("environment", false),
    contextRaw: tl.getInput("context", false),
    approvalsFromRaw: tl.getInput("approvalsFrom", false),
    waitForApprovalRaw: tl.getInput("waitForApproval", false),
    maxWaitMinutesRaw: tl.getInput("maxWaitMinutes", false),
    modeRaw: tl.getInput("mode", false),
    verifyPermitRaw: tl.getInput("verifyPermit", false),
    permitTokenRaw: tl.getInput("permitToken", false),
    // Predefined variables — present on classic/YAML build pipelines and
    // classic release pipelines respectively. tl.getVariable translates the
    // dotted name to the underlying env var (BUILD_REQUESTEDFOR /
    // RELEASE_REQUESTEDFOR) for us.
    buildRequestedFor: tl.getVariable("Build.RequestedFor"),
    releaseRequestedFor: tl.getVariable("Release.RequestedFor"),
    sourceBranch: tl.getVariable("Build.SourceBranch"),
    azureSubscriptionIdRaw: tl.getInput("azureSubscriptionId", false),
    azureResourceGroupRaw: tl.getInput("azureResourceGroup", false),
    azureDeploymentNameRaw: tl.getInput("azureDeploymentName", false),
    run: {
      organization_url: tl.getVariable("System.CollectionUri"),
      project: tl.getVariable("System.TeamProject"),
      pipeline: tl.getVariable("Build.DefinitionName"),
      run_id: tl.getVariable("Build.BuildId"),
      repository: tl.getVariable("Build.Repository.Name"),
      commit: tl.getVariable("Build.SourceVersion")
    }
  };
  let inputs;
  try {
    inputs = parseInputs(env);
  } catch (err) {
    setOutputs({
      decision: "",
      verified: "false",
      permitToken: "",
      proofHash: "",
      riskScore: "",
      evaluationId: "",
      waitedForApproval: "false"
    });
    const message = err instanceof GateInputError ? `AtlaSent Gate: ${err.message}` : `AtlaSent Gate: unexpected input error: ${err instanceof Error ? err.message : String(err)}`;
    tl.setResult(tl.TaskResult.Failed, message);
    return;
  }
  const result = await runGate(inputs, logger);
  setOutputs(result.outputs);
  tl.setResult(result.ok ? tl.TaskResult.Succeeded : tl.TaskResult.Failed, result.message);
}
main().catch((err) => {
  tl.setResult(
    tl.TaskResult.Failed,
    `AtlaSent Gate: unexpected error: ${err instanceof Error ? err.message : String(err)}. Deploy blocked (fail-closed).`
  );
});
/*! Bundled license information:

q/q.js:
  (*!
   *
   * Copyright 2009-2017 Kris Kowal under the terms of the MIT
   * license found at https://github.com/kriskowal/q/blob/v1/LICENSE
   *
   * With parts by Tyler Close
   * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
   * at http://www.opensource.org/licenses/mit-license.html
   * Forked at ref_send.js version: 2009-05-11
   *
   * With parts by Mark Miller
   * Copyright (C) 2011 Google Inc.
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   * http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *
   *)
*/
