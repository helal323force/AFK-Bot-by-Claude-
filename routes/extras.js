/**
 * routes/extras.js - API for the v3.1 features. Mounted in index.js BEFORE apiRoutes(), after requireAuth, so it uses the
 * same login / x-api-key protection and the same JSON conventions as routes/api.js ({ok:true,...} or {error:"..."}).
 *
 *   POST /api/autojump        {account?, enabled:boolean}
 *   POST /api/follow          {account?, player, distance?}
 *   POST /api/stopmove        {account?}
 *   GET  /api/task?account=   current task, live detail, last result
 *   GET  /api/grind/resources
 *   POST /api/grind/check     {account?, resource, amount}     read-only pre-flight
 *   POST /api/grind           {account?, resource, amount}
 *   POST /api/house/plan      {account?, size?, material?, x?, y?, z?, allowPartial?}   read-only
 *   POST /api/house           same body - starts building
 *   GET  /api/inventory/items?account=
 *   POST /api/inventory/drop  {account?, name, count, confirmProtected?}
 */
const express = require("express");
const state = require("../core/state");

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    const status = e.status || (/^Bot is not online|Busy with|in progress/i.test(e.message) ? 409 : 400);
    res.status(status).json({ error: e.message, ...(e.requiresConfirm ? { requiresConfirm: true, reason: e.reason } : {}) });
  }
};
const instOf = (req) => {
  const id = req.body?.account || req.query?.account, inst = state.getInstance(id);
  if (!inst) throw Object.assign(new Error(`Unknown account "${id || ""}"`), { status: 404 });
  return inst;
};
const online = (inst) => { if (!inst.isOnline()) throw Object.assign(new Error("Bot is not online"), { status: 409 }); return inst; };
const mod = (inst, name) => { const m = online(inst).modules[name]; if (!m) throw Object.assign(new Error(`Feature "${name}" is disabled in settings.json`), { status: 409 }); return m; };

function extrasRoutes() {
  const r = express.Router();

  r.post("/api/autojump", wrap((req, res) => {
    if (typeof req.body?.enabled !== "boolean") throw new Error("enabled (true/false) is required");
    const inst = instOf(req); inst.setAutoJump(req.body.enabled);
    res.json({ ok: true, enabled: inst.runtime.autoJump });
  }));

  r.post("/api/follow", wrap(async (req, res) => {
    const inst = instOf(req);
    await inst.startActivity("follow", { player: String(req.body?.player || ""), distance: req.body?.distance });
    res.json({ ok: true, task: inst.state.task });
  }));

  r.post("/api/stopmove", wrap((req, res) => {
    const inst = instOf(req), was = inst.stopMovement();
    res.json({ ok: true, stopped: was || null });
  }));

  r.get("/api/task", wrap((req, res) => {
    const inst = instOf(req), s = inst.statusPayload();
    res.json({ task: s.task, detail: s.detail, lastResult: s.lastResult, rest: s.rest, nav: s.nav });
  }));

  r.get("/api/grind/resources", wrap((req, res) => res.json({ resources: Object.entries(require("../modules/grinder").RESOURCES).map(([key, d]) => ({ key, blocks: d.blocks })) })));
  r.post("/api/grind/check", wrap(async (req, res) => { const plan = await mod(instOf(req), "grind").prepare(req.body || {}); res.json({ ok: true, plan }); }));
  r.post("/api/grind", wrap(async (req, res) => {
    const inst = instOf(req); mod(inst, "grind");
    await inst.startActivity("grind", { resource: req.body?.resource, amount: req.body?.amount });
    res.json({ ok: true, task: inst.state.task });
  }));

  r.post("/api/house/plan", wrap((req, res) => res.json({ ok: true, plan: mod(instOf(req), "house").plan(req.body || {}) })));
  r.post("/api/house", wrap(async (req, res) => {
    const inst = instOf(req); mod(inst, "house");
    const { account, ...params } = req.body || {};
    await inst.startActivity("house", params);
    res.json({ ok: true, task: inst.state.task });
  }));

  r.get("/api/inventory/items", wrap((req, res) => res.json({ items: mod(instOf(req), "invtools").list() })));
  r.post("/api/inventory/drop", wrap(async (req, res) => {
    const out = await mod(instOf(req), "invtools").drop({ name: req.body?.name, count: req.body?.count, confirmProtected: req.body?.confirmProtected === true });
    res.json({ ok: true, ...out });
  }));

  return r;
}

module.exports = { extrasRoutes };
