/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Cast, 
  Settings, 
  Activity, 
  Play, 
  Square, 
  Terminal, 
  Info, 
  RefreshCw,
  Maximize,
  Minimize,
  VolumeX,
  Volume1,
  Volume2,
  Clock,
  Eye,
  EyeOff,
  Tv,
  Cpu,
  Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Device {
  id: string;
  name: string;
  type?: 'hardware' | 'mock' | 'fallback';
}

interface Status {
  streaming: boolean;
  casting: boolean;
  castStatus?: 'idle' | 'connecting' | 'connected' | 'error';
  icecast: boolean;
  mock?: boolean;
  uptimeMinutes?: number;
  localIp?: string;
}

interface StreamSettings {
  device: string;
  icecastHost: string;
  icecastPort: string;
  icecastSourcePass: string;
  icecastAdminPass: string;
  icecastMount: string;
  bitrate: string;
  sampleRate: string;
}

export default function App() {
  const [status, setStatus] = useState<Status>({ streaming: false, casting: false, icecast: true, mock: false });
  const [devices, setDevices] = useState<Device[]>([]);
  const [chromecasts, setChromecasts] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<StreamSettings>({
    device: "hw:1,0",
    icecastHost: "localhost",
    icecastPort: "8000",
    icecastSourcePass: "hackme",
    icecastAdminPass: "hackme",
    icecastMount: "/stream.mp3",
    bitrate: "320",
    sampleRate: "44100"
  });
  const [isLowPerf, setIsLowPerf] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [showPasswords, setShowPasswords] = useState({ source: false, admin: false });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState({ devices: false, casting: false, action: false });
  const [notification, setNotification] = useState<{message: string, type: 'info' | 'success'} | null>(null);
  const [criticalError, setCriticalError] = useState<{message: string, tip: string} | null>(null);
  const [showScreensaver, setShowScreensaver] = useState(false);
  const inactiveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [deviceFlash, setDeviceFlash] = useState(false);
  const [receiverFlash, setReceiverFlash] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'info' | 'success' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);
  
  const [config, setConfig] = useState({
    device: '',
    chromecast: '',
    password: 'hackme',
    bitrate: 192
  });

  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStatus();
    fetchDevices();
    fetchChromecasts();
    fetchLogs();
    fetchSettings();
    
    const statusInterval = setInterval(fetchStatus, 3000);
    const logsInterval = setInterval(fetchLogs, 4000);
    
    return () => {
      clearInterval(statusInterval);
      clearInterval(logsInterval);
    };
  }, []);

  const resetInactiveTimer = () => {
    if (inactiveTimerRef.current) clearTimeout(inactiveTimerRef.current);
    setShowScreensaver(false);
    
    // Only set timer if NOT streaming
    if (!status.streaming) {
      inactiveTimerRef.current = setTimeout(() => {
        setShowScreensaver(true);
      }, 5 * 60 * 1000); // 5 minutes
    }
  };

  useEffect(() => {
    const handleInteraction = () => resetInactiveTimer();
    window.addEventListener('mousemove', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('mousedown', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    window.addEventListener('scroll', handleInteraction);

    resetInactiveTimer();

    return () => {
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('scroll', handleInteraction);
      if (inactiveTimerRef.current) clearTimeout(inactiveTimerRef.current);
    };
  }, [status.streaming]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        if (!config.device) setConfig(prev => ({ ...prev, device: data.device }));
      }
    } catch (e) {
      console.error('Settings fetch failed', e);
    }
  };

  const saveSettings = async (newSettings: StreamSettings) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        showToast("Settings Saved", 'info');
        setShowSettings(false);
        fetchSettings();
      }
    } catch (e) {
      console.error('Settings save failed', e);
    }
  };

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) {
        if (res.status === 404) {
          console.error("Status check failed: 404 Not Found at /api/status. Check server routes.");
        }
        throw new Error(`Status HTTP error! status: ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        const snippet = text.substring(0, 200);
        console.error("Status: Not a JSON response. Ensure you've pulled latest server changes. Received:", snippet);
        
        // If it looks like HTML, it's likely the SPA fallback
        if (snippet.trim().toLowerCase().startsWith('<!doctype html>')) {
          setLogs(prev => [...prev.slice(-100), `[UI ERROR] API returned HTML. Check server routes or restart.`]);
        }
        
        throw new TypeError("Status: Not a JSON response");
      }
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      if (e instanceof Error && e.name === 'TypeError' && e.message === 'Failed to fetch') {
        return;
      }
      console.error('Status fetch failed', e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (!res.ok) {
        throw new Error(`Logs HTTP error! status: ${res.status}`);
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Logs: Not a JSON response. Ensure you've pulled latest server changes. Received:", text.substring(0, 100));
        throw new TypeError("Logs: Not a JSON response");
      }
      const data = await res.json();
      if (data && Array.isArray(data.logs)) {
        setLogs(data.logs);
        
        // Scan for critical errors
        const latestCritical = [...data.logs].reverse().find((l: string) => l.includes("CRITICAL"));
        if (latestCritical) {
          const msg = latestCritical.split("CRITICAL")[1].split(".")[0].trim();
          const tip = data.logs.find((l: string, idx: number, arr: string[]) => 
            idx > data.logs.indexOf(latestCritical) && l.includes("TIP")
          )?.split("TIP:")[1] || "Check your connections and expert settings.";
          
          setCriticalError({ message: msg, tip });
        } else {
          setCriticalError(null);
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'TypeError' && e.message === 'Failed to fetch') {
        // Quietly fail for network glitches during dev
        return;
      }
      console.error('Logs fetch failed:', e);
    }
  };

  const fetchDevices = async () => {
    setLoading(prev => ({ ...prev, devices: true }));
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      setDevices(data);
      if (data.length > 0 && !config.device) {
        setConfig(prev => ({ ...prev, device: data[0].id }));
      }
    } finally {
      setLoading(prev => ({ ...prev, devices: false }));
    }
  };

  const fetchChromecasts = async () => {
    setLoading(prev => ({ ...prev, casting: true }));
    try {
      const res = await fetch('/api/chromecasts');
      const data = await res.json();
      setChromecasts(data);
      if (data.length > 0 && !config.chromecast) {
        setConfig(prev => ({ ...prev, chromecast: data[0] }));
      }
    } finally {
      setLoading(prev => ({ ...prev, casting: false }));
    }
  };

  const runIcecastSetup = async () => {
    try {
      setLoading(prev => ({ ...prev, action: true }));
      const res = await fetch('/api/setup/icecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePass: settings.icecastSourcePass,
          adminPass: settings.icecastAdminPass,
          port: settings.icecastPort
        })
      });
      if (res.ok) {
        showToast("Icecast Re-configured!", 'success');
      } else {
        const err = await res.json();
        showToast(`Setup Failed: ${err.error}`, 'info');
      }
    } catch (e) {
      showToast("Network error during setup", 'info');
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  const runSystemSetup = async () => {
    if (!confirm("This will reinstall system packages and drivers. Continue?")) return;
    
    try {
      setLoading(prev => ({ ...prev, action: true }));
      const res = await fetch('/api/setup/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePass: settings.icecastSourcePass,
          adminPass: settings.icecastAdminPass
        })
      });
      if (res.ok) {
        showToast("System Installer Started", 'success');
        setShowLogs(true); // Show logs to see progress
      }
    } catch (e) {
      showToast("Failed to launch installer", 'info');
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  const toggleStream = async () => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      if (status.streaming || status.casting) {
        await fetch('/api/stream/stop', { method: 'POST' });
      } else {
        await fetch('/api/stream/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
      }
      fetchStatus();
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`bg-[var(--bg)] flex flex-col overflow-hidden transition-all duration-500 ${
        isFullscreen ? 'w-screen h-screen' : 'w-full max-w-[800px] h-full sm:h-[480px] mx-auto border border-[var(--border)] shadow-2xl rounded-xl sm:m-4'
      }`}
    >
      {/* Top Navigation Bar */}
      <nav className="h-10 border-b border-[var(--border)] bg-[var(--card)] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-gradient-to-br from-pink-500 to-violet-600 rounded flex items-center justify-center shadow-[0_0_10px_rgba(236,72,153,0.5)]">
            <Radio className="text-white w-4 h-4" />
          </div>
          <h1 className="text-xs font-black italic tracking-widest text-[var(--accent)] uppercase">7B Records Control</h1>
          {status.mock && <span className="text-[8px] px-1 border border-cyan-500/50 text-cyan-400 font-bold rounded">MOCK</span>}
          {status.localIp && <span className="text-[9px] font-mono text-white/40 ml-2 tracking-tighter">IP: {status.localIp}</span>}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <StatusIndicator label="ICE" active={status.icecast} color="cyan" />
            <StatusIndicator label="ENC" active={status.streaming} color="pink" />
            <StatusIndicator 
              label="CAST" 
              active={status.casting} 
              color={status.castStatus === 'error' ? 'pink' : status.castStatus === 'connecting' ? 'cyan' : 'cyan'} 
              pulse={status.castStatus === 'connecting'}
            />
          </div>
          <div className="h-4 w-px bg-[var(--border)] mx-1" />
          <button
            onClick={() => setShowScreensaver(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded border border-white/10 transition-all text-[9px] font-black uppercase tracking-widest mr-1 active:scale-95"
            title="Show Screensaver"
          >
            <Tv className="w-3 h-3" />
            Sleep
          </button>
          <button 
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-2.5 hover:bg-white/5 rounded transition-colors text-[var(--ink-secondary)] active:bg-white/10"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 hover:bg-white/5 rounded transition-colors text-[var(--ink-secondary)] active:bg-white/10"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {criticalError && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-500/90 text-white px-4 py-2 flex items-center gap-4 border-b border-red-400 relative z-50 shadow-lg overflow-hidden shrink-0"
          >
             <div className="w-2 h-2 bg-white rounded-full animate-ping" />
             <div className="flex-grow">
                <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5">Hardware / Stream Error Detected</p>
                <p className="text-[11px] font-medium text-white/90 italic tracking-tight">{criticalError.message}</p>
             </div>
             <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded border border-white/10 max-w-[40%]">
                <Info className="w-3 h-3 text-white/70" />
                <p className="text-[9px] font-bold text-white/80 leading-tight uppercase font-mono tracking-tighter">{criticalError.tip}</p>
             </div>
             <button 
               onClick={() => setShowLogs(true)}
               className="bg-white text-red-600 px-3 py-1 rounded-sm text-[9px] font-black uppercase tracking-widest hover:bg-red-50 transition-colors"
             >
               View Logs
             </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid Content */}
      <div className="flex-grow flex flex-col sm:flex-row overflow-hidden">
        {/* Sidebar Controls */}
        <aside className="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-[var(--border)] bg-[var(--card)]/50 p-4 flex flex-col gap-4 overflow-y-auto">
          <section className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[9px] font-bold text-pink-400 uppercase tracking-tighter">Input Deck</label>
                <div className="flex items-center gap-2">
                  {loading.devices && <RefreshCw className="w-2.5 h-2.5 animate-spin text-pink-400/70" />}
                  <div className={`w-1 h-1 rounded-full ${loading.devices ? 'bg-pink-500 animate-pulse' : 'bg-transparent'}`} />
                </div>
              </div>
              
              {/* Hardware Warning Alert */}
              {!loading.devices && devices.filter(d => d.type === 'hardware').length === 0 && (
                <div className="mb-2 p-1.5 bg-amber-500/10 border border-amber-500/30 rounded flex items-center gap-2">
                  <VolumeX className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="text-[8px] text-amber-200 leading-tight">
                    NO HARDWARE DETECTED. Connect a USB audio interface or check permissions.
                  </span>
                </div>
              )}

              <select 
                value={config.device}
                onChange={(e) => {
                  const deviceId = e.target.value;
                  const selectedDevice = devices.find(d => d.id === deviceId);
                  const deviceName = selectedDevice?.name || deviceId;
                  setConfig({ ...config, device: deviceId });
                  
                  // Flash feedback
                  setDeviceFlash(true);
                  setTimeout(() => setDeviceFlash(false), 600);
                  
                  if (selectedDevice?.type === 'mock') {
                    showToast(`Mode: Testing with Mock Audio`, 'info');
                  } else if (deviceId) {
                    showToast(`Input linked: ${deviceName.substring(0, 15)}...`);
                  }
                }}
                disabled={loading.devices}
                className={`w-full bg-[var(--panel)] border rounded px-3 py-2.5 text-[11px] text-white focus:outline-none focus:ring-1 transition-all font-mono disabled:opacity-50 appearance-none cursor-pointer active:bg-white/5 ${
                  deviceFlash ? 'ring-2 ring-pink-500 bg-pink-500/10' : ''
                } ${
                  devices.find(d => d.id === config.device)?.type === 'mock' 
                    ? 'border-cyan-500/50 shadow-[0_0_8px_rgba(34,211,238,0.2)]' 
                    : 'border-[var(--border)] focus:border-pink-500 focus:ring-pink-500/30'
                }`}
              >
                <option value="">{loading.devices ? 'Scanning devices...' : 'Select input device'}</option>
                {!loading.devices && devices.length === 0 && <option disabled>No devices found</option>}
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.name.substring(0, 18)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-cyan-400 uppercase tracking-tighter mb-1.5">Stream Quality</label>
              <select 
                value={config.bitrate}
                onChange={(e) => setConfig({ ...config, bitrate: parseInt(e.target.value) })}
                className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-3 py-2.5 text-[11px] text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono appearance-none cursor-pointer active:bg-white/5"
              >
                <option value="96">96 kbps (Low)</option>
                <option value="128">128 kbps (Mid)</option>
                <option value="192">192 kbps (High)</option>
                <option value="256">256 kbps (Studio)</option>
                <option value="320">320 kbps (Lossless Sim)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[9px] font-bold text-pink-400 uppercase tracking-tighter">Target Receiver</label>
                <div className="flex items-center gap-2">
                  {status.casting && (
                    <span className={`text-[8px] font-bold tracking-tighter ${
                      status.castStatus === 'connected' ? 'text-green-400' : 
                      status.castStatus === 'connecting' ? 'text-cyan-400 animate-pulse' : 
                      status.castStatus === 'error' ? 'text-red-400' : 'text-white/40'
                    }`}>
                      {status.castStatus?.toUpperCase() || 'OFFLINE'}
                    </span>
                  )}
                  {loading.casting && <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-400/70" />}
                  <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); fetchChromecasts(); }}
                    disabled={loading.casting}
                    className="text-[8px] font-bold text-cyan-400 hover:text-cyan-300 disabled:opacity-50 transition-colors uppercase flex items-center gap-1 bg-cyan-400/10 px-1.5 py-0.5 rounded border border-cyan-400/20"
                  >
                    <RefreshCw className={`w-2 h-2 ${loading.casting ? 'animate-spin' : ''}`} /> {loading.casting ? 'Scanning...' : 'Refresh'}
                  </button>
                </div>
              </div>
              <select 
                value={config.chromecast}
                onChange={(e) => {
                  const val = e.target.value;
                  setConfig({ ...config, chromecast: val });
                  
                  // Flash feedback
                  setReceiverFlash(true);
                  setTimeout(() => setReceiverFlash(false), 600);
                  
                  if (val) showToast(`Output target set to ${val.substring(0, 15)}...`);
                }}
                disabled={loading.casting}
                className={`w-full bg-[var(--panel)] border border-[var(--border)] rounded px-3 py-2.5 text-[11px] text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono disabled:opacity-50 appearance-none cursor-pointer active:bg-white/5 ${
                  receiverFlash ? 'ring-2 ring-cyan-500 bg-cyan-500/10' : ''
                }`}
              >
                <option value="">{loading.casting ? 'Searching for devices...' : 'Select receiver'}</option>
                {chromecasts.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Volume Control */}
          <section className="bg-[var(--panel)] p-3 rounded-lg border border-[var(--border)]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] font-bold text-[var(--ink-secondary)] uppercase">Volume</span>
              <span className="text-[10px] font-mono text-pink-400">{isMuted ? 'MUTED' : `${volume}%`}</span>
            </div>
            <div className="flex items-center gap-4 py-1">
              <button 
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`p-2.5 rounded transition-colors active:scale-90 ${isMuted ? 'bg-red-500/20 text-red-500' : 'text-pink-500 hover:bg-pink-500/10'}`}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume1 className="w-5 h-5" />}
              </button>
              <div className="flex-grow flex items-center h-8">
                <input 
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(parseInt(e.target.value))}
                  className="w-full accent-pink-500 h-2 bg-black/40 rounded-full cursor-pointer touch-none"
                />
              </div>
            </div>
          </section>

          <footer className="mt-auto space-y-2">
            <button 
              type="button"
              onClick={(e) => { e.preventDefault(); toggleStream(); }}
              disabled={loading.action}
              className={`w-full py-3.5 rounded font-black text-xs tracking-[0.2em] transition-all flex items-center justify-center gap-2 group active:scale-[0.98] ${
                status.streaming 
                  ? 'bg-transparent border border-red-500 text-red-500 hover:bg-red-500 hover:text-white' 
                  : (loading.action ? 'bg-pink-800' : 'bg-pink-600') + ' border border-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)] hover:shadow-[0_0_25px_rgba(236,72,153,0.6)]'
              } ${loading.action ? 'opacity-80 cursor-wait' : ''}`}
            >
              {loading.action ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> {status.streaming ? 'STOPPING...' : 'STARTING...'}</>
              ) : status.streaming ? (
                <><Square className="w-4 h-4 fill-current" /> STOP SESSION</>
              ) : (
                <><Play className="w-4 h-4 fill-current" /> GO LIVE</>
              )}
            </button>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => setShowLogs(!showLogs)}
                className="flex-grow py-2 bg-[var(--panel)] border border-[var(--border)] rounded text-[9px] font-bold text-[var(--ink-secondary)] flex items-center justify-center gap-1.5 hover:bg-white/5"
              >
                <Terminal className="w-3 h-3" /> LOGS
              </button>
              <div className="px-3 py-2 bg-[var(--panel)] border border-[var(--border)] rounded flex items-center justify-center">
                 <div className={`w-1.5 h-1.5 rounded-full ${status.icecast ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)]' : 'bg-white/10'}`} />
              </div>
            </div>
          </footer>
        </aside>

        {/* Center Canvas Area */}
        <main className="flex-grow relative flex items-center justify-center bg-black/20 overflow-hidden">
          {/* Animated Matrix Background */}
          {!isLowPerf && (
            <div className="absolute inset-0 pointer-events-none opacity-20">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
            </div>
          )}

          <div className="relative group">
             <CircularVisualizer 
               spinning={status.streaming} 
               armActive={status.casting ? status.castStatus === 'connected' : status.streaming} 
               lowPerf={isLowPerf}
             />
             
             {/* Dynamic Status Overlay */}
             <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 shadow-2xl">
                   <Activity className={`w-3 h-3 ${status.streaming ? 'text-pink-500 animate-pulse' : 'text-white/20'}`} />
                   <span className="text-[9px] font-mono font-bold tracking-tight text-white/80">
                     {status.streaming ? 'BROADCASTING AT 192KBPS' : 'IDLE'}
                   </span>
                </div>
             </div>
          </div>

          {/* Persistent Stats (Right Side Overlay) */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <div className="bg-black/40 backdrop-blur-md p-3 rounded-lg border border-white/5 min-w-[120px] shadow-lg">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span className="text-[8px] font-black text-cyan-400/50 uppercase tracking-widest">Broadcast Time</span>
              </div>
              <div className="text-xl font-mono font-bold text-white tracking-tighter tabular-nums">
                {status.uptimeMinutes || 0}<span className="text-[10px] font-sans text-[var(--ink-secondary)] ml-1">MIN</span>
              </div>
            </div>
          </div>

          {/* Target Info */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-0.5">
            <span className="text-[8px] font-bold text-pink-500/50 uppercase tracking-widest leading-none">Output Path</span>
            <span className="text-[10px] font-mono text-pink-400 font-bold tracking-tight">
              {config.chromecast || 'UNLINKED_DECK'}
            </span>
          </div>

          {/* Desktop Icon */}
          <div className="absolute top-20 left-8 z-20">
             <motion.button
               onDoubleClick={async () => {
                 if (status.streaming) {
                   showToast("Stream is already live", 'info');
                   return;
                 }
                 
                 showToast("Pre-flight Verification...", 'info');
                 try {
                   const res = await fetch('/api/verify');
                   const data = await res.json();
                   
                   if (data.success) {
                     const { results } = data;
                     if (!results.icecast) {
                       showToast("Icecast Offline - Attempting start", 'info');
                       await fetch('/api/setup/icecast', { 
                         method: 'POST', 
                         body: JSON.stringify(settings), 
                         headers: {'Content-Type': 'application/json'} 
                       });
                     }
                     
                     if (!results.hardware) {
                       showToast("HARDWARE NOT FOUND - check connections", 'info');
                     }
                     
                     showToast("Settings Verified. Starting Core...", 'success');
                     toggleStream();
                   } else {
                     showToast("Verification Failed", 'info');
                     setShowSettings(true);
                   }
                 } catch (e) {
                   showToast("Verification Error", 'info');
                 }
               }}
               whileHover={{ scale: 1.1 }}
               whileTap={{ scale: 0.95 }}
               className="flex flex-col items-center gap-2 group cursor-pointer text-left"
             >
                <div className="w-14 h-14 bg-black/50 border border-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md group-hover:border-cyan-500/50 group-hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all shadow-xl">
                  <Wrench className="w-6 h-6 text-white/30 group-hover:text-cyan-400 transition-colors" />
                </div>
                <div className="space-y-0.5 px-1">
                   <div className="text-[9px] font-black text-white uppercase tracking-widest group-hover:text-cyan-400 transition-colors leading-none">
                      Launch Core
                   </div>
                   <div className="text-[7px] text-white/20 font-mono uppercase tracking-tighter leading-none">
                      Double Click to Start
                   </div>
                </div>
             </motion.button>
          </div>

          {/* Modal Logs Overlay */}
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-4 z-[60] bg-[#050506]/95 backdrop-blur-xl border border-cyan-500/30 rounded-xl flex flex-col overflow-hidden shadow-[0_0_50px_rgba(34,211,238,0.2)]"
              >
                <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-cyan-400/5">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-cyan-400" />
                    <span className="text-[10px] font-black tracking-widest text-white uppercase">Expert Stream Settings</span>
                  </div>
                  <button type="button" onClick={() => setShowSettings(false)} className="text-[9px] font-bold text-white/50 hover:text-white transition-colors">CLOSE</button>
                </div>
                
                <div className="flex-grow overflow-y-auto p-6 space-y-6">
                   <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Audio Hardware</h3>
                        <div className="space-y-2">
                           <label className="block text-[8px] font-bold text-white/40 uppercase">ALSA Input Device Path</label>
                           <input 
                              type="text" 
                              value={settings.device}
                              onChange={(e) => setSettings({...settings, device: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-white focus:border-cyan-500 transition-colors"
                              placeholder="e.g. hw:1,0"
                           />
                           <p className="text-[7px] text-white/30 italic">Standard USB audio cards are usually hw:1,0 or hw:2,0</p>
                        </div>
                        <div className="space-y-2">
                           <label className="block text-[8px] font-bold text-white/40 uppercase">Sample Rate (Hz)</label>
                           <select 
                              value={settings.sampleRate}
                              onChange={(e) => setSettings({...settings, sampleRate: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-white focus:border-cyan-500 transition-colors"
                           >
                              <option value="44100">44100 (Standard)</option>
                              <option value="48000">48000 (HD Audio)</option>
                           </select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-pink-500 uppercase tracking-widest">Icecast Server</h3>
                        <div className="grid grid-cols-2 gap-3">
                           <div className="space-y-2">
                              <label className="block text-[8px] font-bold text-white/40 uppercase">Host</label>
                              <input 
                                 type="text" 
                                 value={settings.icecastHost}
                                 onChange={(e) => setSettings({...settings, icecastHost: e.target.value})}
                                 className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-white focus:border-pink-500 transition-colors"
                              />
                           </div>
                           <div className="space-y-2">
                              <label className="block text-[8px] font-bold text-white/40 uppercase">Port</label>
                              <input 
                                 type="text" 
                                 value={settings.icecastPort}
                                 onChange={(e) => setSettings({...settings, icecastPort: e.target.value})}
                                 className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-white focus:border-pink-500 transition-colors"
                              />
                           </div>
                        </div>
                        <div className="space-y-2">
                           <label className="block text-[8px] font-bold text-white/40 uppercase">Mount Password (Source)</label>
                           <div className="relative">
                              <input 
                                 type={showPasswords.source ? "text" : "password"} 
                                 value={settings.icecastSourcePass}
                                 onChange={(e) => setSettings({...settings, icecastSourcePass: e.target.value})}
                                 className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-white focus:border-pink-500 transition-colors pr-10"
                              />
                              <button
                                 type="button"
                                 onClick={() => setShowPasswords(prev => ({ ...prev, source: !prev.source }))}
                                 className="absolute right-0 top-0 bottom-0 px-4 text-white/30 hover:text-white/60 transition-colors active:bg-white/5"
                              >
                                 {showPasswords.source ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                           </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                           <div className="space-y-2">
                              <label className="block text-[8px] font-bold text-white/40 uppercase">Admin Password</label>
                              <div className="relative">
                                 <input 
                                    type={showPasswords.admin ? "text" : "password"} 
                                    value={settings.icecastAdminPass}
                                    onChange={(e) => setSettings({...settings, icecastAdminPass: e.target.value})}
                                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-white focus:border-pink-500 transition-colors pr-10"
                                 />
                               <button
                                    type="button"
                                    onClick={() => setShowPasswords(prev => ({ ...prev, admin: !prev.admin }))}
                                    className="absolute right-0 top-0 bottom-0 px-4 text-white/30 hover:text-white/60 transition-colors active:bg-white/5"
                                 >
                                    {showPasswords.admin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                 </button>
                              </div>
                           </div>
                           <div className="space-y-2">
                              <label className="block text-[8px] font-bold text-white/40 uppercase">Mount Point</label>
                              <input 
                                 type="text" 
                                 value={settings.icecastMount}
                                 onChange={(e) => setSettings({...settings, icecastMount: e.target.value})}
                                 className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-white focus:border-pink-500 transition-colors"
                              />
                           </div>
                        </div>
                      </div>
                   </div>

                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">System Optimization</h3>
                      <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10">
                        <div>
                          <div className="text-[9px] font-black text-white uppercase tracking-widest">Performance Mode</div>
                          <div className="text-[7px] text-white/40 italic">Disable heavy visual effects for smoother experience on Pi/Low-perf devices</div>
                        </div>
                        <button
                          onClick={() => setIsLowPerf(!isLowPerf)}
                          className={`w-10 h-5 rounded-full transition-all relative ${isLowPerf ? 'bg-cyan-500' : 'bg-white/10'}`}
                        >
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isLowPerf ? 'left-6' : 'left-1'}`} />
                        </button>
                      </div>
                   </div>

                   <div className="space-y-4 pt-4 border-t border-white/5">
                      <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Hardware & System Orchestration</h3>
                      <div className="grid grid-cols-2 gap-4">
                         <button 
                           type="button"
                           onClick={runIcecastSetup}
                           disabled={loading.action}
                           className="flex items-center justify-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-cyan-400 disabled:opacity-50 transition-all hover:border-cyan-500/50"
                         >
                           <Wrench className="w-4 h-4" />
                           RECONFIGURE ICECAST
                         </button>
                         <button 
                           type="button"
                           onClick={runSystemSetup}
                           disabled={loading.action}
                           className="flex items-center justify-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-pink-500 disabled:opacity-50 transition-all hover:border-pink-500/50"
                         >
                           <Cpu className="w-4 h-4" />
                           RUN MASTER INSTALLER
                         </button>
                      </div>
                      <p className="text-[7px] text-white/30 italic">Use these tools if you change passwords or if the Icecast server is unreachable. Master Installer requires sudo permissions on the host.</p>
                   </div>

                   <div className="pt-6 border-t border-white/5 flex gap-4">
                      <button 
                        type="button"
                        onClick={() => saveSettings(settings)}
                        className="flex-grow bg-cyan-600 hover:bg-cyan-500 text-white py-3.5 rounded-lg font-black text-[10px] tracking-[0.2em] transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] active:scale-95"
                      >
                        APPLY EXPERT CONFIGURATION
                      </button>
                      <button 
                         type="button"
                         onClick={() => {
                           const mount = settings.icecastMount.startsWith('/') ? settings.icecastMount : `/${settings.icecastMount}`;
                           const url = `http://${status.localIp || 'localhost'}:${settings.icecastPort}${mount}`;
                           window.open(url, '_blank');
                         }}
                         className="px-6 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[9px] font-bold transition-all uppercase tracking-widest active:scale-95"
                      >
                        Test Stream
                      </button>
                      <button 
                         type="button"
                         onClick={() => {
                           const defaults = {
                            device: "hw:1,0",
                            icecastHost: "localhost",
                            icecastPort: "8000",
                            icecastSourcePass: "hackme",
                            icecastAdminPass: "hackme",
                            icecastMount: "7b_records",
                            bitrate: "320",
                            sampleRate: "44100"
                           };
                           setSettings(defaults);
                           saveSettings(defaults);
                         }}
                         className="px-6 border border-white/10 text-white/40 hover:text-white rounded-lg text-[9px] font-bold"
                      >
                        DEFAULTS
                      </button>
                   </div>
                   
                   <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <div className="flex gap-3">
                         <Info className="w-4 h-4 text-amber-500 shrink-0" />
                         <div className="space-y-1">
                            <span className="block text-[9px] text-amber-200/70 leading-relaxed uppercase tracking-widest font-black">Troubleshooting & Tips</span>
                            <p className="text-[9px] text-amber-100/50 leading-relaxed font-mono">
                                • Incorrect Mount Password: Check <code className="text-white">setup_icecast.sh</code> output.<br/>
                                • Busy Hardware: Unplug and replug your USB audio interface.<br/>
                                • Silent Stream: Ensure your source (turntable) is playing and volume is up.
                            </p>
                         </div>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}

            {showLogs && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-4 z-50 bg-[#050506]/95 backdrop-blur-xl border border-pink-500/30 rounded-xl flex flex-col overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]"
              >
                <div className="px-4 py-2 border-b border-white/10 flex justify-between items-center bg-white/5">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3 h-3 text-pink-500" />
                    <span className="text-[9px] font-black tracking-widest text-white uppercase">System Debug Console</span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <a 
                      href="/api/logs/download" 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] font-black tracking-widest text-cyan-400 hover:text-white transition-colors uppercase border border-cyan-400/20 px-2 py-1 rounded bg-cyan-400/5"
                    >
                      Download Full Log File
                    </a>
                    <button type="button" onClick={() => setShowLogs(false)} className="text-[9px] font-bold text-pink-500 hover:text-white transition-colors">CLOSE</button>
                  </div>
                </div>
                <div className="flex-grow overflow-y-auto p-4 font-mono text-[9px] space-y-1">
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-3 text-white/50">
                      <span className="text-cyan-500 shrink-0">{log.split(']')[0]}]</span>
                      <span className="truncate">{log.split(']')[1]}</span>
                    </div>
                  ))}
                  <div ref={consoleEndRef} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Mini Retro CRT scanlines effect */}
      {!isLowPerf && (
        <div className="absolute inset-0 pointer-events-none z-[100] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[size:100%_4px,3px_100%] opacity-30" />
      )}

      {/* Toast Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={`absolute bottom-6 right-6 z-[200] px-4 py-2 rounded-lg border backdrop-blur-md shadow-2xl flex items-center gap-3 ${
              notification.type === 'success' 
                ? 'bg-pink-500/20 border-pink-500/50 text-pink-400' 
                : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${notification.type === 'success' ? 'bg-pink-500' : 'bg-cyan-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screensaver Overlay */}
      <AnimatePresence>
        {showScreensaver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="fixed inset-0 z-[500] bg-black flex flex-col items-center justify-center cursor-none pointer-events-auto"
            onClick={() => setShowScreensaver(false)}
          >
             <motion.div
               animate={!isLowPerf ? { 
                 x: [10, -10, 10, -10, 10],
                 y: [10, 10, -10, -10, 10],
               } : {}}
               transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
               className="flex flex-col items-center gap-6"
             >
                <div className={`w-24 h-24 bg-gradient-to-br from-pink-500 to-violet-600 rounded-full flex items-center justify-center border border-white/20 ${!isLowPerf ? 'shadow-[0_0_50px_rgba(236,72,153,0.3)]' : ''}`}>
                   <Radio className="text-white w-12 h-12" />
                </div>
                <div className="text-center space-y-2">
                   <h2 className="text-2xl font-black italic tracking-[0.3em] text-white uppercase bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-cyan-500">7B RECORDS</h2>
                   <div className="text-[10px] font-mono text-white/30 uppercase tracking-[0.5em]">SYSTEM STANDBY // IDLE MODE</div>
                   <div className="pt-8 text-[40px] font-mono font-bold text-white/10 tracking-widest tabular-nums">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </div>
                </div>
             </motion.div>
             {!isLowPerf && (
               <>
                 <div className="absolute inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
                 <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent animate-pulse" />
               </>
             )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CircularVisualizer({ spinning, armActive, lowPerf = false }: { spinning: boolean, armActive: boolean, lowPerf?: boolean }) {
  return (
    <div className="relative w-[340px] h-[340px] flex items-center justify-center shrink-0 scale-[0.7] sm:scale-90 lg:scale-100">
      {/* Vinyl Record Base */}
      <motion.div
        animate={spinning ? { rotate: [0, 360] } : { rotate: 0 }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "linear" 
        }}
        className="relative w-[300px] h-[300px] rounded-full bg-black flex items-center justify-center overflow-hidden border-[6px] border-[#1a1a1a] shadow-[0_0_60px_rgba(255,0,255,0.2)]"
      >
        {/* Grooves with Synth Effect */}
        {!lowPerf && [...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full border border-pink-500/5"
            style={{
              inset: `${(i + 1) * 10 + 20}px`,
            }}
          />
        ))}

        {/* Cyber Reflection */}
        {!lowPerf && <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-500/5 to-transparent pointer-events-none" />}
        
        {/* Dynamic Inner Label */}
        <div className="relative w-[110px] h-[110px] rounded-full bg-gradient-to-br from-pink-600 to-violet-700 flex flex-col items-center justify-center shadow-inner border-[6px] border-black z-10 overflow-hidden">
          {/* Animated Pulse Pattern */}
          {spinning && !lowPerf && (
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{ duration: 1, repeat: Infinity }}
              className="absolute inset-0 bg-white/20 blur-xl"
            />
          )}
          
          {/* True Center Hole */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-black rounded-full z-20 border border-white/20" />
          
          <div className="text-[10px] font-black text-white px-2 text-center leading-none uppercase tracking-widest relative z-10 italic -translate-y-[32px]">
            7B
          </div>
          <div className="text-[8px] font-black text-white px-2 text-center leading-none uppercase tracking-tighter relative z-10 italic -translate-y-[20px]">
             RECORDS
          </div>
          <div className="text-[6px] font-black text-cyan-300 mt-0 uppercase tracking-widest relative z-10 translate-y-4">CORE_V2.7</div>
        </div>
      </motion.div>

      {/* Tone Arm / Needle (Cyberpunk Styled) */}
      <motion.div
        initial={{ rotate: -45 }}
        animate={armActive ? { rotate: 28 } : { rotate: -45 }}
        transition={{ type: "spring", stiffness: 35, damping: 12 }}
        className="absolute top-[-30px] right-[-30px] w-12 h-[320px] origin-top-right z-30 pointer-events-none"
      >
        {/* Arm Pivot Base */}
        <div className="absolute top-0 right-0 w-14 h-14 rounded-xl bg-[#240b45] border border-pink-500/30 shadow-[0_0_20px_rgba(236,72,153,0.2)] flex items-center justify-center transform translate-x-4 translate-y-4">
            <div className="w-8 h-8 rounded-lg bg-pink-500/20 border border-pink-500/50 shadow-inner" />
        </div>

        {/* Arm Tube */}
        <div className="w-1.5 h-full bg-gradient-to-r from-pink-500 to-violet-600 rounded-full shadow-[0_0_20px_rgba(236,72,153,0.4)] relative ml-auto mr-12 mt-8">
          {/* Head Shell & Stylus */}
          <div className="absolute bottom-0 left-[-12px] w-12 h-16 bg-[#1a0832] rounded-lg shadow-2xl transform rotate-[25deg] flex flex-col items-center pt-3 border border-cyan-500/40">
             <div className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_12px_rgba(34,211,238,1)] animate-pulse" />
             <div className="mt-3 w-0.5 h-5 bg-gradient-to-b from-pink-500 to-transparent rounded-full" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function StatusIndicator({ label, active, color = 'pink', pulse = false }: { label: string, active: boolean, color?: 'pink' | 'cyan', pulse?: boolean }) {
  const activeColor = color === 'pink' ? 'bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.8)]' : 'bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.8)]';
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-black/40 rounded-md border border-white/10">
      <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${active ? activeColor : 'bg-white/10'} ${pulse ? 'animate-pulse' : ''}`} />
      <span className={`text-[8px] font-black tracking-widest ${active ? 'text-white' : 'text-white/20'}`}>
        {label}
      </span>
    </div>
  );
}

function MetricCard({ icon, title, value, color = 'pink' }: { icon: React.ReactNode, title: string, value: string, color?: string }) {
  return (
    <div className="bg-[var(--panel)] p-2 rounded-lg border border-[var(--border)] flex items-center gap-3">
      <div className={`p-1.5 rounded-md ${color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-pink-500/10 text-pink-500'}`}>
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: 'w-3.5 h-3.5' }) : icon}
      </div>
      <div>
        <div className="text-[7px] font-black text-[var(--ink-secondary)] uppercase tracking-[0.1em] leading-none mb-1">{title}</div>
        <div className="text-sm font-mono font-bold tracking-tighter leading-none text-white">{value}</div>
      </div>
    </div>
  );
}
