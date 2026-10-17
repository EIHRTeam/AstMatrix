/** Source strings stay in the domain packages; display translations belong to the UI. */
const english: Record<string, string> = {
  语言: 'Language',
  关于: 'About',
  '关于 AstMatrix': 'About AstMatrix',
  关闭: 'Close',
  版本: 'Version',
  轻量而强大的多编码格式条形码与二维码生成器:
    'A lightweight yet powerful muti-formats QR Code & Barcode generator',
  '打开 GitHub 仓库': 'Open GitHub repository',
  '无法打开 GitHub，请在浏览器中访问：':
    'Unable to open GitHub. Visit this address in your browser:',
  '无法打开许可证链接，请在浏览器中访问：':
    'Unable to open the license link. Visit this address in your browser:',
  编码类别: 'Code category',
  条形码: 'Barcodes',
  二维码: '2D codes',
  编码参数: 'Encoding settings',
  高级设置: 'Advanced settings',
  编码格式: 'Symbology',
  业务预设: 'Preset',
  未实现: 'Not implemented',
  '共享编码、业务预设与矢量输出已实现；独立符合性与真实宿主验收尚未完成。':
    'Shared encoding, presets and vector output are implemented. Independent conformance and real-host acceptance are not yet verified.',
  编码内容: 'Content',
  '模块宽度（mm）': 'Module width (mm)',
  '前景色（RGB hex）': 'Foreground (RGB hex)',
  '背景（transparent 或 RGB hex）': 'Background (transparent or RGB hex)',
  合并同色路径: 'Merge paths with the same color',
  '条高（mm）': 'Bar height (mm)',
  '人眼可读文字（OCR-B 轮廓）': 'Human-readable text (OCR-B outlines)',
  校验位策略: 'Check digit policy',
  校验已有: 'Validate existing',
  自动生成: 'Generate automatically',
  纠错级别: 'Error correction',
  'QR 版本（0 自动，1–40）': 'QR version (0 = auto, 1–40)',
  'Data Matrix 边长（0 自动）': 'Data Matrix size (0 = auto)',
  '通用 ASCII': 'General ASCII',
  '通用 UTF-8': 'General UTF-8',
  'Mobile / HTTPS 链接': 'Mobile / HTTPS link',
  矢量预览: 'Vector preview',
  '正在插入，请稍候': 'Inserting, please wait',
  当前输入尚未生成有效预览: 'Enter valid content to generate a preview',
  生成中: 'Generating',
  需要修正: 'Needs correction',
  等待输入: 'Waiting for input',
  '正在生成矢量…': 'Generating vector…',
  输入有效内容以生成预览: 'Enter valid content to generate a preview',
  编码引擎: 'Encoding engine',
  输入校验: 'Input validation',
  '正在模拟插入…': 'Simulating insertion…',
  '正在插入…': 'Inserting…',
  模拟插入文档: 'Simulate insertion',
  插入文档: 'Insert into document',
  '复制中…': 'Copying…',
  '复制 SVG': 'Copy SVG',
  'SVG 已复制': 'SVG copied',
  '复制 SVG 失败': 'Unable to copy SVG',
  模拟插入成功: 'Simulated insertion succeeded',
  插入成功: 'Inserted successfully',
  '无法访问剪贴板，请允许剪贴板访问后重试。':
    'Clipboard access is unavailable. Allow clipboard access and try again.',
  请先打开文档: 'Open a document first',
  当前宿主不支持原生矢量插入: 'This host does not support native vector insertion',
  当前宿主不支持复合路径: 'This host does not support compound paths',
  当前宿主不支持可编辑文本: 'This host does not support editable text',
  当前宿主无法保存可恢复参数: 'This host cannot save restorable parameters',
  '文档已切换或关闭，请在当前文档重试':
    'The document changed or closed. Try again in the current document.',
  '输入已变化，已取消插入': 'Input changed. Insertion was cancelled.',
  模拟宿主拒绝写入: 'The simulated host denied write access',
  模拟创建图元中途失败: 'Simulated failure while creating vector objects',
  '插入失败，清理也失败；文档中可能残留对象':
    'Insertion and cleanup failed. Objects may remain in the document.',
  '插入失败，已清理本次对象': 'Insertion failed. Objects from this attempt were removed.',
  请修正输入参数: 'Please correct the input settings',
  '请输入六位 RGB hex': 'Enter a six-digit RGB hex color',
  请输入编码内容: 'Enter content to encode',
  '输入超过 4096 字符': 'Input exceeds 4096 characters',
  '无效 Unicode 代理对': 'Invalid Unicode surrogate pair',
  '不支持的 ECC200 正方形尺寸': 'Unsupported ECC200 square size',
  'EAN 只接受数字': 'EAN accepts digits only',
  'Code 128 当前 Profile 只接受可打印 ASCII；不会替换字符':
    'This Code 128 preset accepts printable ASCII only; characters are not substituted.',
  'Mobile Profile 需要完整 http/https 链接': 'The Mobile preset requires a complete http/https URL',
  'UTF-8 / ECI 26 · 正方形模块 · 静区随 SVG 一同保留。':
    'UTF-8 / ECI 26 · Square modules · Quiet zones are preserved in the SVG.',
  '保留输入内容，仅接受可打印 ASCII。': 'Input is preserved. Only printable ASCII is accepted.',
  '二维组件（GS1 AI 括号语法）': '2D component (GS1 AI bracket syntax)',
  '附加校验（输入为正文）': 'Additional checksum (input excludes checksum)',
  'ISSN 序列变体（2 位数字）': 'ISSN sequence variant (2 digits)',
  'MaxiCode 模式（2/3 物流，4/5 通用）': 'MaxiCode mode (2/3 = shipping, 4/5 = general)',
  '物流邮编（模式 2/3）': 'Postal code (modes 2/3)',
  '国家码（模式 2/3，3 位数字）': 'Country code (modes 2/3, 3 digits)',
  '服务等级（模式 2/3，3 位数字）': 'Service class (modes 2/3, 3 digits)',
  'Micro QR 版本（0 自动，1–4）': 'Micro QR version (0 = auto, 1–4)',
  'Han Xin 版本（0 自动，1–84）': 'Han Xin version (0 = auto, 1–84)',
  'Mailmark 2D 类型': 'Mailmark 2D type',
  '序列号（1–20 位字母数字）': 'Serial number (1–20 alphanumeric characters)',
  '批次（1–20 位字母数字或 -_.）': 'Batch (1–20 alphanumeric characters or -_.)',
  '有效期（YYMMDD，DD 可为 00）': 'Expiry date (YYMMDD, DD may be 00)',
  'NTIN-DE / GS1 Data Matrix（技术生成）': 'NTIN-DE / GS1 Data Matrix (technical generation)',
  'NTIN-DE（14 位完整编号）': 'NTIN-DE (complete 14-digit number)',
  'PPN-DE / ISO 15434 Format 06（技术生成）': 'PPN-DE / ISO 15434 Format 06 (technical generation)',
  'PPN-DE（12 位完整编号）': 'PPN-DE (complete 12-digit number)',
  序列号: 'Serial number',
  批次: 'Batch',
  '有效期（YYMMDD）': 'Expiry date (YYMMDD)',
  'Code 49 行数（0 自动，2–8）': 'Code 49 rows (0 = auto, 2–8)',
  'Code 49 行高（8–50 模块）': 'Code 49 row height (8–50 modules)',
  'Code 49 分隔高度（1–5 模块）': 'Code 49 separator height (1–5 modules)',
  'ASCII 0–127，保留大小写与控制字符；自动生成行/符号校验。2–8 行堆叠，不支持 Unicode 或 ECI。':
    'ASCII 0–127, preserving case and control characters; row and symbol checksums are generated automatically. Stacks 2–8 rows; Unicode and ECI are not supported.',
  '输入完整 14 位 GTIN，编码为带 AI (01) 的 GS1-128；补位需明确选择。':
    'Enter a complete 14-digit GTIN, encoded as GS1-128 with AI (01). Check digit generation must be selected explicitly.',
  '使用 GS1 AI 括号语法，如 (01)09521234543213(10)LOT123；引擎校验 AI 和数据。':
    'Use GS1 AI bracket syntax, such as (01)09521234543213(10)LOT123. The engine validates AIs and their data.',
  '输入完整 12 位 UPC-A；自动补位模式只输入 11 位正文。':
    'Enter a complete 12-digit UPC-A; enter only 11 data digits when generating the check digit.',
  '输入 0/1 数字系统 + 六位压缩数据 + 校验位；校验基于展开后的 UPC-A。':
    'Enter number system 0/1, six compressed data digits and a check digit. Validation uses the expanded UPC-A.',
  '数字及连字符；auto 按正文长度生成一或两位校验，输入不含校验位。':
    'Digits and hyphens; auto generates one or two check digits based on data length. Input excludes check digits.',
  '仅数字，加可选校验后总位数须为偶数；不会静默补零。':
    'Digits only. The total length, including any checksum, must be even. Zeros are never added silently.',
  '数字、大写字母、空格及 -.$/+%；不含起止符 *，可选 Mod 43 校验。':
    'Digits, uppercase letters, spaces and -.$/+%; exclude start/stop *. Optional Mod 43 checksum.',
  'Full ASCII 0–127；控制字符需关闭 HRI；不替换大小写。':
    'Full ASCII 0–127; disable HRI for control characters. Letter case is preserved.',
  'Code 93 基本字符集；自动生成必要的 C/K 校验。':
    'Code 93 basic character set; required C/K checksums are generated automatically.',
  '仅数字的印刷装订标记；需人工检查方向和宿主输出。':
    'Digits-only printing and binding marks; verify orientation and host output manually.',
  '仅数字；默认生成 Mod 10，可显式选择其他校验；输入为不含校验的正文。':
    'Digits only; Mod 10 is generated by default. Other checksums can be selected explicitly. Input excludes checksums.',
  '单轨数值 3–131070；保留条宽比例，默认不显示 HRI。':
    'One-track value 3–131070; preserves bar width ratios. HRI is off by default.',
  '双轨数值 4–64570080；默认不显示 HRI。': 'Two-track value 4–64570080; HRI is off by default.',
  'Telepen Alpha / ASCII 0–127；控制字符需关闭 HRI。':
    'Telepen Alpha / ASCII 0–127; disable HRI for control characters.',
  '完整 ISBN-13（978/979，9790 属 ISMN），可带原有连字符；附加码单独输入。':
    'Complete ISBN-13 (978/979; 9790 belongs to ISMN). Existing hyphens are allowed. Enter add-on data separately.',
  '完整 13 位 ISMN（9790 前缀），可带原有连字符。':
    'Complete 13-digit ISMN (9790 prefix). Existing hyphens are allowed.',
  '完整 ISSN（末位可为 X）；序列变体构成主码，EAN-2 附加码单独输入。':
    'Complete ISSN (the last character may be X). The sequence variant forms the main code; enter EAN-2 add-on data separately.',
  '当前引擎只开放可打印 ASCII；不支持 ECI，不会把中文静默编码为错误字符集。':
    'The engine currently accepts printable ASCII only. ECI is not supported; Chinese text is never silently encoded with the wrong character set.',
  'Micro QR / 可打印 ASCII / 自动版本与纠错；静区为两个模块。':
    'Micro QR / Printable ASCII / Automatic version and error correction; two-module quiet zone.',
  'Codablock F / 可打印 ASCII / 自动堆叠布局，保持行列比例。':
    'Codablock F / Printable ASCII / Automatic stacked layout with preserved row and column proportions.',
  'MaxiCode 模式 2/3 使用分离的邮编、国家码、服务等级；模式 4/5 编码通用 ASCII 消息。':
    'MaxiCode modes 2/3 use separate postal code, country code and service class fields. Modes 4/5 encode general ASCII messages.',
  'Mailmark 2D 类型 7/9/29；保留 JGB 头与空格，静区 4X。技术生成，业务与行业验收待完成。':
    'Mailmark 2D types 7/9/29; preserves the JGB header and spaces, with a 4X quiet zone. Technical generation; business and industry acceptance is pending.',
  'NTIN-DE / 04150 前缀 / 内嵌 PZN 校验 / GS1 Data Matrix；技术生成，行业验收待完成。':
    'NTIN-DE / 04150 prefix / Embedded PZN checksum / GS1 Data Matrix; technical generation, industry acceptance pending.',
  '线性编号与二维 GS1 AI 内容分开输入；校验线性编号，二维 AI 由引擎校验。':
    'Enter the linear number and 2D GS1 AI content separately. The linear number is validated; the engine validates 2D AIs.',
  'UTF-8 / ECI 26；保留原始内容和码制静区。':
    'UTF-8 / ECI 26; preserves original content and symbology quiet zones.',
  'PPN-DE / 11 前缀 / PZN 与 ASCII 加权 Mod 97 校验 / ISO 15434 Format 06；技术生成，行业验收待完成。':
    'PPN-DE / 11 prefix / PZN and ASCII-weighted Mod 97 checksums / ISO 15434 Format 06; technical generation, industry acceptance pending.',
  模拟宿主: 'Simulated host',
  切换文档: 'Switch document',
  关闭文档: 'Close document',
  打开文档: 'Open document',
  失败场景: 'Failure scenario',
  正常插入: 'Normal insertion',
  权限拒绝: 'Permission denied',
  '部分失败 / 清理成功': 'Partial failure / cleanup succeeded',
  '部分失败 / 清理失败': 'Partial failure / cleanup failed',
  文档: 'Document',
  无文档: 'No document',
  对象仅存于浏览器内存: 'Objects exist only in browser memory',
  模拟宿主控制: 'Simulated host controls',
  '默认校验完整 GTIN；自动补位需在高级设置中明确选择。':
    'A complete GTIN is validated by default. Select check digit generation explicitly in advanced settings.',
  校验位不正确: 'Invalid check digit',
  校验位只接受数字: 'Check digits must contain digits only',
  'Code 11 只接受数字和连字符': 'Code 11 accepts digits and hyphens only',
  'Code 39/93 需要大写 ASCII 字符集，不含起止符 *':
    'Code 39/93 requires uppercase ASCII; exclude start/stop *',
  'Code 49 只接受 ASCII（0–127），不做字符替换':
    'Code 49 accepts ASCII (0–127) only; characters are not substituted',
  'Code 49 行数需为 0 或 2–8': 'Code 49 rows must be 0 or 2–8',
  'Code 49 输入超过 500 字符': 'Code 49 input exceeds 500 characters',
  'GS1-128 需要 GS1 AI 括号语法': 'GS1-128 requires GS1 AI bracket syntax',
  'ISBN-13 需要 978/979 前缀，9790 为 ISMN':
    'ISBN-13 requires a 978/979 prefix; 9790 belongs to ISMN',
  'ISMN 需要 9790 前缀': 'ISMN requires the 9790 prefix',
  'ISSN 校验位不正确': 'Invalid ISSN check digit',
  'Interleaved 2of5 加校验后必须为偶数位；不会静默补零':
    'Interleaved 2of5 must have an even number of digits including the checksum; zeros are not added silently',
  'Mailmark 2D 需要以 JGB 空格开头且至少 45 个 ASCII 字符，保留填充空格':
    'Mailmark 2D must start with JGB followed by a space and contain at least 45 ASCII characters; preserve padding spaces',
  'NTIN-DE 需要 04150 前缀和正确的 GTIN 校验位':
    'NTIN-DE requires the 04150 prefix and a valid GTIN check digit',
  '内嵌 PZN 校验位不正确': 'Invalid embedded PZN check digit',
  '当前 PPN-DE 需要 11 + 8 位 PZN + 2 位校验':
    'PPN-DE requires 11 + an 8-digit PZN + 2 check digits',
  '当前 PPN-DE 需要 11 前缀和正确的两位 PPN 校验':
    'PPN-DE requires the 11 prefix and two valid PPN check digits',
  'UPC-E 需要 0/1 数字系统 + 六位压缩数据':
    'UPC-E requires number system 0/1 and six compressed data digits',
  'UPC-E 非规范压缩：尾码 3 的第三位必须为 3–9':
    'Non-canonical UPC-E: when the last digit is 3, the third digit must be 3–9',
  'UPC-E 非规范压缩：尾码 4 的第四位不可为 0':
    'Non-canonical UPC-E: when the last digit is 4, the fourth digit cannot be 0',
  'UPC-E 非规范压缩：尾码 5–9 的第五位不可为 0':
    'Non-canonical UPC-E: when the last digit is 5–9, the fifth digit cannot be 0',
  '当前 Profile 只接受 ASCII（0–127）': 'This preset accepts ASCII (0–127) only',
  '当前 Profile 只接受可打印 ASCII，不做字符替换':
    'This preset accepts printable ASCII only; characters are not substituted',
  '控制字符无法显示为 OCR-B；请关闭人眼可读文字':
    'Control characters cannot be displayed in OCR-B; disable human-readable text',
  '模式 2 邮编需要 1–9 位数字': 'Mode 2 postal codes require 1–9 digits',
  '模式 3 邮编需要 1–6 位大写字母、数字或空格':
    'Mode 3 postal codes require 1–6 uppercase letters, digits or spaces',
  '需要三位数字，保留前导零': 'Enter three digits, preserving leading zeros',
  '需要完整 13 位出版物编号，可带连字符':
    'Enter a complete 13-digit publication number; hyphens are allowed',
  '需要完整 13 位编号且校验位正确': 'Enter a complete 13-digit number with a valid check digit',
  '需要完整 ISSN：XXXX-XXXX（末位可为 X）':
    'Enter a complete ISSN: XXXX-XXXX (the last character may be X)',
  '带连字符的编号需要完整的五段格式；也可输入不带连字符的 13 位数字':
    'Hyphenated numbers require all five parts; alternatively enter 13 digits without hyphens',
  '请分开填写线性与二维组件，不接受分隔符注入':
    'Enter linear and 2D components separately; separator injection is not accepted',
  '二维组件需要 GS1 AI 括号语法': 'The 2D component requires GS1 AI bracket syntax',
  该码制只接受数字: 'This symbology accepts digits only',
  '有效期必须为有效 YYMMDD 日期，DD=00 表示月底':
    'Expiry must be a valid YYMMDD date; DD=00 means the end of the month',
  '码制与 Profile 不兼容': 'The symbology and preset are incompatible',
  '该 Profile 尚未实现': 'This preset is not implemented',
  未知码制: 'Unknown symbology',
  输入已变化: 'Input changed',
  文档已变化: 'Document changed',
  '正在连接 Figma…': 'Connecting to Figma…',
  'Figma 消息桥未连接，请重新运行插件': 'The Figma bridge is not connected; rerun the plugin',
  'Figma 主线程启动失败，请重新运行插件': 'The Figma main thread could not start; rerun the plugin',
  'Figma 初始化失败，请重新运行插件': 'Figma initialization failed; rerun the plugin',
  'Figma 连接诊断': 'Figma connection diagnostics',
  页面已切换: 'The page changed',
  页面已变化: 'The page changed',
  输入或页面已变化: 'The input or page changed',
  'Figma 首版仅支持文字轮廓': 'This Figma version supports outlined text only',
  不支持可编辑文本: 'Editable text is not supported',
  'Figma 首版仅支持视口中心定位': 'This Figma version supports viewport-center placement only',
  'Figma 消息桥未连接，请从插件打开面板':
    'The Figma bridge is not connected; open the panel from the plugin',
  '消息预算已满，请重新打开插件': 'The message budget is full; reopen the plugin',
  插件会话已变化: 'The plugin session changed',
  面板已关闭或输入已变化: 'The panel closed or input changed',
  'Figma 面板已关闭': 'The Figma panel is closed',
  'Scene 超过 8 MiB 消息上限': 'The scene exceeds the 8 MiB message limit',
  已有插入任务: 'An insertion is already in progress',
  面板已关闭: 'The panel is closed',
  '输入已变化，已取消传输': 'Input changed; transfer cancelled',
  插入已取消或输入已变化: 'Insertion cancelled or input changed',
  '文档、尺寸或 DPI 已变化': 'The document, dimensions or DPI changed',
  请先选择定位图层: 'Select a placement layer first',
  定位选择已变化: 'The placement selection changed',
  包含静区的条码尺寸超出文档画布: 'The barcode, including quiet zones, exceeds the document canvas',
  '当前版本或文档模式不支持 Shape Layer（仅 RGB / CMYK）':
    'This version or document mode does not support shape layers (RGB / CMYK only)',
  插入失败且历史回滚失败: 'Insertion failed and history rollback failed',
  '插入失败，已回滚本次历史': 'Insertion failed; changes from this attempt were rolled back',
  'Scene 超过开发预算（512 图层 / 20000 子路径）；请启用合并路径':
    'The scene exceeds the development budget (512 layers / 20000 subpaths); enable path merging',
  '参数超过 64 KiB 存储上限': 'Parameters exceed the 64 KiB storage limit',
  'Photoshop 截断恢复参数，插入已取消':
    'Photoshop truncated the restorable parameters; insertion cancelled',
  'Photoshop 操作已取消': 'The Photoshop operation was cancelled',
  'ExtendScript 执行失败，请重新加载面板': 'ExtendScript execution failed; reload the panel',
  'Scene 超过 8 MiB 传输上限': 'The scene exceeds the 8 MiB transfer limit',
  当前宿主不支持更新对象: 'This host does not support object updates',
  无效宿主状态: 'Invalid host state',
  无效插入回包: 'Invalid insertion response',
  '请输入完整的 http:// 或 https:// 链接': 'Enter a complete http:// or https:// URL',
  '请输入以 04150 开头的完整 14 位 NTIN-DE 编号':
    'Enter a complete 14-digit NTIN-DE number starting with 04150',
  '请输入以 11 开头的完整 12 位 PPN-DE 编号':
    'Enter a complete 12-digit PPN-DE number starting with 11',
  '请输入 GS1 AI 括号语法，例如 (01)09521234543213(10)LOT123':
    'Enter GS1 AI bracket syntax, e.g. (01)09521234543213(10)LOT123',
  '请输入完整 ISBN-13（978/979 前缀，可含连字符）':
    'Enter a complete ISBN-13 (978/979 prefix; hyphens allowed)',
  '请输入完整 ISMN（9790 前缀，可含连字符）':
    'Enter a complete ISMN (9790 prefix; hyphens allowed)',
  '请输入完整 ISSN，例如 0311-175X': 'Enter a complete ISSN, e.g. 0311-175X',
  '请输入 3–131070 范围内的整数': 'Enter an integer between 3 and 131070',
  '请输入 4–64570080 范围内的整数': 'Enter an integer between 4 and 64570080',
  '请输入数字或连字符 (-)': 'Enter digits or hyphens (-)',
  '请输入数字（含可选校验位后的总位数须为偶数）':
    'Enter digits (the total length including any checksum must be even)',
  请输入数字: 'Enter digits',
  '请输入大写字母、数字、空格或 -.$/+%（不含起止符 *）':
    'Enter uppercase letters, digits, spaces or -.$/+% (exclude start/stop *)',
  '请输入 ASCII 字符（0–127，支持控制字符）':
    'Enter ASCII characters (0–127, including control characters)',
  '请输入可打印 ASCII 字符，例如 ABC_123': 'Enter printable ASCII characters, e.g. ABC_123',
  '请输入以 JGB 空格开头的 Mailmark 内容（至少 45 个 ASCII 字符，保留空格）':
    'Enter Mailmark data starting with JGB followed by a space (at least 45 ASCII characters; preserve spaces)',
  '请输入文本（支持中文及其他 Unicode 字符）':
    'Enter text (Chinese and other Unicode characters supported)',
  请输入符合当前编码格式的内容: 'Enter content accepted by the selected symbology',
  '内容过长或不符合当前编码设置，请缩短内容或调整版本、尺寸及纠错级别。':
    'The content is too long or cannot be encoded with the current settings. Shorten it or adjust the version, size or error correction level.',
  '当前字体无法显示部分字符，请调整编码内容或关闭人眼可读文字。':
    'The font cannot display some characters. Change the content or turn off human-readable text.',
  '编码结果校验失败，请重试或切换编码格式。':
    'The encoding result could not be verified. Try again or select another symbology.',
  '当前编码参数不受支持，请检查高级设置或恢复默认参数。':
    'The encoding settings are not supported. Check advanced settings or restore their defaults.',
  '当前内容不符合所选编码格式，请检查字符范围和输入格式。':
    'The content is not valid for the selected symbology. Check the allowed characters and input format.',
  '编码失败，请检查内容与参数后重试，或切换编码格式。':
    'Encoding failed. Check the content and settings, then try again or select another symbology.',
};

const patterns: [RegExp, (...parts: string[]) => string][] = [
  [
    /^请输入(\d+) 位数字（(不含|含)校验位）$/,
    (length, policy) =>
      `Enter ${length} digits (${policy === '不含' ? 'excluding' : 'including'} the check digit)`,
  ],
  [
    /^请输入以 0 或 1 开头的 (\d+) 位数字（(不含|含)校验位）$/,
    (length, policy) =>
      `Enter ${length} digits starting with 0 or 1 (${policy === '不含' ? 'excluding' : 'including'} the check digit)`,
  ],
  [/^需要 (\d+) 位数字$/, (length) => `Enter ${length} digits`],
  [/^数值范围为 (\d+)–(\d+)$/, (min, max) => `The value must be between ${min} and ${max}`],
  [/^Photoshop 操作失败：(.+)$/, (details) => `Photoshop operation failed: ${details}`],
  [/^附加码（(\d+) 位数字）$/, (length) => `Add-on (${length} digits)`],
  [
    /^自动补位模式需要 (\d+) 位数字$/,
    (length) => `Check digit generation requires ${length} digits`,
  ],
  [
    /^需要 (\d+) 位数字且校验位正确$/,
    (length) => `Enter ${length} digits with a valid check digit`,
  ],
];

export type Locale = 'zh-CN' | 'en';
export function translate(locale: Locale, source: string): string {
  if (locale === 'zh-CN') return source;
  if (english[source]) return english[source];
  for (const [pattern, format] of patterns) {
    const match = source.match(pattern);
    if (match) return format(...match.slice(1));
  }
  return source;
}
