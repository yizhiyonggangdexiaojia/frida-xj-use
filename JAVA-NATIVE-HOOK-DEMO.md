# Java + Native 组合 Hook 实测演示

> 2026-09-09 实测记录。设备:Pixel 6 / Android 14 / arm64(已 root,内核模块已启用)。
> Frida `17.9.1`,Java bridge 为仓库内置 `_agent.js`。

本页记录同一 Frida 会话内 **Java Hook 与 Native Hook 同时安装、同时触发** 的实测过程,
目标为四个真实发行的海外 App(含银行与游戏),全部使用仓库自带脚本,未做任何针对性绕过。

## 演示脚本

`scripts/java-native-hook.js` 一共安装三个定点 Hook:

| 钩子 | 层 | 形式 | 说明 |
|---|---|---|---|
| `libc.so!open` | Native | `Interceptor.attach` + `textShadow` | 观察文件打开,回调限流打印前 8 条 |
| `android.app.Activity.onResume()` | Java | `.implementation` | 打印实际 resumed 的 Activity 类名 |
| `android.util.Log.i(String, String)` | Java | 静态方法 `.implementation` | 打印 tag 和 message,限流前 8 条 |

回调全部为纯 JavaScript,不使用 CModule;每 10 秒输出一条心跳,携带三类 Hook 的
累计命中数,作为进程存活与注入持续生效的直接证据。

统一执行命令(先加载 bridge,再加载用户脚本):

```bash
PACKAGE="<目标包名>"
uv run frida -H 127.0.0.1:27042 \
  -f "$PACKAGE" \
  -l frida-java-bridge/_agent.js \
  -l scripts/java-native-hook.js
```

观察窗口为 60 秒;存活判定使用 `adb shell pidof "$PACKAGE"` 与脚本内心跳双通道。

## 目标与结果总览

| App | 包名 | 地区 | 已知保护 | Native `open` 命中 | Java 命中(onResume / Log.i) | 注入窗口内存活 | detach 后存活 |
|---|---|---|---|---|---|---|---|
| Hay Day | `com.supercell.hayday` | 芬兰 Supercell | Promon SHIELD | 1194 | 2 / 26 | 是 | 是 |
| Paytm | `net.one97.paytm` | 印度 | 自研 cachehandler | 4348 | 3 / 13 | 是 | 否(进程自行退出) |
| Livin' by Mandiri | `id.bmri.livin` | 印尼 | DexGuard + 自研 | 384 | 1 / 6 | 是 | 是 |
| K PLUS | `com.kasikorn.retail.mbanking.wap` | 泰国开泰银行 | DexProtector + VOS | 435 | 4 / 1 | 是(三进程) | 是(三进程) |

四轮组合注入全部成功:两条 Hook 链路同时工作,窗口内无一崩溃、无一被杀。

## 逐目标日志摘录

以下为真实终端输出的删节(去掉 REPL 横幅,保留全部关键行)。

### 1. Hay Day(Promon SHIELD)

```text
Spawning `com.supercell.hayday`...
[native] libc.so!open hook installed @ 0x7c15ed2a70
Spawned `com.supercell.hayday`. Resuming main thread!
[native] open("/proc/self/cmdline") = 72
[native] open(".../com.supercell.hayday-.../base.apk") = 72
[java] android.app.Activity.onResume() hook installed
[java] android.util.Log.i(String, String) hook installed
[java] Activity.onResume <- com.supercell.hayday.GameApp
[java] Log.i Choreographer: Skipped 38 frames!  ...
[alive] 10s pid=4538 native_open=1045 onResume=2 Log_i=23
[alive] 30s pid=4538 native_open=1146 onResume=2 Log_i=26
[alive] 60s pid=4538 native_open=1194 onResume=2 Log_i=26
```

进程 4538 在注入中与 frida 退出后均存活。截图(t≈22s,游戏主场景正常渲染):

<img src="screenshots/hayday.png" width="280" alt="Hay Day alive" />

### 2. Paytm(印度)

```text
Spawning `net.one97.paytm`...
[native] libc.so!open hook installed @ 0x7c15ed2a70
[java] android.app.Activity.onResume() hook installed
[java] android.util.Log.i(String, String) hook installed
[java] Log.i PlayCore: UID: [10291]  PID: [8953] StandardIntegrity : warmUpIntegrityToken(...)
[java] Activity.onResume <- net.one97.paytm.landingpage.activity.AJRMainActivity
[java] Activity.onResume <- net.one97.paytm.auth.activity.AJRAuthActivity
[alive] 10s pid=8953 native_open=1491 onResume=3 Log_i=10
[alive] 60s pid=8953 native_open=4311 onResume=3 Log_i=12
```

三轮运行结果一致。两个值得记录的现象:

1. **进程名伪装**:`pidof net.one97.paytm` 与按名 `ps` 都找不到进程,但脚本心跳持续
   到 60 秒。以心跳 pid 反查 `/proc/<pid>/`:

   ```text
   # cat /proc/<pid>/cmdline
   com.android.chrome:sandboxed_process0      # 伪装成 Chrome 沙箱进程
   # cat /proc/<pid>/comm
   net.one97.paytm                            # comm 仍是真实包名
   ```

   判定 Paytm 存活应以脚本内心跳(携带真实 pid)或按 `comm` 查询为准。
2. **frida 退出后进程消失**:脚本卸载、会话结束后进程随即退出。窗口内(60 秒)
   行为完全正常,该现象属于 detach 之后的目标自身行为。

截图(t≈22s,启动页正常渲染):

<img src="screenshots/paytm.png" width="280" alt="Paytm alive" />

### 3. Livin' by Mandiri(印尼)

```text
Spawning `id.bmri.livin`...
[native] libc.so!open hook installed @ 0x7c15ed2a70
[java] android.app.Activity.onResume() hook installed
[java] android.util.Log.i(String, String) hook installed
[java] Log.i GoogleTagManager: Loading container GTM-M4QZ783
[java] Activity.onResume <- com.bankmandiri.md.presentation.ui.MainActivity
[java] Log.i Choreographer: Skipped 65 frames!  ...
[alive] 10s pid=29784 native_open=373 onResume=1 Log_i=6
[alive] 60s pid=29784 native_open=384 onResume=1 Log_i=6
```

进程 29784 注入中与 detach 后均存活。截图(t≈22s,欢迎页正常渲染):

<img src="screenshots/livin.png" width="280" alt="Livin alive" />

### 4. K PLUS(泰国开泰银行,DexProtector + VOS)

组合脚本:

```text
Spawning `com.kasikorn.retail.mbanking.wap`...
[native] libc.so!open hook installed @ 0x7c15ed2a70
[java] android.app.Activity.onResume() hook installed
[java] android.util.Log.i(String, String) hook installed
[java] Activity.onResume <- com.kasikorn.retail.mbanking.kplus.home.activity.SplashScreenActivity
[java] Activity.onResume <- com.karumi.dexter.DexterActivity
[java] Activity.onResume <- com.kasikorn.kcore.presentation.mobileno.VerifyMobileNoActivity
[alive] 10s pid=4239 native_open=363 onResume=4 Log_i=1
[alive] 60s pid=4239 native_open=435 onResume=4 Log_i=1
```

K PLUS 为三进程应用,`pidof` 返回三个 pid,注入中与 detach 后全部存活。

截图由 root `screencap` 采集:K PLUS 的验证页设置了 `FLAG_SECURE`,普通
`adb exec-out screencap` 对该页面输出空文件,root 截图正常:

<img src="screenshots/kplus.png" width="280" alt="K PLUS alive" />

> 注:该截图含手机号输入页,公开引用前请先确认画面内容是否需要处理。

## 配套现有观察脚本

主 toolkit 仓库 `scripts/` 下针对 K PLUS 的两个纯 Native 观察脚本同样验证通过
(spawn,不加载 bridge):

```bash
uv run frida -H 127.0.0.1:27042 \
  -f com.kasikorn.retail.mbanking.wap \
  -l scripts/dexprotect-analysis/index.js
```

```text
[Remote::com.kasikorn.retail.mbanking.wap ]-> .../lib/arm64/libdpboot.so
.../lib/arm64/libdexprotector.so
hook success                          # libdexprotector.so!JNI_OnLoad 已钩上
.../lib/arm64/libdexprotector.53y4.so
```

```bash
uv run frida -H 127.0.0.1:27042 \
  -f com.kasikorn.retail.mbanking.wap \
  -l scripts/vos-analysis/index.js
```

```text
.../lib/arm64/libvosWrapperEx.so
hook success                          # libvosWrapperEx.so!JNI_OnLoad 已钩上
```

两个脚本通过 `__loader_android_dlopen_ext` 等待目标保护库加载,再对其
`JNI_OnLoad` 安装钩子;`hook success` 即为注入成功的直接标志。两轮运行中
App 三进程全程存活。

## 观察边界

- 每轮观察窗口为 60 秒,属于点查(spont check),不代表数分钟级长跑兼容性结论;
  建立长跑结论需要按用户指南分别建立无注入、零 Hook、仅 bridge、最小脚本四组基线。
- `[object Object]` 一行是 `_agent.js` 初始化时输出的状态对象,属正常现象。
- 所有命令使用示例变量,未包含激活码、设备序列号或其他敏感值。
