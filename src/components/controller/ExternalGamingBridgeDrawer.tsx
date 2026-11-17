import React, { useState } from 'react';
import { generateCloudGamingBridgeSnippets } from '../../protocol/w3cGamepadBridge';
import { Download, Copy, Check } from 'lucide-react';

interface ExternalGamingBridgeDrawerProps {
  roomCode: string;
  appOrigin: string;
}

export const ExternalGamingBridgeDrawer: React.FC<ExternalGamingBridgeDrawerProps> = ({
  roomCode,
  appOrigin,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bridgeSnippets = generateCloudGamingBridgeSnippets(roomCode, appOrigin);

  const handleCopy = (id: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleDownloadUserscript = () => {
    const blob = new Blob([bridgeSnippets.userscriptContent], {
      type: 'application/javascript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulsepad-bridge-${roomCode.toLowerCase()}.user.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-emerald-500/40 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1 max-w-2xl">
          <h3 className="text-base font-display font-bold text-white">
            यह वेबसाइट छोड़कर किसी भी अन्य गेमिंग वेबसाइट (Xbox Cloud, GeForce NOW, Poki, CrazyGames) पर कैसे खेलें?
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            ब्राउज़र सुरक्षा नियमों (Same-Origin Policy) के कारण एक वेबसाइट दूसरी वेबसाइट को सीधे कंट्रोल नहीं कर सकती—लेकिन नीचे दिए गए{' '}
            <strong className="text-emerald-400">2 वास्तविक तरीकों</strong> से आपका यह फ़ोन रिमोट दुनिया की किसी भी गेमिंग वेबसाइट पर 10–15ms में काम करेगा:
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadUserscript}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Auto-Userscript (.user.js)</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopy('bm', bridgeSnippets.bookmarkletHref)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedId === 'bm' ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Bookmarklet Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy 1-Tap Bookmarklet</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleCopy('cs', bridgeSnippets.consoleSnippet)}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {copiedId === 'cs' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Script Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Console Script</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1">
          <span className="font-semibold text-emerald-400">
            तरीका A (सबसे आसान — ऑटोमैटिक Userscript एक्सटेंशन):
          </span>
          <p className="text-slate-300 leading-relaxed">
            अपने टैबलेट/PC ब्राउज़र में Tampermonkey या Stay एक्सटेंशन लगाकर ऊपर दिया{' '}
            <code className="text-amber-300">Auto-Userscript (.user.js)</code> डाउनलोड करें। इसके बाद जब भी आप यह वेबसाइट छोड़कर{' '}
            <strong className="text-white">xbox.com/play</strong>,{' '}
            <strong className="text-white">geforcenow.com</strong> या किसी भी गेमिंग साइट पर जाएंगे, आपका फ़ोन अपने-आप Xbox/PS5 कंट्रोलर के रूप में जुड़ जाएगा!
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1">
          <span className="font-semibold text-amber-400">
            तरीका B (बिना किसी एक्सटेंशन के — 1-Tap Bookmarklet):
          </span>
          <p className="text-slate-300 leading-relaxed">
            अपने फ़ोन पर यही कंट्रोलर स्क्रीन खुली रखें (WakeLock आपके फ़ोन की स्क्रीन बंद नहीं होने देगा)। अब टैबलेट पर कोई भी गेमिंग वेबसाइट खोलें और बुकमार्क बार से{' '}
            <strong className="text-white">1-Tap Bookmarklet</strong> पर टैप करें—तुरंत रूम{' '}
            <strong className="text-amber-300 font-mono">{roomCode}</strong> का कंट्रोलर उस वेबसाइट में चलने लगेगा!
          </p>
        </div>
      </div>
    </div>
  );
};
