import { afterEach, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm, cp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { validatePayload, checkCompilerVersion, compilePayloadInstallers } from './build.mjs';
import { readZip, safeRelative } from './zip.mjs';
import {
  digest,
  releaseVersion,
  verifyInventory,
  archiveName,
  illustratorCertificateFingerprintName,
  illustratorZxpName,
  installerName,
  installerArchitectures,
} from '../artifacts.mjs';
import { assembleRelease } from '../verify-release.mjs';

const directories: string[] = [];

it('detects the compiler engine without relying on the PE ProductVersion resource', () => {
  const calls: unknown[] = [];
  const version = checkCompilerVersion('C:\\Inno Setup 7\\ISCC.exe', (file, args, options) => {
    calls.push({ file, args, options });
    return '7.1.1\r\n';
  });
  expect(version).toBe('7.1.1');
  expect(calls).toEqual([
    {
      file: 'C:\\Inno Setup 7\\ISCC.exe',
      args: ['--version'],
      options: { encoding: 'utf8' },
    },
  ]);
});

it.each(['6.7.4', '7.1.0', '7.1.10', '7.2.0', '0.0.0'])('rejects compiler engine %s', (version) => {
  expect(() => checkCompilerVersion('ISCC.exe', () => `${version}\r\n`)).toThrow(
    'Expected Inno Setup compiler engine 7.1.1',
  );
});

it('does not mistake the major-version help banner for an engine version', () => {
  expect(() =>
    checkCompilerVersion(
      'ISCC.exe',
      () => 'Inno Setup 7 Command-Line Compiler\r\nUsage: iscc [options] scriptfile.iss',
    ),
  ).toThrow('did not report its compiler engine version');
});

it('propagates a failed compiler version query', () => {
  expect(() =>
    checkCompilerVersion('ISCC.exe', () => {
      throw new Error('ISCmplr.dll could not load');
    }),
  ).toThrow('ISCmplr.dll could not load');
});
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'astmatrix-packaging-'));
  directories.push(directory);
  return directory;
}

it('preserves x64 download names and distinguishes the aarch64 installers', () => {
  expect(installerName('Illustrator', '0.1.2')).toBe('AstMatrix-Illustrator-0.1.2-Setup.exe');
  expect(installerName('Photoshop', '0.1.2', 'x64')).toBe('AstMatrix-Photoshop-0.1.2-Setup.exe');
  expect(installerName('Illustrator', '0.1.2', 'aarch64')).toBe(
    'AstMatrix-Illustrator-0.1.2-aarch64-Setup.exe',
  );
  // Invalid architectures must not silently select x64.
  expect(() => installerName('Photoshop', '0.1.2', 'arm32' as 'x64')).toThrow(
    'Unsupported installer architecture',
  );
});

it.each(['Illustrator', 'Photoshop'])(
  'compiles both %s target architectures from the same payload',
  async (host) => {
    const output = await temporary();
    const calls: string[][] = [];
    const names = await compilePayloadInstallers(
      'ISCC.exe',
      host,
      '0.1.2',
      'payload',
      'archive.ccx',
      output,
      (_file, args) => {
        calls.push(args);
        const name = args.find((arg) => arg.startsWith('/F'))!.slice(2) + '.exe';
        const bytes = Buffer.alloc(2048);
        bytes.write('MZ');
        writeFileSync(path.join(output, name), bytes);
      },
    );
    expect(names).toEqual(
      installerArchitectures.map((architecture) => installerName(host, '0.1.2', architecture)),
    );
    expect(calls).toHaveLength(2);
    for (const [index, architecture] of installerArchitectures.entries()) {
      expect(calls[index]).toEqual(
        expect.arrayContaining([
          `/DTargetArchitecture=${architecture}`,
          '/DPayloadDir=payload',
          '/DArchivePath=archive.ccx',
          `/F${installerName(host, '0.1.2', architecture).slice(0, -4)}`,
        ]),
      );
    }
  },
);

it('rejects an invalid aarch64 compiler output', async () => {
  const output = await temporary();
  await expect(
    compilePayloadInstallers(
      'ISCC.exe',
      'Illustrator',
      '0.1.2',
      'payload',
      'archive',
      output,
      (_file, args) => {
        const name = args.find((arg) => arg.startsWith('/F'))!.slice(2) + '.exe';
        const bytes = Buffer.alloc(2048);
        if (args.includes('/DTargetArchitecture=x64')) bytes.write('MZ');
        writeFileSync(path.join(output, name), bytes);
      },
    ),
  ).rejects.toThrow('Invalid installer executable: AstMatrix-Illustrator-0.1.2-aarch64-Setup.exe');
});

function zip(entries: [string, string][], method = 8) {
  const locals: Buffer[] = [];
  const records: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const filename = Buffer.from(name);
    const data = Buffer.from(text);
    const packed = method === 8 ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(crc32(data), 16);
    record.writeUInt32LE(packed.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);
    locals.push(local, filename, packed);
    records.push(record, filename);
    offset += local.length + filename.length + packed.length;
  }
  const central = Buffer.concat(records);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

function payload(host: 'Illustrator' | 'Photoshop') {
  const names = [
    'LICENSE',
    'PRIVACY.md',
    'README.md',
    'licenses/BWIP-JS-MIT.txt',
    'licenses/OCR-A-NOTICE.txt',
    'licenses/OCR-B-NOTICE.txt',
    `Installation_Guide_${host}.txt`,
    ...(host === 'Illustrator'
      ? [
          'bootstrap/index.html',
          'jsx/astmatrix.jsx',
          'vendor/CSInterface.js',
          'web/cep11/index.html',
          'web/cep12/index.html',
        ]
      : [
          'index.html',
          'index.js',
          'index.css',
          'icons/list@1x.png',
          'icons/list@2x.png',
          'icons/panel@1x.png',
          'icons/panel@2x.png',
          'webview/index.html',
        ]),
  ];
  const files = new Map(names.map((name) => [name, Buffer.from('fixture')]));
  if (host === 'Illustrator')
    files.set(
      'CSXS/manifest.xml',
      Buffer.from(
        '<ExtensionManifest ExtensionBundleVersion="0.1.2"><Host Version="[27.0,30.9]" /></ExtensionManifest>',
      ),
    );
  else
    files.set(
      'manifest.json',
      Buffer.from(
        JSON.stringify({
          id: '1f4db629',
          version: '0.1.2',
          host: { app: 'PS', minVersion: '26.0.0' },
          requiredPermissions: { webview: { enableMessageBridge: 'localOnly' } },
        }),
      ),
    );
  files.set(
    'host-build-info.json',
    Buffer.from(
      JSON.stringify({
        target: host === 'Illustrator' ? 'illustrator-cep' : 'photoshop-uxp-webview',
        artifacts: [...files].map(([name, bytes]) => ({ path: name, sha256: digest(bytes) })),
      }),
    ),
  );
  return files;
}

it.each([0, 8])('reads ZIP method %s without changing payload bytes', (method) => {
  expect(
    readZip(
      zip(
        [
          ['manifest.json', '{"version":"0.1.2"}'],
          ['web/index.js', 'test'],
        ],
        method,
      ),
    )
      .get('web/index.js')
      ?.toString(),
  ).toBe('test');
});
it.each([
  '../escape',
  '/absolute',
  'C:/escape',
  'folder\\escape',
  'CON.txt',
  'name.',
  'folder/../file',
  'a//b',
])('rejects unsafe archive path %s', (name) => {
  expect(() => safeRelative(name)).toThrow('Unsafe ZIP path');
});
it('rejects duplicates, file/directory collisions and truncated ZIPs', () => {
  expect(() =>
    readZip(
      zip([
        ['a', 'one'],
        ['A', 'two'],
      ]),
    ),
  ).toThrow('Duplicate');
  expect(() =>
    readZip(
      zip([
        ['a', 'one'],
        ['a/b', 'two'],
      ]),
    ),
  ).toThrow('collision');
  expect(() => readZip(zip([['a', 'one']]).subarray(0, 30))).toThrow('ZIP end record');
});
it('rejects corrupt payload data', () => {
  const bytes = zip([['a', 'one']], 0);
  bytes[31] = 0;
  expect(() => readZip(bytes)).toThrow('CRC');
});
it.each(['Illustrator', 'Photoshop'] as const)(
  'validates %s payload identity, resources and hashes',
  (host) => {
    const files = payload(host);
    expect(() => validatePayload(host, files, '0.1.2')).not.toThrow();
    expect(() => validatePayload(host, files, '0.1.3')).toThrow('version mismatch');
    const missing = new Map(files);
    missing.delete('LICENSE');
    expect(() => validatePayload(host, missing, '0.1.2')).toThrow('Missing');
    files.set('README.md', Buffer.from('corrupt'));
    expect(() => validatePayload(host, files, '0.1.2')).toThrow('hash mismatch');
  },
);
it('rejects a wrapper directory and a native Photoshop package', () => {
  const wrapped = new Map(
    [...payload('Illustrator')].map(([name, bytes]) => [`AstMatrix/${name}`, bytes]),
  );
  expect(() => validatePayload('Illustrator', wrapped, '0.1.2')).toThrow(
    'CEP payload version mismatch',
  );
  const native = payload('Photoshop');
  const manifest = JSON.parse(native.get('manifest.json')!.toString());
  manifest.host.minVersion = '24.0.0';
  native.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  expect(() => validatePayload('Photoshop', native, '0.1.2')).toThrow('26.0.0');
});
it('rejects artifact substitution across commits, versions and bytes', async () => {
  const directory = await temporary();
  await writeFile(path.join(directory, 'plugin.ccx'), 'payload');
  const info = {
    schemaVersion: 1,
    commit: 'abc',
    version: '0.1.2',
    artifacts: [{ name: 'plugin.ccx', sha256: digest(Buffer.from('payload')) }],
  };
  await expect(verifyInventory(directory, info, '0.1.2', 'abc')).resolves.toBeUndefined();
  await expect(verifyInventory(directory, info, '0.1.3', 'abc')).rejects.toThrow('version');
  await expect(verifyInventory(directory, info, '0.1.2', 'def')).rejects.toThrow('commit');
  await writeFile(path.join(directory, 'plugin.ccx'), 'other');
  await expect(verifyInventory(directory, info, '0.1.2', 'abc')).rejects.toThrow('hash');
});
it('shares release manifest version validation with manual builds', async () => {
  const directory = await temporary();
  await mkdir(path.join(directory, 'apps'), { recursive: true });
  for (const host of ['illustrator-cep', 'photoshop-uxp']) {
    await cp(`apps/${host}`, path.join(directory, 'apps', host), {
      recursive: true,
      filter: (source) => !source.includes('/dist') && !source.includes('/node_modules'),
    });
  }
  await cp('package.json', path.join(directory, 'package.json'));
  const version = await releaseVersion(directory);
  const file = path.join(directory, 'apps/photoshop-uxp/manifest-webview.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.version = '99.0.0';
  await writeFile(file, JSON.stringify(manifest));
  expect(version).toBe(JSON.parse(await readFile('package.json', 'utf8')).version);
  await expect(releaseVersion(directory)).rejects.toThrow('version mismatch');
});

it('publishes ZXP and its certificate fingerprint and rejects mismatches', async () => {
  const directory = await temporary();
  const packages = path.join(directory, 'packages');
  const installers = path.join(directory, 'installers');
  const signed = path.join(directory, 'signed');
  const output = path.join(directory, 'output');
  await mkdir(packages);
  await mkdir(installers);
  await mkdir(signed);
  const version = '0.1.2';
  const archives = ['Illustrator', 'Photoshop', 'Figma'].map((host) => archiveName(host, version));
  const zxp = illustratorZxpName(version);
  const fingerprint = illustratorCertificateFingerprintName(version);
  const exes = ['Illustrator', 'Photoshop'].flatMap((host) =>
    installerArchitectures.map((architecture) => installerName(host, version, architecture)),
  );
  const bytes = Buffer.from('fixture only');
  const fingerprintBytes = Buffer.from(`SHA-256 (X.509 certificate): ${'AA:'.repeat(31)}AA\n`);
  for (const name of archives) await writeFile(path.join(packages, name), bytes);
  for (const name of exes) await writeFile(path.join(installers, name), bytes);
  await writeFile(path.join(signed, zxp), bytes);
  await writeFile(path.join(signed, fingerprint), fingerprintBytes);
  const payloadInfo = {
    version,
    commit: 'abc',
    artifacts: archives.map((name) => ({ name, sha256: digest(bytes) })),
  };
  const installerInfo = {
    version,
    commit: 'abc',
    artifacts: exes.map((name) => ({ name, sha256: digest(bytes) })),
    payloadArtifacts: payloadInfo.artifacts,
  };
  const signedInfo = {
    version,
    commit: 'abc',
    sourceArtifact: payloadInfo.artifacts.find(
      (entry) => entry.name === archiveName('Illustrator', version),
    ),
    artifacts: [
      { name: zxp, sha256: digest(bytes) },
      { name: fingerprint, sha256: digest(fingerprintBytes) },
    ],
  };
  await writeFile(path.join(packages, 'payload-info.json'), JSON.stringify(payloadInfo));
  await writeFile(path.join(installers, 'installer-info.json'), JSON.stringify(installerInfo));
  await writeFile(path.join(signed, 'signed-info.json'), JSON.stringify(signedInfo));
  await assembleRelease(packages, installers, signed, output, version, 'abc');
  expect((await readdir(output)).sort()).toEqual(
    [
      ...archives.filter((name) => name !== archiveName('Illustrator', version)),
      ...exes,
      zxp,
      fingerprint,
    ].sort(),
  );
  const completeArtifacts = installerInfo.artifacts;
  installerInfo.artifacts = completeArtifacts.filter((entry) => !entry.name.includes('-aarch64-'));
  await writeFile(path.join(installers, 'installer-info.json'), JSON.stringify(installerInfo));
  await expect(
    assembleRelease(packages, installers, signed, output, version, 'abc'),
  ).rejects.toThrow('Installer architecture set mismatch');
  installerInfo.artifacts = completeArtifacts;
  const armName = installerName('Photoshop', version, 'aarch64');
  await writeFile(path.join(installers, 'installer-info.json'), JSON.stringify(installerInfo));
  await writeFile(path.join(installers, armName), 'tampered ARM installer');
  await expect(
    assembleRelease(packages, installers, signed, output, version, 'abc'),
  ).rejects.toThrow(`Artifact hash mismatch: ${armName}`);
  await writeFile(path.join(installers, armName), bytes);
  installerInfo.payloadArtifacts = [];
  await writeFile(path.join(installers, 'installer-info.json'), JSON.stringify(installerInfo));
  await expect(
    assembleRelease(packages, installers, signed, output, version, 'abc'),
  ).rejects.toThrow('different payloads');
  installerInfo.payloadArtifacts = payloadInfo.artifacts;
  await writeFile(path.join(installers, 'installer-info.json'), JSON.stringify(installerInfo));
  signedInfo.sourceArtifact = { name: archiveName('Illustrator', version), sha256: 'wrong' };
  await writeFile(path.join(signed, 'signed-info.json'), JSON.stringify(signedInfo));
  await expect(
    assembleRelease(packages, installers, signed, output, version, 'abc'),
  ).rejects.toThrow('different Illustrator payload');
  signedInfo.sourceArtifact = payloadInfo.artifacts[0];
  await writeFile(path.join(signed, 'signed-info.json'), JSON.stringify(signedInfo));
  await writeFile(path.join(signed, zxp), 'tampered ZXP');
  await expect(
    assembleRelease(packages, installers, signed, output, version, 'abc'),
  ).rejects.toThrow(`Artifact hash mismatch: ${zxp}`);
  await writeFile(path.join(signed, zxp), bytes);
  const invalidFingerprint = Buffer.from('SHA-256 (X.509 certificate): invalid\n');
  await writeFile(path.join(signed, fingerprint), invalidFingerprint);
  signedInfo.artifacts[1] = { name: fingerprint, sha256: digest(invalidFingerprint) };
  await writeFile(path.join(signed, 'signed-info.json'), JSON.stringify(signedInfo));
  await expect(
    assembleRelease(packages, installers, signed, output, version, 'abc'),
  ).rejects.toThrow('Invalid Illustrator certificate fingerprint');
});
