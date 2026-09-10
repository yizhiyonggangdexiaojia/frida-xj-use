# frida-xj-use

> 禁止将本项目用于任何违法犯罪活动。

## 项目定位

本项目是面向最终用户的 Android arm64 Frida XJ 发布版使用工程。用户取得配套内核
模块、`frida-server` 和激活码后，可以直接使用本仓库完成：

- 创建锁定版本的 Frida Python 与 CLI 环境。
- 部署、激活、启动和停止设备端 `frida-server`。
- 通过 USB 转发使用 spawn 或 attach 模式注入目标进程。
- 加载 Native、Java 或 Java + Native 组合 Hook 模板。
- 让 AI 助手依据内置 skill 提供使用指导和故障排查。

仓库只交付用户侧启动工具、预构建 Java bridge、示例脚本、实测记录和 AI skill，
不包含内核模块、`frida-server`、授权服务或运行时内部实现。

## 文档分工

| 资料 | 面向对象 | 职责 |
| --- | --- | --- |
| 本 README | 最终用户 | 环境准备、激活、启停、示例运行和高频故障 |
| `scripts/` | 最终用户与 AI | 可直接运行和修改的最小 Hook 模板 |
| `JAVA-NATIVE-HOOK-DEMO.md` | 需要核对实测结果的用户 | 固定环境下的组合 Hook 日志、结果和截图 |
| [`.agents/skills/frida-user-guide/SKILL.md`](.agents/skills/frida-user-guide/SKILL.md) | AI 助手 | 更完整的 API 边界、使用建议和排障流程 |

`frida-user-guide` 是本项目内置、供 AI 助手加载的固定指南，不是第二份用户
README。普通用户按本 README 操作即可；实测文档只记录验证证据，不重复安装和通用
使用说明。

## 仓库内容

| 文件 | 用途 |
| --- | --- |
| `frida-usb` | 激活、授权、启停设备端 server，并建立 ADB 转发 |
| `frida-java-bridge/_agent.js` | Java 脚本需要同时加载的预构建 bridge |
| `scripts/native-hook.js` | `libc.so!open` Native Hook 示例 |
| `scripts/java-hook.js` | `Log.i(String, String)` Java Hook 示例 |
| `scripts/java-native-hook.js` | 同一会话内 Java + Native 三定点演示 |
| `.agents/skills/frida-user-guide/SKILL.md` | 安装、注入、Hook 使用与排障的 AI 指南 |
| `JAVA-NATIVE-HOOK-DEMO.md` | 四个发行版 App 的 60 秒组合 Hook 实测记录 |
| `screenshots/` | 上述实测记录对应的存活截图 |
| `pyproject.toml` / `uv.lock` | 固定 Frida Python 与 CLI 版本 |

## 使用 AI Skill

支持项目级 skill 的 AI 助手可以从
`.agents/skills/frida-user-guide/SKILL.md` 加载指南。建议在问题中明确指定
`frida-user-guide`，例如：

```text
请使用 frida-user-guide，带我完成首次环境准备、设备激活和 USB 启动。
```

```text
请使用 frida-user-guide，用 spawn 模式为 com.example.app 加载
scripts/native-hook.js。
```

```text
请使用 frida-user-guide，排查 Interceptor.textShadow is unavailable。
```

```text
请使用 frida-user-guide，帮我为 com.example.app 编写一个指定 overload 的
Java Hook，并给出正确的 bridge 加载命令。
```

```text
请使用 frida-user-guide，按照“工具问题反馈”模板帮我整理一份已脱敏的问题报告。
```

该 skill 还覆盖 `Interceptor` 回调形式、`Java.perform()` 与
`Java.performNow()` 的时机、JVMTI、动态 ClassLoader、JNI 异常、高频 Hook 和问题
报告整理。使用时遵循以下边界：

- 不向 AI 发送完整激活码、设备序列号、账号、Token 或业务数据。
- AI 只应说明用户侧操作和公开脚本，不披露或推测服务端、授权、内核模块及运行时内部
  实现。
- 静态能力、设备连接成功和目标 App 实测结果必须分开描述。
- 当前项目可直接使用的文件和命令以本 README 及仓库实际内容为准。

### 工具问题反馈

遇到疑似工具兼容性问题时，先参考 skill 中的
[“工具问题反馈”](.agents/skills/frida-user-guide/SKILL.md#工具问题反馈)完成分组和
累加测试，再让 AI 按模板整理报告。报告应包括环境、注入方式、完整现象、四组基线、
最小复现、重复次数以及已脱敏的终端输出和 logcat；不要只提交错误截图或一句现象描述。

提交前删除激活码、设备序列号、账号、Token、业务数据及其他身份信息。

当前 `_agent.js` SHA-256：

```text
8df045274d77c2971c9810e6fd366ee7873474e4aa2637bfb296627bf38e4164
```

## 使用条件

- Android arm64 设备。
- 设备已 root，`adb shell su -c` 可用。
- 已安装并启用配套内核模块。
- 已取得配套 arm64 `frida-server` 和激活码。
- 主机已安装 ADB、uv 和 Python 3.13。

激活码属于敏感信息。不要把真实激活码写入脚本、文档、Issue、终端截图或日志。

## 快速开始

### 1. 准备主机环境

```bash
git clone https://github.com/yizhiyonggangdexiaojia/frida-xj-use.git
cd frida-xj-use

uv sync --locked --python python3.13 --no-managed-python
uv run frida --version
adb devices -l
```

预期 Frida 版本为 `17.9.1`。设置本次操作使用的设备：

```bash
export ANDROID_SERIAL="<DEVICE_SERIAL>"
```

### 2. 安装模块并部署 server

通过设备当前 root 方案的模块管理界面安装配套内核模块，重启并确认模块已启用。

把交付的 arm64 server 放在当前目录，然后推送到默认位置：

```bash
adb -s "$ANDROID_SERIAL" push ./frida-server /data/local/tmp/tsfs
adb -s "$ANDROID_SERIAL" shell su -c \
  'chmod 755 /data/local/tmp/tsfs'
```

若交付方指定了其他设备路径：

```bash
export FRIDA_DEVICE_BINARY="/absolute/device/path"
```

`frida-usb` 不会构建、推送或自动寻找 server，设备端目标必须已经存在且可执行。

### 3. 首次激活

在交互式 shell 中隐藏输入，避免激活码进入 shell 历史：

```bash
printf "Activation code: " >&2
IFS= read -r -s ACTIVATION_CODE
printf "\n" >&2
./frida-usb --activate "$ACTIVATION_CODE"
unset ACTIVATION_CODE
```

激活成功后通常不需要重复执行。设备重启或内核模块重新加载后仍需重新授权，日常启动
命令会自动完成授权。

### 4. 启动、检查和停止

```bash
./frida-usb start
uv run frida-ps -H 127.0.0.1:27042
```

`./frida-usb` 等同于 `./frida-usb start`。停止本次 server 和 ADB 转发：

```bash
./frida-usb stop
```

需要切换本机端口时：

```bash
export FRIDA_HOST_PORT="27043"
./frida-usb start
uv run frida-ps -H "127.0.0.1:$FRIDA_HOST_PORT"
```

该脚本不安装开机服务。设备重启、ADB 断开或 server 退出后，需要重新启动。

## 运行 Hook 示例

### Native

```bash
PACKAGE="com.example.app"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l scripts/native-hook.js
```

Native 模板在安装 `Interceptor` Hook 前启用并校验：

```javascript
Interceptor.textShadow = true;
```

该能力不可用时脚本会报错，不会降级为普通 Hook。模板通过 RPC 提供 `detach()`，
自定义脚本也可以保存 listener 并调用 `listener.detach()`。

### Java

Java 脚本必须在同一条 CLI 命令中先加载 bridge，再加载用户脚本：

```bash
PACKAGE="com.example.app"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l frida-java-bridge/_agent.js \
  -l scripts/java-hook.js
```

`Java.perform()` 会等待应用环境和默认 ClassLoader 可用。`Java.performNow()` 会立即
进入 VM，但此时应用 ClassLoader 可能尚未准备好。JVMTI 默认关闭；确实需要
`Java.choose()` 等依赖 JVMTI 的能力时显式调用：

```javascript
Java.enableJvmti();
```

启用 JVMTI 可能改变应用启动耗时和运行时状态。

### Java + Native

```bash
PACKAGE="com.example.app"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l frida-java-bridge/_agent.js \
  -l scripts/java-native-hook.js
```

该脚本安装三个定点 Hook 并输出 10 至 60 秒存活心跳。脚本结构和真实 App
结果见 [Java + Native 组合 Hook 实测](JAVA-NATIVE-HOOK-DEMO.md)。

要 attach 已运行进程，可把示例中的 `-f "$PACKAGE"` 改为
`-n "<PROCESS_NAME>"`。

## 修改模板

按目标修改模块名、导出符号、类名、方法名和 overload。已知模块的导出通过模块实例
查询：

```javascript
const module = Process.getModuleByName('libtarget.so');
const address = module.getExportByName('target_function');
```

全局导出使用：

```javascript
const address = Module.findGlobalExportByName('target_function');
```

排障时建议每轮新增不超过三个 Hook，先单组运行，再逐组累加。高频 Native 路径不要
在每次回调中大量执行 `console.log()` 或 `send()`。

## 常见问题

| 现象 | 检查 |
| --- | --- |
| `adb was not found in PATH` | 安装 Android Platform Tools，并运行 `adb version` |
| 多设备导致命令失败 | 用 `adb devices -l` 获取 serial，并设置 `ANDROID_SERIAL` |
| `frida-ps` 连接失败 | 检查设备端日志与 ADB forward，然后停止并重新启动 |
| `Interceptor.textShadow is unavailable` | 确认 arm64、内核模块已启用，并重新运行 `frida-usb start` 完成授权 |
| `Java is not defined` | 确认同一条 CLI 命令先加载 `_agent.js`，再加载 Java 脚本 |
| 找不到应用类 | 先使用 `Java.perform()`；动态类需选择实际 ClassLoader |

连接失败时使用：

```bash
adb -s "$ANDROID_SERIAL" shell su -c \
  'cat /data/local/tmp/.fsrv-usb.log'
adb -s "$ANDROID_SERIAL" forward --list
./frida-usb stop
./frida-usb start
```

## 验证边界

仓库内容面向配套 Android arm64 发布物。静态语法检查不能代替目标设备测试。设备、
Android、目标 App、启动方式或 Hook 组合发生变化后，应分别记录无注入、零 Hook、
仅 bridge 和最小脚本四组基线；短时间存活不等同于长期兼容。

## License

本仓库原创脚本和文档使用 Apache License 2.0。预构建
`frida-java-bridge/_agent.js` 使用
`LGPL-2.0-only WITH WxWindows-exception-3.1`；详情见 `LICENSES/` 和
`THIRD_PARTY_NOTICES.md`。
