/**
 * modules/waypoint.js - "move" activity: go to x/y/z, wander randomly, or follow a player.
 * run({x,y?,z}) | run({random:true}) | run({follow:"Name"})
 * Emits Socket.IO "move_status" {state: navigating|arrived|failed|following, target, error}.
 */
const { goals } = require("mineflayer-pathfinder");

function create(inst) {
  const bot = inst.bot;
  let token = 0;

  const status = (state, extra = {}) => inst.emitSocket("move_status", { state, ...extra });

  async function run(p = {}) {
    const my = ++token;
    if (p.follow) {
      const target = bot.players[p.follow]?.entity;
      if (!target) { status("failed", { error: `${p.follow} not visible` }); inst.addLog(`Cannot follow ${p.follow}: not in range`, "warn"); inst.activityDone("move"); return; }
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 3), true);
      status("following", { target: p.follow });
      inst.addLog(`Following ${p.follow}`, "control");
      return; // stays active until stopActivity()
    }
    let x = Number(p.x), y = p.y == null || p.y === "" ? null : Number(p.y), z = Number(p.z);
    if (p.random) {
      const me = bot.entity.position;
      x = me.x + (Math.random() - 0.5) * 24; z = me.z + (Math.random() - 0.5) * 24; y = null;
    }
    if (!Number.isFinite(x) || !Number.isFinite(z) || (y !== null && !Number.isFinite(y))) { status("failed", { error: "invalid coordinates" }); inst.activityDone("move"); return; }
    const target = { x: Math.round(x), y: y === null ? null : Math.round(y), z: Math.round(z) };
    status("navigating", { target });
    inst.addLog(`Navigating to ${target.x}, ${target.y ?? "~"}, ${target.z}`, "control");
    try {
      await inst.goto(x, y, z, 2, 120000);
      if (my !== token) return;
      status("arrived", { target });
      inst.addLog("Arrived at waypoint", "success");
    } catch (e) {
      if (my !== token) return;
      status("failed", { target, error: e.message });
      inst.addLog(`Navigation failed: ${e.message}`, "warn");
    }
    inst.activityDone("move");
  }

  return { run, halt() { token++; }, stop() { token++; } };
}
module.exports = { create };
