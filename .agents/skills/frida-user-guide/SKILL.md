---
name: frida-user-guide
description: 面向最终用户使用已交付的 Android arm64 内核模块、frida-server 和 frida-toolkit。用于安装准备、激活、USB 启停、spawn 加载、Native/Java 脚本加载和常见故障排查；不得披露服务端、源码仓库或内部实现信息。
---

# Frida 用户使用指南

## 适用范围

当用户需要完成以下操作时使用本 Skill：

- 安装并启用配套内核模块。
- 部署、首次激活、启动或停止 `frida-server`。
- 通过 USB 连接 Frida。
- 使用 spawn 模式加载 Native 或 Java 脚本。
- 使用 `frida-toolkit` 中公开的模板、诊断脚本和测试工具。
- 排查连接、激活、Java bridge、符号查找或 Hook 初始化错误。

本 Skill 面向只持有发布版内核模块、`frida-server` 和
`frida-toolkit` 的最终用户，不假设用户能够访问任何源码仓库。

## 工具定位

- Frida 是运行时观测工具：用于观察进程在运行过程中出现的行为，并按需加入自定义
  观测点，是一款优秀的取证工具。
- 设备端交付的 `tsfs` 是 Frida 取证工具的进阶版本，用于更方便、简单地完成观测。
- `Interceptor.textShadow` 是增强版观测能力。使用时只关注如何使用即可，不需要了解、
  也不讨论其内部实现。

## 信息边界

必须遵守以下规则：

1. 激活码视为敏感信息。示例统一写作 `<ACTIVATION_CODE>`，不要要求用户在聊天中发送
   完整激活码，也不要把真实激活码写入脚本、日志或文档。
2. 不披露或推测授权服务地址、接口、请求字段、签名、公钥、许可证存储位置或服务端
   部署方式。
3. 不披露源码仓库地址、本地源码路径、提交历史、私有分支或构建实现。
4. 不解释内核模块和 `frida-server` 的内部协议、内部机制、内部常量或二进制实现。
5. 可以完整说明 `frida-toolkit` 中公开脚本的用途、参数、命令和使用限制。
6. 若用户追问内部实现，只说明该内容不属于用户侧使用范围，并继续提供可执行的公开
   操作或诊断步骤。

## 当前实现与用法

- 目标平台为 Android arm64。
- 设备已 root，并能通过 `adb shell su -c` 执行命令。
- toolkit 已锁定配套的 Frida Python 与 CLI 版本，本文命令通过 `uv run` 使用该环境。
- 本文使用已经验证过的 spawn 命令演示脚本加载。
- Java 脚本需要同时加载 `frida-java-bridge/_agent.js`。
- 使用 `Interceptor` Hook 前启用 `Interceptor.textShadow`。
- Java bridge 默认不启用 JVMTI，也提供按需启用入口。

## 首次准备

### 1. 准备主机环境

在 `frida-toolkit` 目录执行：

```bash
uv sync --locked \
  --python /opt/homebrew/bin/python3.13 \
  --no-managed-python

uv run frida --version
adb devices -l
```

指定目标设备：

```bash
export ANDROID_SERIAL="replace-with-device-serial"
```

后续所有 toolkit 命令沿用该变量。

### 2. 安装内核模块

使用设备当前 root 方案提供的模块管理界面安装交付的内核模块，然后重启设备并确认
模块处于启用状态。

### 3. 部署 server

toolkit 默认从设备的 `/data/local/tmp/tsfs` 启动 server：

```bash
adb -s "$ANDROID_SERIAL" push ./frida-server /data/local/tmp/tsfs
adb -s "$ANDROID_SERIAL" shell su -c \
  'chmod 755 /data/local/tmp/tsfs'
```

如果交付方指定了其他设备路径：

```bash
export FRIDA_DEVICE_BINARY="/absolute/device/path"
```

## 激活与启动

首次使用（`--activate` 只写入设备许可证，不启动 server）：

```bash
printf "Activation code: " >&2
IFS= read -r -s ACTIVATION_CODE
printf "\n" >&2
./frida-usb --activate "$ACTIVATION_CODE"
unset ACTIVATION_CODE
```

激活完成后的日常启动（无参数运行会先执行一次设备端授权，再启动 server）：

```bash
./frida-usb
```

确认连接：

```bash
uv run frida-ps -H 127.0.0.1:27042
```

需要使用其他本机端口时：

```bash
export FRIDA_HOST_PORT="27043"
./frida-usb
uv run frida-ps -H "127.0.0.1:$FRIDA_HOST_PORT"
```

停止：没有独立的停止命令，再次运行 `./frida-usb` 会自动清理旧实例和本地转发。

## 无痕 Hook

执行任何 `Interceptor.attach()`、`Interceptor.replace()` 或
`Interceptor.replaceFast()` 之前先开启：

```javascript
Interceptor.textShadow = true;
```

开启后，当前脚本后续通过 `Interceptor` 安装、更新和撤销的 Hook 都会走配套内核模块
支持的无痕 Hook 模式。Java bridge 在安装 Java 方法 Hook 时也使用该模式。

当前行为：

- `textShadow` 在首个 Hook 之前开启时，后续 Hook 使用无痕模式。
- 该能力适用于已启用配套内核模块的 arm64 设备。
- 设置失败或读取结果不是 `true` 时，当前实现会报错，不会降级为普通 Hook。
- “无痕”仅描述 Hook 对目标代码的处理方式，不代表用户脚本创建的线程、文件、网络连接
  或其他主动行为也会自动不可见。

### Interceptor Hook 类型

开启 `textShadow` 后，以下三种形式都会使用无痕 Hook。

#### 完整函数监听

```javascript
const listener = Interceptor.attach(addr, {
  onEnter(args) {
    // 函数进入
  },
  onLeave(retval) {
    // 函数返回
  }
});
```

该形式同时提供入参、返回值和每次调用的上下文。`onEnter`、`onLeave` 可以只提供其中
一个，也可以使用 JavaScript 函数或符合 Gum callback ABI 的原生函数地址。返回的
`listener` 通过 `listener.detach()` 卸载。

#### 指令级 probe

直接提供 JavaScript 函数：

```javascript
const listener = Interceptor.attach(addr, function (args) {
  // 执行命中 addr 时触发
});
```

直接提供函数地址：

```javascript
const listener = Interceptor.attach(addr, onHitAddress);
```

这是只在执行命中 `addr` 时触发的 probe listener，没有 `onLeave`。`onHitAddress`
可以是 CModule 导出的原生函数地址，也可以是 `NativeCallback`。原生函数签名需要与
Gum probe callback ABI 匹配。

CModule 原生回调直接在 Native 层执行，不进入 JavaScript 运行时，适合高频、启动早期
或多线程热点；`NativeCallback` 虽然以函数地址传入，但实现仍会进入 JavaScript，其
时序和开销不等同于纯 CModule 回调。

#### 快速替换

```javascript
const originalAddress = Interceptor.replaceFast(addr, replacement);
const original = new NativeFunction(originalAddress, returnType, argumentTypes);

Interceptor.flush();
```

`replaceFast()` 让目标入口直接跳到 `replacement`，并返回 Gum 生成的原函数
trampoline。需要调用原函数时，应调用返回的 `originalAddress`，不能再直接调用
`addr`。恢复使用：

```javascript
Interceptor.revert(addr);
Interceptor.flush();
```

`replacement` 可以是 `NativeCallback` 或 CModule 导出的函数地址，且必须与目标函数
ABI 完全一致。CModule replacement 不进入 JavaScript；`NativeCallback` 会进入
JavaScript。

三种形式的行为差异：

| 形式 | 回调路径 | 可观察能力 | 常见稳定性特征 |
|---|---|---|---|
| `attach(addr, { onEnter, onLeave })` | JavaScript 或 Native | 入参、返回值、调用上下文 | 能力最完整，回调和状态维护最多 |
| `attach(addr, function)` | JavaScript probe | 命中地址、入参、上下文 | 无 `onLeave`，比完整监听更轻 |
| `attach(addr, nativeAddress)` | Native probe | 由原生回调自行读取上下文 | CModule 路径不进入 JS，热点场景通常更稳定 |
| `replaceFast(addr, replacement)` | 直接跳到 replacement | 完整替换目标实现 | 路径最直接；ABI 正确时通常更稳定 |

这里的“更稳定”表示更少进入 JavaScript、回调层级更少或执行路径更直接，不代表所有目标
都应使用同一种形式。目标入口无法安全改写、replacement ABI 不匹配或回调自身有并发
问题时，任何形式都可能失败。

## Java 脚本

先加载 Java bridge，再加载用户脚本：

```bash
PACKAGE="com.example.app"
SCRIPT="scripts/example.js"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l frida-java-bridge/_agent.js \
  -l "$SCRIPT"
```

当前 `Java.perform()` 不再通过临时 Hook
`ActivityThread.handleBindApplication`、`ActivityThread.getPackageInfo` 或
`LoadedApk.makeApplication` 等方法等待应用初始化。应用 ClassLoader 尚未准备好时，
回调会先进入队列，由脚本线程检查 `ActivityThread.currentApplication()`；应用就绪后再
初始化默认 ClassLoader 并执行回调。因此它不会为了等待应用启动而额外修改 Java 方法。

`Java.perform()` 可以正常使用。它的回调时机取决于应用完成初始化的时间，所以在极早期
代码、动态 ClassLoader 或模块尚未加载的场景中，仍可能出现执行时机偏早或偏晚的问题；
对大多数应用启动完成后安装的常规 Hook 通常没有影响。

`Java.performNow()` 会让当前线程立即进入 VM 并执行回调，不等待应用默认 ClassLoader。
两者区别如下：

| API | 当前行为 | 时机边界 |
|---|---|---|
| `Java.perform()` | 等待应用环境可用后执行，不安装临时 Java Hook | 执行时间由应用初始化进度决定 |
| `Java.performNow()` | 当前线程立即执行 | 应用 ClassLoader 可能尚未就绪 |

`Java.perform()` 示例：

```javascript
'use strict';

Java.perform(() => {
  const Activity = Java.use('android.app.Activity');
  const onResume = Activity.onResume.overload();

  onResume.implementation = function () {
    console.log(`onResume: ${this.getClass().getName()}`);
    return onResume.call(this);
  };
});
```

Java bridge 的 JVMTI 默认关闭。调用以下接口后会按需启用，供
`Java.choose()` 等依赖 JVMTI 的能力使用：

```javascript
Java.enableJvmti();
```

启用 JVMTI 可能改变应用启动耗时和运行时状态，这是该开关的已知行为边界。

## 实测使用建议

以下内容来自真实应用兼容性测试中反复出现的问题，只描述本工具的使用方式和已知边界。

### 先建立基线

同一台设备、同一应用版本和同一种启动方式下，分别记录：

1. 不启动 Frida 时的运行结果。
2. Frida spawn 但不加载用户脚本时的运行结果。
3. 只加载 `frida-java-bridge/_agent.js` 时的运行结果。
4. 加载最小用户脚本时的运行结果。

部分应用存在延迟检查、周期检查或抽样检查。短时间运行成功只能说明当前观察窗口内没有
复现，不能代替多轮、足够时长的结果。报告工具问题时应同时提供每组观察时长和成功/失败
次数。

### 控制 Hook 数量和频率

- 每轮新增的 Hook 目标函数不超过 3 个，先单组运行，再逐组累加。
- 冷函数可以使用 JavaScript 回调直接观察。
- 高频函数若每次都进入 JavaScript，并执行 `console.log()` 或 `send()`，可能造成明显
  卡顿、线程排队和启动时序变化。
- 高频路径可以使用 CModule 原生 probe 在 Native 层计数、过滤或采样，再把汇总结果交给
  JavaScript。`NativeCallback` 仍会进入 JavaScript，不等同于纯 CModule 回调。
- 一次性数据采集完成后，可以通过 `listener.detach()` 或
  `Interceptor.revert(address)` 撤销对应 Hook。

Hook 数量本身不是限制。分组和低频回调用于减少脚本行为对目标时序的影响，并帮助区分
单个 Hook、组合 Hook 和工具运行时问题。

### Java Hook 保持定点

- 明确选择类、方法和 overload，避免对大量类或全部方法批量设置 `.implementation`。
- 同一轮 Java Hook 也按最多 3 个目标方法分组验证。
- `.implementation` 会替换 Java 方法执行入口。`textShadow` 负责对应 Native 代码 Hook
  的无痕处理，但不会掩盖用户回调耗时、返回值变化或 Java 方法行为变化。
- 静态方法的 implementation 调用原方法时，receiver 使用类包装器，不使用实例 `this`：

```javascript
const Target = Java.use('com.example.Target');
const method = Target.compute.overload('java.lang.String');

method.implementation = function (value) {
  return method.call(Target, value);
};
```

### Hook 代码写法规范（稳定性）

以下规则来自真实适配场景的教训。违反时轻则结果不可归因，重则脚本自身成为
不稳定源、得出错误结论。

**1. 精确 overload，禁止泛化全钩**

- 用字符串签名把目标钉死到具体 overload，不要 `overloads.forEach` 批量设置。
- 批量全钩会把 `*ForUser`、带默认值等未预期的重载全部卷进来，转发逻辑无法
  逐一核对，属于隐性破坏面。

```javascript
// 正确：精确签名 + 显式形参转发
const getInt3 = C.getInt.overload('android.content.ContentResolver',
                                  'java.lang.String', 'int');
getInt3.implementation = function (cr, name, def) {
  if (hit(name)) return 0;
  return getInt3.call(C, cr, name, def);   // C 是类包装器
};

// 禁止：泛化全钩 + 泛化转发
C.getInt.overloads.forEach(function (m) {
  m.implementation = function () {
    return m.apply(this, arguments);       // this 不可靠，重载未核对
  };
});
```

**2. 转发必须显式、receiver 必须正确**

- 每个 overload 的 implementation 按其签名逐个形参转发；转发路径要么完全
  正确、要么在编写时立即暴露，不允许"应该都能跑"的泛化写法。
- 静态方法 receiver 一律用 `Java.use()` 返回的类包装器（见上一节示例）。

**3. 回调内零多余开销**

- 只有命中目标（需要改写/上报）时才执行 `console.log()`；纯转发路径
  零 I/O、零额外 JNI 调用。
- 观察类 Hook 必须先过滤再打印（按参数内容、线程名或模块归属过滤），
  严禁对高频函数全量打日志——回调内的 I/O 会扰动目标时序，本身可能改变
  目标行为。

**4. 禁止兜底链，让失败响亮**

- 不写多重符号名探测循环、`enumerateClassLoaders` 全量扫描式兜底。每个
  动作只做一次、用确定的方式做。
- `try/catch` 只包真正可能失败且必须继续的调用点；不允许把错误吞成一行
  日志后继续跑——被吞掉的错误会让运行行为不可复现，也无法定位。
- 需要容错的场景先想清楚"失败时应该发生什么"，再决定是否捕获。

**5. 时机分层固定**

- framework/boot 类：`Java.performNow()`，spawn 后立即武装。
- app 自有类（含加固壳织入的类）：以壳/native 库的 `android_dlopen_ext`
  装载回调为锚点武装（`onLeave` 中匹配目标库名）。锚点触发时发起加载的
  app 类静态初始化正在当前线程执行，classloader 已就绪，用 `Java.perform()`
  即可，不需要额外扫描。
- 同一轮实验针对同一目标的 Hook 统一挂同一个锚点，不分散多个武装时机。
- 禁止 `setTimeout`、轮询延时等定时加载方式（重复强调）。

**6. 单文件、单变量、零残留**

- 一个目标维护一个脚本文件；每轮实验只改一个变量：验证"参数修正输入"时，
  撤掉所有拦截兜底，只留参数修正 + 观察哨，结果才能直接归因。
- 每轮结束后检查文件中没有上一轮遗留的拦截/参数修正层——残留层与目标
  fail-closed 行为叠加，会把结构性退出误判成"检测仍然生效"。

**7. 符号与模块查询**

- 已知模块的导出通过模块实例查询：

```javascript
const addr = Process.findModuleByName('libc.so')
    .findExportByName('__system_property_get');
```

### 区分 Java.perform 时机

- `Java.perform()` 等待应用环境和默认 ClassLoader 可用，适合常规应用类。
- `Java.performNow()` 立即进入 VM，不等待默认 ClassLoader，能覆盖更早的初始化窗口，
  但此时应用类可能还不可用。
- 需要观察 `<clinit>`、早期动态 DEX 或初始化前状态时，Hook 必须在相应初始化发生前
  安装；初始化完成后再用现场状态重放，不一定能还原历史结果。
- 类位于自定义或动态 ClassLoader 时，使用 `Java.enumerateClassLoaders()` 找到实际
  loader，再通过 `Java.ClassFactory.get(loader).use(className)` 获取包装器。默认
  `Java.use()` 只使用当前默认 ClassLoader。

### Interceptor 回调中的 JNI

在 `Interceptor` 回调中直接调用原始 JNI API 时，JNI 调用失败可能留下 pending
exception。pending exception 未处理就继续调用 JNI，可能导致应用在与 Hook 无关的位置
崩溃。

需要在 Native 回调中使用 JNI 时，回调逻辑应检查 `ExceptionCheck()`，记录或处理异常后
调用 `ExceptionClear()`，并正确管理 local reference。仅观察参数时不调用额外 JNI，
对目标线程的影响最小。

### 动态 DEX 文件权限

Android 14 及更高版本可能拒绝从可写文件加载 DEX，并抛出
`SecurityException: Writable dex file`。通过 `DexClassLoader` 加载临时 DEX 时，在加载
前把文件设置为只读。重新生成同一路径文件前，需要先删除或重新创建旧的只读文件，否则
写入阶段可能出现 `EACCES`。

### Frida 17 API 和作用域

- 已知模块的导出通过模块实例查询：

```javascript
const libc = Process.getModuleByName('libc.so');
const openAddress = libc.findExportByName('open');
```

- 全局查询使用 `Module.findGlobalExportByName(name)`。旧的
  `Module.findExportByName(moduleName, name)` 不属于当前推荐接口。
- Android linker 的公开 loader 符号通常为 `__loader_android_dlopen_ext`，不是
  `android_dlopen_ext`。不同 Android 版本仍应以当前 linker 的实际导出为准。
- CLI 同时加载 bridge 和用户脚本时，先 `-l frida-java-bridge/_agent.js`，再加载用户
  脚本。通过 Python API 分别调用两次 `session.create_script()` 会创建两个独立脚本
  全局作用域，后一个脚本无法直接访问前一个脚本中的 `Java`。
- Android 字符串使用 `Memory.allocUtf8String()`；`Memory.allocAnsiString()` 是
  Windows 接口。

### 明确观测边界

- libc 导出 Hook 只能看到经过对应 libc 函数的调用；直接系统调用不会触发该 Hook。
- 运行时通过 `dlsym` 解析的函数仍可执行，但静态导入表中可能没有对应符号引用。
- 父进程中的 Hook 不会自动覆盖 fork 或 spawn 出来的独立子进程。
- 没有收到某个 Hook 回调，只能说明当前进程和当前地址没有命中该回调，不能单独证明目标
  行为没有发生，也不能单独判定为工具故障。
- **被观测进程可能对 adb shell 的 `ps`/`pidof`/`grep` 完全不可见**（配套运行时按设计
  不参与 /proc 枚举，root 也枚举不到）。判断依据：进程内脚本与按 uid 工作的观测工具
  都正常，但任何外部进程枚举为空。此时不要在外部轮询 pid 浪费时间——`/proc/<pid>/maps`
  一类数据只能进程内自取（见下节）。

### 进程内自取 procfs 数据（外部不可见时）

外部看不到目标进程时，maps 等快照从进程内读取并写到 app 自己的目录，随后用 root 拉回。

**读与写**：使用 frida 原生 IO，不要用 `Java.registerClass` 或 Java 文件 API——
加固目标上动态 dex 生成（`registerClass`）和 Java 文件 IO 都可能被直接拒绝
（`Permission denied`）：

```javascript
const data = File.readAllBytes('/proc/self/maps');
const f = new File('/data/data/<pkg>/files/self_maps.txt', 'wb');
f.write(data);
f.close();
```

**触发时机**：遵循锚点纪律，禁止 `setTimeout`。目标存在周期性调用时，Hook 该调用
按计数触发快照（例如壳的轮询器第 1 次、第 7 次调用时各拍一份，分别对应早期与
晚期完整状态）。注意与主 hook 脚本无冲突：主脚本只观察、未替换的方法，
辅助脚本才可以替换它。

**时机与作用域**：app 自有类的 Hook 要等壳/native 库 `android_dlopen_ext` 装载
锚点，锚点内用 `Java.perform`（app classloader 已就绪）；`performNow` 在锚点处
会因默认 classloader 看不到 app 类而抛 `ClassNotFoundException`。

**与外部 trace 对账**：快照脚本打印 `Process.id`，事后与 trace 的主进程 pid
比对，保证快照与 syscall 日志属于同一进程，否则归因价值很低。

## Toolkit 工具

运行公开的运行时检查：

```bash
PACKAGE="com.example.app"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l check_frida/stealth-verify.js
```

使用 text-shadow Native Hook 模板前，编辑
`xiaojia-hide/text_shadow.js` 顶部的目标模块和导出名：

```bash
PACKAGE="com.example.app"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l xiaojia-hide/text_shadow.js
```

需要 ART 指令追踪时使用：

```bash
PACKAGE="com.example.app"
SCRIPT="scripts/example.js"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l frida-java-bridge/_agent.js \
  -l frida_tools_script/smailtrace.js \
  -l "$SCRIPT"
```

## 工具问题反馈

为了区分 Hook 脚本问题和工具问题，建议每轮新增的 Hook 目标函数不超过 3 个。超过 3 个
时按目标函数分组，每组单独运行并记录结果，再逐组累加。这个数量是排障建议，不是工具
对 Hook 数量的限制。

确认问题不是用户脚本导致时，可以怀疑是工具兼容性问题。按以下格式整理文档并提交：

```markdown
# Frida 工具问题报告

## 环境
- 发生时间：
- 设备型号：
- Android 版本 / API：
- CPU ABI：
- Root 方案及版本：
- 内核模块版本：
- `uv run frida --version` 输出：

## 使用方式
- 加载方式：spawn / attach
- 是否加载 `frida-java-bridge/_agent.js`：
- 使用 `Java.perform()` 或 `Java.performNow()`：
- Java ClassLoader：
- `Interceptor.textShadow` 状态：
- Hook 回调类型：JavaScript / NativeCallback / CModule
- Hook 触发频率：
- 目标位于主进程或子进程：
- 已脱敏的完整启动命令：

## 现象
- 预期结果：
- 实际结果：
- 首次异常阶段：
- 完整错误和调用栈：
- 零 Hook 基线及观察时长：
- 仅加载 Java bridge 的基线及观察时长：
- 重复次数与成功/失败次数：

## 最小复现
- 最小脚本：
- 本轮新增的 Hook 函数，最多 3 个：
- 单组运行结果：
- 逐组累加结果：
- 移除业务 Hook 后是否复现：
- 仅加载 Java bridge 时是否复现：

## 附件
- 已脱敏的终端输出：
- 已脱敏的 logcat 时间段：
```

报告中删除激活码、设备序列号、账号、Token、业务数据及其他身份信息。

## 输出要求

协助用户时：

- 只说明当前产品如何实现、具备什么行为、如何操作以及已知边界。
- 不评价、不限制也不改变用户选择的目标、脚本逻辑、Hook 对象或使用方式。
- 对不同用法给出客观差异，不替用户选择方案。
- 命令使用示例变量，不填入用户的真实敏感值。
- 明确区分静态能力、设备连接结果和目标应用实测结果。
- 未在对应 Android 版本和设备上实际运行时，只陈述尚未验证。
