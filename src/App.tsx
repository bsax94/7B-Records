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
  MessageSquare,
  Clock
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

export default function App() {
  const [status, setStatus] = useState<Status>({ streaming: false, casting: false, icecast: true, mock: false });
  const [devices, setDevices] = useState<Device[]>([]);
  const [chromecasts, setChromecasts] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState({ devices: false, casting: false, action: false });
  const [notification, setNotification] = useState<{message: string, type: 'info' | 'success'} | null>(null);
  
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
    
    const statusInterval = setInterval(fetchStatus, 3000);
    const logsInterval = setInterval(fetchLogs, 4000);
    
    return () => {
      clearInterval(statusInterval);
      clearInterval(logsInterval);
    };
  }, []);

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
        isFullscreen ? 'w-screen h-screen' : 'w-[800px] h-[480px] mx-auto border border-[var(--border)] shadow-2xl rounded-xl m-4'
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
            onClick={toggleFullscreen}
            className="p-1.5 hover:bg-white/5 rounded transition-colors text-[var(--ink-secondary)]"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* Main Grid Content */}
      <div className="flex-grow flex overflow-hidden">
        {/* Sidebar Controls */}
        <aside className="w-56 border-r border-[var(--border)] bg-[var(--card)]/50 p-4 flex flex-col gap-4">
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
                  
                  if (selectedDevice?.type === 'mock') {
                    showToast(`Mode: Testing with Mock Audio`, 'info');
                  } else if (deviceId) {
                    showToast(`Input linked: ${deviceName.substring(0, 15)}...`);
                  }
                }}
                disabled={loading.devices}
                className={`w-full bg-[var(--panel)] border rounded px-2 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 transition-all font-mono disabled:opacity-50 ${
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
                className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono"
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
                    onClick={fetchChromecasts}
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
                  if (val) showToast(`Output target set to ${val.substring(0, 15)}...`);
                }}
                disabled={loading.casting}
                className="w-full bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono disabled:opacity-50"
              >
                <option value="">{loading.casting ? 'Searching for devices...' : 'Select receiver'}</option>
                {chromecasts.map(c => (
                  <option key={c} value={c}>{c.substring(0, 18)}</option>
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
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`p-1.5 rounded transition-colors ${isMuted ? 'bg-red-500/20 text-red-500' : 'text-pink-500 hover:bg-pink-500/10'}`}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume1 className="w-4 h-4" />}
              </button>
              <input 
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                className="flex-grow accent-pink-500 h-1 bg-black/40 rounded-full"
              />
            </div>
          </section>

          <footer className="mt-auto space-y-2">
            <button 
              onClick={toggleStream}
              disabled={loading.action}
              className={`w-full py-2.5 rounded font-black text-xs tracking-[0.2em] transition-all flex items-center justify-center gap-2 group ${
                status.streaming 
                  ? 'bg-transparent border border-red-500 text-red-500 hover:bg-red-500 hover:text-white' 
                  : (loading.action ? 'bg-pink-800' : 'bg-pink-600') + ' border border-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)] hover:shadow-[0_0_25px_rgba(236,72,153,0.6)] hover:scale-[1.02]'
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
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
          </div>

          <div className="relative group">
             <CircularVisualizer active={status.streaming} />
             
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

          {/* Modal Logs Overlay */}
          <AnimatePresence>
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
                    <button onClick={() => setShowLogs(false)} className="text-[9px] font-bold text-pink-500 hover:text-white transition-colors">CLOSE</button>
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
      <div className="absolute inset-0 pointer-events-none z-[100] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[size:100%_4px,3px_100%] opacity-30" />

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
    </div>
  );
}

function CircularVisualizer({ active }: { active: boolean }) {
  return (
    <div className="relative w-[340px] h-[340px] flex items-center justify-center shrink-0 scale-90 sm:scale-100">
      {/* Vinyl Record Base */}
      <motion.div
        animate={active ? { rotate: [0, 360] } : { rotate: 0 }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "linear" 
        }}
        className="relative w-[300px] h-[300px] rounded-full bg-black flex items-center justify-center overflow-hidden border-[6px] border-[#1a1a1a] shadow-[0_0_60px_rgba(255,0,255,0.2)]"
      >
        {/* Grooves with Synth Effect */}
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full border border-pink-500/5"
            style={{
              inset: `${(i + 1) * 10 + 20}px`,
            }}
          />
        ))}

        {/* Cyber Reflection */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-500/5 to-transparent pointer-events-none" />
        
        {/* Dynamic Inner Label */}
        <div className="relative w-[110px] h-[110px] rounded-full bg-gradient-to-br from-pink-600 to-violet-700 flex flex-col items-center justify-center shadow-inner border-[6px] border-black z-10 overflow-hidden">
          {/* Animated Pulse Pattern */}
          {active && (
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
          
          <div className="text-[10px] font-black text-white px-2 text-center leading-none uppercase tracking-widest relative z-10 italic -translate-y-[26px]">
            7B
          </div>
          <div className="text-[8px] font-black text-white px-2 text-center leading-none uppercase tracking-tighter relative z-10 italic -translate-y-[22px]">
            RECORDS
          </div>
          <div className="text-[6px] font-black text-cyan-300 mt-0 uppercase tracking-widest relative z-10 translate-y-4">CORE_V0.3</div>
        </div>
      </motion.div>

      {/* Tone Arm / Needle (Cyberpunk Styled) */}
      <motion.div
        initial={{ rotate: -45 }}
        animate={active ? { rotate: 28 } : { rotate: -45 }}
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
