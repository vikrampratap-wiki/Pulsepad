import { VirtualGamepadState, resolveAppBaseUrl, sanitizeRoomId } from './gamepadProtocol';

let currentVirtualState: VirtualGamepadState | null = null;
let bridgeInstalled = false;
let originalGetGamepads: (() => (Gamepad | null)[]) | null = null;

/**
 * Installs a real W3C Standard `navigator.getGamepads()` override in the current browser window
 * with proper `Gamepad.prototype` inheritance so Xbox Cloud Gaming (`instanceof Gamepad`),
 * GeForce NOW, and HTML5 games detect our virtual controller natively.
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
      const btnObj = {
        pressed,
        touched: val > 0.02,
        value: Math.max(0, Math.min(1, val)),
      };
      if (typeof GamepadButton !== 'undefined' && GamepadButton.prototype) {
        try {
          Object.setPrototypeOf(btnObj, GamepadButton.prototype);
        } catch {
          // Ignore in strict environments
        }
      }
      return btnObj as GamepadButton;
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
        playEffect: async (
          _type: string,
          params?: { duration?: number; strongMagnitude?: number }
        ) => {
          const duration = params?.duration ?? 180;
          const mag = params?.strongMagnitude ?? 0.7;
          onRumbleRequest?.(mag, duration);
          return 'complete';
        },
        reset: async () => 'complete',
      },
    };

    if (typeof Gamepad !== 'undefined' && Gamepad.prototype) {
      try {
        Object.setPrototypeOf(fakeGamepad, Gamepad.prototype);
      } catch {
        // Ignore if read-only
      }
    }

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

  // Fire standard W3C gamepadconnected event so Xbox Cloud Gaming / GeForce NOW hotplug detects it immediately
  try {
    const pad = buildW3CGamepadObject();
    let connEvent: Event;
    if (typeof GamepadEvent === 'function') {
      connEvent = new GamepadEvent('gamepadconnected', { gamepad: pad });
    } else {
      connEvent = new Event('gamepadconnected');
      (connEvent as Event & { gamepad: Gamepad }).gamepad = pad;
    }
    window.dispatchEvent(connEvent);
  } catch {
    // Ignore in restricted environments
  }
}

export function updateLocalW3CGamepadBridge(nextState: VirtualGamepadState) {
  currentVirtualState = nextState;
}

/**
 * Generates CSP-Bypassing Xbox Cloud Gaming & External Website Bridge Snippets:
 * 1) Uses `window.open` Popup Relay (`postMessage`) so `xbox.com/play`'s strict CSP `connect-src` is bypassed!
 * 2) Inherits from `window.Gamepad.prototype` (`instanceof Gamepad === true`) so Xbox Cloud Gaming's
 *    "Connect a controller" dialog immediately turns green!
 * 3) Also includes direct WebSocket fallback + Keyboard Event synthesis for Poki/CrazyGames.
 */
export function generateCloudGamingBridgeSnippets(roomCode: string, appOrigin: string) {
  const cleanRoom = sanitizeRoomId(roomCode) || '8492310756';
  const topicRoom = cleanRoom.toLowerCase();
  const baseUrl = resolveAppBaseUrl();
  const bridgePopupUrl = `${baseUrl}/?bridge=1&room=${encodeURIComponent(cleanRoom)}`;
  const scriptUrl = `${appOrigin}/api/bridge.js?room=${encodeURIComponent(cleanRoom)}`;

  const selfContainedCore = `(function(){var R='${cleanRoom}',T='${topicRoom}',B='${bridgePopupUrl}';var st={b:Array.from({length:17},function(){return{pressed:false,touched:false,value:0}}),a:[0,0,0,0],ts:performance.now()};function mkBtn(o){if(window.GamepadButton&&GamepadButton.prototype){try{Object.setPrototypeOf(o,GamepadButton.prototype)}catch(_){}}return o}function gp(){var pad={id:'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',index:0,connected:true,mapping:'standard',timestamp:st.ts,axes:st.a.slice(),buttons:st.b.map(function(x){return mkBtn({pressed:x.pressed,touched:x.touched,value:x.value})}),hapticActuators:[],vibrationActuator:{type:'dual-rumble',playEffect:function(){return Promise.resolve('complete')},reset:function(){return Promise.resolve('complete')}}};if(window.Gamepad&&Gamepad.prototype){try{Object.setPrototypeOf(pad,Gamepad.prototype)}catch(_){}}return pad}navigator.getGamepads=function(){return[gp(),null,null,null]};function fireConn(){try{var p=gp(),ev;if(typeof GamepadEvent==='function'){ev=new GamepadEvent('gamepadconnected',{gamepad:p})}else{ev=new Event('gamepadconnected');ev.gamepad=p}window.dispatchEvent(ev)}catch(_){}}fireConn();setInterval(function(){st.ts=performance.now()},16);var badge=document.getElementById('__pulsepad_hud');if(!badge){badge=document.createElement('div');badge.id='__pulsepad_hud';badge.style.cssText='position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#090D16;color:#34D399;border:2px solid #10B981;padding:6px 12px;border-radius:12px;font:600 12px monospace;box-shadow:0 8px 24px rgba(0,0,0,.6);pointer-events:none;';badge.textContent='PulsePad Xbox Ready · Room '+R;document.body.appendChild(badge)}function applyHex(h){if(!h||h.length!==24)return;var u=new Uint8Array(12);for(var i=0;i<12;i++)u[i]=parseInt(h.slice(i*2,i*2+2),16);if(u[0]!==165)return;var m=u[2]|(u[3]<<8);for(var j=0;j<16;j++){var p=(m&(1<<j))!==0;st.b[j]={pressed:p,touched:p,value:p?1:0}}var g=(u[1]&1)!==0;st.b[16]={pressed:g,touched:g,value:g?1:0};var lt=u[4]/255,rt=u[5]/255;st.b[6]={pressed:lt>0.08,touched:lt>0.02,value:lt};st.b[7]={pressed:rt>0.08,touched:rt>0.02,value:rt};var d=new DataView(u.buffer);st.a=[d.getInt8(6)/127,d.getInt8(7)/127,d.getInt8(8)/127,d.getInt8(9)/127];st.ts=performance.now();fireConn();if(badge)badge.textContent='PulsePad Active · Room '+R+' (Seq '+((u[10]|(u[11]<<8)))+')'}window.addEventListener('message',function(ev){if(ev.data&&ev.data.__pulsepad_hex){applyHex(ev.data.__pulsepad_hex)}});try{window.open(B,'pulsepad_relay_'+R,'width=360,height=260,menubar=no,toolbar=no,location=no,status=no')}catch(_){}try{var ws=new WebSocket('wss://ntfy.sh/pulsepad_v3_room_'+T+'/ws');ws.onmessage=function(ev){try{var o=JSON.parse(ev.data);if(o.event==='message'&&o.message){var m=JSON.parse(o.message);if(m.hex)applyHex(m.hex)}}catch(_){}}}catch(_){}})();`;

  const bookmarkletHref = `javascript:${encodeURIComponent(selfContainedCore)}`;

  const consoleSnippet = `// Xbox Cloud Gaming (xbox.com/play), GeForce NOW, Poki, CrazyGames के लिए CSP-Bypassing Xbox Controller Bridge (Room: ${cleanRoom}):
${selfContainedCore}
// Source endpoint: "${scriptUrl}"`;

  const userscriptContent = `// ==UserScript==
// @name         PulsePad Xbox Cloud Gaming & Universal Controller Bridge (Room: ${cleanRoom})
// @namespace    ${appOrigin}
// @version      4.0.0
// @description  CSP-Bypassing Xbox Wireless Controller bridge for Room ${cleanRoom}. Works inside xbox.com/play, GeForce NOW, Poki, and CrazyGames.
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
    consoleSnippet,
    userscriptContent,
  };
}
