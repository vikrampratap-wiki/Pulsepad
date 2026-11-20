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
              TABLET XBOX CLOUD GAMING (xbox.com/play) COMPACT BRIDGE v7 · ID: {formattedRoom} ({bridgeSnippets.bookmarkletHref.length} chars)
            </span>
          </div>
          <h3 className="text-sm sm:text-base font-display font-bold text-white">
            बुकमार्क में कोड अधूरा कटने (Truncate होने) की समस्या अब v7 Compact कोड से 100% हल!
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            <strong className="text-amber-300">पहले कोड आधा क्यों कट गया था?</strong> टैबलेट के बुकमार्क URL बॉक्स में ~4,000 अक्षरों की सीमा होती है और पुराना कोड 4,850 अक्षरों का होने के कारण <code>KeyboardEvent</code> पर कट रहा था। नया{' '}
            <strong className="text-emerald-400">v7 Ultra-Compact Code केवल {bridgeSnippets.bookmarkletHref.length} अक्षरों</strong> का है और इसके अंत में <code>&#125;)();</code> पूरा आता है!
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
                <span>v7 Compact Code Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Step 1: Copy v7 Compact Code ({bridgeSnippets.bookmarkletHref.length} chars)</span>
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
                ? '[LINKED] xbox.com/play Linked (Keep Tab Open)'
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

      {/* Direct Full Bookmarklet Code Box so user can inspect and verify it ends with })(); */}
      <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-mono text-emerald-400 font-semibold">
            पूरा v7 बुकमार्क कोड (अंत में <code className="text-amber-300">&#125;)();</code> अवश्य जांचें — कुल {bridgeSnippets.bookmarkletHref.length} अक्षर):
          </span>
          <button
            type="button"
            onClick={() => handleCopy('bm-box', bridgeSnippets.bookmarkletHref)}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold hover:bg-emerald-500/30 transition-colors"
          >
            {copiedId === 'bm-box' ? 'कॉपी हो गया!' : 'पूरा कोड कॉपी करें'}
          </button>
        </div>
        <textarea
          readOnly
          rows={2}
          value={bridgeSnippets.bookmarkletHref}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300 select-all focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Step-by-Step Tablet Instructions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/40 flex flex-col gap-1.5">
          <span className="font-bold text-amber-400">
            कदम 1: बुकमार्क में पुराना अधूरा कोड हटाकर नया v7 पेस्ट करें
          </span>
          <p className="text-slate-300 leading-relaxed">
            अपने टैबलेट के <code className="text-emerald-300 font-bold">xboxpad</code> बुकमार्क को Edit करें, पुराने अधूरे कोड को <strong className="text-white">Select All करके पूरी तरह मिटा दें</strong>, और यह नया छोटा v7 कोड पेस्ट करें (जिसके अंत में <code className="text-amber-300">&#125;)();</code> है)।
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 flex flex-col gap-1.5">
          <span className="font-bold text-emerald-400 flex items-center gap-1">
            <Tv className="w-3.5 h-3.5" />
            <span>कदम 2: इसी पेज से xbox.com/play खोलें</span>
          </span>
          <p className="text-slate-300 leading-relaxed">
            टैबलेट पर इस PulsePad टैब को <strong className="text-white">बंद मत करें</strong>! ऊपर हरे बटन <strong className="text-emerald-300">Step 2: यहाँ से xbox.com/play खोलें ↗</strong> पर टैप करें—इससे दोनों टैब आपस में सीधे जुड़ जाएंगे।
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-sky-500/40 flex flex-col gap-1.5">
          <span className="font-bold text-sky-400">
            कदम 3: URL पट्टी में xboxpad चलाएं
          </span>
          <p className="text-slate-300 leading-relaxed">
            अब <strong className="text-white">xbox.com/play</strong> वाले टैब की ऊपरी URL पट्टी में <code className="text-emerald-300 font-bold">xboxpad</code> लिखकर नीचे आने वाले सुझाव पर टैप करें। कोने में <code className="text-emerald-300">[PAD] Xbox Pad LIVE (Pkt #...)</code> दिखते ही सभी बटन तुरंत काम करेंगे!
          </p>
        </div>
      </div>
    </div>
  );
};
