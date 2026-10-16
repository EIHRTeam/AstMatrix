# tests

Test layers defined in `docs/plan/INIT.md` §11.

| Directory              | Layer           | Coverage                                                                    |
| ---------------------- | --------------- | --------------------------------------------------------------------------- |
| `barcode-conformance/` | 1 — encoding    | valid/invalid input, check digits, profiles, composite, special characters  |
| `vector-golden/`       | 2 — geometry    | module size, coordinates, quiet zone, path counts, IR/SVG snapshots         |
| `decode/`              | 3 — decode      | rendered output scanned at several DPI by at least two independent decoders |
| `react-state/`         | 5 — React state | providers, Selection reducer, profile linkage, stale async results          |
| `compatibility/`       | —               | web profile and host version matrix records                                 |
| `host-integration/`    | 4 — real hosts  | insert, select, recolour, edit, undo, save, reopen, metadata, performance   |
| `fixtures/`            | —               | shared golden samples from §11.2                                            |

Vitest projects are declared in the repository root `vitest.config.ts` and map to these
directories. Layer 3 and layer 4 require real decoders and real host applications, so
they are recorded here as manual/CI-gated suites rather than pure unit tests.

Status: skeleton only — no test cases are authored in this round.
