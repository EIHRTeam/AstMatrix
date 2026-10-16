/* Conservative bootstrap syntax; no browser-version inference from User-Agent. */
(function () {
  try {
    var cs = new CSInterface();
    var host = cs.getHostEnvironment();
    var cep = cs.getCurrentApiVersion();
    // The native bridge can return decimal strings even though CSInterface documents numbers.
    var rawCepMajor = cep.major;
    var cepMajor =
      typeof rawCepMajor === 'number' ||
      (typeof rawCepMajor === 'string' && /^\d+$/.test(rawCepMajor))
        ? Number(rawCepMajor)
        : NaN;
    var parts = host.appVersion.split('.');
    var major = Number(parts[0]),
      minor = Number(parts[1] || 0),
      patch = Number(parts[2] || 0);
    var expected =
      major >= 30 || (major === 29 && (minor > 5 || (minor === 5 && patch >= 1))) ? 12 : 11;
    if (
      host.appId !== 'ILST' ||
      !isFinite(major) ||
      major < 27 ||
      major > 30 ||
      cepMajor !== expected ||
      typeof Promise !== 'function' ||
      typeof Map !== 'function' ||
      typeof URL !== 'function'
    )
      throw new Error(
        '不支持的 Illustrator / CEP 环境：' + host.appVersion + ' / CEP ' + cep.major,
      );
    window.location.replace('../web/cep' + expected + '/index.html');
  } catch (error) {
    document.getElementById('status').textContent = 'AstMatrix 无法启动：' + String(error);
  }
})();
