# Dictol 执行计划与上下文摘要

> 更新日期：2026-07-22  
> 当前阶段：方案分析与真实词典验证  
> 约束：在用户明确要求前，不开始应用功能编码。

## 1. 产品目标

构建一个桌面端词典应用，允许用户导入 MDX/MDD 词库并搜索词条，尽可能忠实呈现词典自带的 HTML、CSS、图片、音频及 JavaScript 交互。

首批真实验证词典：

- OALDPE：Oxford Advanced Learner's Dictionary 英汉双解精装版。
- LDOCE5：Longman Dictionary of Contemporary English 5++ En-Cn V2.15。

应用只提供用户自行导入能力，不随安装包分发上述词典。OALDPE 元数据明确标注仅限个人学习研究、禁止商业用途；LDOCE5 也包含第三方版权内容，后续发布前需单独核查授权边界。

## 2. 已确定的技术方向

### 2.1 技术栈

- 桌面框架：Electron。
- 应用前端：React。
- 主进程/后端协调层：Node.js。
- MDX/MDD 解析：`js-mdict` 7.x。
- 解析运行环境：Node.js Worker Thread，不在 Electron 主线程或 Renderer 中运行。
- 本地索引数据库：PGlite，数据库文件存放于 Electron `app.userData`。

### 2.2 进程边界

- Renderer 不直接调用 js-mdict 或访问词典文件。
- Renderer 只调用受控的 preload API。
- Node.js 后端负责查询 PGlite、调度解析 Worker、组合词条响应及管理导入任务。
- js-mdict Worker 负责 MDX/MDD 解析、索引遍历和原始记录/资源读取。
- 导入和大文件读取不得运行在 Electron 主线程。
- PGlite 由 Node.js 查询和写入。

### 2.3 存储原则

导入词典时：

- 保存词典元数据、源文件信息、词条键和记录定位信息。
- 保存 MDD 资源键和对应分卷/定位信息。
- 不把词条 HTML、图片、音频、字体等大块内容复制到 PGlite。

查询词条时：

- 先从 PGlite 找到一个或多个记录定位信息。
- Node 调用 js-mdict Worker 从原始 MDX/MDD 读取内容。
- 在查询阶段解析重定向并组合页面。

源文件移动、修改或替换后，原定位信息可能失效。词典表必须保存至少：文件大小、修改时间和内容指纹；打开词典时校验，失效后要求重新索引。

## 3. 推荐总体架构

```text
React Renderer
  │
  │ typed preload API
  ▼
Electron Main / Node Backend
  ├── PGlite：词典、词条和资源索引
  ├── 导入任务与进度管理
  ├── 查询、别名解析、页面组合
  ├── 自定义协议处理
  └── Worker 调度与生命周期管理
          │
          ▼
      js-mdict Worker Thread
        ├── MDX/MDD 头部与版本解析
        ├── Encrypted=2 索引解密
        ├── key list 与 record block 解析
        ├── lookupAll / fetch / locator 适配
        ├── MDD 资源读取
        └── 批量导入与随机读取
```

## 4. 词典页面隔离

词典 HTML/JS 不得直接注入 React DOM。推荐放在独立、沙箱化的词典页面中运行：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- 不向词典页面暴露 Electron、Node.js、文件系统或通用 IPC。
- 每部词典使用独立 origin/partition，避免 Cookie、localStorage 和缓存互相污染。

建议注册自定义协议：

```text
dictol-dict://<dictionary-id>/entry?key=apple
dictol-dict://<dictionary-id>/oaldpe.css
dictol-dict://<dictionary-id>/LM5style.css
dictol-dict://<dictionary-id>/media/english/ameProns/apple1.mp3
```

协议处理器只接受已注册词典和规范化后的相对资源键，必须阻止路径穿越。响应应设置准确 MIME 类型、缓存策略和词典级 CSP。

特殊协议处理：

- `entry://...`：阻止默认导航，转换为当前词典的词条查询；保留 fragment/anchor。
- `sound://...`：阻止默认导航，通过资源索引读取 MDD 音频并播放。
- 相对 URL：先查词典旁的外置文件，再查 MDD 资源索引。
- `http`、`https`、`wss`：按词典级网络权限允许或阻止。

## 5. 建议数据模型

具体 SQL 在实现阶段确定，逻辑模型至少包含以下实体。

### 5.1 Dictionary

- `id`
- `title`
- `format_version`
- `encoding`
- `encrypted_mode`
- `key_case_sensitive`
- `strip_key`
- `source_directory`
- `mdx_file`
- 外置文件清单
- 导入状态、错误和进度
- 文件大小、mtime、快速指纹/完整哈希
- 词典适配器类型，例如 `generic`、`oaldpe`、`ldoce5`

### 5.2 DictionaryFile

- `dictionary_id`
- 文件角色：`mdx`、`mdd`、`mdd-volume`、`external-resource`
- 分卷序号
- 路径
- 大小、mtime、指纹
- 文件自身的 MDict 头部配置

注意：同一词典的不同 MDX/MDD 文件可能具有不同 `Encrypted` 值，必须逐文件解析，不能继承主 MDX 设置。

### 5.3 EntryIndex

- `dictionary_id`
- `term_original`
- `term_normalized`
- `record_locator`
- `ordinal`
- 可选 `record_kind_hint`

`term` 不能唯一。主键应以词典、记录位置和序号为基础。查询必须返回同一个键的全部记录。

### 5.4 ResourceIndex

- `dictionary_id`
- `resource_key_original`
- `resource_key_normalized`
- `dictionary_file_id`/MDD 分卷
- `record_locator`
- 可选 MIME/扩展名提示

MDD 资源键通常以反斜杠开头；URL 路径进入索引前需要将 `/` 转换为 `\` 并补齐前导 `\`。

### 5.5 Locator 要求

Locator 的最终字段由 js-mdict `KeyWordItem` 和底层 record offset 能力决定，目标是重启后无需重新按词搜索即可读取记录。可能包含：

- 解压后的全局 record offset 和 length。
- record block 编号。
- block 的压缩文件偏移、压缩长度和解压长度。
- 记录在解压 block 内的 offset 和 length。

阶段 1 必须验证这些字段是否属于稳定、可序列化、可跨进程重启复用的接口。若 js-mdict 暂时不能按持久化 locator 读取，第一版允许降级为：

```text
PGlite 保存 dictionary_id + term + ordinal
→ Worker 调用 lookupAll(term)
→ 按 ordinal 选择记录
```

此时 PGlite 负责跨词典检索、排序和过滤，js-mdict 自身的内存 key list 负责文件内定位。长期目标仍是给适配层补充稳定的批量 key/locator 和按位置读取接口。

## 6. 通用 MDX 查询语义

查询结果不是单一记录，必须支持：

1. 使用词典头部规则规范化查询键。
2. 从 PGlite 读取该键的全部记录位置。
3. 逐条按位置读取原始记录。
4. 正文记录保留。
5. `@@@LINK=<target>` 记录递归解析目标键。
6. 使用 `visited` 集合阻止循环。
7. 设置最大递归深度，初始建议为 8。
8. 合并直接记录和解析出的目标内容。
9. 由词典适配器完成必要的兼容处理。

通用层不得假设记录一定是完整 HTML，也不得用固定文本分隔符拼接后直接交给浏览器。

## 7. OALDPE 实测摘要

目录当前包含：

- `oaldpe.mdx`
- `oaldpe.mdd`
- `oaldpe.1.mdd`
- `oaldpe.2.mdd`
- `oaldpe.3.mdd`
- `oaldpe.css`
- `oaldpe.js`
- `oaldpe-jquery.js`
- `oaldpe.png`

### 7.1 格式与规模

| 文件 | MDict 版本 | Encrypted | 记录数 | 主要内容 |
|---|---:|---:|---:|---|
| `oaldpe.mdx` | 2.0 | 2 | 622,808 | 词条 HTML |
| `oaldpe.mdd` | 2.0 | No | 72 | CSS、字体、配置资源 |
| `oaldpe.1.mdd` | 2.0 | 2 | 160,805 | MP3 |
| `oaldpe.2.mdd` | 2.0 | No | 1,874 | PNG |
| `oaldpe.3.mdd` | 2.0 | No | 112,897 | MP3 |

四个 MDD 格式相同，但文件自身的加密配置不同。`Encrypted=2` 是关键词索引加密，不要求用户输入密码。

### 7.2 词条结构

- 每条正式词条基本是完整 HTML 文档。
- 引用外置 `oaldpe.css`、`oaldpe-jquery.js`、`oaldpe.js`。
- 使用自定义标签，例如 `deft`、`chn`、`unboxx`。
- 使用 `entry://`、`sound://`、相对图片路径。
- CSS 引用的字体均存在基础 MDD。
- JS 为 jQuery 3.7.1 + OALDPE 自定义交互。
- JS 只依赖浏览器 API，不依赖 Node/Electron API。
- `localStorage` 用于持久化词典配置，因此应使用每词典独立 origin。

### 7.3 键重复

- 622,808 条记录。
- 615,914 个精确唯一键。
- 6,181 个键对应多条记录。
- 单键最多 6 条记录。

### 7.4 网络行为

默认配置并非完全离线：

- 单词发音默认离线。
- 图片默认离线。
- 官方例句发音默认在线。
- Edge TTS 默认开启，使用 Bing Speech WebSocket。
- 本地脚本失败时会回退到 CDN。

必须由宿主控制网络权限。建议默认阻止任意联网，用户明确开启在线发音/TTS 后，只开放必要域名和协议。

### 7.5 OALDPE 专属适配

- 优先从词典目录读取三个外置 CSS/JS，再查询 MDD。
- 保留完整 HTML 文档结构。
- 拦截 `entry://` 和 `sound://`。
- 允许 CSS 字体、图片及本地动态脚本通过同一词典 origin 加载。
- 不模拟 Eudic/GoldenDict UA，避免执行宿主专属分支。

## 8. LDOCE5 实测摘要

目录当前包含：

- `LDOCE5.mdx`
- `LDOCE5.mdd`

### 8.1 格式与规模

| 文件 | 大小 | MDict 版本 | Encrypted | 记录数 |
|---|---:|---:|---:|---:|
| `LDOCE5.mdx` | 约 184MB | 2.0 | 2 | 283,110 |
| `LDOCE5.mdd` | 约 1.2GB | 2.0 | 2 | 183,926 |

MDX 配置：

- `Encoding=UTF-8`
- `KeyCaseSensitive=No`
- `StripKey=Yes`
- `Format=Html`
- `Compact=Yes`
- `StyleSheet` 为空

### 8.2 页面资源

词条是 HTML 片段，每个正式词条引用：

- `LM5style.css`：存在于 MDD。
- `LM5style_switch.css`：缺失。
- `LM5style_show.css`：存在于 MDD，用 CSS 边框作为 MDD 存在标志。
- `jquery-3.2.1.min.js`：存在于 MDD。
- `LM5Switch.js`：存在于 MDD。
- `LM5pp_config.ini`：缺失。

缺失的 `.ini` 不致命，`LM5Switch.js` 内置完整默认值；缺失的 switch CSS 可能影响少量状态样式，但主样式和主要交互可用。协议层应正常返回 404，不要因此中止整个词条加载。

### 8.3 重定向与多记录

- 283,110 条记录中有 218,252 条 `@@@LINK`。
- 约 64,858 条为实际内容。
- 35,081 个精确键具有重复记录。
- 单键最多 8 条记录。
- 正常别名链最大深度为 4。
- 存在 9 个循环组件，34 个键最终受循环影响。

循环示例：

```text
cockfight → cockfighting → cockfight
ghostwrite → ghostwriter → ghostwrite
sharecropper → sharecrop → sharecropper
lipread → lipread
```

LDOCE5 有 344 条不规范 link target，其中包含 HTML 标签、弯引号或 `↔`。实测通过以下专属规范化规则可全部恢复：

1. HTML entity decode。
2. 移除 HTML 标签。
3. `’` 转换为 `'`。
4. 规范化 `↔` 周围的空格。
5. 忽略大小写匹配。

这些规则只放进 LDOCE5 适配器，不污染通用 MDict 层。

### 8.4 图片

- 2,051 条 MDX 记录包含 `data:image/...`。
- 一部分正文通过 `@@@LINK` 引用隐藏的 MDX Base64 图片记录。
- MDD 仅含 15 个普通 JPG。

因此 LDOCE5 图片处理必须覆盖：正文内 Base64、MDX link target 中的隐藏图片节点、普通 MDD 图片资源。

### 8.5 音频

MDD 包含：

- 182,065 个 MP3。
- 1,842 个 Ogg Speex `.spx`，抽样为 22050Hz 单声道。

MP3 可直接通过 `sound://media/...` 映射到 MDD 键。SPX 不应假设 Chromium 能稳定播放；应把它作为独立媒体兼容项，比较 Speex WASM、本机 FFmpeg 子进程和第一版暂不支持三种方案。若实施转码，可在首次播放时按需转换为 WAV/PCM 或其他 Chromium 稳定支持的格式，并按资源哈希缓存结果。

### 8.6 UA 与在线行为

`LM5Switch.js` 看到桌面 Chrome UA 时，会把离线 MP3 改为 `http://www.ldoceonline.com/media/...`。Electron 默认 UA 会触发该行为。

为 LDOCE5 词典页面设置不含 `Chrome`、`Eudic`、`GoldenDict` 的专用 UA，同时保留平台标识，例如：

```text
Mozilla/5.0 (Macintosh) Dictol/1.0
```

这样可以保持桌面布局并使用本地 MDD 音频。最终 UA 需要在 macOS、Windows、Linux 上分别验证。

## 9. js-mdict 解析器方案

主解析器改为固定版本的 `js-mdict` 7.x，直接运行在 Node.js Worker Thread 中。当前项目是个人使用，许可证不作为此次技术选型的阻断因素。

选择理由：

- 直接支持 MDX/MDD，并提供 `lookup`、`lookupAll`、前缀、联想和模糊查询等能力。
- `lookupAll` 能覆盖 LDOCE5 这类重复键词典。
- 同时支持 Node ESM/CJS，接入 Electron 的 Node 后端比原生模块简单。
- 移除原生编译、跨平台二进制分发和 ABI 适配成本，前期能更快验证真实词典。
- MDX 可按关键词项读取，MDD 可定位资源，具备实现“索引只存键与位置、正文按需读取”的基础能力。

运行约束：

- 所有打开、遍历、查询和资源读取都在 Worker Thread 执行，禁止在 Electron 主线程和 Renderer 中执行。
- 导入默认单文件顺序处理，或使用严格受限的 worker 池，避免多个大词典同时建立内存索引。
- 活跃词典实例按需打开并使用 LRU 淘汰；worker 必须可关闭、崩溃重启和取消长任务。
- PGlite 只由 Node 后端持有，解析 worker 不直接打开数据库。
- `Buffer`/`ArrayBuffer` 尽量通过 transferable 传输，避免 MDD 大资源在进程内反复复制。

必须在原型阶段确认的风险：

- js-mdict 可能在打开文件时建立并重排完整关键词列表，峰值内存必须用两部真实词典实测。
- `KeyWordItem` 或底层 record offset 是否能稳定序列化、跨进程重启复用，需要验证；若不能，第一版使用 `dictionary_id + term + ordinal` 回查。
- MDD 高层接口返回 Base64 会增加约三分之一体积并产生额外复制；需要确认能否通过薄封装或维护小型分支直接返回 `Buffer`/`Uint8Array`。
- js-mdict 只负责底层格式读取；`@@@LINK`、词典专属 target 清理、HTML 组合和资源协议仍由 Node 内容层负责。
- 同步 API 不能进入 Electron 主线程，Worker Thread 是架构要求而非可选优化。

Python `mdict-utils` 继续作为验证基线，但不进入正式运行链路。最终判断依据是两部真实词典的兼容性、导入耗时、峰值内存、随机查询延迟、冷启动和损坏文件行为，而不是孤立的微基准。

## 10. 分阶段执行计划

### 阶段 0：冻结验证范围

目标：明确第一版必须支持的文件和功能，不写 UI。

- 将 OALDPE 与 LDOCE5 作为固定回归样本。
- 记录样本文件大小、哈希和元数据。
- 选定每部词典的代表性测试词条、别名、图片、MP3、SPX、专题页和循环别名。
- 明确第一版是否允许联网；建议基础版本默认离线，在线资源按词典授权。

验收：形成不可变的兼容性测试清单。

### 阶段 1：js-mdict 可行性原型

目标：不做 Electron UI，用 Node 诊断工具验证 js-mdict 的底层能力和资源成本。

- 锁定准确的 js-mdict 7.x 版本，打开全部 7 个 MDX/MDD 文件。
- 验证每个文件的版本、记录数、`Encrypted` 和编码与 Python 基线一致。
- 验证 OALDPE 与 LDOCE5 的重复键，确认 `lookupAll` 的结果、顺序和稳定性。
- 批量遍历 key，记录可获得的 `KeyWordItem`、record offset 和其他定位字段。
- 将定位信息序列化，关闭 worker/进程后重新打开文件，验证能否直接读取原记录。
- 若稳定 locator 不成立，验证 `term + ordinal -> lookupAll -> ordinal` 降级路径，确保重启后无需全量重新导入。
- 随机读取至少 1,000 条 MDX 记录和 1,000 条 MDD 资源。
- 确认 MDD 接口的 Base64 行为，并验证直接得到 `Buffer`/`Uint8Array` 的最小改造路径。
- 验证 OALDPE 的跨 MDD 分卷，以及 LDOCE5 的 MP3、SPX、CSS、JS、Base64 和重定向记录。
- 测量初始化耗时、峰值 RSS/heap、随机读取延迟，并验证损坏、截断和不支持格式的可诊断错误。

验收：结果与 Python 基线一致；locator 模式已经选定；两部词典的峰值内存边界明确；若需要薄封装或小型分支，改动范围已经量化。

### 阶段 2：Worker Thread 边界设计

目标：确定 Node 后端与 js-mdict worker 的最小稳定消息协议。

建议消息能力而非最终签名：

- `inspectDictionary(path)`
- `openDictionary(path)` / handle 生命周期
- `iterateEntries(handle, batchSize, cursor)`
- `readEntryAt(handle, locator)`，或 locator 不可用时的 `lookupAll(handle, term)`
- `iterateResources(handle, batchSize, cursor)`
- `readResourceAt(handle, locator)`，或按标准化 MDD key 定位
- `closeDictionary(handle)`

要求：

- 导入和大读取不阻塞 Electron 主线程。
- 支持取消、进度、批量返回和 backpressure。
- 错误必须可序列化，并保留文件、阶段和可诊断原因。
- 大二进制优先通过 transferable `ArrayBuffer`/`Buffer` 交付，避免无意义复制。
- 文件句柄、词典实例、worker、LRU 和崩溃重启生命周期明确。
- Node 主线程不解析 MDict 二进制格式；worker 不直接访问 PGlite。

验收：Node CLI 通过 Worker Thread 完成真实词典索引和随机读取，不涉及 React。

### 阶段 3：PGlite 索引原型

目标：验证仅保存键和 locator 的数据模型。

- 建立 Dictionary、DictionaryFile、EntryIndex、ResourceIndex。
- 批量事务导入，避免逐条 insert。
- 同时保留原始键和规范化键。
- 支持单键多记录。
- 支持 LDOCE5 21 万以上别名记录。
- 增加导入中断、失败清理、恢复或重新导入策略。
- 测量 PGlite 数据库大小、导入时间和查询延迟。

验收：重启进程后无需重新导入索引；能够按稳定 locator 直接读取，或让词条按 `term + ordinal`、资源按标准化 MDD key 降级回查原始内容。

### 阶段 4：通用查询与重定向解析

目标：在 Node 层生成逻辑词条结果。

- 多记录查询。
- `@@@LINK` 递归解析。
- visited/cycle 防护和深度限制。
- fragment/anchor 保留。
- LDOCE5 target 清理适配器。
- 明确正文、隐藏资源节点和重复正文的组合顺序。
- 为损坏 link 返回部分结果和诊断，不让整次查询失败。

验收：`apple` 等样本能返回正文、内嵌图片依赖和所有必要记录；循环别名不会卡死。

### 阶段 5：自定义协议与沙箱渲染

目标：在 Electron 中忠实显示两部词典，但暂不追求完整产品 UI。

- 注册 `dictol-dict://`。
- 从外置文件、MDX、MDD 返回资源。
- 设置 MIME、CSP、缓存和 Range 行为。
- 使用独立沙箱页面运行词典脚本。
- 拦截 `entry://`、`sound://` 和外部 URL。
- OALDPE 验证 CSS、字体、折叠、配置、深色模式和 localStorage。
- LDOCE5 验证 HTML fragment 包装、别名图片、折叠、中文切换和离线 MP3。
- 验证词典切换后 origin、localStorage、缓存互不污染。

验收：代表词条的视觉和交互与成熟词典软件基本一致，词典页面无法访问 Node/Electron。

### 阶段 6：媒体兼容

目标：补齐音频和大资源传输。

- MP3 直接流式返回。
- SPX 按需解码，比较 Speex WASM、本机 FFmpeg 子进程与暂不支持三种路径，并确定缓存格式。
- 支持取消播放、重复播放和并发资源请求。
- 对大资源避免完整复制到多个进程。
- 决定是否实现 HTTP Range。

验收：OALDPE 与 LDOCE5 的代表性单词、例句、MP3、SPX 均可播放，内存没有随资源大小异常增长。

### 阶段 7：安全与网络权限

目标：把任意导入词典视为不可信内容。

- CSP 默认禁止外部脚本和任意网络。
- 词典级、域名级网络授权。
- 禁止 Node、Electron、文件系统和通用 IPC。
- 禁止任意窗口创建、下载和协议逃逸。
- 外部链接交给主应用确认后使用系统浏览器打开。
- 路径规范化和 MDD key 规范化安全测试。
- 对 HTML/JS 的崩溃、死循环和高 CPU 行为提供隔离与恢复。

验收：恶意测试词典不能读取本地文件、调用 Node、访问其他词典 origin 或绕过网络策略。

### 阶段 8：React 产品界面

目标：在底层链路稳定后构建桌面产品体验。

- 词典导入、校验、进度、取消和失败恢复。
- 搜索框、建议、历史、前进后退。
- 多结果和多词典结果组织。
- 词典启用/禁用、排序、删除索引但保留源文件。
- 缺失源文件重定位。
- 网络权限和词典设置界面。
- 诊断页显示解析器版本、文件状态和兼容性警告。

验收：完成端到端桌面应用工作流。

### 阶段 9：打包与回归

- 锁定 js-mdict 和压缩/解码依赖的准确版本与完整性。
- 验证 Electron 内置 Node 版本下的 ESM/CJS 兼容性。
- 验证 worker bundle 在打包后的路径、`asar`/`asarUnpack` 行为及源文件访问权限。
- 验证 macOS、Windows、Linux 的自定义协议、文件路径和可选 FFmpeg 可用性。
- app.userData 迁移和数据库 schema version。
- 大词典首次导入、升级、卸载和残留数据策略。
- 冷启动、导入、查询、资源读取和内存基准。
- OALDPE、LDOCE5 固定回归测试。

## 11. 第一批回归用例

### OALDPE

- `apple`：完整 HTML、CSS、JS、英美音频、插图、内部链接。
- `oaldpeconfig`：配置页面与 localStorage。
- `@topic_...`：特殊专题键。
- 重复键示例：`service station`，确认返回 6 条记录。
- 分卷验证：基础资源、`.1` 音频、`.2` 图片、`.3` 音频。

### LDOCE5

- `apple`：正文 + `@@@LINK=ldoce4188jpg` + Base64 图片节点。
- 普通 `entry://` 与带 fragment 的链接。
- MP3 英音、美音、例句发音。
- 任意 `.spx` 示例，例如 `\media\spx\GB_aleck0205.spx`。
- 最大深度 4 的别名，例如 `abridgments`。
- 循环别名：`cockfight`、`lipread`、`ghostwrite`。
- 含 HTML 的 link target：`add something on something`。
- 大小写行为：`apple` 与 `Apple`。
- 缺失 `LM5style_switch.css` 和 `LM5pp_config.ini` 时页面仍能初始化。

## 12. 关键风险与待决策事项

1. **js-mdict 内存与定位能力**：重点验证完整关键词索引的峰值内存、批量遍历、稳定 locator、重复键顺序和 `Encrypted=2`。
2. **词典内容适配层粒度**：建议通用 MDict worker + 可插拔 Node 内容适配器，不把具体词典 HTML 规则写进底层解析核心。
3. **词典页面容器**：在正式实现前用最小原型比较独立 WebContentsView 与受控 iframe 的隔离、生命周期和输入体验。
4. **SPX 解码方案**：比较 Speex WASM、本机 FFmpeg 和第一版暂不支持，确认跨平台体积、性能及缓存格式。
5. **网络默认策略**：建议默认离线，逐词典授权；OALDPE 默认配置与此冲突，需要产品层明确提示。
6. **外置资源发现**：导入 MDX 时扫描同目录同 basename 资源，并记录缺失依赖，但不得盲目允许任意文件访问。
7. **PGlite 并发模型**：明确只有 Node 后端持有数据库，避免 Renderer 和多个 worker 同时以不受控方式打开同一文件。
8. **删除语义**：默认只删除 app.userData 内索引和缓存，不删除用户原始 MDX/MDD；删除源文件必须单独明确授权。
9. **版权与分发**：应用代码和词典内容严格分离。
10. **MDD Base64 开销**：优先让 worker 返回原始二进制；若只能使用 Base64，必须测量峰值内存并限制并发资源读取。

## 13. 下一步建议

用户允许开始编码后，从“阶段 0 + 阶段 1”开始，不直接搭建完整 Electron/React UI。第一项实现应是一个可重复运行的 Node + Worker Thread + js-mdict 解析验证工具，用两部真实词典建立基准与回归证据；只有 locator、重复键、重定向和资源读取稳定后，再接入 PGlite 与 Electron 渲染。
