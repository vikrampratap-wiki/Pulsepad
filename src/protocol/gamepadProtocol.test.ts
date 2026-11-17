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
  buildControllerPairUrl,
} from './gamepadProtocol';
import { generateCloudGamingBridgeSnippets } from './w3cGamepadBridge';
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
  const snippets = generateCloudGamingBridgeSnippets('ROOM77', 'https://pulsepad.example.com');
  assert.ok(snippets.scriptUrl.includes('room=ROOM77'));
  assert.ok(snippets.bookmarkletHref.startsWith('javascript:'));
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
    buildControllerPairUrl('pulse1', 'https://vikrampratap-wiki.github.io', '/Pulsepad/'),
    'https://vikrampratap-wiki.github.io/Pulsepad/?mode=controller&room=PULSE1'
  );
  assert.equal(
    buildControllerPairUrl('PULSE1', 'http://localhost:3000', '/'),
    'http://localhost:3000/?mode=controller&room=PULSE1'
  );
});

