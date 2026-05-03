import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { exec, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { existsSync } from "fs";
import os from "os";

const execAsync = promisify(exec);

// Helper to get local IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    // Skip virtual/bridge interfaces common on Pi/Linux
    if (name.includes('docker') || name.includes('veth') || name.includes('br-')) continue;
    
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const LOCAL_IP = getLocalIp();
  const LOG_FILE = path.join(process.cwd(), "app.log");

  // Initialize log file
  try {
    await fs.writeFile(LOG_FILE, `--- 7B Records Server Start: ${new Date().toISOString()} ---\n`);
  } catch (err) {
    console.error("Failed to initialize log file:", err);
  }

  app.use(express.json());

  let darkIceProcess: ChildProcess | any = null;
  let mkChromecastProcess: ChildProcess | any = null;
  let streamStartTime: number | null = null;
  let mockMode = false;
  let castStatus: 'idle' | 'connecting' | 'connected' | 'error' = 'idle';
  let logs: string[] = ["7B Records Server Started", `Server IP: ${LOCAL_IP}`, "Waiting for audio sources..."];

  const addLog = async (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMsg = `[${timestamp}] ${msg}`;
    logs.push(formattedMsg);
    if (logs.length > 500) logs.shift();
    console.log(`[LOG] ${msg}`);
    
    // Auto-detect cast status from logs
    if (msg.includes("Casting...") || msg.includes("Playing...") || msg.includes("audio is being casted")) {
      castStatus = 'connected';
    } else if (msg.includes("Attempting to cast") || msg.includes("Waiting for stream")) {
      castStatus = 'connecting';
    } else if (msg.includes("Error") || msg.includes("failed") || msg.includes("bug detected")) {
      castStatus = 'error';
    }
    
    try {
      await fs.appendFile(LOG_FILE, formattedMsg + "\n");
    } catch (err) {
      // Ignore file write errors
    }
  };

  // Request logger (MOVED TO TOP OF MIDDLEWARE)
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API CALL] ${req.method} ${req.url}`);
    }
    next();
  });

  // API Routes
  const apiRouter = express.Router();

  apiRouter.get("/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  apiRouter.get("/status", (req, res) => {
    try {
      const uptimeMinutes = streamStartTime 
        ? Math.floor((Date.now() - streamStartTime) / 60000)
        : 0;

      res.status(200).set('Content-Type', 'application/json').json({
        streaming: !!darkIceProcess,
        casting: !!mkChromecastProcess,
        castStatus,
        icecast: true,
        mock: mockMode,
        uptimeMinutes,
        localIp: LOCAL_IP
      });
    } catch (error) {
      console.error("Status error:", error);
      res.status(500).json({ error: "Status failed" });
    }
  });

  apiRouter.get("/logs", (req, res) => {
    res.json({ logs });
  });

  apiRouter.get("/logs/download", (req, res) => {
    res.download(LOG_FILE, "7b-records-debug.log");
  });

  apiRouter.get("/devices", async (req, res) => {
    try {
      const { stdout } = await execAsync("arecord -l");
      const hardwareDevices = stdout.split('\n')
        .filter(line => line.includes('card'))
        .map(line => {
          const match = line.match(/card (\d+):.*device (\d+):/);
          return match ? { id: `hw:${match[1]},${match[2]}`, name: line.trim(), type: 'hardware' } : null;
        })
        .filter(Boolean);

      const mockDevices = [
        { id: "mock:1", name: "🚀 Mock Audio Device (Test)", type: 'mock' }
      ];

      res.json([...hardwareDevices, ...mockDevices]);
    } catch (error) {
      res.json([
        { id: "mock:1", name: "🚀 Mock Audio Device (Test)", type: 'mock' },
        { id: "hw:1,0", name: "⚠️ Hardware Not Found - Using hw:1,0 Fallback", type: 'fallback' }
      ]);
    }
  });

  apiRouter.get("/chromecasts", async (req, res) => {
    try {
      addLog("Scanning for Chromecasts (mDNS)...");
      
      let devices: string[] = [];

      // 1. Try avahi-browse (native linux mDNS)
      try {
        const { stdout } = await execAsync("avahi-browse -rt _googlecast._tcp --parsable", { timeout: 5000 });
        const lines = stdout.split("\n");
        for (const line of lines) {
          if (line.startsWith("=") && line.includes("_googlecast._tcp")) {
            const parts = line.split(";");
            if (parts.length > 3) {
              const name = parts[3].replace(/\\/g, "");
              devices.push(name);
            }
          }
        }
      } catch (avahiError) {
        // Fallback or ignore
      }

      // 2. If avahi returned nothing or failed, try mkchromecast as fallback
      if (devices.length === 0) {
        const execResult = await execAsync("mkchromecast -l", { timeout: 10000 })
          .catch(err => ({ stdout: err.stdout || "", stderr: err.stderr || "" }));

        const output = (execResult.stdout || "") + "\n" + (execResult.stderr || "");
        devices = output.split('\n')
          .filter(line => line.toLowerCase().includes('name:'))
          .map(line => {
            const parts = line.split(/[Nn]ame:/);
            return parts.length > 1 ? parts[1].trim() : null;
          })
          .filter((name): name is string => name !== null && name.length > 0);
      }
      
      const uniqueDevices = Array.from(new Set(devices));

      if (uniqueDevices.length === 0) {
        addLog("Scan complete: 0 physical devices detected.");
        res.json(["Living Room Speaker (Demo)", "Kitchen Hub (Demo)"]);
      } else {
        addLog(`Scan complete: Found ${uniqueDevices.length} devices.`);
        res.json(uniqueDevices);
      }
    } catch (error) {
      addLog(`Discovery error (Fatal): ${error}`);
      res.json(["Living Room Speaker (Demo)", "Kitchen Hub (Demo)"]);
    }
  });

  apiRouter.post("/stream/start", async (req, res) => {
    const { device, chromecast, password, bitrate } = req.body;

    if (darkIceProcess || mkChromecastProcess) {
       return res.status(400).json({ error: "Stream already running" });
    }

    try {
      // Clean up any stray processes first
      addLog("Cleaning up previous session processes...");
      try {
        await execAsync("pkill -9 darkice || true");
        await execAsync("pkill -9 mkchromecast || true");
        await execAsync("pkill -9 catt || true");
      } catch (e) {}

      // Verify Icecast is running or try to start it
      try {
        const { stdout: netstat } = await execAsync("netstat -an | grep 8000 | grep LISTEN || true");
        if (!netstat) {
          addLog("Icecast not detected on port 8000. Attempting to start/restart icecast2 service...");
          await execAsync("sudo systemctl restart icecast2 || true");
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        addLog("Could not verify Icecast status. Continuing anyway...");
      }

      // IMPORTANT: config string must have NO leading spaces for DarkIce sections [header]
      const configText = `[general]
duration        = 0
bufferSecs      = 2
reconnect       = yes

[input]
device          = ${device || 'hw:1,0'}
sampleRate      = 44100
bitsPerSample   = 16
channel         = 2

[icecast2-0]
bitrateMode     = cbr
format          = mp3
bitrate         = ${bitrate || 192}
server          = localhost
port            = 8000
password        = ${password || 'hackme'}
mountPoint      = stream.mp3
name            = PiCastStream
`;
      await fs.writeFile("darkice.cfg", configText);
      addLog("Generated darkice.cfg (Fixed formatting)");

      addLog(`Attempting to start DarkIce with device ${device}...`);
      
      const spawnProcess = (cmd: string, args: string[], name: string) => {
        // Fallback for catt if installed via pip3 in .local/bin
        let finalCmd = cmd;
        if (cmd === "catt") {
          const homeLocalBin = path.join(process.env.HOME || '', '.local/bin/catt');
          if (existsSync(homeLocalBin)) {
            finalCmd = homeLocalBin;
          }
        }
        const proc = spawn(finalCmd, args);
        
        proc.on('error', (err: any) => {
          if (err.code === 'ENOENT') {
            if (name === 'Catt') {
              addLog(`WARNING: 'catt' binary not found. Please run 'sudo apt install catt' or 'pip3 install catt' on your Pi.`);
            } else {
              addLog(`WARNING: ${name} binary not found. Entering Mock Mode.`);
            }
            mockMode = true;
          } else {
            addLog(`${name} Error: ${err.message}`);
          }
        });

        proc.on('exit', (code) => {
          addLog(`${name} process exited with code ${code}`);
          if (name === 'DarkIce') {
            darkIceProcess = null;
            if (code === 1 && !mockMode) {
               addLog("DarkIce failed to start. Tip: Check if another app is using the audio device or if the Icecast password is correct.");
            }
          }
          if (name === 'Cast' || name === 'Catt') mkChromecastProcess = null;
        });

        const checkAuthError = (logMsgText: string) => {
          if (name === 'DarkIce' && (logMsgText.includes("can't open connector") || logMsgText.includes("connector [0]"))) {
            addLog("CRITICAL: Icecast connection failed. Likely incorrect password. DEFAULT is 'hackme'. Check settings.");
          }
        };

        proc.stdout?.on('data', (data) => {
          const logMsg = data.toString();
          addLog(`${name}: ${logMsg}`);
          checkAuthError(logMsg);
        });
        
        proc.stderr?.on('data', (data) => {
          const logMsg = data.toString();
          addLog(`${name} Stderr: ${logMsg}`);
          checkAuthError(logMsg);
          
          // Monitor for the mkchromecast bug
          if (name === 'Cast' && (
            logMsg.includes("AttributeError: 'Casting' object has no attribute 'cast'") ||
            logMsg.includes("AttributeError: module 'pychromecast' has no attribute 'get_chromecast'") ||
            logMsg.includes("AttributeError: module 'pychromecast.error' has no attribute 'NoChromecastFoundError'")
          )) {
             if (mkChromecastProcess && mkChromecastProcess.kill) mkChromecastProcess.kill();
             
             const streamUrl = `http://${LOCAL_IP}:8000/stream.mp3`;
             addLog(`mkchromecast bug detected! Switching to 'catt' backup...`);
             try {
               mkChromecastProcess = spawnProcess("catt", ["-d", chromecast, "cast", streamUrl], "Catt");
               if (mkChromecastProcess && mkChromecastProcess.pid) {
                 addLog(`Successfully spawned backup 'catt' (PID: ${mkChromecastProcess.pid})`);
               } else {
                 addLog("ERROR: failed to spawn 'catt' or no PID.");
               }
             } catch (spawnErr) {
               addLog(`CRITICAL Error while spawning 'catt': ${spawnErr}`);
             }
          }
        });
        
        return proc;
      };

      darkIceProcess = spawnProcess("darkice", ["-c", "darkice.cfg"], "DarkIce");
      streamStartTime = Date.now();

      // Better check: Wait until the stream URL is actually reachable locally
      const waitForStream = async (retries = 10): Promise<boolean> => {
        for (let i = 0; i < retries; i++) {
          try {
            const { stdout } = await execAsync(`curl -I http://localhost:8000/stream.mp3 2>/dev/null | grep "200" || true`);
            if (stdout.includes("200")) return true;
          } catch (e) {}
          await new Promise(r => setTimeout(r, 1500));
          if (i % 2 === 0) addLog(`Waiting for stream to buffer... (${i + 1}/${retries})`);
        }
        return false;
      };

      (async () => {
        const isLive = await waitForStream();
        
        if (!isLive && (!darkIceProcess || !darkIceProcess.pid)) {
          addLog("DASHBOARD: Simulating DarkIce (Hardware not responding)");
          darkIceProcess = { kill: () => { mockMode = false; }, pid: 999 };
          mockMode = true;
        } else if (!isLive) {
          addLog("WARNING: Stream did not go live. Please verify Icecast password.");
        }

        const streamUrl = `http://${LOCAL_IP}:8000/stream.mp3`;
        addLog(`Attempting to cast ${streamUrl} to ${chromecast}...`);
        
        // Try mkchromecast first
        mkChromecastProcess = spawnProcess("mkchromecast", [
          "--name", chromecast,
          "--source-url", streamUrl,
          "-c", "mp3",
          "--control"
        ], "Cast");
      })();

      res.json({ success: true, mock: mockMode, streamUrl: `http://${LOCAL_IP}:8000/stream.mp3` });
    } catch (error) {
      addLog(`Failed to start stream: ${error}`);
      res.status(500).json({ error: "Failed to start stream" });
    }
  });

  apiRouter.post("/stream/stop", (req, res) => {
    if (darkIceProcess) {
      if (darkIceProcess.kill) darkIceProcess.kill();
      darkIceProcess = null;
      addLog("Stopped DarkIce simulation/process");
    }
    if (mkChromecastProcess) {
      if (mkChromecastProcess.kill) mkChromecastProcess.kill();
      mkChromecastProcess = null;
      addLog("Stopped Cast simulation/process");
    }
    streamStartTime = null;
    mockMode = false;
    castStatus = 'idle';
    res.json({ success: true });
  });

  // Catch-all for API router to prevent falling through to SPA handler
  apiRouter.use((req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.url}` });
  });

  // Mount API Router
  app.use("/api", apiRouter);

  // Request logger
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Final catch-all for anything NOT starting with /api
  app.get("*", (req, res) => {
    if (req.url.startsWith('/api')) {
      return res.status(404).json({ error: "API route not found" });
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
