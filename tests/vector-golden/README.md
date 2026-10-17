# vector-golden

Geometry tests: module size, coordinate conversion, quiet zones, path and node counts, IR and
SVG snapshots, numeric precision, and filled-pixel equivalence between merged and raw paths.

The five core SVG goldens live in `fixtures/` and come from constructed regression samples.
Golden results must not change because of a Web Profile, React Compiler output, or a host annual
version. Text metrics are covered by focused HRI tests because platform fonts can shift layout.

Golden tests verify geometry and determinism. Independent scanning is covered by `test:decode`;
neither result asserts industry or host support.
