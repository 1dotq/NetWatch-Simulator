# AETHERIS // AI-Orchestrated Network & ICS Digital Twin

A high-fidelity, interactive cyber-physical simulation platform modeling a multi-tier enterprise IT network, an industrial OT network, and the continuous physics of a pressurized chemical reactor system. The platform integrates a real-time event-driven threat-vector simulation and an autonomous AI co-driver orchestrating firewall segmentations, PLC containment, and pressure-venting playbooks.

## Key Features

1. **Dual-Zone Cyber-Physical Topology**: Fully-featured rendering of Enterprise IT (AD, Router, SOC station, Firewall) and Industrial ICS OT (HMIs, PLCs, Actuators, Level Sensors) with animated packet-flows.
2. **Reactor Thermodynamics Simulation**: Real-time modeling of mass and heat balance equations (Inflow/Outflow valve hydraulics, thermal balance, thermodynamics pressure, and PID-controlled valves).
3. **Autonomous AI Orchestrator**: Simulates anomaly detection and response logic (auto-mitigates lateral network movement, runs industrial microsegmentation policies, and acts as an intelligent safety controller).
4. **Interactive CLI Console**: Fully operational embedded prompt supporting custom shell diagnostics (`isolate`, `mitigate`, `actuate`, `status`, `playbook`).
5. **No External Runtime Dependencies**: Built entirely using pure HTML5, CSS3 Grid/Flexbox layouts, and Vanilla JS Canvas renderers for maximum execution speed, offline reliability, and rendering fidelity.

---

## Architecture Directory Layout

- `index.html` : Glassmorphic layout grid containing side panels, Canvas container, and bottom terminal shell.
- `styles.css` : Design system tokens, interactive neon color variants, retro-futuristic scrollbars, and keyframe glows.
- `network-canvas.js` : Topology physics engine drawing links, custom shapes, click selectors, and floating glowing packets.
- `physics-sim.js` : Continuous chemical reactor mechanics simulation and grid line chart drawing.
- `orchestrator.js` : AI playbook scheduler, alerts dispatcher, and terminal parsing engine.
- `app.js` : Application coordinator, timing animation frame ticks, and event syncing wrappers.
- `package.json` : Project metadata and the local static-server convenience script.

---

## Running in the Browser (Zero Setup)

You can launch this high-fidelity twin application instantly on any platform:
1. Double-click `index.html` (or open it with your favorite web browser).
2. All components load offline with full fluid simulations, canvas drawing, and interactive console playbooks running at a high frame rate.

---

## Running via a Local Static Server (Optional)
Opening `index.html` directly works for the offline twin. If you want to use the
live LLM providers (Google Gemini / Anthropic Claude), browsers require the page
to be served over `http://` rather than `file://`. Any static server works:

```bash
npm start          # serves the folder at http://localhost:8080
# or, without npm:
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser. No build step or dependencies
are required — the app is pure HTML, CSS, and vanilla JavaScript.

---

## 📋 Comprehensive Directory of All 50 Active Features

### 🛠️ Network Engineering & Emulation Layer (Features 1–15)
1. **Draggable Hardware Toolbox:** A floating workspace sidebar panel enabling users to click/drag physical devices onto the canvas.
2. **Cisco IOS Router Asset:** A deployable node executing a virtual Cisco configuration operating system.
3. **Cisco IOS Switch Asset:** A deployable L2 switch providing virtual console interfaces.
4. **Palo Alto Next-Gen Firewall Asset:** A deployable perimeter security node supporting zone filters.
5. **Ubuntu Engineering Workstation:** A deployable host simulating terminal command operations.
6. **VxWorks RTOS PLC Node:** A deployable industrial logic controller managing Modbus registers.
7. **Siemens WinCC HMI Asset:** A deployable visualization panel reflecting physics values.
8. **Gigabit Cabling Port Selector:** A dynamic modal prompting physical port connectivity options when connecting nodes.
9. **Vector Cable Interface Labels:** Trig-calculated dynamic labels (e.g. `g0/1`, `eth0`) rendered directly along connection wires.
10. **OSPF Dijkstra Routing Engine:** Dijkstra path solver calculating and routing packet streams step-by-step across active routers.
11. **Stateful DHCP Server Pools:** Automatically assigns IP leases to workstations via simulated DHCP packet broadcasts.
12. **Stateful IP Conflict Auto-Valider:** Scans nodes for duplicate IPs, displaying red warnings on the canvas.
13. **Dynamic ARP Cache Table:** Virtual CLI supports `show arp` dynamically updating during live packet transfers.
14. **ICMP Ping & Delay Solver:** Live CLI `ping` computes millisecond transmission latencies over connection hops.
15. **Cable Snipper Context Menu:** Right-click action to manually sever and restore cables on the fly.

### 🏭 Industrial Control Systems (ICS) & SCADA Layer (Features 16–30)
16. **Inlet Control Actuator Loop:** SCADA control valve adjustable by slider or Modbus registers.
17. **Outlet Vent Actuator Loop:** Outlet valve simulating Torricelli drainage curves.
18. **Exothermic Exponent formulas:** Exothermic runaway state calculation starting when temperature exceeds 70.0°C.
19. **Safety Instrumented System (SIS) Interlocks:** PLC vxWorks safety code (IP-99) triggering emergency XV-103 vent if pressure goes over 2.20 MPa.
20. **Emergency Vent Valve XV-103:** Vent valve logic causing liquid vaporization and cooling under high pressure.
21. **Modbus TCP Coil Read/Write Modal:** Inline PLC tab for manual coil writes.
22. **HMI Tag Manager:** Mapped tags linking live physics data streams directly to visual indicators.
23. **MitM Spoofing Switch:** Enables Stuxnet-mode spoofing where the HMI displays normal logs during reactor anomalies.
24. **Modbus Hex Actuation command:** Interactive CLI command `modbus send` parsing standard Hex modbus frames.
25. **Hardware Thermal Overheating:** Overheating calculation where device proximity to high-temperature fields breaks link vectors.
26. **Centralized Log Collector:** Central logging feed showing RFC 5424 formatted syslog strings.
27. **Physical Telemetry charts:** Live grid graph drawing continuous neon plots of Level, Pressure, and Temp.
28. **Process telemetries meters:** Numeric readouts displaying values in MPa, °C, and percentage scales.
29. **Speed dilation regulator:** Slider to slow down/accelerate physical simulation loops.
30. **Reboot All PLCs command:** Sidebar suggestions button to clear PLC compromises and restore default firmware.

### 🛡️ Cyber-Security & Attack Vector Modeling (Features 31–45)
31. **VTable Hijack Memory Dumper:** Real CLI command `debug memory vtable` detailing virtual function offsets.
32. **Stateful Firewall ACL Port Filtering:** Command interface configuring protocol drop ranges.
33. **Static Route CLI Configurator:** Terminal command `ip route [DST] [MASK] [GW]` saving route configs statefully.
34. **Interactive Wireshark Hex Inspector:** Clickable visual packet streams opening frame decoders and hex dumps.
35. **Lateral Threat Movement radar:** Graphical visualizer showing compromised spreading chances.
36. **Industrial Modbus Registry Fuzzer:** HMI panel generating fuzzed variables to test PLC stability.
37. **SOAR Incident Playbooks:** Scripting options automating port blocking when threat signatures trip.
38. **SSH Line Configs & Credentials:** Authentic line configurations prompting telnet logins on device CLI switches.
39. **PCAP Network Capture Exporter:** Log option downloading simulated network traffic logs.
40. **HMI Overpressure alarm klaxon:** Visual alarm system flashing red banners and warning sirens.
41. **Industrial DMZ Switch:** Firewall setting severs OT networks from enterprise networks.
42. **IT-OT Segmentation CTF Mission:** Guided mission checking if the workstation is isolated from OT elements.
43. **Zero-Trust Zone CTF Mission:** Guided mission verifying custom firewall and port ACL implementations.
44. **Lateral Mitigation CTF Mission:** Guided mission testing link severing and redundant border routes.
45. **Conflict Resolution tool:** Cleans logic tables and restores compromise vectors immediately.

### 🎨 Visual & Presentation HUD Modes (Features 46–50)
46. **FullscreenHUD Mode:** Collapses sidebar panels and headers for clean presentation.
47. **Persistent Topology Save (JSON):** Dynamic `.netsim` layout exporter.
48. **Persistent Topology Load (JSON):** HTML file-reader parsing and rebuilding canvas configurations.
49. **Zoom Vector controls:** Canvas scaling matrix adjusting rendering positions.
50. **Network Boundary Vector Export:** SVG exporter downloading the visual network topology for compliance audits.

