# vector-golden — layer 2

Geometry tests (§11.1, §11.2): module size, coordinate conversion, quiet zone, path and node
counts, IR and SVG snapshots, numeric precision.

Golden results must not change because of a Web Profile, React Compiler output or a host
annual version (§11.6). Text metrics are covered by separate HRI golden tests because font
differences across platforms can shift layout (§8.3).

Status: no cases authored yet (skeleton).

M1 已冻结五个生产 SVG Golden（fixtures/），来自阶段文档首批样本；引擎版本、首次建立原因、
静区/HRI/毫米策略与像素等价测试说明见 docs/plan/evidence/M1-08/2026-10-14/README.md。
Golden 验证几何和确定性；独立扫码用 test:decode，不能据此声明行业或宿主支持。
