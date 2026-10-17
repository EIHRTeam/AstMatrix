const { chromium } = await import(process.env.ASTMATRIX_PLAYWRIGHT_MODULE ?? 'playwright');
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('apps/illustrator-cep/dist/web');
const destination = resolve(process.env.ASTMATRIX_REPORT_DIR ?? 'tmp/web-comparison');
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + '/')) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file),
      type =
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.txt': 'text/plain',
        }[extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const address = server.address(),
  port = address.port;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const records = [];
const percentile = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return { medianMs: a[14], p95Ms: a[28], maxMs: a[29] };
};
try {
  for (const profile of ['cep11', 'cep12'])
    for (const compiler of ['on', 'off']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(() => {
        delete Object.hasOwn;
        delete Array.prototype.at;
        delete Array.prototype.toSorted;
        delete Array.prototype.toSpliced;
        delete Array.prototype.with;
      });
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      const name = profile + (compiler === 'off' ? '-compiler-off' : '');
      await page.goto('http://127.0.0.1:' + port + '/' + name + '/');
      await page.getByRole('status').filter({ hasText: '已就绪' }).waitFor();
      if (await page.getByRole('button', { name: '模拟插入文档', exact: true }).isDisabled())
        throw new Error('Compiled stale insert availability ' + name);
      await page.getByRole('button', { name: '模拟插入文档', exact: true }).click();
      await page.getByText(/模拟插入成功/).waitFor();
      await context.setOffline(true);
      const rendering = await page.evaluate(async () => {
        const checkbox = document.querySelector('.settings input'),
          values = [];
        for (let n = 0; n < 35; n++) {
          const start = performance.now(),
            next = !checkbox.checked;
          await new Promise((done, reject) => {
            const observer = new MutationObserver(check),
              timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error('Settings commit timeout'));
              }, 2000);
            function check() {
              if (document.querySelectorAll('.barcode-form .field').length > 1 === next) {
                observer.disconnect();
                clearTimeout(timer);
                done();
              }
            }
            observer.observe(document.querySelector('.editor'), { childList: true, subtree: true });
            checkbox.click();
            check();
          });
          if (n >= 5) values.push(performance.now() - start);
          await new Promise((r) => requestAnimationFrame(r));
        }
        return values;
      });
      await page.getByRole('tab', { name: '二维码', exact: true }).click();
      await page.getByRole('status').filter({ hasText: '已就绪' }).waitFor();
      const previews = await page.evaluate(async () => {
        const input = document.querySelector('textarea'),
          values = [];
        for (let n = 0; n < 35; n++) {
          const start = performance.now();
          await new Promise((done, reject) => {
            const observer = new MutationObserver(check),
              timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error('Preview timeout'));
              }, 3000);
            function check() {
              if (
                document.querySelector('.status')?.textContent === '已就绪' &&
                document.querySelector('.preview-stage img')
              ) {
                observer.disconnect();
                clearTimeout(timer);
                done();
              }
            }
            observer.observe(document.querySelector('.preview'), {
              childList: true,
              subtree: true,
              attributes: true,
            });
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(
              input,
              'https://example.com/benchmark/' + n,
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
          if (n >= 5) values.push(performance.now() - start);
        }
        return values;
      });
      if (errors.length) throw new Error(name + ' console: ' + JSON.stringify(errors));
      records.push({
        profile,
        compiler,
        compilerRegression: 'pass: ready preview enables insert; fake insert succeeds',
        offline: 'pass: context offline during 35 settings changes and 35 distinct QR previews',
        apiFloor:
          'Object.hasOwn and Array.at/toSorted/toSpliced/with removed before bundle execution',
        settingsCommit: percentile(rendering),
        previewWith150msDebounce: percentile(previews),
        raw: { rendering, previews },
        errors,
      });
      await context.close();
    }
  await mkdir(destination, { recursive: true });
  await writeFile(
    resolve(destination, 'comparison.json'),
    JSON.stringify(
      {
        suite: 'web-compiler-comparison',
        generatedAt: new Date().toISOString(),
        browser: await browser.version(),
        platform: process.platform,
        arch: process.arch,
        warmup: 5,
        repetitions: 30,
        viewports: '1280x900',
        method:
          'Settings click to visible DOM commit via MutationObserver; QR input to ready DOM including fixed 150ms debounce, encode, IR and SVG; production bundles in current Chrome. Not React Profiler CPU duration or real CEP measurement.',
        limitations:
          'No performance guarantee inferred from these small samples; real CEP runtime, host timing and peak memory remain separate acceptance work.',
        records,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify(
      records.map(({ profile, compiler, settingsCommit, previewWith150msDebounce }) => ({
        profile,
        compiler,
        settingsCommit,
        previewWith150msDebounce,
      })),
    ),
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
