class AELlmService {
  constructor() {
    this.providerKey = 'aetheris_llm_provider';
    this.apiKeyKey = 'aetheris_llm_apikey';
  }

  getProvider() {
    try {
      return localStorage.getItem(this.providerKey) || 'gemini';
    } catch {
      return 'gemini';
    }
  }

  getApiKey() {
    try {
      return localStorage.getItem(this.apiKeyKey) || '';
    } catch {
      return '';
    }
  }

  setSettings(provider, apiKey) {
    try {
      localStorage.setItem(this.providerKey, provider);
      localStorage.setItem(this.apiKeyKey, apiKey);
    } catch {
      // Storage unavailable (private mode / disabled) — settings stay in-session only.
    }
  }

  hasCredentials() {
    return this.getApiKey().trim().length > 0;
  }

  // Generate robust system prompt providing full twin application state vectors
  buildSystemPrompt(currentNodes, currentLinks, currentProject, physicalState = null) {
    const nodesJson = JSON.stringify(currentNodes.map(n => ({
      id: n.id, name: n.name, type: n.type, role: n.role, ip: n.ip, x: Math.round(n.x), y: Math.round(n.y), status: n.status, config: n.config
    })));

    const linksJson = JSON.stringify(currentLinks.map(l => ({
      source: l.sourceId, target: l.targetId, status: l.status
    })));

    let physicsContext = "";
    if (physicalState) {
      physicsContext = `
Active Physical ICS Variables (Reactor-3):
- Pressure: ${physicalState.pressure.toFixed(2)} MPa (Nominal: 1.2, Critical: 2.5)
- Temp: ${physicalState.temp.toFixed(1)} °C (Nominal: 42.5, Critical: 90.0)
- Level: ${physicalState.level.toFixed(1)} % (Nominal: 65.8)
- Inlet Valve: ${physicalState.inletValve}%
- Outlet Valve: ${physicalState.outletValve}%
- Relief Valve: ${physicalState.reliefValve ? 'OPEN' : 'CLOSED'}
`;
    }

    return `You are AETHERIS Co-Pilot, an advanced AI industrial network engineer, SCADA architect, and digital twin cyber-security orchestrator.
You have FULL control over the simulation topology. The user is asking you to modify, analyze, or discuss the current digital twin.

Each node in the topology contains a detailed "config" object representing its live running configurations (such as network interfaces, hostnames, subnet configurations, gateways, active static/dynamic routing, ACL security filters, OSPF states, physical SCADA register bindings, data diode modes, and PLC safety interlocks). Use this visibility to perform deep diagnostics, locate communication bottlenecks, recommend security hardening rules, or explain specific device parameters.

Current Project Workspace: "${currentProject}"
Current Topology Nodes:
${nodesJson}

Current Topology Connections:
${linksJson}
${physicsContext}

CRITICAL: If the user asks you to modify the topology (e.g. add a node, remove a device, connect two switches, clear the network), you MUST issue exact command instructions in your output response using the special brackets below. You can issue multiple actions in a single response.

Valid Actions Format:
- To add a node: [ADD_NODE: {"id":"Unique-ID", "name":"Device Name", "type":"it|ot|plc|field", "role":"Router|Switch|Workstation|SCADA HMI|Modbus PLC|Actuator|Sensor", "ip":"192.168.1.X", "x":pos_x, "y":pos_y}]
  (Note: position boundaries: X [50 to 900], Y [50 to 450])
- To remove a node: [REMOVE_NODE: "Unique-ID"]
- To add a connection: [ADD_LINK: {"source":"NodeA-ID", "target":"NodeB-ID"}]
- To remove a connection: [REMOVE_LINK: {"source":"NodeA-ID", "target":"NodeB-ID"}]
- To clear the canvas: [CLEAR_TOPOLOGY]

For example:
User prompt: "Add a new PLC at IP 192.168.1.104 and connect it to OT switch"
Your response: "Understood. Creating the new PLC node and establishing a communication path to our core OT switch.
[ADD_NODE: {\\"id\\":\\"PLC-104\\", \\"name\\":\\"Secondary PLC\\", \\"type\\":\\"plc\\", \\"role\\":\\"Modbus PLC\\", \\"ip\\":\\"192.168.1.104\\", \\"x\\":620, \\"y\\":220}]
[ADD_LINK: {\\"source\\":\\"OT-SW\\", \\"target\\":\\"PLC-104\\"}]"

Keep your explanations concise, professional, and engineer-focused. If the user asks general questions or asks to analyze anomalies, respond helpfully without bracket actions.`;
  }

  async sendPrompt(userPrompt, currentNodes, currentLinks, currentProject, physicalState = null) {
    const apiKey = this.getApiKey().trim();
    const provider = this.getProvider();

    // Fallback: If no API key is supplied, run high-fidelity local Mock AI model
    if (!apiKey) {
      return this.generateMockResponse(userPrompt, currentNodes, currentLinks);
    }

    const systemPrompt = this.buildSystemPrompt(currentNodes, currentLinks, currentProject, physicalState);

    try {
      if (provider === 'gemini') {
        const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
        let lastError = null;
        
        for (const model of candidateModels) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    role: 'user',
                    parts: [{ text: systemPrompt + "\n\nUser Prompt: " + userPrompt }]
                  }
                ],
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 4000
                }
              })
            });

            if (response.ok) {
              const data = await response.json();
              return data.candidates?.[0]?.content?.parts?.[0]?.text || "Empty response from Gemini API.";
            } else {
              const errData = await response.json();
              const errMsg = errData.error?.message || `HTTP error ${response.status}`;
              // If it's not a model not found error (status 404 or specific text), throw immediately
              const isNotFound = response.status === 404 || errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('not support');
              if (!isNotFound) {
                throw new Error(errMsg);
              }
              lastError = new Error(errMsg);
            }
          } catch (e) {
            lastError = e;
            const isNotFound = e.message?.toLowerCase().includes('not found') || e.message?.toLowerCase().includes('404') || e.message?.toLowerCase().includes('not support');
            if (!isNotFound) {
              throw e;
            }
          }
        }
        throw lastError || new Error("All candidate Gemini models failed to load.");
      } else {
        // Claude API direct call. Browser-only: opt into Anthropic's client-side
        // CORS path. Without a proxy this exposes the key to the page, which is
        // acceptable only for local single-user lab use.
        const url = 'https://api.anthropic.com/v1/messages';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 4000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error?.message || `HTTP error ${response.status}`);
        }

        const data = await response.json();
        return data.content?.[0]?.text || "Empty response from Claude API.";
      }
    } catch (error) {
      console.error("AETHERIS LLM Service Error:", error);
      return `[LLM SERVICE FAULT] Failed to communicate with API provider. Reason: ${error.message}.\n\n*Note: Since this is a browser file executing directly, Google Gemini API is highly recommended as it fully supports direct client-side cross-origin fetches (CORS).*`;
    }
  }

  // High-fidelity Mock AI response system for instant prototype verification
  generateMockResponse(userPrompt, currentNodes, currentLinks) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const query = userPrompt.toLowerCase();
        let response = "";

        if (query.includes('25-node') || query.includes('25 node') || query.includes('purdue') || query.includes('ics network')) {
          response = `[MOCK AI CO-PILOT (OFFLINE SIMULATION MODE)]
Understood. Constructing a highly secure 25-node Enterprise ICS architecture mapped to the Purdue Model:
- Level 5/4 (IT Core, Active Directory Server, Enterprise Historian)
- Level 3.5 (IDMZ Edge Firewall, Jump Host, Patch Server, OT IDS)
- Level 3 (Site Core Switch, SCADA Master, EWS, Plant Historian)
- Level 1/2 (Cell Switches, Process PLC, Safety PLC, RTU)
- Level 0 (Smart Valve, VFD Drive, Sensors, E-Stop, Motorized Pumps, Flow Meter)

Deploying complete physical nodes and establishing virtual communication paths to the digital twin:
[CLEAR_TOPOLOGY]
[ADD_NODE: {"id":"IT-CORE-RT", "name":"IT Core Router", "type":"it", "role":"Router", "ip":"10.4.0.1", "x":100, "y":70}]
[ADD_NODE: {"id":"IT-AD-SRV", "name":"IT Active Directory Server", "type":"it", "role":"AD Server", "ip":"10.4.0.10", "x":200, "y":70}]
[ADD_NODE: {"id":"ENT-HIST", "name":"Enterprise Historian", "type":"it", "role":"Server", "ip":"10.4.0.20", "x":300, "y":70}]
[ADD_NODE: {"id":"IDMZ-FW", "name":"IT/OT Edge Firewall", "type":"it", "role":"Firewall", "ip":"10.35.0.1", "x":200, "y":160}]
[ADD_NODE: {"id":"JUMP-HOST", "name":"Windows Jump Host", "type":"it", "role":"Workstation", "ip":"10.35.0.10", "x":100, "y":240}]
[ADD_NODE: {"id":"PATCH-SRV", "name":"Patch Server", "type":"it", "role":"Server", "ip":"10.35.0.20", "x":200, "y":240}]
[ADD_NODE: {"id":"OT-IDS", "name":"OT Security Monitor (IDS)", "type":"it", "role":"Workstation", "ip":"10.35.0.30", "x":300, "y":240}]
[ADD_NODE: {"id":"SITE-CORE-SW", "name":"Site Core Switch", "type":"ot", "role":"Switch", "ip":"10.3.0.2", "x":460, "y":150}]
[ADD_NODE: {"id":"SCADA-MASTER", "name":"SCADA Master", "type":"ot", "role":"SCADA HMI", "ip":"10.3.0.10", "x":460, "y":60}]
[ADD_NODE: {"id":"EWS-ENG", "name":"Engineering Workstation", "type":"ot", "role":"Workstation", "ip":"10.3.0.20", "x":560, "y":60}]
[ADD_NODE: {"id":"PLANT-HIST", "name":"Plant Historian", "type":"ot", "role":"Server", "ip":"10.3.0.30", "x":660, "y":60}]
[ADD_NODE: {"id":"CELL-SW-1", "name":"Cell Switch 1", "type":"ot", "role":"Switch", "ip":"10.2.1.1", "x":560, "y":180}]
[ADD_NODE: {"id":"CELL-SW-2", "name":"Cell Switch 2", "type":"ot", "role":"Switch", "ip":"10.2.2.1", "x":560, "y":280}]
[ADD_NODE: {"id":"PROC-PLC", "name":"Process PLC", "type":"plc", "role":"Modbus PLC", "ip":"10.2.1.10", "x":680, "y":140}]
[ADD_NODE: {"id":"SAFE-PLC", "name":"Safety PLC", "type":"plc", "role":"Safety Controller", "ip":"10.2.1.20", "x":680, "y":220}]
[ADD_NODE: {"id":"RTU-CTRL", "name":"Remote Terminal Unit", "type":"plc", "role":"Modbus PLC", "ip":"10.2.2.10", "x":680, "y":320}]
[ADD_NODE: {"id":"FLOW-VALVE", "name":"Smart Flow Valve", "type":"field", "role":"Actuator", "ip":"Slave 1", "x":820, "y":50}]
[ADD_NODE: {"id":"VFD-DRIVE", "name":"VFD Drive", "type":"field", "role":"Actuator", "ip":"Slave 2", "x":820, "y":90}]
[ADD_NODE: {"id":"PRES-SENS", "name":"Pressure Sensor", "type":"field", "role":"Sensor", "ip":"Slave 3", "x":820, "y":130}]
[ADD_NODE: {"id":"TEMP-SENS", "name":"Temperature Sensor", "type":"field", "role":"Sensor", "ip":"Slave 4", "x":820, "y":170}]
[ADD_NODE: {"id":"LEVEL-SENS", "name":"Level Sensor", "type":"field", "role":"Sensor", "ip":"Slave 5", "x":820, "y":210}]
[ADD_NODE: {"id":"ESTOP-RELAY", "name":"E-Stop Relay", "type":"field", "role":"Sensor", "ip":"Slave 6", "x":820, "y":260}]
[ADD_NODE: {"id":"PUMP-A", "name":"Motorized Pump A", "type":"field", "role":"Actuator", "ip":"Slave 7", "x":820, "y":310}]
[ADD_NODE: {"id":"PUMP-B", "name":"Motorized Pump B", "type":"field", "role":"Actuator", "ip":"Slave 8", "x":820, "y":350}]
[ADD_NODE: {"id":"FLOW-METER", "name":"Flow Meter", "type":"field", "role":"Sensor", "ip":"Slave 9", "x":820, "y":390}]
[ADD_LINK: {"source":"IT-AD-SRV", "target":"IT-CORE-RT"}]
[ADD_LINK: {"source":"ENT-HIST", "target":"IT-CORE-RT"}]
[ADD_LINK: {"source":"IT-CORE-RT", "target":"IDMZ-FW"}]
[ADD_LINK: {"source":"JUMP-HOST", "target":"IDMZ-FW"}]
[ADD_LINK: {"source":"PATCH-SRV", "target":"IDMZ-FW"}]
[ADD_LINK: {"source":"OT-IDS", "target":"IDMZ-FW"}]
[ADD_LINK: {"source":"SITE-CORE-SW", "target":"IDMZ-FW"}]
[ADD_LINK: {"source":"SCADA-MASTER", "target":"SITE-CORE-SW"}]
[ADD_LINK: {"source":"EWS-ENG", "target":"SITE-CORE-SW"}]
[ADD_LINK: {"source":"PLANT-HIST", "target":"SITE-CORE-SW"}]
[ADD_LINK: {"source":"CELL-SW-1", "target":"SITE-CORE-SW"}]
[ADD_LINK: {"source":"CELL-SW-2", "target":"SITE-CORE-SW"}]
[ADD_LINK: {"source":"PROC-PLC", "target":"CELL-SW-1"}]
[ADD_LINK: {"source":"SAFE-PLC", "target":"CELL-SW-1"}]
[ADD_LINK: {"source":"RTU-CTRL", "target":"CELL-SW-2"}]
[ADD_LINK: {"source":"FLOW-VALVE", "target":"PROC-PLC"}]
[ADD_LINK: {"source":"VFD-DRIVE", "target":"PROC-PLC"}]
[ADD_LINK: {"source":"PRES-SENS", "target":"PROC-PLC"}]
[ADD_LINK: {"source":"TEMP-SENS", "target":"PROC-PLC"}]
[ADD_LINK: {"source":"LEVEL-SENS", "target":"PROC-PLC"}]
[ADD_LINK: {"source":"PUMP-A", "target":"RTU-CTRL"}]
[ADD_LINK: {"source":"PUMP-B", "target":"RTU-CTRL"}]
[ADD_LINK: {"source":"FLOW-METER", "target":"RTU-CTRL"}]
[ADD_LINK: {"source":"ESTOP-RELAY", "target":"SAFE-PLC"}]`;
        } else if (query.includes('dual-homed') || query.includes('dual homed') || query.includes('hybrid network') || query.includes('gateway topology')) {
          response = `[MOCK AI CO-PILOT (OFFLINE SIMULATION MODE)]
Understood. Constructing a highly secure, redundant Dual-Homed Internet Gateway with dual upstream WAN providers, integrated DMZ segments, and secure internal Enterprise Core LAN connectivity:

Executing canvas topology configuration instructions:
[CLEAR_TOPOLOGY]
[ADD_NODE: {"id":"WAN-RT-01", "name":"WAN Router Primary", "type":"it", "role":"Router", "ip":"203.0.113.1", "x":100, "y":80}]
[ADD_NODE: {"id":"WAN-RT-02", "name":"WAN Router Secondary", "type":"it", "role":"Router", "ip":"198.51.100.1", "x":300, "y":80}]
[ADD_NODE: {"id":"EDGE-FW-01", "name":"Dual-Homed Edge Firewall", "type":"it", "role":"Firewall", "ip":"192.168.1.1", "x":200, "y":180}]
[ADD_NODE: {"id":"IT-CORE-RT", "name":"IT Core Router", "type":"it", "role":"Router", "ip":"10.1.10.1", "x":200, "y":280}]
[ADD_NODE: {"id":"CORP-AD", "name":"Active Directory Server", "type":"it", "role":"AD Server", "ip":"10.1.10.3", "x":100, "y":360}]
[ADD_NODE: {"id":"DMZ-SW", "name":"DMZ Segment Switch", "type":"ot", "role":"Switch", "ip":"172.16.1.1", "x":350, "y":220}]
[ADD_NODE: {"id":"DMZ-WEB", "name":"Public Web Server", "type":"it", "role":"Server", "ip":"172.16.1.10", "x":350, "y":320}]
[ADD_LINK: {"source":"WAN-RT-01", "target":"EDGE-FW-01"}]
[ADD_LINK: {"source":"WAN-RT-02", "target":"EDGE-FW-01"}]
[ADD_LINK: {"source":"EDGE-FW-01", "target":"IT-CORE-RT"}]
[ADD_LINK: {"source":"EDGE-FW-01", "target":"DMZ-SW"}]
[ADD_LINK: {"source":"IT-CORE-RT", "target":"CORP-AD"}]
[ADD_LINK: {"source":"DMZ-SW", "target":"DMZ-WEB"}]`;
        } else if (query.includes('add') && (query.includes('plc') || query.includes('device') || query.includes('server') || query.includes('workstation'))) {
          // Parse node type
          let type = 'plc';
          let role = 'Modbus PLC';
          let name = 'Secondary PLC';
          let id = 'PLC-104';
          let ip = '192.168.1.104';
          let x = 620;
          let y = 220;

          if (query.includes('workstation') || query.includes('pc')) {
            type = 'it';
            role = 'Workstation';
            name = 'Finance WS';
            id = 'FIN-WS';
            ip = '10.1.10.8';
            x = 220;
            y = 300;
          } else if (query.includes('server') || query.includes('ad')) {
            type = 'it';
            role = 'AD Server';
            name = 'Backup Domain Controller';
            id = 'CORP-BDC';
            ip = '10.1.10.4';
            x = 220;
            y = 80;
          }

          // Generate dynamic IP based on count
          const count = currentNodes.length;
          
          response = `[MOCK AI CO-PILOT (NO API KEY DETECTED)]
Understood. Simulating AETHERIS intelligence: I have created a new ${role} node [${id}] and routed its communication vectors.

[ADD_NODE: {"id":"${id}", "name":"${name}", "type":"${type}", "role":"${role}", "ip":"${ip}", "x":${x}, "y":${y}}]
[ADD_LINK: {"source":"${type === 'plc' ? 'OT-SW' : 'IT-GW'}", "target":"${id}"}]`;

        } else if (query.includes('remove') || query.includes('delete')) {
          // Find a candidate node to delete
          const deletable = currentNodes.find(n => n.id !== 'IT-GW' && n.id !== 'FW-01' && n.id !== 'OT-SW');
          if (deletable) {
            response = `[MOCK AI CO-DRIVER (NO API KEY DETECTED)]
Initiating decommission playbook for asset: [${deletable.name}]. Severing firewall channels and deleting node.

[REMOVE_NODE: "${deletable.id}"]`;
          } else {
            response = `[MOCK AI CO-DRIVER] Cannot locate safe decomission candidates. Core gateway router elements cannot be deleted.`;
          }
        } else if (query.includes('clear') || query.includes('blank') || query.includes('empty')) {
          response = `[MOCK AI CO-DRIVER (NO API KEY DETECTED)]
Wiping active digital twin topology parameters. Creating a blank slate...

[CLEAR_TOPOLOGY]`;
        } else if (query.includes('connect') || query.includes('link')) {
          // Find two nodes not connected
          response = `[MOCK AI CO-DRIVER]
To establish connection streams, type: "Add link from [Node A] to [Node B]". 

Example action triggered:
[ADD_LINK: {"source":"SOC-WS", "target":"FW-01"}]`;
        } else {
          // General conversational response
          response = `[MOCK AI CO-DRIVER (NO API KEY DETECTED)]
Hello! I am standing by to build topologies or automate playbooks. 

Since you haven't supplied a live API key on the **Landing Page / Settings Panel**, I am running in **Offline Simulation Mode**.
- To build nodes, try typing: *"Add a PLC"* or *"Add a workstation"*
- To wipe the canvas, try typing: *"Clear the canvas"*
- To configure live intelligence, click the **Exit Workspace** button, select **Settings** in the portal, and paste your Google Gemini or Anthropic Claude developer token!`;
        }
        resolve(response);
      }, 800);
    });
  }
}
