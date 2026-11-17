import React, { useState } from 'react';
import {
  BUTTON_METADATA,
  StickCalibrationConfig,
  StickCurveType,
  VirtualGamepadState,
  simulateTransportLatency,
} from '../protocol/gamepadProtocol';
import { Cpu, Network, Sliders } from 'lucide-react';

interface EngineeringLatencyLabProps {
  gamepadState: VirtualGamepadState;
  lastHexPacket: string[];
  calibration: StickCalibrationConfig;
  onCalibrationChange: React.Dispatch<React.SetStateAction<StickCalibrationConfig>>;
  onButtonToggle: (buttonIndex: number, nextVal: number) => void;
}

export const EngineeringLatencyLab: React.FC<EngineeringLatencyLabProps> = ({
  gamepadState,
  lastHexPacket,
  calibration,
  onCalibrationChange,
  onButtonToggle,
}) => {
  const [simWifiRtt, setSimWifiRtt] = useState<number>(12);
  const [simPacketLoss, setSimPacketLoss] = useState<number>(2);
  const [simPollingHz, setSimPollingHz] = useState<number>(120);

  const metrics = simulateTransportLatency({
    baseWifiRttMs: simWifiRtt,
    packetLossPercent: simPacketLoss,
    pollingRateHz: simPollingHz,
  });

  // Compute 16-bit button bitmask for interactive bit toggle laboratory
  let buttonBitmask = 0;
  for (let i = 0; i < 16; i++) {
    if ((gamepadState.buttons[i] ?? 0) > 0.15) {
      buttonBitmask |= 1 << i;
    }
  }

  const jsonEquivalent = JSON.stringify({
    type: 'gamepad:state',
    skin: gamepadState.skin,
    sequence: gamepadState.sequence,
    axes: gamepadState.axes,
    buttons: gamepadState.buttons.slice(0, 8),
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Intro Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-2">
        <div className="text-xs text-slate-400">
          Interactive Engineering & Architecture Co-Lab · नई तकनीक सीखें और प्रयोग करें
        </div>
        <h2 className="text-xl font-display font-bold text-white">
          10–15ms लो-लेटेंसी आर्किटेक्चर कैसे काम करता है? (Hands-On Protocol Lab)
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
          एक साधारण वेबसाइट पर JSON भेजने में 60–120ms का समय लग जाता है। यहाँ आप खुद प्रयोग करके देख सकते हैं कि कैसे{' '}
          <strong className="text-emerald-400">12-Byte Binary Bitmasking</strong>,{' '}
          <strong className="text-amber-400">WebRTC Unordered UDP DataChannel</strong>, और{' '}
          <strong className="text-sky-400">Thumbstick Response Curves</strong> मिलकर आपके फ़ोन को एक असली कंसोल कंट्रोलर जैसा 10–15ms रिस्पॉन्स देते हैं।
        </p>
      </div>

      {/* Lab Module 1: 12-Byte Binary Bitmask Dissector vs JSON */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-display font-bold text-white">
              01. 12-Byte Binary Packet & Interactive Bitmask Studio
            </h3>
          </div>
          <div className="text-xs font-mono tabular-nums text-emerald-400">
            12 Bytes Binary vs {jsonEquivalent.length + 95} Bytes JSON ({metrics.savingPercent}% Smaller)
          </div>
        </div>

        <p className="text-xs text-slate-300">
          नीचे दिए गए 16-बिट बटन रजिस्टर (Bits 0–15) पर क्लिक करके किसी भी बिट को <code className="text-amber-300">1</code> या <code className="text-slate-400">0</code> करें और देखें कि कैसे 16 बटनों की स्थिति सिर्फ 2 बाइट्स (<code className="text-emerald-300">Uint16LE</code>) में पैक हो जाती है:
        </p>

        {/* Interactive 16-Bit Register Buttons */}
        <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-16 gap-1.5">
          {BUTTON_METADATA.slice(0, 16).map((b) => {
            const bitOn = (buttonBitmask & (1 << b.index)) !== 0;
            return (
              <button
                key={b.index}
                type="button"
                onClick={() => onButtonToggle(b.index, bitOn ? 0 : 1)}
                className={`min-h-[54px] p-1.5 rounded-lg border font-mono flex flex-col items-center justify-between transition-colors ${
                  bitOn
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'
                }`}
              >
                <span className="text-[10px]">Bit {b.index}</span>
                <span className="text-sm tabular-nums">{bitOn ? '1' : '0'}</span>
                <span className="text-[10px] truncate max-w-full">{b.shortCode}</span>
              </button>
            );
          })}
        </div>

        {/* 12-Byte Anatomy Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 pt-1 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-amber-400">Byte [0..1] Header</div>
            <div className="text-sm font-bold text-white mt-1">
              0x{lastHexPacket[0]} 0x{lastHexPacket[1]}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Magic &apos;P&apos; + Skin Flags</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-emerald-400">Byte [2..3] Bitmask</div>
            <div className="text-sm font-bold text-white mt-1">
              0x{lastHexPacket[2]} 0x{lastHexPacket[3]}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">16 Buttons in 16 Bits</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-sky-400">Byte [4..5] L-Stick</div>
            <div className="text-sm font-bold text-white mt-1">
              0x{lastHexPacket[4]} 0x{lastHexPacket[5]}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Int8 LX, LY (-127..127)</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-sky-400">Byte [6..7] R-Stick</div>
            <div className="text-sm font-bold text-white mt-1">
              0x{lastHexPacket[6]} 0x{lastHexPacket[7]}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Int8 RX, RY (-127..127)</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-amber-400">Byte [8..9] Triggers</div>
            <div className="text-sm font-bold text-white mt-1">
              0x{lastHexPacket[8]} 0x{lastHexPacket[9]}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Uint8 LT, RT (0..255)</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[11px] text-slate-300">Byte [10..11] Seq</div>
            <div className="text-sm font-bold text-white mt-1">
              0x{lastHexPacket[10]} 0x{lastHexPacket[11]}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Frame #{gamepadState.sequence}</div>
          </div>
        </div>
      </div>

      {/* Lab Module 2 & 3 Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Module 2: WebRTC UDP vs TCP Head-of-Line Blocking Simulator */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-amber-400" />
              <h3 className="text-base font-display font-bold text-white">
                02. WebRTC UDP vs TCP Head-of-Line Blocking Simulator
              </h3>
            </div>
            <p className="text-xs text-slate-300">
              वाई-फाई पैकेट लॉस और पोलिंग रेट बदलकर देखें कि क्यों गेमिंग रिमोट में{' '}
              <code className="text-emerald-300">ordered: false, maxRetransmits: 0</code> जरूरी है:
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <label htmlFor="wifi-rtt-slider" className="text-slate-300">
                  Local Wi-Fi Ping (Base RTT)
                </label>
                <span className="font-mono tabular-nums text-amber-400">{simWifiRtt} ms</span>
              </div>
              <input
                id="wifi-rtt-slider"
                type="range"
                min={4}
                max={30}
                step={1}
                value={simWifiRtt}
                onChange={(e) => setSimWifiRtt(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <label htmlFor="packet-loss-slider" className="text-slate-300">
                  Simulated Wi-Fi Packet Loss
                </label>
                <span className="font-mono tabular-nums text-rose-400">{simPacketLoss}%</span>
              </div>
              <input
                id="packet-loss-slider"
                type="range"
                min={0}
                max={15}
                step={1}
                value={simPacketLoss}
                onChange={(e) => setSimPacketLoss(Number(e.target.value))}
                className="w-full accent-rose-500"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-slate-300">Controller Polling Rate:</span>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800">
                {[60, 120, 240].map((hz) => (
                  <button
                    key={hz}
                    type="button"
                    onClick={() => setSimPollingHz(hz)}
                    className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      simPollingHz === hz
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {hz} Hz
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/40">
              <div className="text-xs font-semibold text-emerald-400">
                PulsePad Binary UDP/WebRTC
              </div>
              <div className="text-2xl font-mono font-bold tabular-nums text-white mt-1">
                {metrics.udpLatencyP50Ms} ms{' '}
                <span className="text-xs font-normal text-slate-400">P50</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-emerald-300 mt-0.5">
                P99 Peak: {metrics.udpLatencyP99Ms} ms ({metrics.bandwidthKbpsBinary} kbps)
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/40">
              <div className="text-xs font-semibold text-rose-400">Standard JSON over TCP</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-white mt-1">
                {metrics.tcpLatencyP50Ms} ms{' '}
                <span className="text-xs font-normal text-slate-400">P50</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-rose-300 mt-0.5">
                P99 Spike: {metrics.tcpLatencyP99Ms} ms ({metrics.bandwidthKbpsJson} kbps)
              </div>
            </div>
          </div>
        </div>

        {/* Module 3: Thumbstick Deadzone & Response Curve Calibration Studio */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <h3 className="text-base font-display font-bold text-white">
                03. Analog Stick Response Curve & Deadzone Studio
              </h3>
            </div>
            <p className="text-xs text-slate-300">
              शूटर गेम्स (Halo, Call of Duty) में सटीक निशाना लगाने के लिए{' '}
              <strong className="text-sky-300">Precision Curve</strong> और रेसिंग/एक्शन के लिए{' '}
              <strong className="text-amber-300">Aggressive Curve</strong> चुनें:
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
            {(
              [
                { id: 'linear', label: 'Linear (1:1)' },
                { id: 'precision', label: 'Precision Aim (x^1.75)' },
                { id: 'aggressive', label: 'Fast Snap (x^0.72)' },
              ] as { id: StickCurveType; label: string }[]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  onCalibrationChange((prev) => ({
                    ...prev,
                    curve: item.id,
                  }))
                }
                className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  calibration.curve === item.id
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <label htmlFor="deadzone-slider" className="text-slate-300">
                Radial Stick Deadzone (Drift Filter)
              </label>
              <span className="font-mono tabular-nums text-sky-400">
                {Math.round(calibration.deadzone * 100)}%
              </span>
            </div>
            <input
              id="deadzone-slider"
              type="range"
              min={0}
              max={0.28}
              step={0.02}
              value={calibration.deadzone}
              onChange={(e) =>
                onCalibrationChange((prev) => ({
                  ...prev,
                  deadzone: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-sky-400"
            />
          </div>

          {/* Live SVG Response Curve Plot */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
            <svg viewBox="0 0 160 90" className="w-40 h-24 shrink-0">
              <rect x="0" y="0" width="160" height="90" rx="6" fill="#090D16" />
              <line x1="16" y1="76" x2="148" y2="76" stroke="#334155" strokeWidth="1" />
              <line x1="16" y1="12" x2="16" y2="76" stroke="#334155" strokeWidth="1" />
              {/* Deadzone cutoff marker */}
              <line
                x1={16 + calibration.deadzone * 132}
                y1="12"
                x2={16 + calibration.deadzone * 132}
                y2="76"
                stroke="#F59E0B"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              {/* Curve Path */}
              <polyline
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.5"
                points={Array.from({ length: 25 }, (_, idx) => {
                  const t = idx / 24;
                  const dz = calibration.deadzone;
                  let yVal = 0;
                  if (t > dz) {
                    const norm = (t - dz) / (1 - dz);
                    yVal =
                      calibration.curve === 'precision'
                        ? Math.pow(norm, 1.75)
                        : calibration.curve === 'aggressive'
                          ? Math.pow(norm, 0.72)
                          : norm;
                  }
                  const px = 16 + t * 132;
                  const py = 76 - yVal * 62;
                  return `${px.toFixed(1)},${py.toFixed(1)}`;
                }).join(' ')}
              />
            </svg>

            <div className="flex flex-col gap-1 text-xs">
              <div className="font-mono text-slate-300">
                Active L-Stick:{' '}
                <span className="text-sky-400 font-bold tabular-nums">
                  ({gamepadState.axes[0].toFixed(2)}, {gamepadState.axes[1].toFixed(2)})
                </span>
              </div>
              <div className="font-mono text-slate-300">
                Active R-Stick:{' '}
                <span className="text-emerald-400 font-bold tabular-nums">
                  ({gamepadState.axes[2].toFixed(2)}, {gamepadState.axes[3].toFixed(2)})
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                पीली रेखा (Deadzone) के भीतर हल्का अंगूठा हिलने पर अनचाहा ड्रिफ्ट नहीं होगा।
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
