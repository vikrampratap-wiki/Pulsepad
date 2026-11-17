import { VirtualGamepadState } from './gamepadProtocol';

let currentVirtualState: VirtualGamepadState | null = null;
let bridgeInstalled = false;
let originalGetGamepads: (() => (Gamepad | null)[]) | null = null;

/**
 * Installs a real W3C Standard `navigator.getGamepads()` override in the current browser window
 * so any HTML5 game, cloud gaming client, or gamepad tester reads our virtual controller natively.
 */
export function installLocalW3CGamepadBridge(
  initialState: VirtualGamepadState,
  onRumbleRequest?: (intensity: number, durationMs: number) => void
) {
  currentVirtualState = initialState;

  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (bridgeInstalled) return;
  bridgeInstalled = true;

  if (typeof navigator.getGamepads === 'function') {
    originalGetGamepads = navigator.getGamepads.bind(navigator);
  }

  const buildW3CGamepadObject = (): Gamepad => {
    const st = currentVirtualState || initialState;
    const isPS = st.skin === 'playstation';

    const buttons: GamepadButton[] = st.buttons.map((val, idx) => {
      const threshold = idx === 6 || idx === 7 ? 0.08 : 0.3;
      const pressed = val >= threshold;
      return {
        pressed,
        touched: val > 0.02,
        value: Math.max(0, Math.min(1, val)),
      };
    });

    const fakeGamepad = {
      id: isPS
        ? 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'
        : 'Xbox Series X|S Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',
      index: 0,
      connected: true,
      mapping: 'standard' as GamepadMappingType,
      timestamp: performance.now(),
      axes: [st.axes[0], st.axes[1], st.axes[2], st.axes[3]],
      buttons,
      hapticActuators: [],
      vibrationActuator: {
        type: 'dual-rumble',
        playEffect: async (_type: string, params?: { duration?: number; strongMagnitude?: number }) => {
          const duration = params?.duration ?? 180;
          const mag = params?.strongMagnitude ?? 0.7;
          onRumbleRequest?.(mag, duration);
          return 'complete';
        },
        reset: async () => 'complete',
      },
    };

    return fakeGamepad as unknown as Gamepad;
  };

  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    writable: true,
    value: () => {
      const nativePads = originalGetGamepads ? Array.from(originalGetGamepads()) : [];
      const virtualPad = buildW3CGamepadObject();
      return [virtualPad, nativePads[1] ?? null, nativePads[2] ?? null, nativePads[3] ?? null];
    },
  });

  // Fire standard W3C gamepadconnected event so games listening for hotplug detect it immediately
  try {
    const connEvent = new Event('gamepadconnected') as Event & { gamepad: Gamepad };
    connEvent.gamepad = buildW3CGamepadObject();
    window.dispatchEvent(connEvent);
  } catch {
    // Ignore in restricted environments
  }
}

export function updateLocalW3CGamepadBridge(nextState: VirtualGamepadState) {
  currentVirtualState = nextState;
}

/**
 * Generates Bookmarklet, Console Snippet, and Auto-Inject Userscript (.user.js)
 * so the virtual controller works when the user navigates to ANY external gaming website
 * (Xbox Cloud Gaming, GeForce NOW, CrazyGames, Poki, Gamepad Tester, etc.).
 */
export function generateCloudGamingBridgeSnippets(roomCode: string, appOrigin: string) {
  const cleanRoom = roomCode.trim().toUpperCase() || 'PULSE1';
  const scriptUrl = `${appOrigin}/api/bridge.js?room=${encodeURIComponent(cleanRoom)}`;

  const bookmarkletHref = `javascript:(function(){var s=document.createElement('script');s.src='${scriptUrl}&t='+Date.now();document.head.appendChild(s);})();`;

  const consoleSnippet = `// किसी भी गेमिंग वेबसाइट (xbox.com/play, geforcenow.com, crazygames.com) के Console में पेस्ट करें:
(() => {
  const s = document.createElement('script');
  s.src = '${scriptUrl}';
  document.head.appendChild(s);
})();`;

  const userscriptContent = `// ==UserScript==
// @name         PulsePad Universal Cloud Gaming Controller Bridge (Room: ${cleanRoom})
// @namespace    ${appOrigin}
// @version      2.0.0
// @description  Automatically connects your PulsePad phone controller (Room ${cleanRoom}) to Xbox Cloud Gaming, GeForce NOW, and all web gaming sites at 10-15ms latency.
// @match        *://*.xbox.com/*
// @match        *://*.geforcenow.com/*
// @match        *://*.crazygames.com/*
// @match        *://*.poki.com/*
// @match        *://*.amazon.com/luna/*
// @match        *://hardwaretester.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  const s = document.createElement('script');
  s.src = '${scriptUrl}&t=' + Date.now();
  (document.head || document.documentElement).appendChild(s);
})();`;

  return {
    scriptUrl,
    bookmarkletHref,
    consoleSnippet,
    userscriptContent,
  };
}
