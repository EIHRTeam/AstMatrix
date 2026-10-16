/* This classic script runs before the bundle, including when the bundle cannot load or parse. */
(function () {
  function fail(detail) {
    var status = document.getElementById('startup-status');
    if (!status) return;
    status.setAttribute('role', 'alert');
    status.textContent = 'AstMatrix 无法启动 / Unable to start AstMatrix\n' + detail;
  }
  window.addEventListener(
    'error',
    function (event) {
      var target = event.target;
      if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
        fail('无法读取资源 / Resource failed to load: ' + (target.src || target.href));
      } else {
        fail(event.message || 'Unknown startup error');
      }
    },
    true,
  );
  window.addEventListener('unhandledrejection', function (event) {
    fail(String(event.reason));
  });
  window.setTimeout(function () {
    var status = document.getElementById('startup-status');
    if (status && !status.getAttribute('role')) {
      fail('界面未完成初始化，请重新打开插件。 / UI initialization timed out. Reopen the panel.');
    }
  }, 10000);
})();
