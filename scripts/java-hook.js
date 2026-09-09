'use strict';

Java.perform(() => {
  const Log = Java.use('android.util.Log');
  const logInfo = Log.i.overload('java.lang.String', 'java.lang.String');

  logInfo.implementation = function (tag, message) {
    console.log(`[Log.i] ${tag}: ${message}`);
    return logInfo.call(Log, tag, message);
  };

  console.log('Log.i(String, String) hook installed');
});
