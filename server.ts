import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { exec, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";

const execAsync = promisify(exec);

// Helper to get local IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
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

  app.use(express.json());

  // Request logger
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  let darkIceProcess: ChildProcess | any = null;
  let mkChromecastProcess: ChildProcess | any = null;
  let streamStartTime: number | null = null;
  let mockMode = false;
  let logs: string[] = ["7B Records Server Started", `Server IP: ${LOCAL_IP}`, "Waiting for audio sources..."];

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    logs.push(`[${timestamp}] ${msg}`);
    if (logs.length > 200) logs.shift();
    console.log(`[LOG] ${msg}`);
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/status", (req, res) => {
    const uptimeMinutes = streamStartTime 
      ? Math.floor((Date.now() - streamStartTime) / 60000)
      : 0;

    res.json({
      streaming: !!darkIceProcess,
      casting: !!mkChromecastProcess,
      icecast: true,
      mock: mockMode,
      uptimeMinutes,
      localIp: LOCAL_IP
    });
  });

  app.get("/api/logs", (req, res) => {
    res.json({ logs });
  });

  app.get("/api/devices", async (req, res) => {
    try {
      const { stdout } = await execAsync("arecord -l");
      const devices = stdout.split('\n')
        .filter(line => line.includes('card'))
        .map(line => {
          const match = line.match(/card (\d+):.*device (\d+):/);
          return match ? { id: `hw:${match[1]},${match[2]}`, name: line.trim() } : null;
        })
        .filter(Boolean);
      if (devices.length === 0) throw new Error("No hardware devices");
      res.json(devices);
    } catch (error) {
      res.json([
        { id: "hw:1,0", name: "Mock USB Audio Device (Card 1, Device 0)" },
        { id: "hw:0,0", name: "Internal Audio (Card 0, Device 0)" }
      ]);
    }
  });

  app.get("/api/chromecasts", async (req, res) => {
    try {
      addLog("Scanning for Chromecasts...");
      
      // mkchromecast -l often exits with 1 if no devices are found 
      // within its narrow timeout, but still outputs scanned names to stdout/stderr.
      const execResult = await execAsync("mkchromecast -l", { timeout: 15000 })
        .catch(err => {
          // If it fails (non-zero exit), we still check the captured output
          return { stdout: err.stdout || "", stderr: err.stderr || "" };
        });

      const output = (execResult.stdout || "") + "\n" + (execResult.stderr || "");
      
      // Improved parsing: search for 'Name: <device_name>'
      // mkchromecast output usually looks like: [I] Name: Living Room Speaker
      const devices = output.split('\n')
        .filter(line => line.toLowerCase().includes('name:'))
        .map(line => {
          const parts = line.split(/[Nn]ame:/);
          return parts.length > 1 ? parts[1].trim() : null;
        })
        .filter((name): name is string => name !== null && name.length > 0);
      
      const uniqueDevices = Array.from(new Set(devices));

      if (uniqueDevices.length === 0) {
        addLog("Scan complete: 0 physical devices detected in output.");
        // We provide a fallback for UI testing/visibility if nothing was found
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

  app.post("/api/stream/start", async (req, res) => {
    const { device, chromecast, password, bitrate } = req.body;

    if (darkIceProcess || mkChromecastProcess) {
       return res.status(400).json({ error: "Stream already running" });
    }

    try {
      const config = `
[general]
duration        = 0
bufferSecs      = 2
reconnect       = yes

[input]
device          = ${device || 'hw:1,0'}
sampleRate      = 44100
bitsPerSample   = 16
channel         = 2

[icecast2-0]
bitrateMode     = abr
format          = mp3
bitrate         = ${bitrate || 192}
server          = localhost
port            = 8000
password        = ${password || 'raspberry'}
mountPoint      = stream.mp3
name            = PiCastStream
`;
      await fs.writeFile("darkice.cfg", config);
      addLog("Generated darkice.cfg");

      addLog(`Attempting to start DarkIce with device ${device}...`);
      
      const spawnProcess = (cmd: string, args: string[], name: string) => {
        const proc = spawn(cmd, args);
        
        proc.on('error', (err: any) => {
          if (err.code === 'ENOENT') {
            addLog(`WARNING: ${name} binary not found. Entering Mock Mode.`);
            mockMode = true;
          } else {
            addLog(`${name} Error: ${err.message}`);
          }
        });

        proc.stdout?.on('data', (data) => addLog(`${name}: ${data}`));
        proc.stderr?.on('data', (data) => addLog(`${name} Stderr: ${data}`));
        
        return proc;
      };

      darkIceProcess = spawnProcess("darkice", ["-c", "darkice.cfg"], "DarkIce");
      streamStartTime = Date.now();

      // Give Icecast a moment to start the stream before telling Chromecast to fetch it
      setTimeout(() => {
        if (!darkIceProcess || !darkIceProcess.pid) {
          addLog("DASHBOARD: Simulating DarkIce process (Hardware not found)");
          darkIceProcess = { kill: () => { mockMode = false; }, pid: 999 };
          mockMode = true;
        }

        const streamUrl = `http://${LOCAL_IP}:8000/stream.mp3`;
        addLog(`Attempting to cast ${streamUrl} to ${chromecast}...`);
        
        // mkchromecast flags:
        // -n: Name of the chromecast
        // -u: Source URL
        // -c: Codec
        mkChromecastProcess = spawnProcess("mkchromecast", [
          "--name", chromecast,
          "--source-url", streamUrl,
          "-c", "mp3"
        ], "Cast");

        setTimeout(() => {
          if (!mkChromecastProcess || !mkChromecastProcess.pid) {
            addLog("DASHBOARD: Simulating Cast process (Chromecast tools not found)");
            mkChromecastProcess = { kill: () => {}, pid: 1000 };
          }
        }, 1500);
      }, 3000);

      res.json({ success: true, mock: mockMode, streamUrl: `http://${LOCAL_IP}:8000/stream.mp3` });
    } catch (error) {
      addLog(`Failed to start stream: ${error}`);
      res.status(500).json({ error: "Failed to start stream" });
    }
  });

  app.post("/api/stream/stop", (req, res) => {
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
    res.json({ success: true });
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
