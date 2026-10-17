# tests

| Directory              | Vitest project     | Coverage                                                                   |
| ---------------------- | ------------------ | -------------------------------------------------------------------------- |
| `barcode-conformance/` | `conformance`      | catalog mapping, profiles, check digits, all encoders, recovery metadata   |
| `vector-golden/`       | `vector-golden`    | millimetre geometry, quiet zones, IR/SVG golden snapshots, fill topology   |
| `decode/`              | `decode`           | shared-SVG rasterization and independent ZXing/ZBar readback               |
| `react-state/`         | `react-state`      | providers, Selection reducer, profile linkage, stale async results         |
| `compatibility/`       | `compatibility`    | CEP/Photoshop/Figma contracts, host manifests, bridges and native geometry |
| `host-integration/`    | `host-integration` | explicit placeholder for real-host insertion and editing tests             |
| `fixtures/`            | —                  | shared regression samples and captured runtime version fields              |

Unit tests for packages and tooling are colocated under their source trees and run in the
`unit` project. Vitest project definitions are in the repository root `vitest.config.ts`.

The compatibility and decode suites use mocks or locally installed decoders. They do not
substitute for real Illustrator, Photoshop, Figma, or Affinity acceptance, physical scanning, or
industry certification. The host-integration project has no cases yet and is the only project
that allows an empty run.
