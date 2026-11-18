import {
  BUTTON_METADATA,
  VirtualGamepadState,
  resolveAppBaseUrl,
  sanitizeRoomId,
} from './gamepadProtocol';

/**
 * Installs a live W3C-compliant `navigator.getGamepads()` override in the current browser window
 * so any HTML5 game or cloud gaming client running on this page immediately detects the
 * PulsePad Virtual Controller as a standard 17-button, 4-axis Xbox/PlayStation gamepad (`mapping: "standard"`).
 */
let currentVirtualState: VirtualGamepadState | null = null;
let bridgeInstalled = false;
let localVibrationCallback: ((intensity: number, durationMs: number) => void) | null = null;

function createPrototypeSafeButton(pressed: boolean, touched: boolean, value: number): GamepadButton {
  const btn = {
    pressed,
    touched,
    value,
  };
  if (typeof window !== 'undefined' && 'GamepadButton' in window && window.GamepadButton?.prototype) {
    try {
      Object.setPrototypeOf(btn, window.GamepadButton.prototype);
    } catch {
      // Ignore in restricted environments
    }
  }
  return btn as GamepadButton;
}

export function buildW3CGamepadObject(): Gamepad | null {
  if (!currentVirtualState) return null;
  const st = currentVirtualState;
  const buttons: GamepadButton[] = BUTTON_METADATA.map((meta) => {
    const val = st.buttons[meta.index] ?? 0;
    return createPrototypeSafeButton(val > 0.15, val > 0.02, val);
  });

  const idString =
    st.skin === 'playstation'
      ? 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'
      : 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)';

  const virtualGamepad: Record<string, unknown> = {
    id: idString,
    index: 0,
    connected: true,
    mapping: 'standard' as GamepadMappingType,
    timestamp: performance.now(),
    axes: [st.axes[0], st.axes[1], st.axes[2], st.axes[3]],
    buttons,
    hapticActuators: [],
    vibrationActuator: {
      type: 'dual-rumble',
      playEffect: async (
        _type: string,
        params?: { duration?: number; strongMagnitude?: number; weakMagnitude?: number }
      ) => {
        const duration = params?.duration ?? 180;
        const mag = Math.max(params?.strongMagnitude ?? 0.7, params?.weakMagnitude ?? 0.5);
        if (localVibrationCallback) {
          localVibrationCallback(mag, duration);
        }
        return 'complete';
      },
      reset: async () => 'complete',
    },
  };

  if (typeof window !== 'undefined' && 'Gamepad' in window && window.Gamepad?.prototype) {
    try {
      Object.setPrototypeOf(virtualGamepad, window.Gamepad.prototype);
    } catch {
      // Ignore if blocked
    }
  }

  return virtualGamepad as unknown as Gamepad;
}

export function dispatchSyntheticGamepadEvent(
  eventName: 'gamepadconnected' | 'gamepaddisconnected',
  pad: Gamepad
): void {
  if (typeof window === 'undefined') return;
  try {
    const ev = new Event(eventName, { bubbles: true, cancelable: false });
    Object.defineProperty(ev, 'gamepad', {
      value: pad,
      enumerable: true,
      configurable: true,
    });
    if ('GamepadEvent' in window && window.GamepadEvent?.prototype) {
      try {
        Object.setPrototypeOf(ev, window.GamepadEvent.prototype);
      } catch {
        // Ignore
      }
    }
    window.dispatchEvent(ev);
    const handler =
      eventName === 'gamepadconnected'
        ? (window as Window & { ongamepadconnected?: ((e: Event) => void) | null })
            .ongamepadconnected
        : (window as Window & { ongamepaddisconnected?: ((e: Event) => void) | null })
            .ongamepaddisconnected;
    if (typeof handler === 'function') {
      handler.call(window, ev);
    }
  } catch {
    // Ignore in restricted environments
  }
}

export function installLocalW3CGamepadBridge(
  initialState: VirtualGamepadState,
  onVibrationRequest?: (intensity: number, durationMs: number) => void
) {
  currentVirtualState = initialState;
  if (onVibrationRequest) {
    localVibrationCallback = onVibrationRequest;
  }

  if (bridgeInstalled || typeof navigator === 'undefined') return;
  bridgeInstalled = true;

  const nativeGetGamepads =
    typeof navigator.getGamepads === 'function'
      ? navigator.getGamepads.bind(navigator)
      : () => [];

  const getGamepadsOverride = () => {
    const nativePads = nativeGetGamepads ? Array.from(nativeGetGamepads()) : [];
    const virtualPad = buildW3CGamepadObject();
    return [virtualPad, nativePads[1] ?? null, nativePads[2] ?? null, nativePads[3] ?? null];
  };

  try {
    if (typeof Navigator !== 'undefined' && Navigator.prototype) {
      Object.defineProperty(Navigator.prototype, 'getGamepads', {
        configurable: true,
        writable: true,
        value: getGamepadsOverride,
      });
    }
  } catch {
    // Ignore
  }

  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    writable: true,
    value: getGamepadsOverride,
  });

  const pad = buildW3CGamepadObject();
  if (pad) {
    dispatchSyntheticGamepadEvent('gamepadconnected', pad);
  }
}

export function updateLocalW3CGamepadBridge(nextState: VirtualGamepadState) {
  currentVirtualState = nextState;
}

/**
 * Pure helper used by unit tests to verify the exact hex packet parser injected by the external bridge.
 */
export function parseBridgeHexFrame(hex: string): {
  buttons: number[];
  axes: [number, number, number, number];
  sequence: number;
} | null {
  if (!hex || hex.length !== 24) return null;
  const u = new Uint8Array(12);
  for (let i = 0; i < 12; i++) {
    const val = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(val)) return null;
    u[i] = val;
  }
  // Byte 0 is 0x50 (80 decimal, 'P')
  if (u[0] !== 0x50) return null;

  const mask = u[2] | (u[3] << 8);
  const buttons = new Array(17).fill(0);
  for (let j = 0; j < 16; j++) {
    buttons[j] = (mask & (1 << j)) !== 0 ? 1 : 0;
  }
  buttons[16] = (u[1] & 1) !== 0 ? 1 : 0;

  const view = new DataView(u.buffer);
  const axes: [number, number, number, number] = [
    Math.round((view.getInt8(4) / 127) * 1000) / 1000,
    Math.round((view.getInt8(5) / 127) * 1000) / 1000,
    Math.round((view.getInt8(6) / 127) * 1000) / 1000,
    Math.round((view.getInt8(7) / 127) * 1000) / 1000,
  ];
  buttons[6] = Math.round((u[8] / 255) * 1000) / 1000;
  buttons[7] = Math.round((u[9] / 255) * 1000) / 1000;
  const sequence = u[10] | (u[11] << 8);

  return { buttons, axes, sequence };
}

/**
 * Generates Ultra-Compact (<1,980 chars) Tablet-Safe Xbox Cloud Gaming (`xbox.com/play`) Bridge Snippets:
 *
 * Why v7 fixes the Tablet Bookmark truncation issue:
 * - Android/Tablet Chrome's "Edit Bookmark" URL input box truncates URLs around ~4,000 characters.
 * - Previously, `encodeURIComponent(fullScript)` inflated `{`, `}`, `;`, `:` and Hindi characters to >4,800 chars,
 *   cutting off the end of the bookmarklet!
 * - v7 minifies the bridge to ~1,850 characters total and only encodes spaces (`%20`), so the entire bookmarklet
 *   is under 1,980 characters and NEVER gets cut off in any Tablet or Mobile bookmark box!
 */
export function generateCloudGamingBridgeSnippets(roomCode: string, appOrigin: string) {
  const cleanRoom = sanitizeRoomId(roomCode) || '8492310756';
  const baseUrl = typeof window !== 'undefined' ? resolveAppBaseUrl() : appOrigin.replace(/\/+$/, '');
  const bridgePopupUrl = `${baseUrl}/?bridge=1&room=${encodeURIComponent(cleanRoom)}`;
  const scriptUrl = `${appOrigin}/api/bridge.js?room=${encodeURIComponent(cleanRoom)}`;

  const selfContainedCore = `(function(){var R='${cleanRoom}',B='${baseUrl}/?bridge=1&room='+R,c=0,w,N=()=>performance.now(),t=N(),m=(o,p)=>{try{p&&Object.setPrototypeOf(o,p)}catch(_){}return o},mk=v=>m({pressed:v>.08,touched:v>.02,value:+v},window.GamepadButton?.prototype),b=Array(17).fill(0).map(()=>mk(0)),a=[0,0,0,0],pad=m({id:'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',index:0,connected:!0,mapping:'standard',timestamp:t,axes:a,buttons:b},window.Gamepad?.prototype),gf=()=>(pad.timestamp=t,pad.axes=a,pad.buttons=b,[pad,null,null,null]);try{Navigator.prototype.getGamepads=gf;Object.defineProperty(navigator,'getGamepads',{configurable:!0,value:gf})}catch(_){}var fc=()=>{try{var e=m(new Event('gamepadconnected',{bubbles:!0}),window.GamepadEvent?.prototype);Object.defineProperty(e,'gamepad',{value:pad});dispatchEvent(e);ongamepadconnected?.(e)}catch(_){}},wk=v=>{b[0]=mk(v);t=N();fc()};wk(1);setTimeout(()=>wk(0),150);var d=document.body.appendChild(document.createElement('div'));d.style.cssText='position:fixed;bottom:8px;right:8px;z-index:9999;background:#111;color:#0f8;padding:6px;font:700 12px monospace';d.textContent='Tap:Link '+R;d.onclick=()=>{wk(1);setTimeout(()=>wk(0),150);w=open(B,'_pp')};function hx(h){if(!h||h.length!==24)return;var u=new Uint8Array(12),i=0;for(;i<12;i++)u[i]=parseInt(h.slice(i*2,i*2+2),16);if(u[0]!==80)return;c++;var k=u[2]|(u[3]<<8);for(i=0;i<16;i++)b[i]=mk((k>>i)&1);b[16]=mk(u[1]&1);b[6]=mk(u[8]/255);b[7]=mk(u[9]/255);var v=new DataView(u.buffer);a=[4,5,6,7].map(x=>v.getInt8(x)/127);t=N();fc();d.textContent='Xbox LIVE #'+c}addEventListener('message',e=>hx(e.data?.__pulsepad_hex));setInterval(()=>{t=N();if(!c)fc();[opener,w].forEach(x=>{try{x?.postMessage({__pulsepad_subscribe:R},'*')}catch(_){}})},900);try{new WebSocket('wss://ntfy.sh/pulsepad_v3_room_'+R+'/ws').onmessage=e=>hx(e.data?.match?.(/"hex":"([0-9a-f]{24})"/)?.[1])}catch(_){}})();`;

  // Only encode spaces (%20) so the bookmarklet stays < 1,980 characters and never gets truncated in Tablet Chrome's Bookmark URL input!
  const bookmarkletHref = `javascript:${selfContainedCore.replace(/ /g, '%20')}`;
  const tabletAddressBarCode = `javascript:${selfContainedCore}`;

  const consoleSnippet = `// Xbox Cloud Gaming (xbox.com/play), GeForce NOW, Poki, CrazyGames के लिए v7 Compact Tablet Xbox Controller Bridge (Room: ${cleanRoom}):
${selfContainedCore}
// Source endpoint: "${scriptUrl}"`;

  const userscriptContent = `// ==UserScript==
// @name         PulsePad Xbox Cloud Gaming & Universal Controller Bridge v7 (Room: ${cleanRoom})
// @namespace    ${appOrigin}
// @version      7.0.0
// @description  Ultra-compact WebIDL-safe Xbox Wireless Controller bridge for Room ${cleanRoom}. Works inside xbox.com/play, GeForce NOW, Poki, and CrazyGames.
// @match        *://*.xbox.com/*
// @match        *://*.geforcenow.com/*
// @match        *://*.crazygames.com/*
// @match        *://*.poki.com/*
// @match        *://*.amazon.com/luna/*
// @match        *://hardwaretester.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

${selfContainedCore}
// Fallback endpoint: ${scriptUrl}`;

  return {
    scriptUrl,
    bridgePopupUrl,
    bookmarkletHref,
    tabletAddressBarCode,
    consoleSnippet,
    userscriptContent,
  };
}
