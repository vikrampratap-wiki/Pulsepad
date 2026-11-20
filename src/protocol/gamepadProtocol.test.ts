import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialGamepadState,
  encodeGamepadPacket,
  decodeGamepadPacket,
  applyStickResponseCurve,
  simulateTransportLatency,
  formatPacketHex,
  resolveAppBaseUrl,
  resolveRelayBackendOrigin,
  buildControllerPairUrl,
  generateSecureNumericRoomId,
  formatRoomIdDisplay,
  sanitizeRoomId,
  getOrCreatePersistentRoomId,
} from './gamepadProtocol';
import {
  generateCloudGamingBridgeSnippets,
  parseBridgeHexFrame,
} from './w3cGamepadBridge';
import {
  CONTROLLER_THEME_PRESETS,
  DEFAULT_CONTROLLER_THEME,
  hexToRgba,
  loadControllerThemeFromStorage,
  saveControllerThemeToStorage,
  sanitizeControllerTheme,
} from './controllerTheme';
import {
  createDefaultLayoutMap,
  createPresetLayoutMap,
  getControllerOrientationMode,
  loadControllerLayoutFromStorage,
  saveControllerLayoutToStorage,
} from './controllerLayoutPositions';

test('12-byte binary packet encodes and decodes buttons, analog triggers, and axes accurately', () => {
  const state = createInitialGamepadState('playstation');
  state.buttons[0] = 1; // Cross / A
  state.buttons[3] = 1; // Triangle / Y
  state.buttons[6] = 0.5; // L2 analog trigger
  state.buttons[7] = 1.0; // R2 analog trigger
  state.buttons[16] = 1; // PS guide button
  state.axes = [-0.75, 0.5, 0.25, -1.0];
  state.sequence = 1337;

  const packet = encodeGamepadPacket(state);
  assert.equal(packet.byteLength, 12);

  const hex = formatPacketHex(packet);
  assert.equal(hex.length, 12);
  assert.equal(hex[0], '50'); // 'P' header

  const decoded = decodeGamepadPacket(packet);
  assert.ok(decoded);
  assert.equal(decoded.skin, 'playstation');
  assert.equal(decoded.buttons[0], 1);
  assert.equal(decoded.buttons[1], 0);
  assert.equal(decoded.buttons[3], 1);
  assert.equal(decoded.buttons[16], 1);
  assert.ok(Math.abs(decoded.buttons[6] - 0.5) <= 0.02);
  assert.equal(decoded.buttons[7], 1);
  assert.ok(Math.abs(decoded.axes[0] - -0.75) <= 0.02);
  assert.ok(Math.abs(decoded.axes[1] - 0.5) <= 0.02);
  assert.ok(Math.abs(decoded.axes[3] - -1.0) <= 0.02);
  assert.equal(decoded.sequence, 1337);
});

test('stick radial deadzone filters micro-drift and curves scale properly', () => {
  const [zeroX, zeroY] = applyStickResponseCurve(0.05, -0.06, {
    deadzone: 0.12,
    curve: 'linear',
    gyroSensitivity: 0,
    gyroEnabled: false,
  });
  assert.equal(zeroX, 0);
  assert.equal(zeroY, 0);

  const [fullX, fullY] = applyStickResponseCurve(1.0, 0, {
    deadzone: 0.1,
    curve: 'precision',
    gyroSensitivity: 0,
    gyroEnabled: false,
  });
  assert.equal(fullX, 1);
  assert.equal(fullY, 0);
});

test('transport simulator shows sub-15ms P50 UDP latency and 95%+ binary bandwidth savings', () => {
  const metrics = simulateTransportLatency({
    baseWifiRttMs: 14,
    packetLossPercent: 3,
    pollingRateHz: 120,
  });

  assert.ok(metrics.udpLatencyP50Ms <= 15, `Expected UDP P50 <= 15ms, got ${metrics.udpLatencyP50Ms}`);
  assert.ok(metrics.tcpLatencyP99Ms > metrics.udpLatencyP99Ms);
  assert.ok(metrics.savingPercent >= 95);
});

test('external gaming website bridge generates valid userscript, bookmarklet, and console script', () => {
  const snippets = generateCloudGamingBridgeSnippets('3141339400', 'https://vikrampratap-wiki.github.io/Pulsepad');
  assert.ok(snippets.scriptUrl.includes('room=3141339400'));
  assert.ok(snippets.bookmarkletHref.startsWith('javascript:(function(){'));
  assert.ok(snippets.bookmarkletHref.endsWith('})();'));
  assert.ok(
    snippets.bookmarkletHref.length < 1995,
    `Expected compact bookmarklet < 1995 chars for Tablet URL bar, got ${snippets.bookmarkletHref.length}`
  );
  assert.ok(snippets.consoleSnippet.includes('Gamepad?.prototype'));
  assert.ok(snippets.consoleSnippet.includes('bridge=1&room='));
  assert.ok(snippets.userscriptContent.includes('// ==UserScript=='));
  assert.ok(snippets.userscriptContent.includes('*://*.xbox.com/*'));
});

test('controller theme color-picker state sanitizes and persists to localStorage accurately', () => {
  const memoryStore = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryStore.set(k, v);
    },
  };

  const initial = loadControllerThemeFromStorage(mockStorage);
  assert.equal(initial.buttonAccentHex, DEFAULT_CONTROLLER_THEME.buttonAccentHex);

  const customTheme = sanitizeControllerTheme({
    id: 'custom',
    name: 'Neon Cyber',
    buttonAccentHex: '#ff0055',
    stickAccentHex: '#00ffcc',
    triggerAccentHex: '#ffcc00',
    shellTheme: 'titanium',
    borderOpacityPercent: 85,
  });

  saveControllerThemeToStorage(customTheme, mockStorage);
  const loaded = loadControllerThemeFromStorage(mockStorage);

  assert.equal(loaded.buttonAccentHex, '#FF0055');
  assert.equal(loaded.stickAccentHex, '#00FFCC');
  assert.equal(loaded.triggerAccentHex, '#FFCC00');
  assert.equal(loaded.shellTheme, 'titanium');
  assert.equal(loaded.borderOpacityPercent, 85);
  assert.equal(hexToRgba('#FF0055', 0.5), 'rgba(255, 0, 85, 0.5)');
  assert.ok(CONTROLLER_THEME_PRESETS.length >= 5);
});

test('drag-and-drop controller layout positions clamp bounds and persist to localStorage across reloads', () => {
  const memoryStore = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryStore.set(k, v);
    },
  };

  const initial = loadControllerLayoutFromStorage(mockStorage);
  assert.equal(initial.gripLayout, 'console_shell');
  assert.equal(initial.modules.faceButtons.dx, 0);
  assert.equal(initial.modules.faceButtons.dy, 0);

  const customModules = createDefaultLayoutMap();
  customModules.faceButtons = { dx: -48, dy: 32, scale: 1.15 };
  customModules.leftStick = { dx: 500, dy: -400, scale: 2.0 }; // Should clamp to 220, -180, 1.25

  saveControllerLayoutToStorage(
    {
      gripLayout: 'split_edge',
      modules: customModules,
    },
    mockStorage
  );

  const reloaded = loadControllerLayoutFromStorage(mockStorage);
  assert.equal(reloaded.gripLayout, 'split_edge');
  assert.equal(reloaded.modules.faceButtons.dx, -48);
  assert.equal(reloaded.modules.faceButtons.dy, 32);
  assert.equal(reloaded.modules.faceButtons.scale, 1.15);
  assert.equal(reloaded.modules.leftStick.dx, 220);
  assert.equal(reloaded.modules.leftStick.dy, -180);
  assert.equal(reloaded.modules.leftStick.scale, 1.25);

  const clawPreset = createPresetLayoutMap('claw_ergonomic');
  assert.notEqual(clawPreset.faceButtons.dx, 0);
});

test('buildControllerPairUrl preserves GitHub Pages repository subpath (/Pulsepad) in QR code URLs', () => {
  assert.equal(
    resolveAppBaseUrl('https://vikrampratap-wiki.github.io', '/Pulsepad/'),
    'https://vikrampratap-wiki.github.io/Pulsepad'
  );
  assert.equal(
    resolveAppBaseUrl('https://vikrampratap-wiki.github.io', '/Pulsepad/index.html'),
    'https://vikrampratap-wiki.github.io/Pulsepad'
  );
  assert.equal(
    buildControllerPairUrl('8492-310-756', 'https://vikrampratap-wiki.github.io', '/Pulsepad/'),
    'https://vikrampratap-wiki.github.io/Pulsepad/?mode=controller&room=8492310756'
  );
  assert.equal(
    buildControllerPairUrl('PULSE1', 'http://localhost:3000', '/'),
    'http://localhost:3000/?mode=controller&room=PULSE1'
  );
});

test('generateSecureNumericRoomId creates unique 10-digit numeric IDs and persists per user', () => {
  const id1 = generateSecureNumericRoomId();
  const id2 = generateSecureNumericRoomId();
  assert.match(id1, /^[1-9][0-9]{9}$/);
  assert.match(id2, /^[1-9][0-9]{9}$/);
  assert.notEqual(id1, id2);

  assert.equal(formatRoomIdDisplay('8492310756'), '8492-310-756');
  assert.equal(sanitizeRoomId('8492-310-756'), '8492310756');

  const memoryStore = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryStore.set(k, v);
    },
  };

  const firstVisitId = getOrCreatePersistentRoomId(null, mockStorage);
  assert.match(firstVisitId, /^[1-9][0-9]{9}$/);
  const secondVisitId = getOrCreatePersistentRoomId(null, mockStorage);
  assert.equal(firstVisitId, secondVisitId);
});

test('parseBridgeHexFrame decodes 12-byte phone controller packets accurately for Xbox Cloud Gaming', () => {
  const state = createInitialGamepadState('xbox');
  state.buttons[0] = 1; // A
  state.buttons[6] = 0.5; // LT
  state.buttons[7] = 1; // RT
  state.buttons[16] = 1; // Xbox Guide
  state.axes = [-0.5, 0.75, 0.25, -1];
  state.sequence = 512;

  const bytes = encodeGamepadPacket(state);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const parsed = parseBridgeHexFrame(hex);
  assert.ok(parsed);
  assert.equal(parsed.buttons[0], 1);
  assert.equal(parsed.buttons[16], 1);
  assert.ok(Math.abs(parsed.buttons[6] - 0.5) <= 0.02);
  assert.equal(parsed.buttons[7], 1);
  assert.ok(Math.abs(parsed.axes[0] - -0.5) <= 0.02);
  assert.ok(Math.abs(parsed.axes[1] - 0.75) <= 0.02);
  assert.ok(Math.abs(parsed.axes[3] - -1) <= 0.02);
  assert.equal(parsed.sequence, 512);
});

test('getControllerOrientationMode accurately detects mobile landscape vs portrait viewports', () => {
  // Mobile landscape viewports mentioned in acceptance criteria (667x375, 844x390, 896x414, 915x412)
  assert.equal(getControllerOrientationMode(667, 375), 'landscape');
  assert.equal(getControllerOrientationMode(844, 390), 'landscape');
  assert.equal(getControllerOrientationMode(896, 414), 'landscape');
  assert.equal(getControllerOrientationMode(915, 412), 'landscape');
  assert.equal(getControllerOrientationMode(800, 480), 'landscape');
  assert.equal(getControllerOrientationMode(568, 320), 'landscape');

  // Mobile portrait viewports (390x844, 414x896)
  assert.equal(getControllerOrientationMode(390, 844), 'portrait');
  assert.equal(getControllerOrientationMode(414, 896), 'portrait');
  assert.equal(getControllerOrientationMode(375, 667), 'portrait');

  // Tablet and desktop screens
  assert.equal(getControllerOrientationMode(1024, 768), 'portrait');
  assert.equal(getControllerOrientationMode(1920, 1080), 'portrait');
});

test('Xbox Cloud Gaming Button B (Continue) and all face/d-pad inputs decode properly in hex frame', () => {
  const state = createInitialGamepadState('xbox');
  state.buttons[0] = 1; // A
  state.buttons[1] = 1; // B (Continue)
  state.buttons[2] = 1; // X
  state.buttons[3] = 1; // Y
  state.buttons[12] = 1; // D-pad Up
  state.buttons[13] = 1; // D-pad Down
  state.buttons[14] = 1; // D-pad Left
  state.buttons[15] = 1; // D-pad Right
  state.sequence = 1001;

  const bytes = encodeGamepadPacket(state);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const parsed = parseBridgeHexFrame(hex);
  assert.ok(parsed);
  assert.equal(parsed.buttons[0], 1, 'A pressed');
  assert.equal(parsed.buttons[1], 1, 'B (Continue) pressed');
  assert.equal(parsed.buttons[2], 1, 'X pressed');
  assert.equal(parsed.buttons[3], 1, 'Y pressed');
  assert.equal(parsed.buttons[12], 1, 'D-pad Up');
  assert.equal(parsed.buttons[13], 1, 'D-pad Down');
  assert.equal(parsed.buttons[14], 1, 'D-pad Left');
  assert.equal(parsed.buttons[15], 1, 'D-pad Right');
  assert.equal(parsed.sequence, 1001);
});

test('resolveRelayBackendOrigin resolves clean hosted origin and avoids dead 404 Cloud Run backend', () => {
  const ghOrigin = resolveRelayBackendOrigin('https://vikrampratap-wiki.github.io/Pulsepad');
  assert.equal(ghOrigin, 'https://vikrampratap-wiki.github.io/Pulsepad');
  assert.ok(!ghOrigin.includes('run.app'), 'Must not point to dead Cloud Run 404 URL');

  const localOrigin = resolveRelayBackendOrigin('http://localhost:3000');
  assert.equal(localOrigin, 'http://localhost:3000');
});

test('Xbox Cloud Gaming bridge snippets include local channels and zero pictorial emojis', () => {
  const snippets = generateCloudGamingBridgeSnippets('9876543210', 'https://example.com/Pulsepad');

  // Verify CSP-resistant local channels are present in core bookmarklet
  assert.ok(snippets.bookmarkletHref.includes('127.0.0.1:8088'), 'Includes CSP-whitelisted local 8088 WebSocket');
  assert.ok(snippets.bookmarkletHref.includes('BroadcastChannel'), 'Includes local BroadcastChannel');
  assert.ok(snippets.bookmarkletHref.includes('Xbox%20LIVE%20#') || snippets.bookmarkletHref.includes('Xbox LIVE #'), 'Includes live packet counter HUD');
  assert.ok(!snippets.bookmarkletHref.includes('wss://ntfy.sh'), 'Must not rely on external WebSocket blocked by play.xbox.com CSP');

  // Strict 0 Pictorial Emojis assertion
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(snippets.bookmarkletHref), 'Bookmarklet must have 0 pictorial emojis');
  assert.ok(!emojiRegex.test(snippets.consoleSnippet), 'Console snippet must have 0 pictorial emojis');
  assert.ok(!emojiRegex.test(snippets.userscriptContent), 'Userscript must have 0 pictorial emojis');

  // Verify MessageChannel transfer is wired into bookmarklet
  assert.ok(snippets.bookmarkletHref.includes('MessageChannel'), 'Must include MessageChannel for sub-15ms direct port transfer');
  assert.ok(snippets.bookmarkletHref.length < 1995, `Bookmarklet must be < 1995 chars, got ${snippets.bookmarkletHref.length}`);
});

test('server.ts port 8088 hex framing formats and decodes cleanly in bridge parser', () => {
  const binaryPacket = new Uint8Array([
    0x50, // Header 'P'
    0x01, // Xbox / Guide pressed
    0x03, // A + B pressed
    0x00,
    0x7f, // Axis 0 max (1.0)
    0x81, // Axis 1 min (-1.0)
    0x00,
    0x00,
    0xff, // LT max analog
    0x80, // RT half analog
    0xe8, // Seq low
    0x03, // Seq high (1000)
  ]);

  // server.ts converts bytes to hex string for port 8088 WebSocket clients:
  const hexFrame = Buffer.from(binaryPacket).toString('hex');
  assert.equal(hexFrame.length, 24);
  assert.equal(hexFrame.slice(0, 2), '50');

  // Bridge parses 24-character hex frame
  const parsed = parseBridgeHexFrame(hexFrame);
  assert.ok(parsed, 'Hex frame must parse successfully');
  assert.equal(parsed.buttons[0], 1, 'Button A pressed');
  assert.equal(parsed.buttons[1], 1, 'Button B pressed');
  assert.equal(parsed.buttons[16], 1, 'Xbox Guide pressed');
  assert.equal(parsed.buttons[6], 1, 'LT max');
  assert.equal(parsed.sequence, 1000);
});

test('parseBridgeHexFrame handles invalid, empty, or truncated frames without crashing', () => {
  assert.equal(parseBridgeHexFrame(''), null);
  assert.equal(parseBridgeHexFrame('50'), null);
  assert.equal(parseBridgeHexFrame('5000000000000000000000'), null); // 22 chars
  assert.equal(parseBridgeHexFrame('400000000000000000000000'), null); // Wrong header byte
  assert.equal(parseBridgeHexFrame('50zzzzzzzzzzzzzzzzzzzzzz'), null); // Non-hex chars
});

test('entire src/ codebase complies with strict 0 pictorial emojis and dingbats rule', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  const violations: Array<{ file: string; line: number; text: string }> = [];

  function scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry !== 'node_modules' && entry !== '.git' && entry !== 'dist') {
          scanDirectory(fullPath);
        }
      } else if (/\.(tsx?|jsx?|html)$/.test(entry)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        content.split('\n').forEach((line, idx) => {
          if (emojiRegex.test(line)) {
            violations.push({ file: fullPath, line: idx + 1, text: line.trim() });
          }
        });
      }
    }
  }

  scanDirectory(path.resolve('./src'));
  assert.equal(
    violations.length,
    0,
    `Found ${violations.length} emoji/dingbat violations:\n` +
      violations.map((v) => `  ${v.file}:${v.line} -> ${v.text}`).join('\n')
  );
});

test('bookmarklet interval short-circuits K and fc when connected (c > 0) to prevent port leaks and event storms', () => {
  const snippets = generateCloudGamingBridgeSnippets('7778889990', 'https://play.xbox.com');
  // Confirm the interval contains the c || short-circuit with safe W.opener reference
  assert.ok(
    snippets.bookmarkletHref.includes('c||(fc(),[W.opener,w].map(K))') ||
      snippets.bookmarkletHref.includes('c||(fc(),[opener,w].map(K))') ||
      snippets.bookmarkletHref.includes('c||(fc(),[W.opener,w].map(K))'.replace(/ /g, '%20')),
    'Interval must short-circuit and not recreate MessageChannels or dispatch 60Hz events once packets arrive'
  );
  // Confirm first packet fires fc() once
  assert.ok(
    snippets.bookmarkletHref.includes('c===1&&fc()'),
    'Bridge must only fire initial gamepadconnected event once on first packet, not on every 60Hz frame'
  );
});

test('bookmarklet executes safely in strict sandbox and injects 12-byte hex packets directly into navigator.getGamepads()', () => {
  const snippets = generateCloudGamingBridgeSnippets('8492310756', 'https://vikrampratap-wiki.github.io/Pulsepad');

  // Verify length constraints on GitHub Pages domain
  assert.ok(
    snippets.bookmarkletHref.length < 1995,
    `Bookmarklet on GitHub Pages must be < 1995 chars, got ${snippets.bookmarkletHref.length}`
  );

  const listeners: Record<string, Array<(e: any) => void>> = {};
  let hudElement: any = null;
  let dispatchedEvents: any[] = [];

  const mockWindow: any = {
    opener: null,
    addEventListener: (type: string, fn: any) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: () => {},
    dispatchEvent: (ev: any) => {
      dispatchedEvents.push(ev);
      return true;
    },
    open: () => ({ postMessage: () => {} }),
    performance: { now: () => 12345.67 },
    Gamepad: function () {},
    GamepadButton: function () {},
    GamepadEvent: function (this: any, type: string) {
      this.type = type;
    },
  };

  const mockNavigator: any = {};
  const mockDocument: any = {
    body: {
      appendChild: (el: any) => el,
    },
    createElement: () => {
      hudElement = {
        style: {},
        textContent: '',
        onclick: null,
      };
      return hudElement;
    },
  };

  const mockSetInterval = () => 1;
  const mockSetTimeout = () => 2;
  const mockWebSocket = function () {
    return { onmessage: null, close: () => {} };
  };
  const mockBroadcastChannel = function () {
    return { onmessage: null, close: () => {} };
  };

  const jsCode = snippets.tabletAddressBarCode.replace(/^javascript:/, '');
  // Evaluate in strict function sandbox
  const runner = new Function(
    'window',
    'navigator',
    'document',
    'performance',
    'Event',
    'setInterval',
    'setTimeout',
    'WebSocket',
    'BroadcastChannel',
    `"use strict"; ${jsCode}`
  );
  runner(
    mockWindow,
    mockNavigator,
    mockDocument,
    mockWindow.performance,
    mockWindow.GamepadEvent,
    mockSetInterval,
    mockSetTimeout,
    mockWebSocket,
    mockBroadcastChannel
  );

  // Initial state check
  assert.equal(hudElement.textContent, 'Tap:Link 8492310756');
  assert.equal(typeof mockNavigator.getGamepads, 'function');
  const initialPads = mockNavigator.getGamepads();
  assert.ok(initialPads[0]);
  assert.equal(initialPads[0].id, 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)');

  // Simulate incoming 12-byte hex packet via window message:
  // 50 (P) 01 (Guide) 03 00 (A+B) 7f 81 40 c0 (Axes) ff 80 (LT+RT) 00 00 (Seq)
  const incomingPacketHex = '500103007f8140c0ff800000';
  assert.ok(listeners['message'], 'Must have registered a message event listener on window');
  listeners['message'].forEach((handler) => {
    handler({ data: { __pulsepad_hex: incomingPacketHex } });
  });

  // Confirm HUD updated live
  assert.equal(hudElement.textContent, 'Xbox LIVE #1');

  // Confirm Gamepad values in navigator.getGamepads() updated immediately
  const livePads = mockNavigator.getGamepads();
  assert.ok(livePads[0]);
  assert.equal(livePads[0].buttons[0].pressed, true, 'Button A pressed');
  assert.equal(livePads[0].buttons[1].pressed, true, 'Button B (Continue) pressed');
  assert.equal(livePads[0].buttons[16].pressed, true, 'Xbox Guide pressed');
  assert.equal(livePads[0].buttons[6].value, 1, 'LT max value 1');
  assert.ok(Math.abs(livePads[0].buttons[7].value - 0.5) <= 0.02, 'RT half value ~0.5');
  assert.equal(livePads[0].axes[0], 1, 'Axis 0 max');
  assert.equal(livePads[0].axes[1], -1, 'Axis 1 min');
});



