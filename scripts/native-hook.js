'use strict';

Interceptor.textShadow = true;
if (Interceptor.textShadow !== true) {
  throw new Error('Interceptor.textShadow is unavailable');
}

const libc = Process.getModuleByName('libc.so');
const openAddress = libc.getExportByName('open');

const listener = Interceptor.attach(openAddress, {
  onEnter(args) {
    this.path = args[0].isNull() ? '<null>' : args[0].readUtf8String();
  },
  onLeave(retval) {
    console.log(`open("${this.path}") = ${retval.toInt32()}`);
  }
});

rpc.exports = {
  detach() {
    listener.detach();
  }
};

console.log(`libc open hook installed at ${openAddress}`);
