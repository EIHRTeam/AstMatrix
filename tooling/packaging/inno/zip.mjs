// Deliberately bounded ZIP reader for our small, non-ZIP64 release packages.
import assert from 'node:assert/strict';
import { inflateRawSync, crc32 } from 'node:zlib';

export function safeRelative(name) {
  // oxlint-disable-next-line no-control-regex -- ZIP filenames cannot contain Windows control characters.
  assert(name && !/[\\:\x00-\x1f]/.test(name) && !name.startsWith('/'), `Unsafe ZIP path: ${name}`);
  assert(
    name
      .split('/')
      .every(
        (part) =>
          part &&
          part !== '.' &&
          part !== '..' &&
          !/[. ]$/.test(part) &&
          !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      ),
    `Unsafe ZIP path: ${name}`,
  );
  return name;
}

export function readZip(bytes) {
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (
      bytes.readUInt32LE(end) === 0x06054b50 &&
      end + 22 + bytes.readUInt16LE(end + 20) === bytes.length
    )
      break;
  }
  assert(end >= 0 && end >= bytes.length - 65557, 'ZIP end record missing');
  assert.equal(bytes.readUInt16LE(end + 4), 0, 'Multi-disk ZIP unsupported');
  assert.equal(bytes.readUInt16LE(end + 6), 0, 'Multi-disk ZIP unsupported');
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  assert(count > 0 && count < 10000, 'Invalid ZIP entry count');
  let cursor = bytes.readUInt32LE(end + 16);
  const centralEnd = cursor + bytes.readUInt32LE(end + 12);
  assert.equal(centralEnd, end, 'Invalid ZIP central directory');
  const files = new Map();
  const seen = new Set();
  let total = 0;
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, 'Invalid ZIP entry');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    const local = bytes.readUInt32LE(cursor + 42);
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const directory = rawName.endsWith('/');
    const name = safeRelative(directory ? rawName.slice(0, -1) : rawName);
    assert(!seen.has(name.toLowerCase()), `Duplicate ZIP path: ${name}`);
    seen.add(name.toLowerCase());
    assert((mode & 0xf000) !== 0xa000, 'ZIP symlinks unsupported');
    assert(!(flags & 1) && [0, 8].includes(method), 'Encrypted or unsupported ZIP entry');
    total += size;
    assert(total <= 256 * 1024 * 1024, 'ZIP payload exceeds 256 MiB');
    assert.equal(bytes.readUInt32LE(local), 0x04034b50, 'Invalid local ZIP entry');
    const localNameLength = bytes.readUInt16LE(local + 26);
    assert.equal(
      bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8'),
      rawName,
    );
    const start = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    assert(start + compressed <= bytes.readUInt32LE(end + 16), 'Overlapping ZIP data');
    if (!directory) {
      const input = bytes.subarray(start, start + compressed);
      const data =
        method === 8 ? inflateRawSync(input, { maxOutputLength: Math.max(1, size) }) : input;
      assert.equal(data.length, size, `ZIP size mismatch: ${name}`);
      assert.equal(crc32(data), crc, `ZIP CRC mismatch: ${name}`);
      files.set(name, data);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, centralEnd);
  for (const name of files.keys()) {
    const parts = name.split('/');
    parts.pop();
    while (parts.length) {
      assert(
        ![...files.keys()].some((key) => key.toLowerCase() === parts.join('/').toLowerCase()),
        'ZIP file/directory collision',
      );
      parts.pop();
    }
  }
  return files;
}
