/* M0 storage equality helper. ES3 syntax, no JSON/DOM/Node/host dependency. */
function utf8Bytes(text) {
  var bytes = [];
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      var low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
        i++;
      } else code = 0xfffd;
    } else if (code >= 0xdc00 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63)
      );
  }
  return bytes;
}
function fingerprint(text) {
  var bytes = utf8Bytes(text);
  var value = 0x811c9dc5;
  for (var i = 0; i < bytes.length; i++) {
    value ^= bytes[i];
    // FNV-1a multiplication modulo 2^32, without Math.imul (absent in ExtendScript).
    value =
      (value + (value << 1) + (value << 4) + (value << 7) + (value << 8) + (value << 24)) >>> 0;
  }
  var hex = value.toString(16);
  return ('00000000' + hex).slice(-8);
}
function fixture(baseJson, prefix, targetBytes) {
  if (
    typeof baseJson !== 'string' ||
    baseJson.charAt(0) !== '{' ||
    baseJson.charAt(baseJson.length - 1) !== '}'
  )
    throw new Error('Expected serialized metadata object');
  if (
    typeof prefix !== 'string' ||
    !(targetBytes > 0) ||
    targetBytes !== Math.floor(targetBytes) ||
    targetBytes > 1048576
  )
    throw new Error('Invalid storage fixture size/prefix');
  var separator = baseJson.slice(1, -1).replace(/\s/g, '').length ? ',' : '';
  var header =
    prefix +
    baseJson.slice(0, -1) +
    separator +
    '"m0StorageProbe":{"id":"m0-storage-16k-v1","unicode":"\u5143\u6570\u636e\ud83d\ude00","padding":"';
  var tail = '"}}';
  var count = targetBytes - utf8Bytes(header + tail).length;
  if (count < 0) throw new Error('Base metadata exceeds target storage size');
  var padding = '';
  var chunk = 'A';
  while (count) {
    if (count % 2) padding += chunk;
    count = Math.floor(count / 2);
    if (count) chunk += chunk;
  }
  return header + padding + tail;
}
function compare(actual, expected) {
  if (typeof expected !== 'string') throw new Error('Expected storage text is required');
  var actualIsText = typeof actual === 'string';
  var firstDifference = null;
  if (actualIsText && actual !== expected) {
    var length = Math.max(actual.length, expected.length);
    for (var i = 0; i < length; i++) {
      if (actual.charAt(i) !== expected.charAt(i)) {
        firstDifference = i;
        break;
      }
    }
  }
  return {
    status: actualIsText && actual === expected ? 'pass' : 'fail',
    exactMatch: actualIsText && actual === expected,
    expectedBytes: utf8Bytes(expected).length,
    actualBytes: actualIsText ? utf8Bytes(actual).length : null,
    expectedChars: expected.length,
    actualChars: actualIsText ? actual.length : null,
    expectedFingerprint: fingerprint(expected),
    actualFingerprint: actualIsText ? fingerprint(actual) : null,
    fingerprintAlgorithm: 'FNV-1a UTF-8 (diagnostic only; pass requires exact string equality)',
    firstDifferenceUtf16Index: firstDifference
  };
}
function summary(result) {
  return (
    'status=' +
    result.status +
    '; exactMatch=' +
    result.exactMatch +
    '; expectedBytes=' +
    result.expectedBytes +
    '; actualBytes=' +
    result.actualBytes +
    '; expectedChars=' +
    result.expectedChars +
    '; actualChars=' +
    result.actualChars +
    '; expectedFNV1a=' +
    result.expectedFingerprint +
    '; actualFNV1a=' +
    result.actualFingerprint +
    '; firstDifferenceUtf16Index=' +
    result.firstDifferenceUtf16Index
  );
}
module.exports = {
  utf8Bytes: utf8Bytes,
  fingerprint: fingerprint,
  fixture: fixture,
  compare: compare,
  summary: summary
};
