import React from 'react'
import { useState, useEffect, useRef, useCallback } from "react";

const MISSIONS = [
  { id: "shower", label: "Mandi", emoji: "🚿", target: "handuk", hint: "Foto handukmu!", prompt: "Does this photo show a towel or bathroom item?" },
  { id: "study", label: "Belajar", emoji: "📚", target: "buku", hint: "Foto buku atau meja belajarmu!", prompt: "Does this photo show a book, notebook, or study desk?" },
  { id: "workout", label: "Olahraga", emoji: "🏃", target: "sepatu olahraga", hint: "Foto sepatu olahraga atau alat fitness!", prompt: "Does this photo show sports shoes, gym equipment, or workout gear?" },
  { id: "eat", label: "Makan", emoji: "🍽️", target: "piring makanan", hint: "Foto makananmu!", prompt: "Does this photo show food, a meal, or a plate?" },
  { id: "sleep", label: "Tidur", emoji: "😴", target: "bantal", hint: "Foto bantalmu!", prompt: "Does this photo show a pillow, blanket, or bed?" },
  { id: "prayer", label: "Sholat", emoji: "🕌", target: "sajadah", hint: "Foto sajadah atau tempat sholatmu!", prompt: "Does this photo show a prayer mat (sajadah) or a prayer place?" },
];

const SOUNDS = ["alarm_beep", "alarm_ring", "alarm_buzz"];

function useAlarmSound(playing) {
  const ctxRef = useRef(null);
  const intervalRef = useRef(null);

  const beep = useCallback(() => {
    try {
      if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = ctxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "square";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (playing) {
      beep();
      intervalRef.current = setInterval(beep, 800);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, beep]);
}

function AlarmRinging({ alarm, onPhotoVerified }) {
  const [camState, setCamState] = useState("idle");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [shake, setShake] = useState(false);
  const videoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useAlarmSound(camState !== "verified");

  useEffect(() => {
    const iv = setInterval(() => setShake(s => !s), 600);
    return () => clearInterval(iv);
  }, []);

  const startCamera = async () => {
    try {
      // helper to attempt getUserMedia with a given constraint
      const tryGet = async (c) => await navigator.mediaDevices.getUserMedia(c);

      // Try facingMode first, then generic
      let stream;
      try {
        stream = await tryGet({ video: { facingMode: "environment" }, audio: false });
      } catch (err1) {
        try {
          stream = await tryGet({ video: true, audio: false });
        } catch (err2) {
          // final attempt: enumerate devices and pick first videoinput
          const devices = await navigator.mediaDevices.enumerateDevices();
          const vid = devices.find(d => d.kind === 'videoinput');
          if (vid) {
            stream = await tryGet({ video: { deviceId: { exact: vid.deviceId } }, audio: false });
          } else throw err2;
        }
      }

      streamRef.current = stream;
      console.log('got stream', stream);
      if (videoRef.current) {
        const videoEl = videoRef.current;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.autoplay = true;
        videoEl.onloadedmetadata = () => {
          try {
            const p = videoEl.play();
            if (p && p.catch) p.catch(err => console.warn('video play() rejected', err));
          } catch (err) {
            console.warn('video play error', err);
          }

          const drawFrame = () => {
            const canvasEl = previewCanvasRef.current;
            if (!videoEl || !canvasEl) return;
            if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
              if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
                canvasEl.width = videoEl.videoWidth;
                canvasEl.height = videoEl.videoHeight;
              }
              const ctx = canvasEl.getContext('2d');
              ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
            }
            rafRef.current = requestAnimationFrame(drawFrame);
          };

          stopPreviewLoop();
          rafRef.current = requestAnimationFrame(drawFrame);
        };
        videoEl.srcObject = stream;
      }
      setCamState("open");
    } catch (e) {
      console.error('startCamera error', e);
      setCamState("error");
    }
  };

  const stopPreviewLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stopCamera = () => {
    stopPreviewLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

  const captureAndVerify = async () => {
    if (!previewCanvasRef.current || !canvasRef.current) return;
    const previewCanvas = previewCanvasRef.current;
    const canvas = canvasRef.current;
    canvas.width = previewCanvas.width || 640;
    canvas.height = previewCanvas.height || 480;
    canvas.getContext("2d").drawImage(previewCanvas, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];

    setVerifying(true);
    setResult(null);

    try {
      let answer = "NO";
      if (USE_MOCK) {
        await new Promise(r => setTimeout(r, 800));
        answer = Math.random() < 0.5 ? "YES" : "NO";
      } else {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
                { type: "text", text: `${alarm.mission.prompt} Answer with ONLY \"YES\" or \"NO\" and nothing else.` }
              ]
            }]
          })
        });
        const data = await res.json();
        answer = (data.content?.[0]?.text || "NO").trim().toUpperCase();
      }

      if (answer.startsWith("YES")) {
        setCamState("verified");
        setResult("success");
        stopCamera();
        setTimeout(() => onPhotoVerified(), 1200);
      } else {
        setResult("fail");
        setVerifying(false);
      }
    } catch (e) {
      setResult("error");
      setVerifying(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0a0a0a" }}>
      <div style={{
        background: result === "success" ? "#052e16" : "#1a0000",
        padding: "28px 20px 20px",
        textAlign: "center",
        transition: "background 0.5s"
      }}>
        <div style={{
          fontSize: 60,
          marginBottom: 8,
          display: "inline-block",
          transform: shake && camState !== "verified" ? "rotate(-5deg) scale(1.1)" : "rotate(5deg) scale(1)",
          transition: "transform 0.3s"
        }}>
          {result === "success" ? "✅" : alarm.mission.emoji}
        </div>
        <div style={{ fontSize: 13, color: "#ef4444", fontWeight: 700, letterSpacing: 3, marginBottom: 4 }}>
          {result === "success" ? "ALARM BERHENTI!" : "⏰ ALARM BERBUNYI"}
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, color: "white", letterSpacing: -1 }}>
          {alarm.time}
        </div>
        <div style={{ fontSize: 16, color: "#94a3b8", marginTop: 4 }}>{alarm.label}</div>
      </div>

      <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "#1e293b", borderRadius: 16, padding: "16px 18px" }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>MISI KAMU</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "white" }}>
            📸 {alarm.mission.hint}
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
            Alarm tidak akan berhenti sampai foto terverifikasi!
          </div>
        </div>

        {camState === "idle" && (
          <button onClick={startCamera} style={{
            padding: "16px", borderRadius: 14, border: "none", background: "#ef4444",
            color: "white", fontWeight: 800, fontSize: 16, cursor: "pointer",
            animation: "pulse 1s infinite"
          }}>
            📷 Buka Kamera
          </button>
        )}

        {camState === "error" && (
          <div style={{ background: "#1e293b", borderRadius: 14, padding: 16, textAlign: "center" }}>
            <div style={{ color: "#ef4444", fontSize: 14, marginBottom: 10 }}>
              Kamera tidak bisa dibuka. Izinkan akses kamera.
            </div>
            <button onClick={startCamera} style={{
              padding: "10px 20px", borderRadius: 10, border: "none",
              background: "#334155", color: "white", cursor: "pointer"
            }}>Coba Lagi</button>
          </div>
        )}

        {(camState === "open" || camState === "verified") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#000", minHeight: 200 }}>
              <canvas
                ref={previewCanvasRef}
                style={{ width: "100%", display: "block", borderRadius: 14, maxHeight: 420, objectFit: "cover", background: "black" }}
              />
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
              />
              {camState === 'open' && (
                <div style={{ position: 'absolute', right: 8, top: 8, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: 8, fontSize: 12 }}>
                  {streamRef.current ? `tracks: ${streamRef.current.getVideoTracks().length}` : 'tracks: 0'}
                </div>
              )}
              {result === "success" && (
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(34,197,94,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 60, borderRadius: 14
                }}>✅</div>
              )}
              {result === "fail" && (
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(239,68,68,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexDirection: "column", gap: 8, borderRadius: 14
                }}>
                  <span style={{ fontSize: 40 }}>❌</span>
                  <span style={{ color: "white", fontWeight: 700, fontSize: 14 }}>Bukan {alarm.mission.target}!</span>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {result !== "success" && (
              <button onClick={captureAndVerify} disabled={verifying} style={{
                padding: "16px", borderRadius: 14, border: "none",
                background: verifying ? "#334155" : "#22c55e",
                color: "white", fontWeight: 800, fontSize: 16, cursor: verifying ? "not-allowed" : "pointer"
              }}>
                {verifying ? "⏳ Memverifikasi foto..." : "📸 Foto Sekarang!"}
              </button>
            )}

            {result === "fail" && (
              <div style={{ color: "#f87171", fontSize: 13, textAlign: "center" }}>
                Coba lagi — arahkan kamera ke {alarm.mission.target}!
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }`}</style>
    </div>
  );
}

function SetAlarmScreen({ onSave, alarms }) {
  const [time, setTime] = useState("07:00");
  const [label, setLabel] = useState("Waktu mandi");
  const [mission, setMission] = useState(MISSIONS[0]);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave({ id: Date.now(), time, label, mission, active: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ textAlign: "center", paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", letterSpacing: 2 }}>BUAT ALARM BARU</div>
      </div>

      <div style={{ background: "#1e293b", borderRadius: 16, padding: "20px", textAlign: "center" }}>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          style={{
            background: "transparent", border: "none", outline: "none",
            fontSize: 52, fontWeight: 800, color: "white", textAlign: "center",
            fontFamily: "monospace", width: "100%", cursor: "pointer"
          }}
        />
      </div>

      <div style={{ background: "#1e293b", borderRadius: 16, padding: "16px" }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 8 }}>LABEL ALARM</label>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Contoh: Waktu mandi..."
          style={{
            width: "100%", background: "#0f172a", border: "1px solid #334155",
            borderRadius: 10, padding: "12px", color: "white", fontSize: 15, outline: "none"
          }}
        />
      </div>

      <div style={{ background: "#1e293b", borderRadius: 16, padding: "16px" }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 12 }}>MISI (foto apa untuk berhenti?)</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {MISSIONS.map(m => (
            <button
              key={m.id}
              onClick={() => setMission(m)}
              style={{
                padding: "12px 8px", borderRadius: 12, border: `2px solid ${mission.id === m.id ? "#3b82f6" : "#334155"}`,
                background: mission.id === m.id ? "#1d3461" : "#0f172a",
                color: "white", cursor: "pointer", textAlign: "center", transition: "all 0.2s"
              }}
            >
              <div style={{ fontSize: 24 }}>{m.emoji}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Foto {m.target}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "#1e293b", borderRadius: 14, padding: "14px 16px" }}>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>PRATINJAU MISI</div>
        <div style={{ fontSize: 15, color: "white", fontWeight: 600 }}>
          {mission.emoji} {mission.hint}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
          AI akan memverifikasi foto {mission.target} kamu
        </div>
      </div>

      <button
        onClick={handleSave}
        style={{
          padding: "16px", borderRadius: 14, border: "none",
          background: saved ? "#22c55e" : "#3b82f6",
          color: "white", fontWeight: 800, fontSize: 16, cursor: "pointer", transition: "background 0.3s"
        }}
      >
        {saved ? "✅ Alarm Tersimpan!" : "💾 Simpan Alarm"}
      </button>
    </div>
  );
}

function HomeScreen({ alarms, onDelete, onToggle, currentTime }) {
  const nextAlarm = alarms.filter(a => a.active).sort((a, b) => a.time.localeCompare(b.time))[0];

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#1e293b", borderRadius: 20, padding: "24px", textAlign: "center" }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: "white", fontFamily: "monospace", letterSpacing: 2 }}>
          {currentTime}
        </div>
        {nextAlarm ? (
          <>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>Alarm berikutnya</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6", marginTop: 4 }}>
              {nextAlarm.mission.emoji} {nextAlarm.time} — {nextAlarm.label}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>Belum ada alarm aktif</div>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, letterSpacing: 2 }}>ALARM KAMU ({alarms.length})</div>

      {alarms.length === 0 && (
        <div style={{ background: "#1e293b", borderRadius: 16, padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>⏰</div>
          <div style={{ color: "#64748b", fontSize: 14 }}>Belum ada alarm. Tap + untuk buat alarm baru!</div>
        </div>
      )}

      {alarms.map(alarm => (
        <div key={alarm.id} style={{
          background: "#1e293b", borderRadius: 16, padding: "16px 18px",
          display: "flex", alignItems: "center", gap: 14,
          opacity: alarm.active ? 1 : 0.5, transition: "opacity 0.3s"
        }}>
          <div style={{ fontSize: 32 }}>{alarm.mission.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "white", fontFamily: "monospace" }}>{alarm.time}</div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>{alarm.label}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Misi: foto {alarm.mission.target}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div
              onClick={() => onToggle(alarm.id)}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: alarm.active ? "#3b82f6" : "#334155",
                cursor: "pointer", position: "relative", transition: "background 0.3s"
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 9, background: "white",
                position: "absolute", top: 3,
                left: alarm.active ? 23 : 3, transition: "left 0.3s"
              }} />
            </div>
            <button
              onClick={() => onDelete(alarm.id)}
              style={{
                background: "none", border: "none", color: "#ef4444",
                cursor: "pointer", fontSize: 18, padding: "4px"
              }}
            >🗑️</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SnapAlarm() {
  const [screen, setScreen] = useState("home");
  const [alarms, setAlarms] = useState([
    { id: 1, time: "17:30", label: "Waktu mandi", mission: MISSIONS[0], active: true },
  ]);
  const [currentTime, setCurrentTime] = useState("");
  const [ringingAlarm, setRingingAlarm] = useState(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const timeStr = `${hh}:${mm}`;
      setCurrentTime(timeStr);

      if (!ringingAlarm) {
        const triggered = alarms.find(a => a.active && a.time === timeStr);
        if (triggered) {
          setRingingAlarm(triggered);
          setScreen("ringing");
        }
      }
    };
    update();
    const iv = setInterval(update, 5000);
    return () => clearInterval(iv);
  }, [alarms, ringingAlarm]);

  const addAlarm = (alarm) => {
    setAlarms(prev => [...prev, alarm]);
    setScreen("home");
  };

  const deleteAlarm = (id) => setAlarms(prev => prev.filter(a => a.id !== id));
  const toggleAlarm = (id) => setAlarms(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));

  const handleAlarmDismissed = () => {
    setAlarms(prev => prev.map(a => a.id === ringingAlarm?.id ? { ...a, active: false } : a));
    setRingingAlarm(null);
    setScreen("home");
  };

  const testAlarm = () => {
    const alarm = alarms[0] || { id: 999, time: currentTime, label: "Test alarm", mission: MISSIONS[0], active: true };
    setRingingAlarm(alarm);
    setScreen("ringing");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 20 }}>
      <div style={{ width: 360, background: "#0f172a", borderRadius: 30, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", minHeight: 680, display: "flex", flexDirection: "column" }}>

        <div style={{ background: "#020617", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "white" }}>SnapAlarm</div>
            <div style={{ fontSize: 11, color: "#475569" }}>Stop scrolling, start moving.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={testAlarm}
              style={{
                padding: "6px 12px", borderRadius: 20, border: "1px solid #334155",
                background: "transparent", color: "#94a3b8", fontSize: 11, cursor: "pointer"
              }}
            >⏰ Test</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {screen === "home" && (
            <HomeScreen alarms={alarms} onDelete={deleteAlarm} onToggle={toggleAlarm} currentTime={currentTime} />
          )}
          {screen === "add" && (
            <SetAlarmScreen onSave={addAlarm} alarms={alarms} />
          )}
          {screen === "ringing" && ringingAlarm && (
            <AlarmRinging alarm={ringingAlarm} onPhotoVerified={handleAlarmDismissed} />
          )}
        </div>

        {screen !== "ringing" && (
          <div style={{ background: "#020617", padding: "12px 20px 20px", display: "flex", justifyContent: "space-around" }}>
            {[
              { id: "home", icon: "🏠", label: "Beranda" },
              { id: "add", icon: "➕", label: "Tambah" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setScreen(tab.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: screen === tab.id ? "#3b82f6" : "#475569",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 20px",
                  borderRadius: 12, transition: "all 0.2s",
                  fontWeight: screen === tab.id ? 700 : 400
                }}
              >
                <span style={{ fontSize: 22 }}>{tab.icon}</span>
                <span style={{ fontSize: 11 }}>{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
