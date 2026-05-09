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

  let streamSettings = {
    device: "hw:1,0",
    icecastHost: "localhost",
    icecastPort: "8000",
    icecastSourcePass: "hackme",
    icecastAdminPass: "hackme",
    icecastMount: "/stream.mp3",
    bitsPerSample: "16",
    bitrate: "320",
    sampleRate: "44100"
  };

  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  const addLog = async (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMsg = `[${timestamp}] ${msg}`;
    logs.push(formattedMsg);
    if (logs.length > 500) logs.shift();
    originalConsoleLog(`[LOG] ${msg}`);
    
    // Auto-detect cast status and critical errors from logs
    if (msg.includes("Casting...") || msg.includes("Playing...") || msg.includes("audio is being casted")) {
      castStatus = 'connected';
    } else if (msg.includes("Attempting to cast") || msg.includes("Waiting for stream")) {
      castStatus = 'connecting';
    } else if (msg.includes("Error") || msg.includes("failed") || msg.includes("bug detected") || msg.includes("CRITICAL")) {
      castStatus = 'error';
    }
    
    try {
      await fs.appendFile(LOG_FILE, formattedMsg + "\n");
    } catch (err) {
      // Ignore file write errors
    }
  };

  // Override console methods to capture everything
  console.log = (...args) => {
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(" ");
    if (!msg.startsWith("[LOG]")) { // Prevent loops
      addLog(msg);
    } else {
      originalConsoleLog(...args);
    }
  };

  console.error = (...args) => {
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(" ");
    addLog(`ERROR: ${msg}`);
  };

  // Request logger (MOVED TO TOP OF MIDDLEWARE)
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      originalConsoleLog(`[API CALL] ${req.method} ${req.url}`);
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

  apiRouter.get("/settings", (req, res) => {
    res.json(streamSettings);
  });

  apiRouter.post("/settings", (req, res) => {
    streamSettings = { ...streamSettings, ...req.body };
    addLog(`Settings updated: Device=${streamSettings.device}, bitrate=${streamSettings.bitrate}`);
    res.json({ success: true, settings: streamSettings });
  });

  apiRouter.get("/devices", async (req, res) => {
    try {
      const { stdout } = await execAsync("arecord -l");
      const hardwareDevices = stdout.split('\n')
        .filter(line => line.includes('card') && line.includes('device'))
        .map(line => {
          const match = line.match(/card (\d+): (.*?) \[(.*?)\], device (\d+): (.*?) \[(.*?)\]/);
          if (match) {
            const cardId = match[1];
            const deviceId = match[4];
            const cardName = match[3];
            const deviceName = match[6];
            return { 
              id: `hw:${cardId},${deviceId}`, 
              name: `${cardName} - ${deviceName} (hw:${cardId},${deviceId})`, 
              type: 'hardware' 
            };
          }
          // Fallback if regex fails but line has basic info
          const basicMatch = line.match(/card (\d+):.*device (\d+):/);
          return basicMatch ? { id: `hw:${basicMatch[1]},${basicMatch[2]}`, name: line.trim().substring(0, 40), type: 'hardware' } : null;
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
        const { stdout } = await execAsync("avahi-browse -rt _googlecast._tcp --parsable", { timeout: 13000 });
        const lines = stdout.split("\n");
        for (const line of lines) {
          if (line.startsWith("=") && line.includes("_googlecast._tcp")) {
            const parts = line.split(";");
            if (parts.length > 7) {
              let friendlyName = parts[3].replace(/\\/g, "");
              const ip = parts[7];
              
              if (parts.length > 9) {
                const txt = parts[9];
                const fnMatch = txt.match(/fn="?([^"]+)"?/);
                if (fnMatch && fnMatch[1]) {
                  friendlyName = fnMatch[1];
                }
              }

              const ipParts = parts.filter(p => p.includes('.') && p.split('.').length === 4);
              const bestIp = ipParts.length > 0 ? ipParts[0] : parts[7];
              devices.push(`${friendlyName} [${bestIp}]`);
            }
          }
        }
      } catch (avahiError: any) {
        if (avahiError.message?.includes("Daemon not running")) {
            addLog("Discovery: Avahi daemon is not running. Try: sudo systemctl start avahi-daemon");
        } else {
            addLog(`avahi-browse scan skipped/failed.`);
        }
      }

      // 2. Try catt scan as fallback (since it's installed by our script)
      if (devices.length === 0) {
        try {
          const homeLocalBin = path.join(process.env.HOME || '', '.local/bin/catt');
          const cattCmd = existsSync(homeLocalBin) ? homeLocalBin : 'catt';
          
          addLog("Attempting fallback discovery with 'catt scan'...");
          const { stdout } = await execAsync(`${cattCmd} scan`, { timeout: 20000 });
          const cattLines = stdout.split('\n');
          for (const line of cattLines) {
            // Typical output: Found "Living Room TV" at 192.168.1.5
            const match = line.match(/Found "(.*?)" at (.*)/i);
            if (match) {
              devices.push(`${match[1]} [${match[2]}]`);
            }
          }
        } catch (cattError) {
          addLog("catt scan fallback failed or timed out.");
        }
      }

      // 3. Last resort: Try mkchromecast if available
      if (devices.length === 0) {
        try {
          // Check if mkchromecast exists before running to avoid noisy "Command failed"
          await execAsync("which mkchromecast");
          const { stdout, stderr } = await execAsync("mkchromecast -l", { timeout: 15000 });
          const output = (stdout || "") + "\n" + (stderr || "");
          
          const entries = output.split(/\n\s*\n/);
          for (const entry of entries) {
            const nameMatch = entry.match(/name:\s*(.*)/i);
            const ipMatch = entry.match(/ip:\s*(.*)/i);
            if (nameMatch && ipMatch) {
              devices.push(`${nameMatch[1].trim()} [${ipMatch[1].trim()}]`);
            } else if (nameMatch) {
               devices.push(nameMatch[1].trim());
            }
          }
        } catch (mkError) {
           // Silent fallback
        }
      }
      
      const uniqueDevices = Array.from(new Set(devices)).filter(d => d.trim().length > 0);

      if (uniqueDevices.length === 0) {
        addLog("Scan complete: 0 physical devices detected.");
        res.json(["Living Room Speaker (Demo)", "Kitchen Hub (Demo)"]);
      } else {
        // Filter out devices that only returned IPv6 if possible, or prioritize IPv4
        const prioritized = uniqueDevices.sort((a, b) => {
          const aHasIp4 = a.match(/\[(\d+\.\d+\.\d+\.\d+)\]/);
          const bHasIp4 = b.match(/\[(\d+\.\d+\.\d+\.\d+)\]/);
          if (aHasIp4 && !bHasIp4) return -1;
          if (!aHasIp4 && bHasIp4) return 1;
          return 0;
        });
        addLog(`Scan complete: Found ${prioritized.length} devices.`);
        res.json(prioritized);
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

      // Handshake: Ensure Icecast is fully 'warm' and reachable
      const waitForIcecast = async (maxRetries = 5): Promise<boolean> => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            const { stdout } = await execAsync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${streamSettings.icecastPort}/status-json.xsl || echo "000"`);
            if (stdout.trim() === "200") return true;
          } catch (e) {}
          
          if (i === 0) {
            addLog(`Icecast port ${streamSettings.icecastPort} not ready, attempting service restart...`);
            await execAsync("sudo systemctl restart icecast2 || true");
          }
          await new Promise(r => setTimeout(r, 1500));
        }
        return false;
      };

      if (!(await waitForIcecast())) {
        addLog("Pre-flight Warning: Icecast service not responding. DarkIce may fail to connect.");
      } else {
        addLog("Icecast bridge is warm and reachable.");
      }

      // Sanitize mount point (MUST start with /)
      const mountPoint = streamSettings.icecastMount.startsWith("/") 
        ? streamSettings.icecastMount 
        : `/${streamSettings.icecastMount}`;

      // ALSA Plug Layer: Prefer plughw: for hardware devices to enable automatic format conversion
      const alsaDevice = (device.startsWith("hw:") && !device.startsWith("plughw:")) 
        ? `plug${device}` 
        : device;

      // IMPORTANT: config string must have NO leading spaces for DarkIce sections [header]
      const configText = `[general]
duration        = 0
bufferSecs      = 2
reconnect       = yes

[input]
device          = ${alsaDevice}
sampleRate      = ${streamSettings.sampleRate}
bitsPerSample   = ${streamSettings.bitsPerSample || '16'}
channel         = 2

[icecast2-0]
bitrateMode     = cbr
format          = mp3
bitrate         = ${streamSettings.bitrate}
server          = 127.0.0.1
port            = ${streamSettings.icecastPort}
password        = ${streamSettings.icecastSourcePass}
mountPoint      = ${mountPoint}
name            = 7B Records Live
`;
      const activeConfigPath = path.join(os.tmpdir(), "7b-records-darkice.cfg");
      await fs.writeFile(activeConfigPath, configText);
      addLog(`Generated session config: ${activeConfigPath} (Mount: ${mountPoint})`);

      addLog(`Attempting to start DarkIce with device ${device}...`);

      // STRICT PRE-FLIGHT HARDWARE CHECK
      if (device !== "mock:1") {
        try {
          const { stdout: devices } = await execAsync("arecord -l");
          const cardSearch = device.startsWith("hw:") ? `card ${device.split(":")[1].split(",")[0]}:` : device;
          if (!devices.includes(cardSearch)) {
            addLog(`[HARDWARE FAILURE] Device ${device} not recognized by ALSA.`);
            addLog("TIP: Ensure your USB audio interface is plugged in and recognized in 'arecord -l'.");
            return res.status(404).json({ 
              success: false, 
              error: "DEVICE_NOT_FOUND",
              message: "Audio hardware not found. Please check connections." 
            });
          }
        } catch (e) {
            addLog(`Error during hardware check: ${e}`);
            return res.status(500).json({ error: "ALSA Check Failed" });
        }
      } else {
        addLog("[MODE] Starting in Simulation Mode (Backend Mocking Enabled)");
        mockMode = true;
      }
      
      const spawnProcess = (cmd: string, args: string[], name: string) => {
        // Fallback for catt if installed via pip3 in .local/bin
        let finalCmd = cmd;
        if (cmd === "catt") {
          const homeLocalBin = path.join(process.env.HOME || '', '.local/bin/catt');
          if (existsSync(homeLocalBin)) {
            finalCmd = homeLocalBin;
          }
        }
        
        addLog(`[EXEC] Spawning ${name}: ${finalCmd} ${args.join(' ')}`);
        const proc = spawn(finalCmd, args);
        
        proc.on('error', (err: any) => {
          if (err.code === 'ENOENT') {
            if (name === 'Catt') {
              addLog(`[CRITICAL] Binary 'catt' not found! Please run 'sudo apt install catt' or 'pip3 install catt'.`);
            } else if (name === 'Cast') {
              addLog(`[WARNING] 'mkchromecast' binary not found. Falling back to 'catt' if available.`);
            } else {
              addLog(`[WARNING] ${name} binary not found. Entering Mock Mode.`);
            }
            mockMode = true;
          } else {
            addLog(`[${name} ERROR] ${err.message}`);
          }
        });

        proc.on('exit', (code, signal) => {
          addLog(`[${name} EXIT] Code: ${code}${signal ? `, Signal: ${signal}` : ''}`);
          if (name === 'DarkIce') {
            darkIceProcess = null;
            if (code === 1 && !mockMode) {
               addLog("DarkIce failed to start. Tip: Check if another app is using the audio device or if the Icecast password is correct.");
            }
          }
          if (name === 'Cast' || name === 'Catt') {
            if (code !== 0 && code !== null) {
              addLog(`[${name} FAIL] Casting engine failed with non-zero exit code.`);
            }
            mkChromecastProcess = null;
          }
        });

        const checkAuthError = (logMsgText: string) => {
          if (name === 'DarkIce') {
            if (logMsgText.includes("can't open connector") || logMsgText.includes("connector [0]")) {
              addLog("CRITICAL: Icecast connection failed. Likely incorrect password. DEFAULT is 'hackme'. Check settings.");
            }
            if (logMsgText.includes("Device or resource busy")) {
              addLog("CRITICAL ERROR: Audio device is currently BUSY. Another app might be using it.");
              addLog("TIP: Unplug and replug your USB audio interface.");
            }
            if (logMsgText.includes("No such file or directory") || logMsgText.includes("Unknown PCM")) {
              addLog(`CRITICAL ERROR: Device ${streamSettings.device} is missing.`);
              addLog("TIP: Re-select your USB device in settings or try 'hw:2,0'.");
            }
            if (logMsgText.includes("can't set sample format")) {
              addLog("HARDWARE LIMITATION: Your USB device requires a different bit-depth.");
              addLog("TIP: Ensure you are using the 'plughw' layer in settings (now handled automatically).");
            }
          }
        };

        proc.stdout?.on('data', (data) => {
          const logMsg = data.toString().trim();
          if (logMsg) {
            addLog(`[${name} STDOUT] ${logMsg}`);
            checkAuthError(logMsg);
          }
        });
        
        proc.stderr?.on('data', (data) => {
          const logMsg = data.toString().trim();
          if (logMsg) {
            addLog(`[${name} STDERR] ${logMsg}`);
            checkAuthError(logMsg);
            
            // Monitor for the mkchromecast bug
            if (name === 'Cast' && (
              logMsg.includes("AttributeError:") ||
              logMsg.includes("NoChromecastFoundError") ||
              logMsg.includes("KeyError:")
            )) {
               addLog(`[DEBUG] Detected mkchromecast known bug/exception. Triggering catt fallback...`);
               if (mkChromecastProcess && mkChromecastProcess.kill) mkChromecastProcess.kill();
               
               const activeMount = streamSettings.icecastMount.startsWith("/") ? streamSettings.icecastMount : `/${streamSettings.icecastMount}`;
               const streamUrl = `http://${LOCAL_IP}:${streamSettings.icecastPort}${activeMount}`;
               
               // Try to extract IP from name if it exists (e.g. "Name [192.168.1.5]")
               let castTarget = chromecast;
               const ipMatch = chromecast.match(/\[(.*?)\]/);
               if (ipMatch && ipMatch[1]) {
                   castTarget = ipMatch[1];
                   addLog(`[FALLBACK] Extracted IP ${castTarget} for catt target`);
               }

               setTimeout(() => {
                 try {
                   addLog(`[FALLBACK] Launching catt to target: ${castTarget}`);
                   mkChromecastProcess = spawnProcess("catt", ["-d", castTarget, "cast", streamUrl], "Catt");
                 } catch (spawnErr) {
                   addLog(`[CRITICAL] Error while spawning 'catt' fallback: ${spawnErr}`);
                 }
               }, 1000);
            }
          }
        });
        
        return proc;
      };

      let retryCount = 0;
      const MAX_RETRIES = 3;

      const startDarkIce = async (): Promise<boolean> => {
        return new Promise((resolve) => {
          const proc = spawnProcess("darkice", ["-c", activeConfigPath], "DarkIce");
          darkIceProcess = proc;
          
          let successfullyConnected = false;
          
          const timeout = setTimeout(() => {
            if (!successfullyConnected && proc.pid && proc.pid !== 999) {
              addLog("DarkIce initial handshake timed out. Retrying...");
              proc.kill();
              resolve(false);
            }
          }, 12000); // 12 second timeout for initial connection

          proc.stdout?.on('data', (data) => {
            const msg = data.toString();
            // DarkIce prints "transferring 123 bytes" when successfully sending data
            if (msg.includes("transferring") || msg.includes("Icecast2-0 started")) {
               if (!successfullyConnected) {
                 addLog(">>> DarkIce successfully connected to Icecast bridge.");
                 successfullyConnected = true;
                 clearTimeout(timeout);
                 resolve(true);
               }
            }
          });

          proc.on('exit', (code) => {
            if (!successfullyConnected) {
              clearTimeout(timeout);
              resolve(false);
            }
          });
        });
      };

      (async () => {
        streamStartTime = Date.now();
        let connected = false;
        
        while (retryCount < MAX_RETRIES && !connected) {
          if (retryCount > 0) {
            addLog(`Retry ${retryCount}/${MAX_RETRIES}: Waiting for Icecast port 8000 to clear...`);
            await new Promise(r => setTimeout(r, 4000));
          }
          connected = await startDarkIce();
          if (!connected) retryCount++;
        }

        if (!connected) {
          addLog("BRIDGE FAILURE: Stream not available for casting.");
          addLog("DASHBOARD: Entering Simulation Mode for UI preview.");
          darkIceProcess = { kill: () => { mockMode = false; }, pid: 999 };
          mockMode = true;

          // ABORT casting if bridge failed
          return;
        }

        const activeMount = streamSettings.icecastMount.startsWith('/') ? streamSettings.icecastMount : `/${streamSettings.icecastMount}`;
        const streamUrl = `http://${LOCAL_IP}:${streamSettings.icecastPort}${activeMount}`;
        
        // Network Sanitizer: Prioritize IPv4 and handle IPv6 wrapping
        let castTarget = chromecast;
        const ipMatch = chromecast.match(/\[(.*?)\]/);
        
        if (ipMatch && ipMatch[1]) {
            const rawIp = ipMatch[1];
            // If multiple IPs are present (rare) or we need to check type
            if (rawIp.includes(':')) {
                // If it's IPv6, wrap it for catt
                castTarget = `[${rawIp}]`;
                addLog(`[SANITIZER] Target uses IPv6: ${castTarget}`);
            } else {
                castTarget = rawIp;
                addLog(`[SANITIZER] Target uses IPv4: ${castTarget}`);
            }
        }

        addLog(`Attempting to cast ${streamUrl} to ${castTarget}...`);
        
        // Casting Engine Selection (Primary: catt, Fallback: mkchromecast)
        const runCastingEngine = async () => {
          let hasCatt = false;
          try {
            await execAsync("which catt");
            hasCatt = true;
          } catch (e) {
            const homeLocalBin = path.join(process.env.HOME || "", ".local/bin/catt");
            if (existsSync(homeLocalBin)) hasCatt = true;
          }

          if (hasCatt) {
            addLog(`[EXEC] Launching primary engine: catt to ${castTarget}`);
            mkChromecastProcess = spawnProcess("catt", ["-d", castTarget, "cast", streamUrl], "Catt");
          } else {
            addLog(`[EXEC] catt not found. Launching fallback engine: mkchromecast`);
            mkChromecastProcess = spawnProcess("mkchromecast", [
              "--name", chromecast,
              "--source-url", streamUrl,
              "-c", "mp3",
              "--control"
            ], "Cast");
          }
        };

        runCastingEngine();
      })();

      res.json({ success: true, mock: mockMode, streamUrl: `http://${LOCAL_IP}:${streamSettings.icecastPort}/stream.mp3` });
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

  apiRouter.post("/setup/icecast", async (req, res) => {
    try {
      const { sourcePass, adminPass, port } = req.body;
      addLog(`Re-configuring Icecast with NEW settings (Port: ${port})...`);
      
      const configPath = "/etc/icecast2/icecast.xml";
      const configXml = `<icecast>
    <location>7B Records Studio</location>
    <admin>admin@localhost</admin>
    <limits>
        <clients>100</clients>
        <sources>2</sources>
        <queue-size>524288</queue-size>
        <client-timeout>30</client-timeout>
        <header-timeout>15</header-timeout>
        <source-timeout>10</source-timeout>
        <burst-on-connect>1</burst-on-connect>
        <burst-size>65536</burst-size>
    </limits>
    <authentication>
        <source-password>${sourcePass}</source-password>
        <relay-password>${sourcePass}</relay-password>
        <admin-user>admin</admin-user>
        <admin-password>${adminPass}</admin-password>
    </authentication>
    <hostname>localhost</hostname>
    <listen-socket>
        <port>${port}</port>
        <bind-address>0.0.0.0</bind-address>
    </listen-socket>
    <http-headers>
        <header name="Access-Control-Allow-Origin" value="*" />
    </http-headers>
    <mount type="normal">
        <mount-name>/stream.mp3</mount-name>
    </mount>
    <fileserve>1</fileserve>
    <paths>
        <basedir>/usr/share/icecast2</basedir>
        <logdir>/var/log/icecast2</logdir>
        <webroot>/usr/share/icecast2/web</webroot>
        <adminroot>/usr/share/icecast2/admin</adminroot>
        <alias source="/" destination="/status.xsl"/>
    </paths>
    <logging>
        <accesslog>access.log</accesslog>
        <errorlog>error.log</errorlog>
        <loglevel>3</loglevel>
    </logging>
</icecast>`;

      await fs.writeFile("icecast.xml.tmp", configXml);
      await execAsync(`sudo mv icecast.xml.tmp ${configPath}`);
      await execAsync("sudo systemctl restart icecast2");
      
      addLog("Icecast 2 re-configured and restarted successfully.");
      res.json({ success: true });
    } catch (error) {
      addLog(`Icecast Setup Failed: ${error}`);
      res.status(500).json({ error: "Failed to configure Icecast" });
    }
  });

  apiRouter.post("/setup/system", async (req, res) => {
    try {
      const { sourcePass, adminPass } = req.body;
      addLog("Starting Full System Installation (This may take a minute)...");
      
      // Run install.sh
      const proc = spawn("sudo", ["bash", "./install.sh", sourcePass, adminPass]);
      
      proc.stdout.on('data', (data) => addLog(`Install: ${data.toString().trim()}`));
      proc.stderr.on('data', (data) => addLog(`Install Error: ${data.toString().trim()}`));
      
      proc.on('close', (code) => {
        if (code === 0) {
          addLog("Full System Installation completed successfully.");
        } else {
          addLog(`Installation failed with exit code ${code}`);
        }
      });

      res.json({ success: true, message: "Installation started in background" });
    } catch (error) {
      addLog(`System Setup Launch Failed: ${error}`);
      res.status(500).json({ error: "Failed to start installation" });
    }
  });

  // Catch-all for API router to prevent falling through to SPA handler
  apiRouter.use((req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.url}` });
  });

  // Mount API Router
  app.use("/api", apiRouter);

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
