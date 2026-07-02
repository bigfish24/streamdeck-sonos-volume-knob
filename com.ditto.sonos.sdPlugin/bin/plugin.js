"use strict";

/*
 * Sonos Volume Knob — Stream Deck + encoder plugin.
 *
 * Talks to Sonos over the LOCAL network (UPnP) via the `sonos` package.
 * No cloud, no OAuth. Auto-discovers speakers via SSDP and collapses
 * stereo pairs / bonded satellites into a single room.
 */

const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
const { Sonos, AsyncDeviceDiscovery } = require("sonos");

// ---------- logging ----------
const LOG_DIR = path.join(__dirname, "..", "logs");
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}
const LOG_FILE = path.join(LOG_DIR, "plugin.log");
function log(...args) {
  const line = `${new Date().toISOString()} ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) {}
}
process.on("uncaughtException", (e) => log("uncaughtException", e && e.stack));
process.on("unhandledRejection", (e) => log("unhandledRejection", String(e)));

// ---------- icons (base64 for the LCD layout) ----------
function iconDataUrl(rel) {
  try {
    const buf = fs.readFileSync(path.join(__dirname, "..", rel));
    return "data:image/png;base64," + buf.toString("base64");
  } catch (e) {
    return "";
  }
}
const ICON_VOL = iconDataUrl("imgs/actions/volume.png");
const ICON_MUTED = iconDataUrl("imgs/actions/muted.png");
const ICON_PAUSED = iconDataUrl("imgs/actions/paused.png");

// ---------- Stream Deck connection ----------
const args = parseArgs(process.argv.slice(2));
const PORT = args["-port"];
const PLUGIN_UUID = args["-pluginUUID"];
const REGISTER_EVENT = args["-registerEvent"];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i]] = argv[i + 1];
  return out;
}

let ws;
function send(obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) { log("send error", e && e.message); }
}

log("starting; port=" + PORT + " uuid=" + PLUGIN_UUID);
ws = new WebSocket("ws://127.0.0.1:" + PORT);
ws.on("open", () => {
  send({ event: REGISTER_EVENT, uuid: PLUGIN_UUID });
  log("registered");
});
ws.on("message", (data) => {
  let ev;
  try { ev = JSON.parse(data.toString()); } catch (e) { return; }
  handleEvent(ev).catch((e) => log("handleEvent error", e && e.stack));
});
ws.on("close", () => { log("ws closed; exiting"); process.exit(0); });
ws.on("error", (e) => log("ws error", e && e.message));

// ---------- helpers ----------
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ---------- Sonos discovery ----------
let roomCache = { at: 0, rooms: [] };

async function discoverRooms(timeout = 5000) {
  const disco = new AsyncDeviceDiscovery();
  const seed = await disco.discover({ timeout });
  const groups = await seed.getAllGroups();
  const rooms = [];
  const seen = new Set();
  for (const g of groups) {
    for (const m of g.ZoneGroupMember || []) {
      if (m.Invisible === "1") continue;   // bonded stereo-pair satellite / HT sat
      if (m.IsZoneBridge === "1") continue; // Boost/Bridge
      if (!m.UUID || seen.has(m.UUID)) continue;
      seen.add(m.UUID);
      let host = null;
      try { host = new URL(m.Location).hostname; } catch (e) {}
      if (!host) continue;
      rooms.push({ name: m.ZoneName || host, uuid: m.UUID, host });
    }
  }
  rooms.sort((a, b) => a.name.localeCompare(b.name));
  roomCache = { at: Date.now(), rooms };
  log("discovered rooms", rooms.map((r) => r.name + "@" + r.host));
  return rooms;
}

// Resolve a live Sonos device for the stored settings, healing IP changes via UUID.
async function resolveDevice(settings) {
  if (!settings || !settings.host) return null;
  const direct = new Sonos(settings.host);
  try { await direct.getVolume(); return direct; } catch (e) { log("stored host stale", settings.host, e && e.message); }
  try {
    const rooms = await discoverRooms(4000);
    const match =
      rooms.find((r) => r.uuid === settings.uuid) ||
      rooms.find((r) => r.name === settings.name);
    if (match) { log("re-resolved", settings.name, "->", match.host); return new Sonos(match.host); }
  } catch (e) { log("re-resolve failed", e && e.message); }
  return null;
}

// ---------- per-action (context) state ----------
const state = new Map(); // context -> { settings, device, name, volume, muted, _lastWrite, _timer }

function renderFeedback(ctx, st) {
  const payload = {};
  if (!st || !st.device) {
    payload.title = (st && st.settings && st.settings.name) || "Sonos";
    payload.value = st && st.settings && st.settings.host ? "…" : "Set speaker";
    payload.indicator = 0;
    payload.icon = ICON_VOL;
  } else {
    const showPaused =
      st.paused && ((st.settings && st.settings.pressAction) || "mute") === "playpause";
    payload.title = st.name || "Sonos";
    payload.value = st.muted ? "Muted" : st.volume + "%";
    payload.indicator = st.muted ? 0 : st.volume;
    payload.icon = st.muted ? ICON_MUTED : showPaused ? ICON_PAUSED : ICON_VOL;
  }
  send({ event: "setFeedback", context: ctx, payload });
}

async function initContext(ctx, st) {
  if (st.settings && st.settings.host) {
    const d = await resolveDevice(st.settings);
    if (d) {
      st.device = d;
      try { st.volume = await d.getVolume(); } catch (e) {}
      try { st.muted = await d.getMuted(); } catch (e) {}
      try {
        const ts = await d.getCurrentState();
        st.paused = !(ts === "playing" || ts === "transitioning");
      } catch (e) {}
    }
  }
  renderFeedback(ctx, st);
}

// Throttled + trailing volume write (max ~8/sec) so fast turns stay responsive.
function pushVolume(ctx, st) {
  const now = Date.now();
  const since = now - (st._lastWrite || 0);
  const doWrite = () => { st._lastWrite = Date.now(); writeVolume(ctx, st); };
  if (since >= 120) { doWrite(); }
  else {
    if (st._timer) clearTimeout(st._timer);
    st._timer = setTimeout(() => { st._timer = null; doWrite(); }, 120 - since);
  }
}
async function writeVolume(ctx, st) {
  if (!st.device) return;
  try { await st.device.setVolume(st.volume); }
  catch (e) {
    log("setVolume failed", e && e.message);
    const d = await resolveDevice(st.settings);
    if (d) { st.device = d; try { await d.setVolume(st.volume); } catch (e2) { log("setVolume retry failed", e2 && e2.message); } }
  }
}

// ---------- event dispatch ----------
async function handleEvent(ev) {
  const ctx = ev.context;
  switch (ev.event) {
    case "willAppear": {
      const settings = (ev.payload && ev.payload.settings) || {};
      const st = { settings, device: null, name: settings.name || null, volume: 0, muted: false };
      state.set(ctx, st);
      renderFeedback(ctx, st);
      await initContext(ctx, st);
      break;
    }
    case "willDisappear": {
      const st = state.get(ctx);
      if (st && st._timer) clearTimeout(st._timer);
      state.delete(ctx);
      break;
    }
    case "didReceiveSettings": {
      const st = state.get(ctx) || { volume: 0, muted: false };
      st.settings = (ev.payload && ev.payload.settings) || {};
      st.name = st.settings.name || st.name;
      st.device = null;
      state.set(ctx, st);
      renderFeedback(ctx, st);
      await initContext(ctx, st);
      break;
    }
    case "dialRotate": {
      const st = state.get(ctx);
      if (!st) break;
      if (!st.device) { renderFeedback(ctx, st); break; }
      const ticks = (ev.payload && ev.payload.ticks) || 0;
      const step = (st.settings && Number(st.settings.step)) || 2;
      st.volume = clamp(st.volume + ticks * step, 0, 100);
      if (st.muted && ticks !== 0) { st.muted = false; st.device.setMuted(false).catch(() => {}); }
      renderFeedback(ctx, st);
      pushVolume(ctx, st);
      break;
    }
    case "dialDown":
    case "touchTap": {
      const st = state.get(ctx);
      if (!st || !st.device) break;
      const press = (st.settings && st.settings.pressAction) || "mute";
      if (press === "playpause") {
        const toggle = async (d) => {
          const ts = await d.getCurrentState();
          st.paused = ts === "playing" || ts === "transitioning";
          if (st.paused) await d.pause(); else await d.play();
        };
        try { await toggle(st.device); }
        catch (e) {
          log("play/pause failed", e && e.message);
          const d = await resolveDevice(st.settings);
          if (d) { st.device = d; try { await toggle(d); } catch (e2) { log("play/pause retry failed", e2 && e2.message); } }
        }
        renderFeedback(ctx, st);
        break;
      }
      st.muted = !st.muted;
      renderFeedback(ctx, st);
      try { await st.device.setMuted(st.muted); }
      catch (e) {
        const d = await resolveDevice(st.settings);
        if (d) { st.device = d; try { await d.setMuted(st.muted); } catch (e2) {} }
      }
      break;
    }
    case "sendToPlugin": {
      const p = ev.payload || {};
      if (p.command === "getDevices") {
        let rooms = [];
        try { rooms = await discoverRooms(); }
        catch (e) { log("discovery failed", e && e.message); }
        send({ event: "sendToPropertyInspector", context: ctx, payload: { command: "devices", rooms } });
      }
      break;
    }
    default:
      break;
  }
}
