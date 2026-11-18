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
 *
 * Crucially:
 * 1) Overrides BOTH `Navigator.prototype.getGamepads` and `navigator.getGamepads`.
 * 2) Sets `Object.setPrototypeOf(pad, window.Gamepad.prototype)` and `GamepadButton.prototype`.
 * 3) Dispatches `gamepadconnected` using `new Event('gamepadconnected')` + `Object.setPrototypeOf(ev, GamepadEvent.prototype)`
 *    because `new GamepadEvent(...)` in Chromium C++ WebIDL throws a TypeError on synthetic Gamepad objects!
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
 * Generates v6 Tablet-Ready, CSP-Bypassing Xbox Cloud Gaming (`xbox.com/play`) & External Website Bridge Snippets:
 *
 * Why v6 works inside `xbox.com/play` where earlier scripts showed "Controller not connected":
 * 1) WebIDL-Safe `GamepadEvent`: In Chromium, `new GamepadEvent('gamepadconnected', { gamepad: fakePad })`
 *    THROWS a TypeError because `fakePad` is not a native C++ Blink object, which previously caused
 *    `window.dispatchEvent` to be skipped! v6 constructs `new Event('gamepadconnected')`, defines `.gamepad`,
 *    and sets `Object.setPrototypeOf(ev, GamepadEvent.prototype)` so `ev instanceof GamepadEvent === true`
 *    AND `window.dispatchEvent(ev)` ALWAYS succeeds!
 * 2) Overrides BOTH `Navigator.prototype.getGamepads` and `navigator.getGamepads`.
 * 3) Bi-directional CSP-Bypass `postMessage` Handshake:
 *    - If `xbox.com/play` was opened from PulsePad's "Launch xbox.com/play" button (`window.opener`),
 *      it immediately subscribes to `window.opener.postMessage({ __pulsepad_subscribe: R }, '*')`!
 *    - If `xbox.com/play` was opened separately, tapping the floating HUD button opens the Keep-Awake
 *      PulsePad Relay tab (`window.open(B, 'pulsepad_relay_' + R)`) and receives 60Hz `{ __pulsepad_hex }` packets!
 * 4) Also synthesizes Keyboard/Gamepad events (`Enter`, `Escape`, `ArrowUp/Down/Left/Right`) for menus.
 */
export function generateCloudGamingBridgeSnippets(roomCode: string, appOrigin: string) {
  const cleanRoom = sanitizeRoomId(roomCode) || '8492310756';
  const topicRoom = cleanRoom.toLowerCase();
  const baseUrl = resolveAppBaseUrl();
  const bridgePopupUrl = `${baseUrl}/?bridge=1&room=${encodeURIComponent(cleanRoom)}`;
  const scriptUrl = `${appOrigin}/api/bridge.js?room=${encodeURIComponent(cleanRoom)}`;

  const selfContainedCore = `(function(){var R='${cleanRoom}',T='${topicRoom}',B='${bridgePopupUrl}',pktCount=0,relayWin=null;var st={b:Array.from({length:17},function(){return{pressed:false,touched:false,value:0}}),a:[0,0,0,0],ts:performance.now()};function mkBtn(o){if(window.GamepadButton&&GamepadButton.prototype){try{Object.setPrototypeOf(o,GamepadButton.prototype)}catch(_){}}return o}var cachedPad={id:'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',index:0,connected:true,mapping:'standard',timestamp:st.ts,axes:[0,0,0,0],buttons:st.b.map(function(x){return mkBtn({pressed:x.pressed,touched:x.touched,value:x.value})}),hapticActuators:[],vibrationActuator:{type:'dual-rumble',playEffect:function(){return Promise.resolve('complete')},reset:function(){return Promise.resolve('complete')}}};if(window.Gamepad&&Gamepad.prototype){try{Object.setPrototypeOf(cachedPad,Gamepad.prototype)}catch(_){}}function gp(){cachedPad.timestamp=st.ts;cachedPad.axes=[st.a[0],st.a[1],st.a[2],st.a[3]];for(var i=0;i<17;i++){var b=st.b[i];cachedPad.buttons[i]=mkBtn({pressed:b.pressed,touched:b.touched,value:b.value})}return cachedPad}var getPadsFn=function(){return[gp(),null,null,null]};try{if(window.Navigator&&Navigator.prototype){Object.defineProperty(Navigator.prototype,'getGamepads',{configurable:true,writable:true,value:getPadsFn});Navigator.prototype.webkitGetGamepads=getPadsFn}}catch(_){}try{Object.defineProperty(navigator,'getGamepads',{configurable:true,writable:true,value:getPadsFn});navigator.webkitGetGamepads=getPadsFn}catch(_){}function fireConn(){try{var p=gp(),ev=new Event('gamepadconnected',{bubbles:true,cancelable:false});Object.defineProperty(ev,'gamepad',{value:p,enumerable:true,configurable:true});if(window.GamepadEvent&&GamepadEvent.prototype){try{Object.setPrototypeOf(ev,GamepadEvent.prototype)}catch(_){}}window.dispatchEvent(ev);if(typeof window.ongamepadconnected==='function'){try{window.ongamepadconnected(ev)}catch(_){}}document.dispatchEvent(ev)}catch(_){}}function pulseWake(){st.b[0]={pressed:true,touched:true,value:1};st.ts=performance.now();fireConn();setTimeout(function(){st.b[0]={pressed:false,touched:false,value:0};st.ts=performance.now();fireConn()},160)}pulseWake();setInterval(function(){st.ts=performance.now();if(pktCount===0)fireConn()},800);var badge=document.getElementById('__pulsepad_hud');if(!badge){badge=document.createElement('div');badge.id='__pulsepad_hud';badge.style.cssText='position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#090D16;color:#FBBF24;border:2px solid #F59E0B;padding:8px 14px;border-radius:14px;font:700 12px monospace;box-shadow:0 8px 28px rgba(0,0,0,.85);cursor:pointer;user-select:none;';badge.textContent='👉 यहाँ टैप करें: फ़ोन रिले जोड़ें (ID '+R+')';badge.onclick=function(){pulseWake();try{relayWin=window.open(B,'pulsepad_relay_'+R,'width=380,height=280');badge.style.borderColor='#10B981';badge.style.color='#34D399';badge.textContent='✓ रिले जुड़ गया! अब इस Xbox टैब पर वापस आकर फ़ोन से खेलें'}catch(_){}};document.body.appendChild(badge)}var prevB=new Array(17).fill(false);var keyMap={0:['Enter',13],1:['Escape',27],8:['Tab',9],9:['Enter',13],12:['ArrowUp',38],13:['ArrowDown',40],14:['ArrowLeft',37],15:['ArrowRight',39]};function syncKeys(){for(var k in keyMap){var idx=Number(k),nowP=st.b[idx]&&st.b[idx].pressed;if(nowP!==prevB[idx]){prevB[idx]=nowP;try{var info=keyMap[k],ke=new KeyboardEvent(nowP?'keydown':'keyup',{key:info[0],code:info[0],keyCode:info[1],which:info[1],bubbles:true,cancelable:true}); (document.activeElement||document.body).dispatchEvent(ke);window.dispatchEvent(ke)}catch(_){}}}}function applyHex(h){if(!h||h.length!==24)return;var u=new Uint8Array(12);for(var i=0;i<12;i++)u[i]=parseInt(h.slice(i*2,i*2+2),16);if(u[0]!==80&&u[0]!==165)return;pktCount++;var m=u[2]|(u[3]<<8);for(var j=0;j<16;j++){var p=(m&(1<<j))!==0;st.b[j]={pressed:p,touched:p,value:p?1:0}}var g=(u[1]&1)!==0;st.b[16]={pressed:g,touched:g,value:g?1:0};var d=new DataView(u.buffer);st.a=[d.getInt8(4)/127,d.getInt8(5)/127,d.getInt8(6)/127,d.getInt8(7)/127];var lt=u[8]/255,rt=u[9]/255;st.b[6]={pressed:lt>0.08,touched:lt>0.02,value:lt};st.b[7]={pressed:rt>0.08,touched:rt>0.02,value:rt};st.ts=performance.now();fireConn();syncKeys();if(badge){badge.style.borderColor='#10B981';badge.style.color='#34D399';badge.textContent='🎮 Xbox Pad LIVE · ID '+R+' (Pkt #'+pktCount+')'}}window.addEventListener('message',function(ev){if(ev.data&&ev.data.__pulsepad_hex){applyHex(ev.data.__pulsepad_hex)}});if(window.opener&&!window.opener.closed){try{window.opener.postMessage({__pulsepad_subscribe:R},'*');if(badge){badge.style.borderColor='#10B981';badge.style.color='#34D399';badge.textContent='✓ Xbox Linked to PulsePad Tab · ID '+R}}catch(_){}}setInterval(function(){if(window.opener&&!window.opener.closed){try{window.opener.postMessage({__pulsepad_subscribe:R},'*')}catch(_){}}if(relayWin&&!relayWin.closed){try{relayWin.postMessage({__pulsepad_subscribe:R},'*')}catch(_){}}},1500);try{var ws=new WebSocket('wss://ntfy.sh/pulsepad_v3_room_'+T+'/ws');ws.onmessage=function(ev){try{var o=JSON.parse(ev.data);if(o.event==='message'&&o.message){var m=JSON.parse(o.message);if(m.hex)applyHex(m.hex)}}catch(_){}}}catch(_){}})();`;

  const bookmarkletHref = `javascript:${encodeURIComponent(selfContainedCore)}`;
  const tabletAddressBarCode = `javascript:${selfContainedCore}`;

  const consoleSnippet = `// Xbox Cloud Gaming (xbox.com/play), GeForce NOW, Poki, CrazyGames के लिए v6 Tablet Xbox Controller Bridge (Room: ${cleanRoom}):
${selfContainedCore}
// Source endpoint: "${scriptUrl}"`;

  const userscriptContent = `// ==UserScript==
// @name         PulsePad Xbox Cloud Gaming & Universal Controller Bridge v6 (Room: ${cleanRoom})
// @namespace    ${appOrigin}
// @version      6.0.0
// @description  WebIDL-safe Xbox Wireless Controller bridge for Room ${cleanRoom}. Works inside xbox.com/play, GeForce NOW, Poki, and CrazyGames.
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
