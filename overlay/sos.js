/* Live game data from Rocket League through the SOS BakkesMod plugin ("Simple Overlay System").
   The plugin runs a small WebSocket server on the game PC (ws://localhost:49122) and sends events such as
   game:update_state (clock, score, players, boost) and game:goal_scored. The optional SOS relay re-sends the same
   events on port 49322 to clients that register for them; both work here.
   Nothing is sent back to the game. This only listens. */
const EVENTS = ["game:update_state", "game:goal_scored", "game:match_ended", "game:match_destroyed", "game:initialized",
  "game:replay_start", "game:replay_will_end", "game:replay_end", "game:round_started_go", "game:statfeed_event", "game:podium_start"];

export function connectSOS(address, on){
  const url = /^wss?:\/\//.test(address) ? address : "ws://" + address;
  let ws = null, alive = true, timer = null;
  const retry = () => { if (!alive) return; clearTimeout(timer); timer = setTimeout(open, 3000); };
  function open(){
    try { ws = new WebSocket(url); } catch(e){ retry(); return; }
    ws.onopen = () => {
      /* The relay only forwards events a client registers for; the plugin itself ignores these messages. */
      EVENTS.forEach(ev => { try { ws.send(JSON.stringify({event:"wsRelay:register", data:ev})); } catch(e){} });
      on.status?.(true);
    };
    ws.onclose = () => { on.status?.(false); retry(); };
    ws.onerror = () => {};
    ws.onmessage = e => {
      let txt = typeof e.data === "string" ? e.data : "";
      if (!txt) return;
      if (txt[0] !== "{"){ try { txt = atob(txt); } catch(err){ return; } }   // some plugin builds send base64
      let msg; try { msg = JSON.parse(txt); } catch(err){ return; }
      if (msg && msg.event) on.event?.(msg.event, msg.data);
    };
  }
  open();
  return () => { alive = false; clearTimeout(timer); try { ws?.close(); } catch(e){} };
}
