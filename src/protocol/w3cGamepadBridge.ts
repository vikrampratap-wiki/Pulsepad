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
 * Generates self-contained Bookmarklet, Console Snippet, and Auto-Inject Userscript (.user.js)
 * that work on ANY external gaming website (Xbox Cloud Gaming, GeForce NOW, CrazyGames, Poki, etc.)
 * even when PulsePad is opened from GitHub Pages.
 */
export function generateCloudGamingBridgeSnippets(roomCode: string, appOrigin: string) {
  const cleanRoom = roomCode.trim().toUpperCase() || 'PULSE1';
  const topicRoom = cleanRoom.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pulse1';
  const scriptUrl = `${appOrigin}/api/bridge.js?room=${encodeURIComponent(cleanRoom)}`;

  const selfContainedCore = `(function(){if(window.__PULSEPAD_ACTIVE__)return;window.__PULSEPAD_ACTIVE__=true;var st={b:Array.from({length:17},function(){return{pressed:false,touched:false,value:0}}),a:[0,0,0,0],ts:performance.now()};function gp(){return{id:'Xbox Series X|S Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',index:0,connected:true,mapping:'standard',timestamp:st.ts,axes:st.a.slice(),buttons:st.b.slice(),vibrationActuator:{type:'dual-rumble',playEffect:function(){return Promise.resolve('complete')}}}}navigator.getGamepads=function(){return[gp(),null,null,null]};try{var e=new Event('gamepadconnected');e.gamepad=gp();window.dispatchEvent(e)}catch(_){}function applyHex(h){if(!h||h.length!==24)return;var u=new Uint8Array(12);for(var i=0;i<12;i++)u[i]=parseInt(h.slice(i*2,i*2+2),16);if(u[0]!==165)return;var m=u[2]|(u[3]<<8);for(var j=0;j<16;j++){var p=(m&(1<<j))!==0;st.b[j]={pressed:p,touched:p,value:p?1:0}}var g=(u[1]&1)!==0;st.b[16]={pressed:g,touched:g,value:g?1:0};var lt=u[4]/255,rt=u[5]/255;st.b[6]={pressed:lt>0.08,touched:lt>0.02,value:lt};st.b[7]={pressed:rt>0.08,touched:rt>0.02,value:rt};var d=new DataView(u.buffer);st.a=[d.getInt8(6)/127,d.getInt8(7)/127,d.getInt8(8)/127,d.getInt8(9)/127];st.ts=performance.now()}var ws=new WebSocket('wss://ntfy.sh/pulsepad_v3_room_${topicRoom}/ws');ws.onmessage=function(ev){try{var o=JSON.parse(ev.data);if(o.event==='message'&&o.message){var m=JSON.parse(o.message);if(m.hex)applyHex(m.hex)}}catch(_){}};console.log('[PulsePad] Connected Phone Controller Room ${cleanRoom}');})();`;

  const bookmarkletHref = `javascript:${encodeURIComponent(selfContainedCore)}`;

  const consoleSnippet = `// किसी भी गेमिंग वेबसाइट (xbox.com/play, geforcenow.com, crazygames.com, poki.com) के Console में पेस्ट करें (Room: ${cleanRoom}):
${selfContainedCore}
// Optional local bridge fallback: "${scriptUrl}"`;

  const userscriptContent = `// ==UserScript==
// @name         PulsePad Universal Cloud Gaming Controller Bridge (Room: ${cleanRoom})
// @namespace    ${appOrigin}
// @version      3.0.0
// @description  Automatically connects your PulsePad phone controller (Room ${cleanRoom}) to Xbox Cloud Gaming, GeForce NOW, Poki, CrazyGames, and all web gaming sites.
// @match        *://*.xbox.com/*
// @match        *://*.geforcenow.com/*
// @match        *://*.crazygames.com/*
// @match        *://*.poki.com/*
// @match        *://*.amazon.com/luna/*
// @match        *://hardwaretester.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

${selfContainedCore}
// Source endpoint: ${scriptUrl}`;

  return {
    scriptUrl,
    bookmarkletHref,
    consoleSnippet,
    userscriptContent,
  };
}
