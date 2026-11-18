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
    setTimeout(() => setCopiedId(null), 2000);
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
              XBOX CLOUD GAMING (xbox.com/play) CSP-BYPASS BRIDGE v4 · PRIVATE ID: {formattedRoom}
            </span>
          </div>
          <h3 className="text-sm sm:text-base font-display font-bold text-white">
            Xbox Cloud Gaming (xbox.com/play) के "Connect a Controller" बॉक्स में सीधे कैसे जोड़ें?
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            <strong className="text-amber-300">पुराना बुकमार्कलेट क्यों नहीं चला?</strong> Xbox Cloud Gaming की सुरक्षा नीति (Strict CSP Firewall) बाहरी कनेक्शन को रोक देती है और केवल असली{' '}
            <code className="text-emerald-300">Gamepad.prototype</code> को ही स्वीकार करती है। हमने नया{' '}
            <strong className="text-emerald-400">v4 CSP-Bypass Bridge + Auto-Extension</strong> बना दिया है जो Xbox के कंट्रोलर बॉक्स में तुरंत{' '}
            <strong className="text-white">Xbox Wireless Controller Connected</strong> दिखाता है!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="download-xbox-userscript-btn"
            onClick={handleDownloadUserscript}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>1. Download Xbox Auto-Extension (.user.js)</span>
          </button>

          <button
            type="button"
            data-testid="copy-xbox-bookmarklet-btn"
            onClick={() => handleCopy('bm', bridgeSnippets.bookmarkletHref)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedId === 'bm' ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>v4 Bookmarklet Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>2. Copy v4 Xbox Bookmarklet</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleCopy('cs', bridgeSnippets.consoleSnippet)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 font-medium text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {copiedId === 'cs' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Console Code Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Console Code</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenRelayPopup}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-400/50 hover:bg-sky-500/30 text-sky-300 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{popupLaunched ? 'Relay Popup Active' : 'Test Bridge Relay Window'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/30 flex flex-col gap-1.5">
          <span className="font-bold text-emerald-400 flex items-center gap-1">
            <Tv className="w-3.5 h-3.5" />
            <span>विकल्प 1 (सबसे पक्का): Xbox में ऑटोमैटिक कनेक्ट</span>
          </span>
          <p className="text-slate-300 leading-relaxed">
            टैबलेट/PC के ब्राउज़र (Chrome, Edge, Kiwi या Safari) में <strong className="text-white">Tampermonkey</strong> या <strong className="text-white">Userscripts</strong> एक्सटेंशन जोड़ें और ऊपर दिया{' '}
            <strong className="text-emerald-300">1. Download Xbox Auto-Extension (.user.js)</strong> इंस्टॉल करें। अब जब भी आप{' '}
            <strong className="text-white">xbox.com/play</strong> खोलेंगे, जहां Xbox "Connect a Controller" मांगता है वहां आपका फ़ोन (ID:{' '}
            <strong className="text-amber-300 font-mono">{formattedRoom}</strong>) अपने-आप जुड़ जाएगा!
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/30 flex flex-col gap-1.5">
          <span className="font-bold text-amber-400 flex items-center gap-1">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>विकल्प 2: नया v4 CSP-Bypass Bookmarklet</span>
          </span>
          <p className="text-slate-300 leading-relaxed">
            ऊपर <strong className="text-amber-300">2. Copy v4 Xbox Bookmarklet</strong> पर टैप करके नया कोड कॉपी करें और अपने बुकमार्क के URL में पेस्ट करें। जब आप{' '}
            <strong className="text-white">xbox.com/play</strong> खोलकर इस बुकमार्क पर क्लिक करेंगे, यह Xbox के फ़ायरवॉल को बायपास करने के लिए एक छोटा रिले पॉपअप खोलेगा और कोई भी बटन दबाते ही Xbox में कंट्रोलर चालू हो जाएगा!
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1.5">
          <span className="font-bold text-sky-400">
            विकल्प 3: मोबाइल/टैबलेट एड्रेस बार ट्रिक
          </span>
          <p className="text-slate-300 leading-relaxed">
            मोबाइल/टैबलेट Chrome में बुकमार्क चलाने के लिए <strong className="text-white">xbox.com/play</strong> के टैब में ऊपर एड्रेस बार (URL पट्टी) पर टैप करें, अपने सेव किए हुए बुकमार्क का नाम लिखें, और नीचे आने वाले बुकमार्क पर टैप करें—ऊपर हरी पट्टी{' '}
            <code className="text-emerald-300">PULSEPAD XBOX BRIDGE ACTIVE</code> दिखते ही गेम शुरू करें!
          </p>
        </div>
      </div>
    </div>
  );
};
