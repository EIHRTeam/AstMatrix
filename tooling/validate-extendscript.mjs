import { parse } from 'acorn';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const roots = process.argv.slice(2);
async function validate(root) {
  await Promise.all(
    (await readdir(root, { withFileTypes: true })).map(async (item) => {
      const file = path.join(root, item.name);
      if (item.isDirectory()) await validate(file);
      else if (file.endsWith('.jsx')) {
        const source = await readFile(file, 'utf8');
        // This gate intentionally rejects ExtendScript-only directives/E4X.
        parse(source, { ecmaVersion: 3, sourceType: 'script' });
        console.log(`ES3 syntax pass: ${file}`);
      }
    }),
  );
}
await Promise.all((roots.length ? roots : ['apps/illustrator-cep/jsx']).map(validate));
