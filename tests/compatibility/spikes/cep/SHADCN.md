# M0 shadcn/ui provenance

The panel uses actual shadcn/ui source components from the official **new-york / Tailwind 3** registry,
added with `pnpx shadcn@latest add` (CLI 4.21.4) to an isolated staging project on 2026-10-14.
Registry addresses: `https://ui.shadcn.com/r/styles/new-york/{button,input,textarea,tabs,dialog,toggle-group,label}.json`.
The toggle-group registry also installed toggle. See `SHADCN-LICENSE.txt` (MIT).

Local adaptations: relative imports; existing `radix-ui` unified exports instead of separate Radix packages;
spacing uses gap; equal icon sizes use size; Oxfmt and strict import/type conventions.
Tailwind 3.4.19 and tailwind-merge 2.6.0 are deliberate for the CEP 11 Chrome 88 / CEP 12 Chrome 99 targets.
Tailwind 4's browser floor and modern color/property syntax are not accepted as a replacement for these targets.
CSS is generated at build time and embedded in all five HTML entries; no network/CDN runtime is used.
Bootstrap uses the same compiled utility/theme CSS but does not mount React components.

This is an M0 component/runtime experiment. It does not implement the full M2 application UI.
