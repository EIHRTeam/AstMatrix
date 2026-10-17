#!/usr/bin/env node
/**
 * AstMatrix build entry.
 *
 * Usage
 *   node tooling/build-targets/build.mjs --list
 *   node tooling/build-targets/build.mjs illustrator
 *   node tooling/build-targets/build.mjs photoshop
 *   node tooling/build-targets/build.mjs affinity
 *   node tooling/build-targets/build.mjs web --profile=cep11
 *   node tooling/build-targets/build.mjs target --target=illustrator-2026
 *   node tooling/build-targets/build.mjs all
 *
 * Web and Illustrator/Photoshop development builds execute unless --dry-run is supplied.
 * Annual aliases share host directories. Affinity and signed packaging remain plans.
 *
 * Node 24 executes the imported TypeScript modules directly (type stripping only; the
 * tooling sources therefore avoid enums, namespaces and parameter properties).
 */

import process from 'node:process';
import { buildIllustrator, buildPhotoshop } from './hosts.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  ANNUAL_ALIASES,
  HOST_TARGETS,
  buildCacheKeyParts,
  isAnnualAlias,
  isHostTargetId,
} from './targets.ts';
import { WEB_PROFILE_IDS, WEB_PROFILES, isWebProfileId } from '../web-profiles/index.ts';

const USAGE = `AstMatrix build

  node tooling/build-targets/build.mjs <command> [options]

Commands
  illustrator | photoshop | affinity   build one host target
  web --profile=<profile>              build one Web UI profile
  target --target=<annual-alias>       build through an annual alias
  all                                  resolve every host target
  --list                               print the target/profile/alias tables

Options
  --profile=<cep11|cep12|uxp-webview|web-playground>
  --target=<illustrator-2023|illustrator-2024|illustrator-2025|illustrator-2026|photoshop-2023|photoshop-2026|affinity>
  --compiler=<on|off>                   React Compiler (default on)
  --dry-run                            print the plan without touching the filesystem `;

const ALIAS_COMMANDS = {
  illustrator: 'illustrator-2026',
  photoshop: 'photoshop-2026',
  affinity: 'affinity',
};

function parseArgs(argv) {
  const options = {
    profile: undefined,
    target: undefined,
    list: false,
    command: undefined,
    dryRun: false,
    compiler: 'on',
  };
  for (const arg of argv) {
    if (arg === '--list' || arg === '-l') {
      options.list = true;
    } else if (arg.startsWith('--profile=')) {
      options.profile = arg.slice('--profile='.length);
    } else if (arg.startsWith('--target=')) {
      options.target = arg.slice('--target='.length);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--compiler=')) {
      options.compiler = arg.slice('--compiler='.length);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown build option: ${arg}`);
    } else if (!options.command) {
      options.command = arg;
    }
  }
  return options;
}

function printList() {
  console.log('Host targets\n');
  for (const target of Object.values(HOST_TARGETS)) {
    console.log(
      `  ${target.id.padEnd(18)} runtime=${target.runtime.padEnd(16)} output=${target.output}`,
    );
    console.log(`  ${''.padEnd(18)} app=${target.app}`);
    console.log(
      `  ${''.padEnd(18)} profiles=[${[...target.webProfiles, ...target.uiProfiles].join(', ') || '-'}]`,
    );
  }

  console.log('\nWeb profiles\n');
  for (const profile of Object.values(WEB_PROFILES)) {
    console.log(
      `  ${profile.id.padEnd(18)} target=${String(profile.target).padEnd(28)} hosts=[${profile.hosts.join(', ')}]`,
    );
    console.log(`  ${''.padEnd(18)} ${profile.notes}`);
  }

  console.log('\nAnnual aliases\n');
  for (const alias of Object.values(ANNUAL_ALIASES)) {
    const boundary = alias.runtimeResolutionRequired ? ' [runtime resolution required]' : '';
    console.log(
      `  ${alias.alias.padEnd(18)} -> ${alias.target} profiles=[${alias.webProfiles.join(', ') || '-'}]${boundary}`,
    );
  }

  console.log(
    '\nReminder: annual aliases are aliases, not projects. Illustrator 2023/2024 share one cep11 bundle.',
  );
}

/** Build one host once; aliases share the generated directory. */
async function runPlan(plan, options) {
  if (!options.dryRun && plan.target === 'illustrator-cep') {
    await buildIllustrator();
    return;
  }
  if (!options.dryRun && plan.target === 'photoshop-uxp') {
    await buildPhotoshop();
    return;
  }
  const cacheParts = buildCacheKeyParts({
    sourceHash: '<source-hash>',
    profile: plan.webProfiles.join('+') || plan.uiProfiles.join('+') || plan.target,
    runtime: plan.target,
    options: { alias: plan.alias },
  });

  console.log(`Resolved plan: ${plan.alias}`);
  console.log(`  host target   ${plan.target}`);
  console.log(`  app           ${HOST_TARGETS[plan.target].app}`);
  console.log(`  output        ${HOST_TARGETS[plan.target].output}`);
  console.log(`  web profiles  ${plan.webProfiles.join(', ') || '(none)'}`);
  if (plan.uiProfiles?.length) {
    console.log(`  ui profiles   ${plan.uiProfiles.join(', ')}`);
  }
  console.log(`  cache key     ${cacheParts.join(' | ')}`);
  console.log(`  notes         ${plan.notes}`);
  if (plan.runtimeResolutionRequired) {
    console.log(
      '  WARNING       this alias spans the CEP 11 -> 12 boundary; read the host minor version.',
    );
  }
  console.log(
    options.dryRun
      ? 'DRY RUN: host resources and bundles only; signing is not implemented.'
      : 'Affinity build is not implemented yet.',
  );
}

function plansForCommand(options) {
  if (isAnnualAlias(options.command)) {
    const alias = ANNUAL_ALIASES[options.command];
    return [{ ...alias, uiProfiles: HOST_TARGETS[alias.target].uiProfiles }];
  }

  if (options.command && Object.hasOwn(ALIAS_COMMANDS, options.command)) {
    const alias = ANNUAL_ALIASES[ALIAS_COMMANDS[options.command]];
    return [{ ...alias, uiProfiles: HOST_TARGETS[alias.target].uiProfiles }];
  }

  if (options.command === 'all' || options.command === undefined) {
    return Object.values(ANNUAL_ALIASES).map((alias) => ({
      ...alias,
      uiProfiles: HOST_TARGETS[alias.target].uiProfiles,
    }));
  }

  return [];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!['on', 'off'].includes(options.compiler)) throw new Error('Compiler must be on or off');
  if (options.compiler === 'off' && options.command !== 'web')
    throw new Error('Compiler comparisons use the web command');

  if (options.list) {
    printList();
    return 0;
  }

  if (options.command === 'web') {
    const profile = options.profile;
    if (!profile) {
      console.error(`--profile is required. Known profiles: ${WEB_PROFILE_IDS.join(', ')}`);
      return 1;
    }
    if (!isWebProfileId(profile)) {
      console.error(
        `Unknown Web profile "${profile}". Known profiles: ${WEB_PROFILE_IDS.join(', ')}`,
      );
      return 1;
    }
    console.log(
      `Resolved Web build: ${profile} -> ${WEB_PROFILES[profile].target ?? '(unpinned)'}`,
    );
    console.log(`  hosts    ${WEB_PROFILES[profile].hosts.join(', ')}`);
    console.log(`  notes    ${WEB_PROFILES[profile].notes}`);
    if (!['on', 'off'].includes(options.compiler)) throw new Error('Compiler must be on or off');
    const app =
      profile === 'web-playground'
        ? '@astmatrix/playground-web'
        : profile === 'uxp-webview'
          ? '@astmatrix/photoshop-uxp'
          : '@astmatrix/illustrator-cep';
    const script =
      profile === 'web-playground'
        ? 'build:web'
        : profile === 'uxp-webview'
          ? 'build:webview'
          : 'build:panels';
    if (options.dryRun) {
      console.log(`DRY RUN: pnpm --filter ${app} ${script}; compiler=${options.compiler}`);
      return 0;
    }
    const result = spawnSync('pnpm', ['--filter', app, script], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: { ...process.env, ASTMATRIX_WEB_PROFILE: profile, ASTMATRIX_COMPILER: options.compiler },
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
  }

  if (options.command === 'target') {
    const aliasName = options.target;
    if (!aliasName) {
      console.error(
        `--target is required. Known aliases: ${Object.keys(ANNUAL_ALIASES).join(', ')}`,
      );
      return 1;
    }
    if (!isAnnualAlias(aliasName)) {
      console.error(
        `Unknown annual alias "${aliasName}". Known aliases: ${Object.keys(ANNUAL_ALIASES).join(', ')}`,
      );
      return 1;
    }
    await runPlan(
      {
        ...ANNUAL_ALIASES[aliasName],
        uiProfiles: HOST_TARGETS[ANNUAL_ALIASES[aliasName].target].uiProfiles,
      },
      options,
    );
    return 0;
  }

  if (options.command && isHostTargetId(options.command)) {
    const target = HOST_TARGETS[options.command];
    if (!options.dryRun && target.id === 'illustrator-cep') {
      await buildIllustrator();
      return 0;
    }
    if (!options.dryRun && target.id === 'photoshop-uxp') {
      await buildPhotoshop();
      return 0;
    }
    console.log(`Resolved host target: ${target.id}`);
    console.log(`  app       ${target.app}`);
    console.log(`  output    ${target.output}`);
    console.log(
      `  profiles  ${[...target.webProfiles, ...target.uiProfiles].join(', ') || '(none)'}`,
    );
    console.log(
      options.dryRun ? 'DRY RUN: no artifacts produced.' : 'Affinity build is not implemented yet.',
    );
    return 0;
  }

  const plans = plansForCommand(options);
  if (plans.length === 0) {
    console.error(`Unknown command "${options.command ?? ''}".\n\n${USAGE}`);
    return 1;
  }
  const built = new Set();
  for (const plan of plans) {
    if (built.has(plan.target)) continue;
    await runPlan(plan, options);
    built.add(plan.target);
  }
  return 0;
}

process.exitCode = await main();
