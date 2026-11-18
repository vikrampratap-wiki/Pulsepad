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
 * Also sets `Object.setPrototypeOf(pad, window.Gamepad.prototype)` so strict cloud gaming checks
 * (`pad instanceof Gamepad` on `xbox.com/play` and GeForce NOW) pass natively!
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

  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    writable: true,
    value: () => {
      const nativePads = nativeGetGamepads ? Array.from(nativeGetGamepads()) : [];
      const virtualPad = buildW3CGamepadObject();
      return [virtualPad, nativePads[1] ?? null, nativePads[2] ?? null, nativePads[3] ?? null];
    },
  });

  // Fire standard W3C gamepadconnected event so Xbox Cloud Gaming / GeForce NOW hotplug detects it immediately
  try {
    const pad = buildW3CGamepadObject();
    if (pad) {
      let connEvent: Event;
      if (typeof GamepadEvent === 'function') {
        connEvent = new GamepadEvent('gamepadconnected', { gamepad: pad });
      } else {
        connEvent = new Event('gamepadconnected');
        (connEvent as Event & { gamepad: Gamepad }).gamepad = pad;
      }
      window.dispatchEvent(connEvent);
    }
  } catch {
    // Ignore in restricted environments
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
 * Generates Tablet-Friendly, CSP-Bypassing Xbox Cloud Gaming (`xbox.com/play`) & External Website Bridge Snippets:
 * 1) Matches `encodeGamepadPacket` 12-byte format (`0x50` header, axes at bytes 4..7, triggers at bytes 8..9).
 * 2) Inherits from `window.Gamepad.prototype` (`instanceof Gamepad === true`) and pulses Button A on connect
 *    so Xbox Cloud Gaming's "Connect a controller" dialog immediately turns green on Tablets!
 * 3) Uses triple transport on Tablet:
 *    - Direct WebSocket (`wss://ntfy.sh/pulsepad_v3_room_<id>/ws`)
 *    - Hidden in-page `<iframe>` relay (`?bridge=1&room=<id>`) so Tablet browsers NEVER switch tabs!
 *    - Optional 1-tap Popup Relay if user taps the floating green Tablet HUD badge.
 */
export function generateCloudGamingBridgeSnippets(roomCode: string, appOrigin: string) {
  const cleanRoom = sanitizeRoomId(roomCode) || '8492310756';
  const topicRoom = cleanRoom.toLowerCase();
  const baseUrl = resolveAppBaseUrl();
  const bridgePopupUrl = `${baseUrl}/?bridge=1&room=${encodeURIComponent(cleanRoom)}`;
  const scriptUrl = `${appOrigin}/api/bridge.js?room=${encodeURIComponent(cleanRoom)}`;

  const selfContainedCore = `(function(){var R='${cleanRoom}',T='${topicRoom}',B='${bridgePopupUrl}';var st={b:Array.from({length:17},function(){return{pressed:false,touched:false,value:0}}),a:[0,0,0,0],ts:performance.now()};function mkBtn(o){if(window.GamepadButton&&GamepadButton.prototype){try{Object.setPrototypeOf(o,GamepadButton.prototype)}catch(_){}}return o}function gp(){var pad={id:'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',index:0,connected:true,mapping:'standard',timestamp:st.ts,axes:st.a.slice(),buttons:st.b.map(function(x){return mkBtn({pressed:x.pressed,touched:x.touched,value:x.value})}),hapticActuators:[],vibrationActuator:{type:'dual-rumble',playEffect:function(){return Promise.resolve('complete')},reset:function(){return Promise.resolve('complete')}}};if(window.Gamepad&&Gamepad.prototype){try{Object.setPrototypeOf(pad,Gamepad.prototype)}catch(_){}}return pad}Object.defineProperty(navigator,'getGamepads',{configurable:true,writable:true,value:function(){return[gp(),null,null,null]}});function fireConn(){try{var p=gp(),ev;if(typeof GamepadEvent==='function'){ev=new GamepadEvent('gamepadconnected',{gamepad:p})}else{ev=new Event('gamepadconnected');ev.gamepad=p}window.dispatchEvent(ev)}catch(_){}}st.b[0]={pressed:true,touched:true,value:1};fireConn();setTimeout(function(){st.b[0]={pressed:false,touched:false,value:0};st.ts=performance.now();fireConn()},180);setInterval(function(){st.ts=performance.now()},16);var badge=document.getElementById('__pulsepad_hud');if(!badge){badge=document.createElement('div');badge.id='__pulsepad_hud';badge.style.cssText='position:fixed;bottom:10px;right:10px;z-index:2147483647;background:#090D16;color:#34D399;border:2px solid #10B981;padding:6px 12px;border-radius:12px;font:700 11px monospace;box-shadow:0 8px 24px rgba(0,0,0,.7);cursor:pointer;';badge.textContent='Xbox Controller Connected · ID '+R+' (Tap if blocked)';badge.onclick=function(){window.open(B,'pulsepad_relay_'+R,'width=360,height=260')};document.body.appendChild(badge)}function applyHex(h){if(!h||h.length!==24)return;var u=new Uint8Array(12);for(var i=0;i<12;i++)u[i]=parseInt(h.slice(i*2,i*2+2),16);if(u[0]!==80&&u[0]!==165)return;var m=u[2]|(u[3]<<8);for(var j=0;j<16;j++){var p=(m&(1<<j))!==0;st.b[j]={pressed:p,touched:p,value:p?1:0}}var g=(u[1]&1)!==0;st.b[16]={pressed:g,touched:g,value:g?1:0};var d=new DataView(u.buffer);st.a=[d.getInt8(4)/127,d.getInt8(5)/127,d.getInt8(6)/127,d.getInt8(7)/127];var lt=u[8]/255,rt=u[9]/255;st.b[6]={pressed:lt>0.08,touched:lt>0.02,value:lt};st.b[7]={pressed:rt>0.08,touched:rt>0.02,value:rt};st.ts=performance.now();fireConn();if(badge)badge.textContent='Xbox Pad Active · ID '+R+' (Seq '+((u[10]|(u[11]<<8)))+')'}window.addEventListener('message',function(ev){if(ev.data&&ev.data.__pulsepad_hex){applyHex(ev.data.__pulsepad_hex)}});try{var ifr=document.getElementById('__pulsepad_ifr');if(!ifr){ifr=document.createElement('iframe');ifr.id='__pulsepad_ifr';ifr.src=B;ifr.style.cssText='width:1px;height:1px;opacity:0.01;position:fixed;bottom:0;left:0;pointer-events:none;border:0;';document.body.appendChild(ifr)}}catch(_){}try{var ws=new WebSocket('wss://ntfy.sh/pulsepad_v3_room_'+T+'/ws');ws.onmessage=function(ev){try{var o=JSON.parse(ev.data);if(o.event==='message'&&o.message){var m=JSON.parse(o.message);if(m.hex)applyHex(m.hex)}}catch(_){}}}catch(_){}})();`;

  const bookmarkletHref = `javascript:${encodeURIComponent(selfContainedCore)}`;
  // Raw unencoded javascript: string for direct Tablet Chrome Address-Bar paste
  const tabletAddressBarCode = `javascript:${selfContainedCore}`;

  const consoleSnippet = `// Xbox Cloud Gaming (xbox.com/play), GeForce NOW, Poki, CrazyGames के लिए Tablet Xbox Controller Bridge (Room: ${cleanRoom}):
${selfContainedCore}
// Source endpoint: "${scriptUrl}"`;

  const userscriptContent = `// ==UserScript==
// @name         PulsePad Xbox Cloud Gaming & Universal Controller Bridge (Room: ${cleanRoom})
// @namespace    ${appOrigin}
// @version      5.0.0
// @description  Tablet-ready Xbox Wireless Controller bridge for Room ${cleanRoom}. Works inside xbox.com/play, GeForce NOW, Poki, and CrazyGames.
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
