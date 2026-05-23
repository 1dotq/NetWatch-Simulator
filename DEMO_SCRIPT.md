# AETHERIS NetPilot — Demo Video Blueprint & Script

**Runtime target:** 8–10 minutes  
**Format:** Screen recording with voiceover. No cuts between sections — continuous walkthrough.  
**Tone:** Calm, confident, technically precise. Not a sales pitch. Show, don't sell.

---

## PRE-RECORDING SETUP

Before recording:
- Launch Python HTTP server: `cd /home/kali/Documents/NetSim && python3 -m http.server 8080`
- Open browser to `http://127.0.0.1:8080` — landing page visible
- Window: 1920×1080, browser fullscreen
- API key pre-filled in localStorage (so you don't type it live)
- Select lab: **Reactor-3 Safety Loop Sync** (default, loads the ICS reactor twin)
- Resolution: record at native 1080p, export at 1080p60

---

## SECTION 1 — Landing Page & Platform Overview
**[0:00 – 0:55]**

**SCREEN:** Landing page visible — tier comparison, AI setup card, mission list.

> "AETHERIS is a browser-native industrial cyber range. Zero install — open the HTML file and you're running a full ICS digital twin with live packet capture, a device CLI, physics simulation, and an optional AI co-driver. No Electron, no Node, no Docker."

**ACTION:** Point at tier row.

> "The platform runs in two modes. Community is completely free — you get the full simulator, hardware toolbox, wireshark analyzer, and CLI shells. Professional unlocks AI-powered orchestration using your own Gemini or Claude API key."

**ACTION:** Click "Enable AI Co-Driver" radio → API fields expand. Point at step-by-step instructions.

> "The API key setup is three steps: choose your provider — Gemini is recommended for local use because Google allows browser-direct API calls with no CORS restrictions — get a free key from AI Studio, paste it here. Your key stays in browser localStorage and never leaves your machine."

**ACTION:** Click "Standalone Mode (No AI)" — fields collapse, confirmation message shows.

> "If you don't want any AI features, standalone mode hides the AI panel entirely. The simulator is fully functional either way."

**ACTION:** Switch back to AI mode. Click on the mission list — scroll through a few labs. Hover over "Stuxnet Spoof Detection Playbook" and "S7comm Ransomware Audit".

> "There are twenty-three pre-built cyber range missions across three types: reactor ICS labs, enterprise campus labs, and Purdue model architecture labs. Each one loads a different network topology and comes with a structured mission brief, task checklist, and AI co-driver payload."

**ACTION:** Select **Reactor-3 Safety Loop Sync** and click **LAUNCH SIMULATION WORKSPACE**.

---

## SECTION 2 — Workspace Layout & Header Controls
**[0:55 – 1:40]**

**SCREEN:** Full three-column workspace appears. Mission briefing modal is open.

> "The workspace is three columns: the AI co-pilot sidebar on the left, the topology canvas in the center, and the ICS process telemetry panel on the right. A mission briefing opens automatically with the lab objective and task checklist."

**ACTION:** Read the objective aloud briefly. Click "Ask Co-Driver" button in the modal.

> "Clicking 'Ask Co-Driver' fires the lab's pre-written prompt directly into the AI chat — it gives you a step-by-step guided walkthrough of the mission."

**ACTION:** Close the briefing modal. Point to the status ticker in the header.

> "The system header shows four live status tickers: system state, ICS status, AI orchestrator heartbeat, and a running simulation clock. These update in real time as the simulation progresses."

**ACTION:** Point to PAUSE button. Click it — clock freezes.

> "The simulation can be paused and resumed. Pausing freezes the physics engine, packet generation, and timer — everything holds state."

**ACTION:** Click PAUSE again to resume.

**ACTION:** Point at header buttons — Undo/Redo, Mission Briefing, Community Tier badge.

> "Undo and redo are available for all canvas operations. The tier badge opens the license activation modal if you want to upgrade to Professional."

---

## SECTION 3 — Topology Canvas
**[1:40 – 3:10]**

**SCREEN:** Center canvas with the Reactor-3 topology — IT zone, OT zone, PLC nodes, reactor.

> "The topology canvas is an interactive network digital twin. This reactor lab has fourteen nodes across two zones: an enterprise IT zone with a gateway, firewall, and engineering workstation, and an OT industrial zone with three PLCs, an HMI, and the reactor process twin."

**ACTION:** Scroll/zoom in on the OT zone using the zoom controls.

> "Live traffic is animated as moving dots on every link. Blue dots are unencrypted traffic, green dots are encrypted. You can see packet flow in real time between every device pair."

**ACTION:** Click on the **FW-01** firewall node — inspector panel slides in on right side.

> "Clicking any node opens the Physical Inspector — interface status, routing table, IP addresses, protocol state. This is FW-01, the boundary next-gen firewall. You can see its two interfaces: the IT-facing trunk and the OT-facing segment, with live link state."

**ACTION:** Close inspector. Right-click on **PLC-101**.

> "Right-clicking any node opens the context menu. From here you can open the physical inspector, delete the node, or inject a cyber anomaly directly."

**ACTION:** Click "Physical Inspector" from the context menu.

> "Same inspector, same data — multiple ways to access it."

**ACTION:** Close. Now drag a new device from the **Hardware Toolbox** — switch to ICS tab, drag a PLC onto the canvas.

> "The hardware toolbox on the left edge of the canvas works like Cisco Packet Tracer — drag any device onto the canvas. There are three categories: core network devices like routers and switches, industrial ICS devices like PLCs, HMIs, and sensors, and security appliances like next-gen firewalls and Claroty sensors."

**ACTION:** Select the Cable Link tool, draw a cable between the new PLC and an existing switch.

> "Select Cable Link, click source, click destination — the link is drawn with live traffic immediately."

**ACTION:** Click Undo twice to remove the cable and the node.

> "Undo removes operations in sequence. Nothing is permanent unless you save."

**ACTION:** Click **Auto Arrange** button.

> "Auto arrange repositions all nodes into an optimal layout — useful after adding multiple devices manually."

**ACTION:** Click the **HUD mode** button (screen icon in canvas corner).

> "HUD mode collapses all panels and goes fullscreen canvas — for presenting or monitoring in an operations center context."

**ACTION:** Click HUD mode again to exit.

---

## SECTION 4 — ICS Process Twin & SCADA Panel
**[3:10 – 4:10]**

**SCREEN:** Right panel — Reactor Process State telemetry cards visible.

> "The right panel is the SCADA process twin. For reactor labs it shows live telemetry from the physics simulation engine: reactor temperature, pressure, water level, and inlet flow. These are not static values — the physics engine updates them continuously based on valve positions and configured anomalies."

**ACTION:** Drag the Inlet Valve V-101 slider from 52% down to 20%.

> "The valve sliders actuate the process in real time. Closing the inlet valve reduces water flow — watch the water level start dropping over the next few seconds and temperature begin to climb."

**ACTION:** Wait a moment, then point at changing values.

> "The telemetry cards and progress bars reflect the live state. If pressure climbs past a threshold the SIS — Safety Instrumented System — triggers an automatic interlock."

**ACTION:** Click **Stress Test** button.

> "Stress Test injects a rapid pressure spike — simulating a process anomaly. This is how you drive the simulation into an alert state to practice incident response."

**ACTION:** Watch the anomaly detection board populate at the bottom right.

> "The Anomaly Detection Board captures the alert with timestamp, classification, and a Locate button that centers the canvas on the affected node."

**ACTION:** Click **Normal Mode** to stop the stress test.

**ACTION:** Scroll to Simulation Controls — drag the Time Dilation slider.

> "Time dilation runs the simulation at 0.5x, 1x, 2x, or 4x speed — useful for accelerating through long convergence events in OSPF or BGP labs."

---

## SECTION 5 — Threat Injection & Incident Response
**[4:10 – 5:05]**

**SCREEN:** Header — TRIGGER TEST INCIDENT button visible.

> "The threat injection engine simulates realistic cyber-physical attacks against the running topology."

**ACTION:** Click **TRIGGER TEST INCIDENT**.

**SCREEN:** Header turns to red alert state. "ALERT THREATS ACTIVE" banner appears. Canvas shows compromised node highlighting. Incident log populates.

> "A threat event has been injected. The system header switches to alert state, compromised nodes on the canvas are highlighted, and the incident timeline on the left sidebar begins recording the attack chain with timestamps and severity classifications."

**ACTION:** Click the **INCIDENT LOG** tab on the left sidebar.

> "The incident log is a chronological attack chain — every anomaly, alert resolution, and system response is recorded here with simulation timestamps."

**ACTION:** Switch to **AI HARDENING AUDIT** tab.

> "The AI hardening audit panel runs a real-time configuration validator. It analyzes the current topology for segmentation gaps, unencrypted links, firmware integrity issues, and credential exposure — and generates a prioritized remediation list."

**ACTION:** Click **EXECUTE AUTO-HARDENING PLAYBOOK** button.

> "The auto-hardening playbook executes a sequence of automated remediations: microsegmentation rules are applied, compromised nodes are isolated, and firewall ACLs are patched. Watch the threat count in the canvas stats overlay drop to zero."

**ACTION:** Point at canvas stats overlay (NODES/LINKS/PKT-S/THREAT counters).

> "The canvas stats overlay shows live node count, link count, packets per second, and active threat count — all updating in real time."

---

## SECTION 6 — Wireshark Protocol Analyzer
**[5:05 – 6:00]**

**ACTION:** Click **WIRESHARK** button in the toolbox footer.

**SCREEN:** Wireshark modal opens — packet list, filter ribbon, decode pane.

> "The Wireshark analyzer is a full protocol analyzer built into the browser. It captures all simulated traffic in the running topology — no external tools required."

**ACTION:** Click **CAPTURE** — packet list begins populating.

> "Packets flow in real time. The capture engine generates realistic protocol traffic based on the topology: OSPF neighbor adjacency, BGP keepalives, Modbus coils reads, ARP, ICMP, DNS, and HTTP — all with realistic source and destination addresses from the configured network."

**ACTION:** Click on a **Modbus** packet in the list.

> "Clicking any packet opens the decode pane at the bottom with full protocol dissection — here's a Modbus TCP Function Code 1 coils read, showing the transaction ID, unit ID, function code, and coil data. This is the same level of detail you'd see in a real Wireshark capture."

**ACTION:** Click the **TCP** filter button in the filter ribbon.

> "Protocol filters let you scope the capture to a single protocol. Click TCP to show only TCP traffic."

**ACTION:** Click **OSPF** filter.

> "OSPF shows the neighbor adjacency packets. In OSPF labs you'll see Hello packets, DBD exchanges, and LSA updates between the configured routers."

**ACTION:** Click **CLEAR** then **EXPORT**.

> "Export saves the capture as a JSON file for offline analysis. Clear wipes the buffer."

**ACTION:** Close the Wireshark modal.

---

## SECTION 7 — Device CLI Shell
**[6:00 – 6:40]**

**SCREEN:** Bottom CLI panel visible.

**ACTION:** Click on the **IT-GW** router node on the canvas.

**SCREEN:** CLI panel activates — device profile card appears on left, prompt changes to `IT-GW#`.

> "Clicking any network node activates its interactive CLI. This is a Cisco IOS XE router — the prompt, command syntax, and output format all match the real device."

**ACTION:** Type `show ip route` and press Enter.

> "The routing table shows all active routes — static, OSPF-learned, and directly connected. These match the actual topology configured in the canvas."

**ACTION:** Type `show interfaces`.

> "Interface status shows IP addresses, link state, and protocol — consistent with the node's canvas configuration."

**ACTION:** Click on **PLC-101** on the canvas.

> "Switching to a PLC node changes the CLI context to Modbus/VxWorks serial shell — different syntax, different available commands, appropriate for the device type."

**ACTION:** Type `help`.

> "The CLI parser is device-aware — PLC commands differ from router commands. ICS devices expose Modbus register reads, coil status, and safety interlock state."

---

## SECTION 8 — Packet Tracer Tool
**[6:40 – 7:20]**

**ACTION:** Click **TRACER** button in the toolbox footer.

**SCREEN:** Packet Tracer modal opens.

> "The Packet Tracer tool lets you simulate a specific packet flowing through the topology and trace its hop-by-hop path. Specify a source, destination, protocol, and port."

**ACTION:** Set source to `IT-GW`, destination to `PLC-101`, protocol `TCP`, port `502`.

> "Port 502 is Modbus TCP — we're tracing an IT-to-OT engineering access attempt across the firewall boundary."

**ACTION:** Click **TRACE**.

**SCREEN:** Hop list populates — IT-GW → FW-01 → OT-SW → PLC-101.

> "The tracer resolves each hop, checks ACL rules at the firewall, and reports whether the packet is forwarded or dropped at each node. You can see exactly where in the path a block is applied — critical for diagnosing segmentation policy."

**ACTION:** Close the tracer.

---

## SECTION 9 — AI Co-Driver Chat (Pro Feature)
**[7:20 – 8:30]**

**SCREEN:** Left sidebar — AI CO-PILOT CHAT tab active. Chat history visible with initial welcome message.

> "The AI Co-Driver is a conversational interface to the entire simulator. It can configure topology, inject anomalies, explain alerts, and run playbooks — all in plain English."

**ACTION:** Type in the chat input: `Segment the OT network and block all TCP from the IT zone to PLC-101`

**SCREEN:** AI responds — shows command reasoning, then canvas updates with new segmentation applied.

> "The Co-Driver interprets the request, explains what it's doing, and then executes it against the live canvas. Microsegmentation is applied — watch the link colors update as firewall rules propagate."

**ACTION:** Type: `What is the current reactor pressure and is it within safe operating range?`

**SCREEN:** AI responds with current telemetry values and a safety assessment.

> "The Co-Driver has direct access to the physics simulation state — it can read and reason about live telemetry values, not just topology."

**ACTION:** Click the **Segment Subnet** quick-action chip.

> "Quick action chips are pre-built prompts for the most common operations — segment subnet, reboot field PLCs, mitigate threat. One click fires the full orchestration sequence."

**ACTION:** Enable voice assist (speaker button) — toggle it on.

> "Voice Assist uses the browser's Web Speech API to read Co-Driver responses aloud. Configurable speed and voice profile from the controls below the chat."

**ACTION:** Send one more message: `Run the emergency depressurization playbook`

**SCREEN:** AI responds with playbook steps, valve actuation commands animate in the SCADA panel.

> "Playbooks are structured response sequences. The Co-Driver walks through each step, explaining the clinical rationale — useful for training operators on incident response procedures."

---

## SECTION 10 — Wrap & Feature Summary
**[8:30 – 9:15]**

**SCREEN:** Canvas — active topology with live traffic, SCADA panel live, CLI active at bottom.

> "AETHERIS NetPilot runs entirely in your browser. No install, no server, no cloud dependency. The full feature set:"

**ACTION:** Slowly pan the UI while reading:

> "Twenty-three cyber range missions across ICS reactor, enterprise campus, and Purdue model scenarios. A drag-and-drop hardware toolbox with branded vendor devices. A live physics simulation engine driving real SCADA telemetry. A full protocol analyzer with Cisco IOS, FortiOS, and Modbus CLI shells. Hop-by-hop packet tracing. AI-powered configuration and incident orchestration via your own API key. All running at zero cost in Community mode — or unlocked to Professional with a single license key."

**ACTION:** Return to landing page (click EXIT WORKSPACE in header).

> "AETHERIS is available now. Community tier is free and permanent. Professional features are unlocked with a one-time license key. The source runs as a single HTML file with no dependencies."

**[END]**

---

## B-ROLL / CUTAWAY SUGGESTIONS

If editing into a produced video, these moments work well as insert shots:

| Timestamp cue | Visual | Purpose |
|---|---|---|
| 1:40 | Canvas zoomed in on OT zone, traffic dots moving | Establishes "live" feel |
| 3:10 | Valve slider drag with telemetry updating | Demonstrates physics coupling |
| 4:10 | Alert banner animation + node highlight | Drama/tension of threat injection |
| 5:05 | Wireshark packet list scrolling fast | Shows system activity |
| 5:30 | Modbus packet decode pane expanded | Technical credibility |
| 7:20 | AI chat response streaming in | Key differentiator |
| 8:30 | Full workspace overview, all three columns active | Closing hero shot |

---

## KEYBOARD SHORTCUT CALLOUTS

Worth mentioning on-screen overlays at these moments:

- **Ctrl+Z / Ctrl+Y** — Undo/Redo (mention during canvas editing)
- **Scroll wheel** — Zoom canvas
- **Click + drag** — Pan canvas
- **Double-click node** — Open Physical Inspector
- **Right-click node** — Context menu
- **Esc** — Close any open modal

---

## LABS REFERENCED IN SCRIPT (for title card overlays)

| Lab | Type | Key Feature Demonstrated |
|---|---|---|
| Reactor-3 Safety Loop Sync | ICS Reactor | Default lab — full physics twin |
| Stuxnet Spoof Detection Playbook | ICS Critical | Threat injection + AI triage |
| Modbus Coils Injection Mitigation | ICS Security | Modbus packet decode in Wireshark |
| Enterprise Campus 3-Tier Core | Campus Infra | Multi-tier topology, OSPF |
| Purdue Model 25-Node Digital Twin | Pro/ICS | Purdue segmentation (Pro tier) |

---

## CHAPTER MARKERS (for YouTube / video player)

```
00:00 Introduction & Landing Page
00:55 Workspace Layout & Header
01:40 Topology Canvas & Hardware Toolbox
03:10 ICS Process Twin & SCADA Panel
04:10 Threat Injection & Incident Response
05:05 Wireshark Protocol Analyzer
06:00 Device CLI Shell
06:40 Packet Tracer Tool
07:20 AI Co-Driver Chat
08:30 Platform Summary
```
