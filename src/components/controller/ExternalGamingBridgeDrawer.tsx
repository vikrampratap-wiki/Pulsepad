import React, { useState, useRef } from 'react';
import { generateCloudGamingBridgeSnippets } from '../../protocol/w3cGamepadBridge';
import { formatRoomIdDisplay, resolveAppBaseUrl } from '../../protocol/gamepadProtocol';
import { registerExternalTargetWindow } from '../../hooks/usePulsePadTransport';
import { Download, Copy, Check, ExternalLink, Radio, ShieldCheck, Tv } from 'lucide-react';

interface ExternalGamingBridgeDrawerProps {
  roomCode: string;
  appOrigin: string;
}

export const ExternalGamingBridgeDrawer: React.FC<ExternalGamingBridgeDrawerProps> = ({
  roomCode,
  appOrigin,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [popupLaunched, setPopupLaunched] = useState<boolean>(false);
  const [xboxLaunched, setXboxLaunched] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const bridgeSnippets = generateCloudGamingBridgeSnippets(roomCode, appOrigin);
  const formattedRoom = formatRoomIdDisplay(roomCode);

  // Starts a near-silent Web Audio oscillator so Tablet Chrome/Safari NEVER freezes this tab in the background
  // while the user is playing on the xbox.com/play tab!
  const startTabletKeepAwakeAudio = () => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001; // Imperceptible, prevents background tab throttling on Android/iPad
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioCtxRef.current = ctx;
      } else if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch {
      // Ignore if unsupported
    }
  };

  const handleCopy = (id: string, text: string) => {
    startTabletKeepAwakeAudio();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2200);
  };

  const handleLaunchXboxCloudLinked = () => {
    startTabletKeepAwakeAudio();
    if (typeof window === 'undefined') return;
    try {
      const win = window.open('https://www.xbox.com/play', 'pulsepad_xbox_target');
      registerExternalTargetWindow(win);
      setXboxLaunched(true);
    } catch {
      // Ignore
    }
  };

  const handleDownloadUserscript = () => {
    startTabletKeepAwakeAudio();
    const blob = new Blob([bridgeSnippets.userscriptContent], {
      type: 'application/javascript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulsepad-xbox-bridge-${roomCode.toLowerCase()}.user.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenRelayPopup = () => {
    startTabletKeepAwakeAudio();
    if (typeof window === 'undefined') return;
    const baseUrl = resolveAppBaseUrl();
    const relayUrl = `${baseUrl}/?bridge=1&room=${encodeURIComponent(roomCode)}`;
    try {
      const win = window.open(relayUrl, 'pulsepad_bridge', 'width=420,height=320');
      registerExternalTargetWindow(win);
      setPopupLaunched(true);
    } catch {
      // Ignore if blocked
    }
  };

  return (
    <div
      data-testid="external-gaming-bridge-drawer"
      className="p-3.5 sm:p-5 rounded-2xl bg-slate-950 border border-emerald-500/50 flex flex-col gap-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              TABLET XBOX CLOUD GAMING (xbox.com/play) DIRECT BRIDGE v6 · ID: {formattedRoom}
            </span>
          </div>
          <h3 className="text-sm sm:text-base font-display font-bold text-white">
            टैबलेट पर Xbox का "Controller not connected" निशान हटाने और बटन चलाने का v6 समाधान:
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            <strong className="text-amber-300">पहले बटन क्यों नहीं चले?</strong> Chrome ब्राउज़र में कृत्रिम{' '}
            <code>new GamepadEvent</code> पर WebIDL त्रुटि आ रही थी और Xbox का फ़ायरवॉल बाहरी सिग्नल रोक रहा था। नए{' '}
            <strong className="text-emerald-400">v6 Tablet Bridge</strong> में हमने इसे पूरी तरह ठीक कर दिया है—नीचे से नया कोड कॉपी करके अपने बुकमार्क को एक बार अपडेट कर लें!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="copy-xbox-bookmarklet-btn"
            onClick={() => handleCopy('bm', bridgeSnippets.bookmarkletHref)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedId === 'bm' ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>v6 Xbox Code Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Step 1: Copy NEW v6 Xbox Code</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleLaunchXboxCloudLinked}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>
              {xboxLaunched
                ? '✓ xbox.com/play Linked (Keep Tab Open)'
                : 'Step 2: यहाँ से xbox.com/play खोलें ↗'}
            </span>
          </button>

          <button
            type="button"
            data-testid="download-xbox-userscript-btn"
            onClick={handleDownloadUserscript}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-emerald-400 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auto-Userscript (.user.js)</span>
          </button>

          <button
            type="button"
            onClick={handleOpenRelayPopup}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-400/50 hover:bg-sky-500/30 text-sky-300 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{popupLaunched ? 'Relay Active' : 'Open Relay Window'}</span>
          </button>
        </div>
      </div>

      {/* Step-by-Step Tablet Instructions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/40 flex flex-col gap-1.5">
          <span className="font-bold text-amber-400">
            कदम 1: अपना बुकमार्क नए v6 कोड से अपडेट करें
          </span>
          <p className="text-slate-300 leading-relaxed">
            ऊपर <strong className="text-amber-300">Step 1: Copy NEW v6 Xbox Code</strong> दबाएं और अपने टैबलेट के <code className="text-emerald-300 font-bold">xboxpad</code> बुकमार्क को Edit करके उसमें यह नया v6 कोड पेस्ट कर दें (पुराने कोड में Chrome का इवेंट ब्लॉक हो रहा था, जो अब ठीक हो चुका है)।
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 flex flex-col gap-1.5">
          <span className="font-bold text-emerald-400 flex items-center gap-1">
            <Tv className="w-3.5 h-3.5" />
            <span>कदम 2: इसी पेज से xbox.com/play खोलें</span>
          </span>
          <p className="text-slate-300 leading-relaxed">
            टैबलेट पर इस PulsePad टैब को <strong className="text-white">बंद मत करें</strong>! ऊपर हरे बटन <strong className="text-emerald-300">Step 2: यहाँ से xbox.com/play खोलें ↗</strong> पर टैप करें—इससे दोनों टैब आपस में जुड़ जाएंगे और Xbox का फ़ायरवॉल आपके फ़ोन के बटनों को नहीं रोक पाएगा।
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-sky-500/40 flex flex-col gap-1.5">
          <span className="font-bold text-sky-400">
            कदम 3: URL पट्टी में xboxpad चलाएं
          </span>
          <p className="text-slate-300 leading-relaxed">
            अब <strong className="text-white">xbox.com/play</strong> वाले टैब की ऊपरी URL पट्टी में <code className="text-emerald-300 font-bold">xboxpad</code> लिखकर नीचे आने वाले ★ सुझाव पर टैप करें। कोने में <code className="text-emerald-300">🎮 Xbox Pad LIVE (Pkt #...)</code> दिखते ही Xbox का कंट्रोलर निशान तुरंत चालू हो जाएगा!
          </p>
        </div>
      </div>
    </div>
  );
};
