'use strict';

/*
 * Java + Native 组合 Hook 演示。
 *
 * 同一脚本内安装三个定点钩子,验证两条 Hook 链路同时工作:
 *   Native: libc.so!open                      —— Interceptor + textShadow
 *   Java:   android.app.Activity.onResume()   —— Java bridge implementation
 *   Java:   android.util.Log.i(String,String) —— 静态方法定点 implementation
 *
 * 约定:
 *   - 必须先加载 frida-java-bridge/_agent.js,再加载本脚本。
 *   - 回调全部为纯 JavaScript,不使用 CModule。
 *   - 每条回调只做计数和限流打印,避免高频路径大量进 JS 日志。
 */

var NATIVE_LOG_MAX = 8;
var JAVA_LOG_MAX = 8;

var nativeHits = 0;
var resumeHits = 0;
var logHits = 0;

/* ---------- Native: libc.so!open ---------- */

Interceptor.textShadow = true;
if (Interceptor.textShadow !== true) {
  throw new Error('Interceptor.textShadow is unavailable');
}

var libc = Process.getModuleByName('libc.so');
var openAddress = libc.getExportByName('open');

Interceptor.attach(openAddress, {
  onEnter: function (args) {
    try {
      this.path = args[0].isNull() ? '<null>' : args[0].readUtf8String();
    } catch (e) {
      this.path = '<unreadable>';
    }
  },
  onLeave: function (retval) {
    nativeHits++;
    if (nativeHits <= NATIVE_LOG_MAX) {
      console.log('[native] open("' + this.path + '") = ' + retval.toInt32());
    }
  }
});
console.log('[native] libc.so!open hook installed @ ' + openAddress);

/* ---------- Java: Activity.onResume + Log.i ---------- */

Java.perform(function () {
  var Activity = Java.use('android.app.Activity');
  var onResume = Activity.onResume.overload();

  onResume.implementation = function () {
    resumeHits++;
    if (resumeHits <= JAVA_LOG_MAX) {
      console.log('[java] Activity.onResume <- ' + this.getClass().getName());
    }
    return onResume.call(this);
  };
  console.log('[java] android.app.Activity.onResume() hook installed');

  var Log = Java.use('android.util.Log');
  var logInfo = Log.i.overload('java.lang.String', 'java.lang.String');

  logInfo.implementation = function (tag, message) {
    logHits++;
    if (logHits <= JAVA_LOG_MAX) {
      console.log('[java] Log.i ' + tag + ': ' + message);
    }
    return logInfo.call(Log, tag, message);
  };
  console.log('[java] android.util.Log.i(String, String) hook installed');
});

/* ---------- 存活心跳 ---------- */

function heartbeat(sec) {
  setTimeout(function () {
    console.log('[alive] ' + sec + 's pid=' + Process.id +
      ' native_open=' + nativeHits +
      ' onResume=' + resumeHits +
      ' Log_i=' + logHits);
  }, sec * 1000);
}

heartbeat(10);
heartbeat(20);
heartbeat(30);
heartbeat(40);
heartbeat(50);
heartbeat(60);
