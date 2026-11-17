/**
 * PulsePad Ultra-Low-Latency (10-15ms) Binary Gamepad Protocol & Input Math
 * Encodes full W3C Standard 17-button + 4-axis + analog trigger state into a 12-byte binary frame.
 */

export type ControllerSkin = 'xbox' | 'playstation' | 'pro_claw';
export type StickCurveType = 'linear' | 'precision' | 'aggressive';

export interface VirtualGamepadState {
  /** 17 standard W3C gamepad buttons (0..16). Values 0.0 to 1.0 (6=LT/L2, 7=RT/R2 analog). */
  buttons: number[];
  /** 4 standard W3C thumbstick axes: [LX, LY, RX, RY] in [-1.0, 1.0] */
  axes: [number, number, number, number];
  /** Optional gyroscope tilt steering values [-1.0, 1.0] */
  gyroTiltX: number;
  gyroTiltY: number;
  /** Monotonic 16-bit sequence number */
  sequence: number;
  /** Skin profile active on sender */
  skin: ControllerSkin;
}

export interface StickCalibrationConfig {
  deadzone: number; // 0.00 to 0.30
  curve: StickCurveType;
  gyroSensitivity: number; // 0.0 to 1.0
  gyroEnabled: boolean;
}

export interface TransportComparisonMetrics {
  udpLatencyP50Ms: number;
  udpLatencyP99Ms: number;
  tcpLatencyP50Ms: number;
  tcpLatencyP99Ms: number;
  headOfLineBlockingPenaltyMs: number;
  bandwidthKbpsBinary: number;
  bandwidthKbpsJson: number;
  savingPercent: number;
}

export const BUTTON_METADATA: Array<{
  index: number;
  w3cName: string;
  xboxLabel: string;
  psLabel: string;
  shortCode: string;
}> = [
  { index: 0, w3cName: 'Bottom Face (B0)', xboxLabel: 'A', psLabel: 'Cross (✕)', shortCode: 'A/✕' },
  { index: 1, w3cName: 'Right Face (B1)', xboxLabel: 'B', psLabel: 'Circle (○)', shortCode: 'B/○' },
  { index: 2, w3cName: 'Left Face (B2)', xboxLabel: 'X', psLabel: 'Square (□)', shortCode: 'X/□' },
  { index: 3, w3cName: 'Top Face (B3)', xboxLabel: 'Y', psLabel: 'Triangle (△)', shortCode: 'Y/△' },
  { index: 4, w3cName: 'Left Bumper (B4)', xboxLabel: 'LB', psLabel: 'L1', shortCode: 'LB/L1' },
  { index: 5, w3cName: 'Right Bumper (B5)', xboxLabel: 'RB', psLabel: 'R1', shortCode: 'RB/R1' },
  { index: 6, w3cName: 'Left Trigger (B6)', xboxLabel: 'LT', psLabel: 'L2', shortCode: 'LT/L2' },
  { index: 7, w3cName: 'Right Trigger (B7)', xboxLabel: 'RT', psLabel: 'R2', shortCode: 'RT/R2' },
  { index: 8, w3cName: 'Back / View (B8)', xboxLabel: 'View', psLabel: 'Create', shortCode: 'VIEW' },
  { index: 9, w3cName: 'Start / Menu (B9)', xboxLabel: 'Menu', psLabel: 'Options', shortCode: 'MENU' },
  { index: 10, w3cName: 'Left Stick Click (B10)', xboxLabel: 'LS', psLabel: 'L3', shortCode: 'L3' },
  { index: 11, w3cName: 'Right Stick Click (B11)', xboxLabel: 'RS', psLabel: 'R3', shortCode: 'R3' },
  { index: 12, w3cName: 'D-Pad Up (B12)', xboxLabel: 'Up', psLabel: 'Up', shortCode: 'D-UP' },
  { index: 13, w3cName: 'D-Pad Down (B13)', xboxLabel: 'Down', psLabel: 'Down', shortCode: 'D-DN' },
  { index: 14, w3cName: 'D-Pad Left (B14)', xboxLabel: 'Left', psLabel: 'Left', shortCode: 'D-LF' },
  { index: 15, w3cName: 'D-Pad Right (B15)', xboxLabel: 'Right', psLabel: 'Right', shortCode: 'D-RT' },
  { index: 16, w3cName: 'Center Guide (B16)', xboxLabel: 'Xbox', psLabel: 'PS', shortCode: 'HOME' },
];

export function createInitialGamepadState(skin: ControllerSkin = 'xbox'): VirtualGamepadState {
  return {
    buttons: new Array(17).fill(0),
    axes: [0, 0, 0, 0],
    gyroTiltX: 0,
    gyroTiltY: 0,
    sequence: 0,
    skin,
  };
}

export function clampAxis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

export function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Applies radial deadzone, response curve, and optional gyro steering offset to a 2D thumbstick vector.
 */
export function applyStickResponseCurve(
  rawX: number,
  rawY: number,
  config: StickCalibrationConfig,
  gyroOffsetX = 0,
  gyroOffsetY = 0
): [number, number] {
  const dz = Math.max(0, Math.min(0.45, config.deadzone));
  const magnitude = Math.hypot(rawX, rawY);

  let outX = 0;
  let outY = 0;

  if (magnitude > dz) {
    const normalizedMag = Math.min(1, (magnitude - dz) / (1 - dz));
    let curvedMag = normalizedMag;

    if (config.curve === 'precision') {
      curvedMag = Math.pow(normalizedMag, 1.75);
    } else if (config.curve === 'aggressive') {
      curvedMag = Math.pow(normalizedMag, 0.72);
    }

    const scale = curvedMag / magnitude;
    outX = rawX * scale;
    outY = rawY * scale;
  }

  if (config.gyroEnabled && config.gyroSensitivity > 0) {
    outX += gyroOffsetX * config.gyroSensitivity;
    outY += gyroOffsetY * config.gyroSensitivity;
  }

  return [
    Math.round(clampAxis(outX) * 1000) / 1000,
    Math.round(clampAxis(outY) * 1000) / 1000,
  ];
}

/**
 * Encodes VirtualGamepadState into a compact 12-byte binary ArrayBuffer.
 * Layout:
 * [0]: 0x50 ('P' magic byte)
 * [1]: Flags (Bit 0: Button 16 Guide, Bits 1..2: Skin 0=xbox,1=ps,2=pro_claw)
 * [2..3]: Uint16LE bitmask for buttons 0..15 (pressed if > 0.15)
 * [4]: Int8 Left Stick X (-127..127)
 * [5]: Int8 Left Stick Y (-127..127)
 * [6]: Int8 Right Stick X (-127..127)
 * [7]: Int8 Right Stick Y (-127..127)
 * [8]: Uint8 Left Trigger analog (0..255)
 * [9]: Uint8 Right Trigger analog (0..255)
 * [10..11]: Uint16LE Sequence ID (0..65535)
 */
export function encodeGamepadPacket(state: VirtualGamepadState): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);

  view.setUint8(0, 0x50);

  const skinCode = state.skin === 'playstation' ? 1 : state.skin === 'pro_claw' ? 2 : 0;
  const guideBit = (state.buttons[16] ?? 0) > 0.5 ? 1 : 0;
  const flags = guideBit | ((skinCode & 0x03) << 1);
  view.setUint8(1, flags);

  let mask = 0;
  for (let i = 0; i < 16; i++) {
    if ((state.buttons[i] ?? 0) > 0.15) {
      mask |= 1 << i;
    }
  }
  view.setUint16(2, mask, true);

  view.setInt8(4, Math.round(clampAxis(state.axes[0]) * 127));
  view.setInt8(5, Math.round(clampAxis(state.axes[1]) * 127));
  view.setInt8(6, Math.round(clampAxis(state.axes[2]) * 127));
  view.setInt8(7, Math.round(clampAxis(state.axes[3]) * 127));

  view.setUint8(8, Math.round(clampUnit(state.buttons[6] ?? 0) * 255));
  view.setUint8(9, Math.round(clampUnit(state.buttons[7] ?? 0) * 255));

  view.setUint16(10, (state.sequence ?? 0) & 0xffff, true);

  return new Uint8Array(buf);
}

/**
 * Decodes a 12-byte Uint8Array binary packet back into VirtualGamepadState.
 */
export function decodeGamepadPacket(bytes: Uint8Array): VirtualGamepadState | null {
  if (!bytes || bytes.byteLength < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== 0x50) return null;

  const flags = view.getUint8(1);
  const guidePressed = (flags & 0x01) !== 0;
  const skinCode = (flags >> 1) & 0x03;
  const skin: ControllerSkin =
    skinCode === 1 ? 'playstation' : skinCode === 2 ? 'pro_claw' : 'xbox';

  const mask = view.getUint16(2, true);
  const buttons = new Array(17).fill(0);
  for (let i = 0; i < 16; i++) {
    buttons[i] = (mask & (1 << i)) !== 0 ? 1 : 0;
  }

  const lt = view.getUint8(8) / 255;
  const rt = view.getUint8(9) / 255;
  buttons[6] = Math.round(lt * 100) / 100;
  buttons[7] = Math.round(rt * 100) / 100;
  buttons[16] = guidePressed ? 1 : 0;

  const lx = Math.round((view.getInt8(4) / 127) * 100) / 100;
  const ly = Math.round((view.getInt8(5) / 127) * 100) / 100;
  const rx = Math.round((view.getInt8(6) / 127) * 100) / 100;
  const ry = Math.round((view.getInt8(7) / 127) * 100) / 100;

  const sequence = view.getUint16(10, true);

  return {
    buttons,
    axes: [clampAxis(lx), clampAxis(ly), clampAxis(rx), clampAxis(ry)],
    gyroTiltX: 0,
    gyroTiltY: 0,
    sequence,
    skin,
  };
}

/**
 * Formats a binary packet into an array of 2-character uppercase hex strings for the live inspector.
 */
export function formatPacketHex(bytes: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    out.push(bytes[i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return out;
}

/**
 * Computes deterministic latency & bandwidth metrics comparing 12-byte Binary UDP/WebRTC vs JSON TCP/WebSocket.
 */
export function simulateTransportLatency(params: {
  baseWifiRttMs: number;
  packetLossPercent: number;
  pollingRateHz: number;
}): TransportComparisonMetrics {
  const rtt = Math.max(2, params.baseWifiRttMs);
  const loss = Math.max(0, Math.min(25, params.packetLossPercent)) / 100;
  const hz = Math.max(30, params.pollingRateHz);
  const frameIntervalMs = 1000 / hz;

  // One-way controller-to-tablet latency is ~0.5 * RTT + half polling interval
  const udpLatencyP50Ms = Math.round((rtt * 0.5 + frameIntervalMs * 0.35) * 10) / 10;
  // On UDP/WebRTC unordered channel, a lost packet never blocks the next frame;
  // dead-reckoning holds the vector for 1 frame (frameIntervalMs)
  const udpLatencyP99Ms =
    Math.round((udpLatencyP50Ms + (loss > 0 ? frameIntervalMs * (0.6 + loss * 3) : 1.5)) * 10) / 10;

  // On TCP/ordered WebSocket, JSON parsing + Nagle/ACK overhead adds ~3.5ms at P50,
  // and any lost packet stalls the entire stream for 1-2 full RTTs (Head-of-Line blocking)
  const tcpLatencyP50Ms = Math.round((rtt * 0.65 + frameIntervalMs * 0.5 + 3.2) * 10) / 10;
  const holPenalty = loss > 0 ? Math.round((rtt * 2.4 * (1 + loss * 8) + 18 * loss * 10) * 10) / 10 : 4.2;
  const tcpLatencyP99Ms = Math.round((tcpLatencyP50Ms + holPenalty) * 10) / 10;

  const binaryBytesPerSec = 12 * hz;
  const jsonBytesPerSec = 258 * hz;

  const bandwidthKbpsBinary = Math.round(((binaryBytesPerSec * 8) / 1000) * 10) / 10;
  const bandwidthKbpsJson = Math.round(((jsonBytesPerSec * 8) / 1000) * 10) / 10;
  const savingPercent = Math.round((1 - 12 / 258) * 1000) / 10;

  return {
    udpLatencyP50Ms,
    udpLatencyP99Ms,
    tcpLatencyP50Ms,
    tcpLatencyP99Ms,
    headOfLineBlockingPenaltyMs: Math.round((tcpLatencyP99Ms - udpLatencyP99Ms) * 10) / 10,
    bandwidthKbpsBinary,
    bandwidthKbpsJson,
    savingPercent,
  };
}

export const CLOUD_RELAY_FALLBACK_ORIGIN =
  'https://ais-pre-swupckzn47pok277apvs2h-786374503805.asia-southeast1.run.app';

/**
 * Resolves the full application base URL including any repository subpath (e.g. `/Pulsepad` on GitHub Pages).
 */
export function resolveAppBaseUrl(origin?: string, pathname?: string): string {
  const rawOrigin =
    origin !== undefined
      ? origin
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';
  const rawPathname =
    pathname !== undefined
      ? pathname
      : typeof window !== 'undefined'
        ? window.location.pathname
        : '/';

  const cleanOrigin = rawOrigin.replace(/\/+$/, '');
  const cleanPath = rawPathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');

  if (!cleanPath || cleanPath === '/') {
    return cleanOrigin;
  }
  return `${cleanOrigin}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`;
}

/**
 * Builds the scannable QR code / phone pairing URL that preserves subpaths like `/Pulsepad/` on GitHub Pages.
 */
export function buildControllerPairUrl(
  roomCode: string,
  origin?: string,
  pathname?: string
): string {
  const baseUrl = resolveAppBaseUrl(origin, pathname);
  const safeRoom = (roomCode || 'PULSE1').trim().toUpperCase() || 'PULSE1';
  return `${baseUrl}/?mode=controller&room=${encodeURIComponent(safeRoom)}`;
}

/**
 * Resolves the WebSocket / API relay origin. On static hosts like `*.github.io` that cannot host `/ws` or `/api/bridge.js`,
 * uses the live Cloud Run backend origin so cross-device Phone-to-Tablet pairing and external site bridges still work.
 */
export function resolveRelayBackendOrigin(origin?: string): string {
  const rawOrigin =
    origin !== undefined
      ? origin
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';
  if (/\.github\.io$/i.test(rawOrigin.replace(/^https?:\/\//i, '').split('/')[0])) {
    return CLOUD_RELAY_FALLBACK_ORIGIN;
  }
  return rawOrigin.replace(/\/+$/, '');
}
