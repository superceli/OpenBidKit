/// <reference types="vite/client" />

import type { LvcertBridge } from './shared/types';

declare global {
  interface Window {
    lvcert: LvcertBridge;
    yibiaoClient?: {
      appName: string;
      platform: string;
    };
  }
}

export {};
