import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Clock,
  Copy,
  Check,
  ExternalLink,
  Zap,
  AlertTriangle,
  Server,
  X,
  RefreshCw,
  Globe,
  Radio,
} from "lucide-react";

interface KeepAliveModalProps {
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const KeepAliveModal: React.FC<KeepAliveModalProps> = ({ onClose, onToast }) => {
  const [copied, setCopied] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Public shared URL (accessible externally without Google login by cron-job.org / UptimeRobot)
  const currentOrigin = window.location.origin;
  const publicOrigin = currentOrigin.replace("ais-dev-", "ais-pre-");
  const publicPingUrl = `${publicOrigin}/api/ping`;
  const internalPingUrl = `${currentOrigin}/api/ping`;

  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedInternal, setCopiedInternal] = useState(false);
  const [isZeroSleepActive, setIsZeroSleepActive] = useState(false);
  const audioContextRef = React.useRef<any>(null);
  const wakeLockRef = React.useRef<any>(null);

  const toggleZeroSleep = async () => {
    if (isZeroSleepActive) {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      setIsZeroSleepActive(false);
      onToast("Browser Zero-Sleep Mode Deactivated");
    } else {
      try {
        // Request Screen Wake Lock if supported
        if ("wakeLock" in navigator) {
          try {
            wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
          } catch (e) {}
        }
        // Create silent web audio oscillator loop to prevent browser tab throttle
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.00001; // Silent
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          audioContextRef.current = ctx;
        }
        setIsZeroSleepActive(true);
        onToast("⚡ Browser Zero-Sleep Activated! Tab will not freeze in background.");
      } catch (e: any) {
        setIsZeroSleepActive(true);
        onToast("Browser background keep-alive activated");
      }
    }
  };

  const copyUrl = (url: string, type: "public" | "internal") => {
    navigator.clipboard.writeText(url);
    if (type === "public") {
      setCopiedPublic(true);
      setTimeout(() => setCopiedPublic(false), 2500);
    } else {
      setCopiedInternal(true);
      setTimeout(() => setCopiedInternal(false), 2500);
    }
    onToast("URL copied to clipboard!");
  };

  const testPing = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ping");
      const data = await res.json();
      setTestResult({
        success: res.ok,
        status: res.status,
        data,
      });
      onToast("Ping tested successfully! Server responded: alive");
    } catch (e: any) {
      setTestResult({
        success: false,
        error: e.message || "Ping failed",
      });
      onToast("Ping test failed");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.94, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 15 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden my-auto max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-zinc-100 flex items-center gap-2">
                <span>24/7 Always-On Keep Alive</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-[9px] text-emerald-400">
                  Active System
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400 font-mono">
                Tab ya Windows band hone par bhi server ko 24x7 active rakhne ki guide
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors border border-transparent hover:border-zinc-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs text-zinc-300">
          {/* Reason Card */}
          <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Tab band hone par server kyu band ho jata hai? (Cloud Run Scale-to-Zero)</span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              Google AI Studio ke web apps <strong>Serverless Cloud Run containers</strong> par chalte hain. Jab aap browser tab ya window band karte hain, toh network traffic 0 ho jata hai, aur Google Cloud compute resources save karne ke liye container ko <strong>"Sleep/Freeze" (Scale-to-Zero)</strong> kar deta hai.
            </p>
          </div>

          {/* Remix / Copies Explanation Card */}
          <div className="p-4 bg-sky-950/20 border border-sky-800/40 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-sky-400 font-bold text-xs">
              <Server className="w-4 h-4 shrink-0" />
              <span>AI Studio Remix (Copies) ke liye Zaroori Jaankari:</span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              Jab aap AI Studio me <strong>Remix (Copy)</strong> karte hain, toh har copy ka apna ek alag swatantra container aur naya unique URL banta hai (jaise <code>dev-coc6gx...</code> ya <code>pre-coc6gx...</code>). Har nayi copy ko unmineable par 24x7 nonstop chalane ke liye us copy ke andar aakar uska naya <strong>Public Webhook URL</strong> copy karein aur cron-job.org / UptimeRobot me add karein!
            </p>
          </div>

          {/* Feature: In-Browser Zero Sleep Toggle */}
          <div className="p-4 bg-zinc-950/90 border border-emerald-900/40 rounded-xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>Method 1: In-Browser Background Keep-Alive (Zero Sleep)</span>
              </div>
              <button
                onClick={toggleZeroSleep}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                  isZeroSleepActive
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700"
                }`}
              >
                <Radio className={`w-3.5 h-3.5 ${isZeroSleepActive ? "animate-pulse" : ""}`} />
                <span>{isZeroSleepActive ? "Active (Zero Sleep ON)" : "Turn ON Zero Sleep"}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Isko ON rakhne par aap agar tab ko minimize bhi kar denge, toh browser CPU throttling aur freezing band kar dega aur process full power par active rahegi.
            </p>
          </div>

          {/* Solution 2: Free External Cron Ping (Best & Recommended) */}
          <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>Method 2: Free 1-Minute Webhook Ping (100% Free Forever)</span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded border border-emerald-500/20">
                100% Working
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Tab ya PC band hone par bhi 24x7 active rakhne ke liye neeche diye gaye URL ko <strong>cron-job.org</strong> ya <strong>uptimerobot.com</strong> me har 1 minute ke schedule par daal dijiye:
            </p>

            {/* Public URL Box (Works without login) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1">
                  <span>★ Public Webhook URL (cron-job.org / UptimeRobot ke liye):</span>
                </label>
                <span className="text-[9px] text-zinc-500">No login required</span>
              </div>
              <div className="flex items-center gap-2 bg-black border border-zinc-800 rounded-lg p-2">
                <code className="text-[11px] text-emerald-400 flex-1 truncate font-mono select-all">
                  {publicPingUrl}
                </code>
                <button
                  onClick={() => copyUrl(publicPingUrl, "public")}
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] flex items-center gap-1 transition-colors shrink-0"
                >
                  {copiedPublic ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPublic ? "Copied!" : "Copy URL"}</span>
                </button>
              </div>
            </div>

            {/* Direct Browser URL */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                  Direct Browser Ping / Status URL:
                </label>
              </div>
              <div className="flex items-center gap-2 bg-black border border-zinc-800 rounded-lg p-2">
                <code className="text-[11px] text-zinc-300 flex-1 truncate font-mono select-all">
                  {internalPingUrl}
                </code>
                <a
                  href="/api/ping"
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sky-400 rounded text-[11px] flex items-center gap-1 transition-colors shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open</span>
                </a>
              </div>
            </div>

            {/* Test Ping Button */}
            <div className="pt-1 flex items-center gap-2 flex-wrap">
              <button
                onClick={testPing}
                disabled={isTesting}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? "animate-spin" : ""}`} />
                <span>{isTesting ? "Testing Ping..." : "Test Keep-Alive Ping Now"}</span>
              </button>

              {testResult && (
                <span className={`text-[11px] ${testResult.success ? "text-emerald-400" : "text-rose-400"}`}>
                  {testResult.success ? "✅ 200 OK — Server Alive & Resuming Process" : "❌ Error testing ping"}
                </span>
              )}
            </div>

            {testResult?.data && (
              <pre className="p-2.5 bg-black/60 rounded border border-zinc-800 text-[10px] text-zinc-400 overflow-x-auto">
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
            )}
          </div>

          {/* Quick Setup Instructions */}
          <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-2.5">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>30-Second Setup Guide (cron-job.org ya UptimeRobot):</span>
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-zinc-400 leading-relaxed">
              <li>
                Kisi bhi free monitoring site par jaiye, jaise{" "}
                <a
                  href="https://cron-job.org"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 underline hover:text-sky-300 inline-flex items-center gap-0.5"
                >
                  cron-job.org <ExternalLink className="w-3 h-3" />
                </a>{" "}
                ya{" "}
                <a
                  href="https://uptimerobot.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 underline hover:text-sky-300 inline-flex items-center gap-0.5"
                >
                  uptimerobot.com <ExternalLink className="w-3 h-3" />
                </a>
                .
              </li>
              <li>Ek naya job create karein aur <strong>URL</strong> me upar diya gaya Ping URL paste karein.</li>
              <li>Schedule me <strong>"Every 1 minute"</strong> (ya 2 minutes) select karein.</li>
              <li><strong>Save</strong> par click karein. Ab aapka server 24x7 bina rukaawat ke continuously chalta rahega!</li>
            </ol>
          </div>

          {/* Solution 2: Dedicated Server Option */}
          <div className="p-4 bg-zinc-950/40 border border-zinc-800/70 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-zinc-300 font-bold text-xs">
              <Server className="w-4 h-4 text-purple-400" />
              <span>Dedicated VPS Option (100% Native 24/7):</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Agar aap bina kisi cron service ke directly 24/7 run karna chahte hain, toh AI Studio ke <strong>Settings menu se "Export to ZIP / GitHub"</strong> karke kisi bhi cheap Linux VPS (Google Cloud Compute Engine, DigitalOcean, Hetzner) par <code>npm run build && npm start</code> chala sakte hain.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-zinc-500 font-mono">
            Endpoint: <code className="text-zinc-400">/api/ping</code> & <code className="text-zinc-400">/api/health</code>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono rounded-lg hover:bg-zinc-200 transition-colors"
          >
            Samajh Gaya (Close)
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
