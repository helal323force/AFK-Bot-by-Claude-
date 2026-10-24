/**
 * modules/miner.js - auto-mine activity.
 * Config (modules.auto_mine): enabled, targets[], radius (32), max_targets_per_cycle (5), require_tool (true)
 * Loop: find ores -> path next to them -> equip best tool -> dig -> pick up drops.
 * Returns to the start position every 5 min; remembers mined coords to skip exhausted veins.
 */
const { Vec3 } = require("vec3");

function create(inst) {
  const bot = inst.bot;
  let running = false;
  const mined = new Set();
  const keyOf = (p) => `${p.x},${p.y},${p.z}`;
  const remember = (k) => { mined.add(k); if (mined.size > 1000) mined.delete(mined.values().next().value); };

  function hasTool(block) {
    if (!block.harvestTools) return true;
    return bot.inventory.items().some((i) => block.harvestTools[i.type]);
  }

  async function mineOne(pos, cfg) {
    const block = bot.blockAt(pos);
    if (!block || !cfg.targets.includes(block.name)) { remember(keyOf(pos)); return; }
    if (cfg.require_tool !== false && !hasTool(block)) { remember(keyOf(pos)); inst.addLog(`Skipping ${block.name}: no suitable tool`, "warn"); return; }
    await inst.goto(pos.x, pos.y, pos.z, 3, 25000);
    const tool = inst.movements?.bestHarvestTool(block);
    if (tool) await bot.equip(tool, "hand").catch(() => {});
    await bot.dig(block, true);
    remember(keyOf(pos));
    inst.addLog(`Mined ${block.name} at ${pos.x},${pos.y},${pos.z}`, "success");
  }

  async function run() {
    if (running) return;
    running = true;
    const cfg = inst.config.modules.auto_mine;
    const ids = cfg.targets.map((n) => inst.mcData.blocksByName[n]?.id).filter((x) => x !== undefined);
    if (!ids.length) { inst.addLog("auto_mine: no valid targets configured", "error"); running = false; inst.activityDone("mine"); return; }
    const home = bot.entity.position.clone();
    let lastHome = Date.now();
    inst.addLog("Auto-mine started", "control");
    try {
      while (running && inst.isOnline()) {
        await inst.waitReady();
        if (Date.now() - lastHome > 5 * 60000) {
          lastHome = Date.now();
          await inst.goto(home.x, home.y, home.z, 2, 60000).catch(() => {});
        }
        const targets = bot.findBlocks({ matching: ids, maxDistance: cfg.radius || 32, count: 64 })
          .filter((p) => !mined.has(keyOf(p)))
          .sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position))
          .slice(0, cfg.max_targets_per_cycle || 5);
        if (!targets.length) { inst.addLog("No ore in range, waiting...", "info"); await inst.sleep(8000); continue; }
        for (const p of targets) {
          if (!running || !inst.isOnline()) break;
          await inst.waitReady();
          try { await mineOne(new Vec3(p.x, p.y, p.z), cfg); } catch (e) { remember(keyOf(p)); inst.addLog(`Mine error: ${e.message}`, "warn"); }
        }
        if (running) await inst.collectDrops(8, 8);
      }
    } catch (e) { if (running) inst.addLog(`Miner crashed: ${e.message}`, "error"); }
    running = false;
    inst.activityDone("mine");
  }

  return { run, halt() { running = false; }, stop() { running = false; } };
}
module.exports = { create };
