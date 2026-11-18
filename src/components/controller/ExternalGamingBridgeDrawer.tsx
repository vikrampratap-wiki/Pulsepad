import React, { useState } from 'react';
import { generateCloudGamingBridgeSnippets } from '../../protocol/w3cGamepadBridge';
import { formatRoomIdDisplay, resolveAppBaseUrl } from '../../protocol/gamepadProtocol';
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
  const bridgeSnippets = generateCloudGamingBridgeSnippets(roomCode, appOrigin);
  const formattedRoom = formatRoomIdDisplay(roomCode);

  const handleCopy = (id: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2200);
  };

  const handleDownloadUserscript = () => {
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
    if (typeof window === 'undefined') return;
    const baseUrl = resolveAppBaseUrl();
    const relayUrl = `${baseUrl}/?bridge=1&room=${encodeURIComponent(roomCode)}`;
    try {
      window.open(relayUrl, 'pulsepad_bridge', 'width=420,height=320');
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
              TABLET XBOX CLOUD GAMING (xbox.com/play) DIRECT BRIDGE v5 · ID: {formattedRoom}
            </span>
          </div>
          <h3 className="text-sm sm:text-base font-display font-bold text-white">
            टैबलेट (Tablet) पर Xbox Cloud Gaming (xbox.com/play) से सीधे जोड़ने के निर्देश:
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            टैबलेट के Chrome/Safari ब्राउज़र में सामान्य बुकमार्क मेनू (⋮ → Bookmarks) से बुकमार्कलेट काम नहीं करता।{' '}
            <strong className="text-emerald-400">टैबलेट पर इसे चलाने के लिए नीचे दिए गए 3 आसान कदम अपनाएं</strong>—यह बिना टैब बदले सीधे{' '}
            <code className="text-amber-300">xbox.com/play</code> के अंदर आपका कंट्रोलर चालू कर देगा!
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
                <span>Tablet Xbox Code Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Step 1: Copy Tablet Xbox Code</span>
              </>
            )}
          </button>

          <a
            href="https://www.xbox.com/play"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Step 2: xbox.com/play खोलें ↗</span>
          </a>

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
            कदम 1: टैबलेट पर बुकमार्क सेव करें (सिर्फ़ एक बार)
          </span>
          <p className="text-slate-300 leading-relaxed">
            ऊपर <strong className="text-amber-300">Step 1: Copy Tablet Xbox Code</strong> बटन दबाएं। अब अपने टैबलेट ब्राउज़र में इस पेज को बुकमार्क (★) करें, बुकमार्क को <strong className="text-white">Edit</strong> करें, उसका नाम छोटा रखें जैसे <code className="text-emerald-300 font-bold">xboxpad</code> और उसके URL में कॉपी किया हुआ पूरा कोड पेस्ट करके सेव कर दें।
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 flex flex-col gap-1.5">
          <span className="font-bold text-emerald-400 flex items-center gap-1">
            <Tv className="w-3.5 h-3.5" />
            <span>कदम 2 (सबसे ज़रूरी): टैबलेट की URL पट्टी से चलाएं</span>
          </span>
          <p className="text-slate-300 leading-relaxed">
            अब टैबलेट पर <strong className="text-white">xbox.com/play</strong> खोलें। <strong className="text-rose-300">बुकमार्क मेनू में मत जाएं!</strong> इसके बजाय ऊपर <strong className="text-white">Address Bar (जहां xbox.com लिखा है)</strong> पर टैप करें, वहां <code className="text-emerald-300 font-bold">xboxpad</code> टाइप करें और नीचे दिखने वाले ★ बुकमार्क सुझाव पर टैप करें!
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-sky-500/40 flex flex-col gap-1.5">
          <span className="font-bold text-sky-400">
            कदम 3: तुरंत कनेक्ट! (या Kiwi/Edge एक्सटेंशन तरीका)
          </span>
          <p className="text-slate-300 leading-relaxed">
            टैप करते ही Xbox स्क्रीन के कोने में <code className="text-emerald-300">Xbox Controller Connected · ID {formattedRoom}</code> दिख जाएगा और Xbox का "Connect a controller" बॉक्स अपने-आप हट जाएगा! (यदि आप टैबलेट पर <strong className="text-white">Microsoft Edge / Kiwi Browser</strong> चलाते हैं, तो Tampermonkey में <code className="text-amber-300">.user.js</code> डालकर यह 100% ऑटोमैटिक हो जाता है)।
          </p>
        </div>
      </div>
    </div>
  );
};
