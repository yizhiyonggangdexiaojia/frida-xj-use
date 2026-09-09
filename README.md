# frida-xj-use

> 禁止将本项目用于任何违法犯罪活动。

Android arm64 发布版 Frida XJ 的最小使用工程。仓库只包含主机端环境、USB
启动脚本、已构建的 Java bridge 和基础 Hook 模板，不包含内核模块或
`frida-server`。

## 仓库内容

```text
.
├── frida-usb
├── frida-java-bridge/
│   └── _agent.js
├── scripts/
│   ├── java-hook.js
│   └── native-hook.js
├── .python-version
├── pyproject.toml
└── uv.lock
```

| 文件 | 用途 |
| --- | --- |
| `frida-usb` | 激活、授权、启动、停止设备端 server，并建立 ADB 转发 |
| `frida-java-bridge/_agent.js` | Java 脚本必须一同加载的预构建 bridge |
| `scripts/java-hook.js` | `Log.i(String, String)` Java Hook 示例 |
| `scripts/native-hook.js` | `libc.so!open` Native Hook 示例 |
| `pyproject.toml` / `uv.lock` | 固定 Frida Python 与 CLI 版本 |

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

激活码属于敏感信息。不要把真实激活码写入脚本、README、Issue、终端截图或日志。
本文统一使用 `<ACTIVATION_CODE>`。

## 1. 准备主机环境

克隆仓库后进入目录：

```bash
git clone https://github.com/yizhiyonggangdexiaojia/frida-xj-use.git
cd frida-xj-use
```

根据锁文件创建环境：

```bash
uv sync --locked --python python3.13 --no-managed-python
uv run frida --version
```

预期 Frida 版本为 `17.9.1`。列出设备：

```bash
adb devices -l
```

多设备环境先指定 serial：

```bash
export ANDROID_SERIAL="<DEVICE_SERIAL>"
```

`frida-usb`、`adb` 和后续示例都使用这个设备。

## 2. 安装内核模块

使用设备当前 root 方案提供的模块管理界面安装交付的内核模块，重启设备，然后确认
模块处于启用状态。设备每次重启或内核模块重新加载后，都需要重新执行一次授权；日常
启动命令会自动完成这一步。

## 3. 部署 frida-server

把交付的 arm64 server 放在当前目录，推送到默认位置：

```bash
adb -s "$ANDROID_SERIAL" push ./frida-server /data/local/tmp/tsfs
adb -s "$ANDROID_SERIAL" shell su -c \
  'chmod 755 /data/local/tmp/tsfs'
```

若交付方要求使用其他设备路径：

```bash
export FRIDA_DEVICE_BINARY="/absolute/device/path"
```

启动脚本不会构建或自动寻找 server，目标路径必须已经存在且可执行。

## 4. 首次激活

在交互式 shell 中隐藏输入：

```bash
printf "Activation code: " >&2
IFS= read -r -s ACTIVATION_CODE
printf "\n" >&2
./frida-usb --activate "$ACTIVATION_CODE"
unset ACTIVATION_CODE
```

不要把 `<ACTIVATION_CODE>` 直接写进 shell 历史。激活只需成功执行一次；许可证有效期
和设备绑定状态由交付版本决定。

## 5. 启动和停止

启动 server、授权内核模块并建立本机转发：

```bash
./frida-usb
```

也可以显式写作：

```bash
./frida-usb start
```

连接检查：

```bash
uv run frida-ps -H 127.0.0.1:27042
```

停止本次 server 和 ADB 转发：

```bash
./frida-usb stop
```

切换本机端口：

```bash
export FRIDA_HOST_PORT="27043"
./frida-usb
uv run frida-ps -H "127.0.0.1:$FRIDA_HOST_PORT"
```

该脚本不安装开机服务。设备重启、ADB 断开或 server 退出后，需要重新启动。

## 6. Native Hook

`scripts/native-hook.js` 演示 Hook `libc.so!open`。任何
`Interceptor.attach()`、`replace()` 或 `replaceFast()` 之前都必须先启用：

```javascript
Interceptor.textShadow = true;
```

spawn 加载：

```bash
PACKAGE="com.example.app"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l scripts/native-hook.js
```

attach 到已运行进程：

```bash
PROCESS="com.example.app"
uv run frida -H 127.0.0.1:27042 \
  -n "$PROCESS" \
  -l scripts/native-hook.js
```

模板通过 RPC 提供 `detach()`，也可以在自己的脚本中保存
`Interceptor.attach()` 返回的 listener 并调用 `listener.detach()`。

## 7. Java Hook

Java 脚本必须先加载本仓库提供的 bridge，再加载用户脚本：

```bash
PACKAGE="com.example.app"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l frida-java-bridge/_agent.js \
  -l scripts/java-hook.js
```

`scripts/java-hook.js` 精确选择
`android.util.Log.i(String, String)` overload，打印参数后调用原静态方法。静态方法
调用原实现时，receiver 使用类包装器：

```javascript
return logInfo.call(Log, tag, message);
```

`Java.perform()` 会等待应用环境和默认 ClassLoader 可用。需要在当前线程立即进入 VM
时使用 `Java.performNow()`，但此时应用默认 ClassLoader 可能尚未准备好。

依赖 JVMTI 的能力默认关闭。确实需要 `Java.choose()` 等能力时先显式启用：

```javascript
Java.enableJvmti();
```

启用 JVMTI 可能改变应用启动耗时和运行时状态。

## 8. 自定义模板

复制脚本后只修改目标模块、符号、类名、方法名和 overload。建议每轮新增不超过三个
Hook，先单组运行，再逐组累加。高频 Native 路径不要在每次回调中大量
`console.log()` 或 `send()`。

已知模块的导出使用模块实例查询：

```javascript
const module = Process.getModuleByName('libtarget.so');
const address = module.getExportByName('target_function');
```

全局导出使用：

```javascript
const address = Module.findGlobalExportByName('target_function');
```

同一条 CLI 命令中应先列 `_agent.js`，再列 Java 用户脚本。通过 Python API 分别调用
两次 `session.create_script()` 会创建两个独立脚本作用域，后一个脚本不会自动获得
前一个脚本中的 `Java`。

## 9. 常见问题

### `adb was not found in PATH`

安装 Android Platform Tools，并确认：

```bash
command -v adb
adb version
```

### 多台设备导致命令失败

设置 `ANDROID_SERIAL`，其值来自 `adb devices -l`，不要把真实 serial 提交到仓库。

### `frida-ps` 连接失败

依次检查：

```bash
adb -s "$ANDROID_SERIAL" shell su -c \
  'cat /data/local/tmp/.fsrv-usb.log'
adb -s "$ANDROID_SERIAL" forward --list
./frida-usb stop
./frida-usb
```

### `Interceptor.textShadow is unavailable`

确认设备为 arm64、配套内核模块已启用，并重新运行 `./frida-usb` 完成当前启动周期的
内核模块授权。该模式不可用时脚本会报错，不会降级为普通 Hook。

### `Java is not defined`

确认命令先加载 `frida-java-bridge/_agent.js`，并且 bridge 与用户脚本由同一条
Frida CLI 命令加载。

### 找不到应用类

先使用 `Java.perform()`。类位于自定义或动态 ClassLoader 时，枚举实际 loader，再通过
`Java.ClassFactory.get(loader).use(className)` 获取包装器。

## 10. 验证边界

仓库内容用于配套 Android arm64 发布物。静态语法检查不能代替目标设备测试；设备型号、
Android 版本、应用版本、启动方式和 Hook 组合变化后，应重新建立无注入、零 Hook、
仅 bridge、最小脚本四组基线。

## License

本仓库原创脚本和文档使用 Apache License 2.0。预构建
`frida-java-bridge/_agent.js` 使用
`LGPL-2.0-only WITH WxWindows-exception-3.1`；详情见 `LICENSES/` 和
`THIRD_PARTY_NOTICES.md`。
