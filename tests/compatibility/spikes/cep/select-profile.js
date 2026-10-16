/* oxlint-disable no-unused-vars -- Classic script exposes this function to bootstrap.html and the VM regression test. */
/* exported selectM0Profile */
/* Bootstrap logic testable without a real host; ES3 syntax only. */
function selectM0Profile(cep, host) {
  if (host.appId !== 'ILST') throw new Error('Illustrator required');
  var major = parseInt(host.appVersion, 10);
  if (!isFinite(major) || major < 27 || major > 30) throw new Error('Outside M0 host range');
  // The native bridge can serialize version components as decimal strings.
  var raw = cep.major;
  var cepMajor =
    typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw)) ? Number(raw) : NaN;
  if (cepMajor === 11) return 'cep11';
  if (cepMajor === 12) return 'cep12';
  throw new Error('Unmeasured CEP major: ' + cep.major);
}
