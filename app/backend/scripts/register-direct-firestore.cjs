'use strict';

if (process.env.SOAR_REGISTER_DIRECT_FIRESTORE === '1') {
  try {
    const { EmulatorRegistry } = require('../../../node_modules/firebase-tools/lib/emulator/registry');
    const { Emulators } = require('../../../node_modules/firebase-tools/lib/emulator/types');
    const host = process.env.SOAR_DIRECT_FIRESTORE_HOST || '127.0.0.1';
    const port = Number(process.env.SOAR_DIRECT_FIRESTORE_PORT || '18080');

    if (!EmulatorRegistry.isRunning(Emulators.FIRESTORE)) {
      EmulatorRegistry.set(Emulators.FIRESTORE, {
        getName() {
          return Emulators.FIRESTORE;
        },
        getInfo() {
          return { name: Emulators.FIRESTORE, host, port, pid: process.pid };
        },
        async start() {},
        async connect() {},
        async stop() {}
      });
    }
  } catch (_error) {
    // The preload is inherited by child processes that may not need firebase-tools internals.
    // Keep those processes unaffected; the parent Firebase CLI will fail loudly if registration
    // was required but unavailable.
  }
}
