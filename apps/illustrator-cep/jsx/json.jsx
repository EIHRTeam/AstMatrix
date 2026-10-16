/* Strict JSON codec for ES3. Never eval user data. */
if (!$._astmatrix) $._astmatrix = {};
$._astmatrix.json = (function () {
    function quote(s) {
        return '"' + s.replace(/["\\\x00-\x1f\u2028\u2029]/g, function (c) {
            var h = c.charCodeAt(0).toString(16);
            return '\\u' + ('0000' + h).slice(-4);
        }) + '"';
    }
    function stringify(v) {
        var i, parts = [], key;
        if (v === null) return 'null';
        if (typeof v === 'string') return quote(v);
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'number' && isFinite(v)) return String(v);
        if (v instanceof Array) {
            for (i = 0; i < v.length; i++) parts.push(stringify(v[i]));
            return '[' + parts.join(',') + ']';
        }
        if (v && typeof v === 'object') {
            for (key in v) if (v.hasOwnProperty(key)) parts.push(quote(key) + ':' + stringify(v[key]));
            return '{' + parts.join(',') + '}';
        }
        throw new Error('Non-JSON value');
    }
    function parse(s) {
        var at = 0, depth = 0;
        function fail() { throw new Error('Invalid JSON at ' + at); }
        function white() { while (/[ \t\r\n]/.test(s.charAt(at)) && at < s.length) at++; }
        function string() {
            var out = '', c, e, h;
            if (s.charAt(at++) !== '"') fail();
            while (at < s.length) {
                c = s.charAt(at++);
                if (c === '"') return out;
                if (c === '\\') {
                    e = s.charAt(at++);
                    if (e === 'u') {
                        h = s.substr(at, 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) fail();
                        out += String.fromCharCode(parseInt(h, 16)); at += 4;
                    } else if (e === '"' || e === '\\' || e === '/') out += e;
                    else if (e === 'b') out += '\b'; else if (e === 'f') out += '\f';
                    else if (e === 'n') out += '\n'; else if (e === 'r') out += '\r';
                    else if (e === 't') out += '\t'; else fail();
                } else { if (c.charCodeAt(0) < 32) fail(); out += c; }
            }
            fail();
        }
        function value() {
            white(); if (++depth > 100) fail();
            var c = s.charAt(at), result, key, match;
            if (c === '"') result = string();
            else if (c === '{' || c === '[') {
                var object = c === '{'; result = object ? {} : []; at++; white();
                var close = object ? '}' : ']';
                if (s.charAt(at) === close) at++;
                else while (true) {
                    white();
                    if (object) {
                        key = string(); if (key === '__proto__' || key === 'constructor' || key === 'prototype' || result.hasOwnProperty(key)) fail();
                        white(); if (s.charAt(at++) !== ':') fail(); result[key] = value();
                    } else result.push(value());
                    white(); c = s.charAt(at++); if (c === close) break; if (c !== ',') fail();
                }
            } else if (s.substr(at, 4) === 'true') { at += 4; result = true; }
            else if (s.substr(at, 5) === 'false') { at += 5; result = false; }
            else if (s.substr(at, 4) === 'null') { at += 4; result = null; }
            else {
                match = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(s.substr(at));
                if (!match) fail(); at += match[0].length; result = Number(match[0]); if (!isFinite(result)) fail();
            }
            depth--; return result;
        }
        var result = value(); white(); if (at !== s.length) fail(); return result;
    }
    return { parse: parse, stringify: stringify };
})();
