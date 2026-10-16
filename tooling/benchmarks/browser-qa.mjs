import { resolve } from 'node:path';
const { chromium } = await import(process.env.ASTMATRIX_PLAYWRIGHT_MODULE ?? 'playwright');
import { writeFile } from 'node:fs/promises';
const destination = resolve('docs/plan/evidence/M2-08/2026-10-14');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});
const consoleErrors = [],
  pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning')
    consoleErrors.push({ type: m.type(), text: m.text() });
});
page.on('pageerror', (e) => pageErrors.push(e.message));
const checks = [];
const check = (name, value) => {
  checks.push({ name, pass: !!value });
  if (!value) throw new Error(name);
};
const ready = async () => {
  await page.getByRole('status').filter({ hasText: '已就绪' }).waitFor();
  await page.locator('.preview-stage img').waitFor();
};
try {
  await page.goto(process.env.ASTMATRIX_QA_URL ?? 'http://127.0.0.1:5173/');
  await ready();
  check('page identity', (await page.title()).includes('AstMatrix'));
  check('meaningful body', (await page.locator('h1').textContent()) === 'AstMatrix');
  await page.screenshot({ path: destination + '/screens/desktop-ean13.png' });
  await page.getByLabel('编码内容', { exact: true }).fill('6901234567893');
  check(
    'invalid input immediately disables insert',
    await page.getByRole('button', { name: '模拟插入文档', exact: true }).isDisabled(),
  );
  await page.getByText('需要 13 位数字且校验位正确', { exact: true }).first().waitFor();
  await page.screenshot({ path: destination + '/screens/invalid-check-digit.png' });
  await page.getByLabel('编码内容', { exact: true }).fill('6901234567892');
  await ready();
  for (const [id, text] of [
    ['ean8', '96385074'],
    ['code128', 'ABC-12345'],
  ]) {
    await page.getByLabel('编码格式', { exact: true }).selectOption(id);
    await page.getByLabel('编码内容', { exact: true }).fill(text);
    await ready();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 SVG', exact: true }).click();
    const download = await downloadPromise;
    check(id + ' SVG download', download.suggestedFilename() === 'astmatrix-' + id + '.svg');
    await download.saveAs(destination + '/' + id + '-browser-export.svg');
  }
  await page.getByRole('tab', { name: '二维码', exact: true }).click();
  await page.getByLabel('编码内容', { exact: true }).fill('中文 / café / 😀 / ^ECI000003');
  await ready();
  await page.getByLabel('高级设置', { exact: true }).check();
  await page.getByLabel('模块宽度（mm）', { exact: true }).fill('0.5');
  await ready();
  await page.screenshot({ path: destination + '/screens/desktop-qr.png' });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 SVG', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(destination + '/qrcode-browser-export.svg');
  check('QR SVG download', download.suggestedFilename() === 'astmatrix-qrcode.svg');
  await page.getByLabel('编码格式', { exact: true }).selectOption('datamatrix');
  await page.getByLabel('编码内容', { exact: true }).fill('ABC123');
  await ready();
  const dmDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 SVG', exact: true }).click();
  await (await dmDownload).saveAs(destination + '/datamatrix-browser-export.svg');
  check('Data Matrix SVG download', true);
  await page.getByRole('button', { name: '模拟插入文档', exact: true }).click();
  await page.getByText(/模拟插入成功/).waitFor();
  check('fake insertion succeeds', true);
  await page.getByRole('button', { name: '关闭文档', exact: true }).click();
  check(
    'no document blocks insertion',
    await page.getByRole('button', { name: '模拟插入文档', exact: true }).isDisabled(),
  );
  check(
    'no document still exports',
    await page.getByRole('button', { name: '导出 SVG', exact: true }).isEnabled(),
  );
  await page.getByRole('button', { name: '打开文档', exact: true }).click();
  await page.getByLabel('失败场景', { exact: true }).selectOption('rollback-failed');
  await page.getByRole('button', { name: '模拟插入文档', exact: true }).click();
  await page.getByText(/ROLLBACK_FAILED/).waitFor();
  check('truthful rollback failure', true);
  await page.getByLabel('编码格式', { exact: true }).selectOption('maxicode');
  check(
    'listed symbol blocks export',
    await page.getByRole('button', { name: '导出 SVG', exact: true }).isDisabled(),
  );
  await page.getByLabel('编码格式', { exact: true }).selectOption('qrcode');
  await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: destination + '/screens/mobile-qr.png', fullPage: true });
  check(
    'mobile no horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  check('no error overlay', (await page.locator('vite-error-overlay').count()) === 0);
  check('console health', consoleErrors.length === 0 && pageErrors.length === 0);
  await writeFile(
    destination + '/browser-qa.json',
    JSON.stringify(
      {
        date: '2026-10-14',
        browser: await browser.version(),
        url: page.url(),
        title: await page.title(),
        viewports: ['1280x900', '390x844'],
        browserPlugin: 'absent',
        fallback: 'bundled Playwright 1.62.1; Browser plugin not available',
        checks,
        consoleErrors,
        pageErrors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ checks: checks.length, consoleErrors, pageErrors }));
} catch (error) {
  console.log(
    JSON.stringify({
      checks,
      consoleErrors,
      pageErrors,
      body: await page.locator('body').innerText(),
    }),
  );
  throw error;
} finally {
  await browser.close();
}
