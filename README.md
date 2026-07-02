# Sonos Volume Knob — Stream Deck+ plugin

A dead-simple, reliable **Sonos volume knob** for the Stream Deck+ dials.

- **Rotate** a dial to change volume
- **Press** (or tap the touch strip) to mute/unmute
- The LCD shows the room name, volume %, and a level bar

It talks to your speakers **entirely over the local network** (UPnP/SSDP via
the [`sonos`](https://www.npmjs.com/package/sonos) package). No Sonos account,
no OAuth, no cloud — so it doesn't break when Sonos changes their cloud API.

## Why this exists

The popular cloud-based Sonos Stream Deck plugins depend on the Sonos cloud
control API (OAuth + `api.ws.sonos.com`) and strict response validation. In
practice they're fragile: a common one silently shows an **empty speaker list**
even while reporting "Connected", because one over-strict field check aborts the
whole device fetch. Other local plugins work but make you **type in speaker IP
addresses by hand** — which then break when your router hands out a new IP.

This plugin fixes both problems:

- **Auto-discovery** — finds your speakers on the LAN automatically (SSDP). No
  IP typing.
- **Survives IP changes** — it remembers each speaker by its stable Sonos UUID
  and re-resolves the current IP if DHCP moves it.
- **Stereo-pair aware** — a bonded stereo pair shows up as a single room and the
  knob controls both speakers together (the hidden satellite is filtered out).

## Requirements

- A **Stream Deck+** (the model with rotary dials)
- Stream Deck software **6.5+**
- Node.js + npm on your machine — only needed to install dependencies. The
  plugin itself runs on the Node 20 runtime that Stream Deck bundles.
- Speakers reachable on the same local network as your computer.

## Install (from source)

```bash
git clone https://github.com/bigfish24/streamdeck-sonos-volume-knob.git
cd streamdeck-sonos-volume-knob/com.ditto.sonos.sdPlugin
npm install            # fetches the `sonos` + `ws` dependencies
```

Then make Stream Deck load the plugin by placing the `com.ditto.sonos.sdPlugin`
folder (with its freshly installed `node_modules`) into your Stream Deck plugins
directory:

- **macOS:** `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
- **Windows:** `%APPDATA%\Elgato\StreamDeck\Plugins\`

A symlink works well so you can keep editing in the repo:

```bash
# macOS example (run from the repo root)
ln -s "$PWD/com.ditto.sonos.sdPlugin" \
  "$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.ditto.sonos.sdPlugin"
```

Restart the Stream Deck app.

## Usage

1. In the Stream Deck app, open the actions list and find **Sonos → Sonos Volume**.
2. Drag it onto one of the dials on your Stream Deck+.
3. The property inspector auto-scans the network — pick your speaker/room from
   the dropdown.
4. **Rotate** to change volume, **press** to mute. Adjust **Step** (% per click)
   if you want coarser/finer control, and use **Rescan network** if a speaker
   was offline during the first scan.

## How it works

- On the property inspector, the plugin runs SSDP discovery and reads the
  ZoneGroupTopology, listing every **visible** zone (bonded satellites, marked
  `Invisible`, are skipped so a stereo pair is one entry).
- The selected room is stored as `{ uuid, host, name }`. At runtime the plugin
  tries the saved IP first; if that fails it rediscovers and matches by UUID,
  so a changed IP heals itself.
- Volume writes are throttled (~8/sec, leading + trailing) so fast turns stay
  responsive without flooding the speaker.
- The LCD uses the built-in `$B1` layout: icon + room name + `NN%` + a bar.

## Project layout

```
com.ditto.sonos.sdPlugin/
  manifest.json        Stream Deck plugin manifest (Encoder action)
  bin/plugin.js        Node backend: discovery, dial handling, LCD feedback
  ui/inspector.html    Property inspector (speaker dropdown + settings)
  imgs/                Icons
  package.json         Dependencies: sonos, ws
```

> The plugin UUID is `com.ditto.sonos`. If you fork this, feel free to rename it
> (folder name, `manifest.json` UUID, and the action UUID must match).

## Credits

- [`sonos`](https://github.com/bencevans/node-sonos) — local Sonos UPnP control
  and SSDP discovery.
- Built for the Elgato Stream Deck SDK (v2).

## License

[MIT](LICENSE) — do whatever you like.
