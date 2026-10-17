/* oxlint-disable no-await-in-loop -- Each positive/negative pair intentionally reuses the fixture path and config. */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const temp = await mkdtemp(path.join(os.tmpdir(), 'astmatrix-compiler-rules-'));
const fixtures = {
  'react/hooks': [
    'import {useState} from "react"; export function Good(){const [x]=useState(0);return x;}',
    'import {useState} from "react"; export function Bad({flag}){if(flag){const [x]=useState(0);return x;}return null;}',
  ],
  'react/rule-suppression': [
    'export function Good(){return null;}',
    'export function Bad({value}){\n// eslint-disable-next-line react-hooks/exhaustive-deps\nconst doubled=value*2;\nreturn <div>{doubled}</div>;\n}',
  ],
  'react/unsupported-syntax': [
    'export function Good(){return null;}',
    'export function Bad(props){eval("props.x=true");return <div/>;}',
  ],
};
const results = [];
try {
  for (const [rule, cases] of Object.entries(fixtures)) {
    const config = path.join(temp, 'config.json');
    await writeFile(
      config,
      JSON.stringify({
        plugins: ['react'],
        categories: { correctness: 'off' },
        rules: { [rule]: 'error' },
      }),
    );
    for (const [index, source] of cases.entries()) {
      const file = path.join(temp, `case-${index}.jsx`);
      await writeFile(file, source);
      const run = spawnSync(
        process.execPath,
        [
          'node_modules/oxlint/bin/oxlint',
          '--config',
          config,
          '--format',
          'json',
          '--no-ignore',
          file,
        ],
        { encoding: 'utf8' },
      );
      if (run.error) throw run.error;
      const diagnostics = JSON.parse(run.stdout).diagnostics ?? [];
      const hits = diagnostics.filter((d) => JSON.stringify(d.code).includes(rule.split('/')[1]));
      const pass =
        index === 0 ? run.status === 0 && hits.length === 0 : run.status === 1 && hits.length > 0;
      results.push({
        rule,
        fixture: index === 0 ? 'positive' : 'negative',
        status: pass ? 'pass' : 'fail',
        exitCode: run.status,
        diagnostics,
      });
    }
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.status !== 'pass')) process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}
