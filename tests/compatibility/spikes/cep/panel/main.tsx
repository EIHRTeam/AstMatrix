import type { ChangeEvent, CompositionEvent } from 'react';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Select } from 'radix-ui';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Label } from './components/ui/label';
import { ToggleGroup, ToggleGroupItem } from './components/ui/toggle-group';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './components/ui/dialog';
import { encodeSpike } from '../../../../../packages/barcode-core/src/spike';
import type { VectorScene } from '@astmatrix/vector-ir';
import { primitiveScene } from '../../fixtures';
import { renderSvg } from '@astmatrix/renderers-svg';
// oxlint-disable-next-line import/no-unassigned-import -- Vite loads the spike stylesheet.
import './style.css';
declare const M0_COMPILER_ENABLED: boolean;
declare const M0_WEB_PROFILE: string;
interface Bridge {
  getHostEnvironment(): unknown;
  getCurrentApiVersion(): unknown;
  evalScript(script: string, cb: (value: string) => void): void;
}
declare global {
  interface Window {
    CSInterface?: new () => Bridge;
  }
}
const bridge = window.CSInterface ? new window.CSInterface() : null;
const runtime = JSON.stringify(
  {
    profile: M0_WEB_PROFILE,
    compiler: M0_COMPILER_ENABLED,
    host: bridge?.getHostEnvironment(),
    cep: bridge?.getCurrentApiVersion(),
    ua: navigator.userAgent,
    revision: 'hotfix-03',
    stylesheet: document.getElementById('m0-inline-style') ? 'inline' : 'missing inline style',
    bodyBackground: window.getComputedStyle(document.body).backgroundColor,
  },
  null,
  2,
);
function SpikePanel() {
  const [kind, setKind] = useState<'ean13' | 'qrcode'>('qrcode');
  const [text, setText] = useState('https://example.com/barcode');
  const [composing, setComposing] = useState(false);
  const [log, setLog] = useState(runtime);
  const [selectOpen, setSelectOpen] = useState(false);
  const [showSelectProbe, setShowSelectProbe] = useState(false);
  let scene: VectorScene | undefined;
  let svg = '',
    error = '';
  if (!composing) {
    try {
      scene = encodeSpike({ bcid: kind, text });
      svg = renderSvg(scene);
    } catch (cause) {
      error = String(cause);
    }
  }
  function execute(fail: boolean, primitives = false) {
    const candidate = primitives ? primitiveScene() : scene;
    if (!candidate || !bridge) {
      setLog('Missing scene or real CEP bridge');
      return;
    }
    const metadata = JSON.stringify(candidate.metadata);
    bridge.evalScript(
      `$._astmatrixM0.insert(${JSON.stringify(candidate)},${JSON.stringify(metadata)},${fail ? 0 : -1})`,
      (result) => setLog(`${runtime}\n${result}`),
    );
  }
  function selectKind(v: string) {
    if (v !== 'ean13' && v !== 'qrcode') return;
    setKind(v);
    setText(v === 'ean13' ? '6901234567892' : 'https://example.com/barcode');
    setSelectOpen(false);
  }
  function changeText(e: ChangeEvent<HTMLInputElement>) {
    setText(e.target.value);
  }
  function startComposition() {
    setComposing(true);
  }
  function endComposition(e: CompositionEvent<HTMLInputElement>) {
    setText(e.currentTarget.value);
    setComposing(false);
  }
  function insert() {
    execute(false);
  }
  function failInsert() {
    execute(true);
  }
  function insertPrimitives() {
    execute(false, true);
  }
  function readMetadata() {
    bridge?.evalScript('$._astmatrixM0.read()', (value) => setLog(`${runtime}\nmetadata=${value}`));
  }
  function stressNote() {
    if (!scene || !bridge) return;
    const metadata = {
      ...scene.metadata,
      options: { ...scene.metadata.options, m0Padding: 'A'.repeat(16 * 1024) },
    };
    bridge.evalScript(
      `$._astmatrixM0.writeNote(${JSON.stringify(JSON.stringify(metadata))})`,
      (value) => setLog(`${runtime}\n${value}`),
    );
  }
  return (
    <main className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">AstMatrix M0</h1>
        <Button variant="outline" size="sm" asChild>
          <a href="../../../bootstrap/index.html">切换 Compiler</a>
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">
        hotfix-03 · shadcn/ui · {M0_WEB_PROFILE} · Compiler {String(M0_COMPILER_ENABLED)}
      </p>
      <Tabs defaultValue="encode" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="encode" className="flex-1">
            编码
          </TabsTrigger>
          <TabsTrigger value="evidence" className="flex-1">
            记录
          </TabsTrigger>
        </TabsList>
        <TabsContent value="encode" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>码制</Label>
            <ToggleGroup
              type="single"
              value={kind}
              onValueChange={selectKind}
              variant="outline"
              className="justify-start"
            >
              <ToggleGroupItem value="qrcode">QR Code</ToggleGroupItem>
              <ToggleGroupItem value="ean13">EAN-13</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="barcode-input">输入法测试</Label>
            <Input
              id="barcode-input"
              value={text}
              onChange={changeText}
              onCompositionStart={startComposition}
              onCompositionEnd={endComposition}
            />
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {composing ? '组合输入中' : error}
          </p>
          {svg ? (
            <div className="flex min-h-[140px] items-center justify-center rounded-lg border bg-muted p-4">
              <img
                className="block max-h-[220px] max-w-full"
                alt="M0 矢量预览"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
              />
            </div>
          ) : null}
          <Button type="button" disabled={!scene} onClick={insert}>
            插入实验组
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={insertPrimitives}>
              插入矩形与曲线
            </Button>
            <Button type="button" variant="outline" disabled={!scene} onClick={failInsert}>
              注入失败并清理
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">打开 Dialog</Button>
              </DialogTrigger>
              <DialogContent className="max-w-[90%]">
                <DialogHeader>
                  <DialogTitle>键盘/焦点实验</DialogTitle>
                  <DialogDescription>检查 Tab 焦点、Esc 关闭及触发按钮焦点恢复。</DialogDescription>
                </DialogHeader>
                <Label htmlFor="dialog-input">对话框输入</Label>
                <Input id="dialog-input" />
                <DialogClose asChild>
                  <Button>关闭</Button>
                </DialogClose>
              </DialogContent>
            </Dialog>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowSelectProbe(!showSelectProbe)}
          >
            {showSelectProbe ? '收起 Radix Select 探针' : '展开 Radix Select 探针'}
          </Button>
          {showSelectProbe ? (
            <Select.Root
              value={kind}
              onValueChange={selectKind}
              open={selectOpen}
              onOpenChange={setSelectOpen}
            >
              <Select.Trigger asChild>
                <Button variant="outline">
                  <Select.Value />
                  <Select.Icon> ▾</Select.Icon>
                </Button>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content>
                  <Button type="button" variant="outline" onClick={() => setSelectOpen(false)}>
                    关闭探针菜单
                  </Button>
                  <Select.Viewport>
                    <Select.Group>
                      {['qrcode', 'ean13'].map((v) => (
                        <Select.Item key={v} value={v} onClick={() => selectKind(v)}>
                          <Select.ItemText>{v}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Group>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          ) : null}
        </TabsContent>
        <TabsContent value="evidence" className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={readMetadata}>
              读所选组元数据
            </Button>
            <Button type="button" variant="outline" onClick={stressNote}>
              写入约 16 KiB 元数据
            </Button>
          </div>
          <Label htmlFor="runtime-log">复制运行记录</Label>
          <Textarea id="runtime-log" className="min-h-[280px]" readOnly value={log} rows={15} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
createRoot(root).render(
  <StrictMode>
    <SpikePanel />
  </StrictMode>,
);
