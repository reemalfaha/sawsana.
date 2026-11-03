var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var te = new TextEncoder();
var b64 = /* @__PURE__ */ __name((u) => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64");
var unb = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)), "unb");
var json = /* @__PURE__ */ __name((o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }), "json");
var err = /* @__PURE__ */ __name((m, st = 400) => json({ error: m }, st), "err");
var ready = false;
async function schema(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS teachers(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE,school TEXT,salt TEXT,hash TEXT,created INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER,code TEXT UNIQUE,enc_name TEXT,sec TEXT,no INTEGER,created INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,ts INTEGER,title TEXT,mode TEXT,subject TEXT,right INTEGER,total INTEGER,d TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ix_att ON attempts(student_id,ts)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ix_stu ON students(teacher_id)")
  ]);
  ready = true;
}
__name(schema, "schema");
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", k, te.encode(data)));
}
__name(hmac, "hmac");
async function mint(env, t, id, days) {
  const p = b64(te.encode(JSON.stringify({ t, id, exp: Date.now() + days * 864e5 })));
  return p + "." + await hmac(env.SESSION_SECRET, p);
}
__name(mint, "mint");
async function check(env, req, t) {
  const a = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  const [p, s] = a.split(".");
  if (!p || !s) return null;
  if (await hmac(env.SESSION_SECRET, p) !== s) return null;
  try {
    const o = JSON.parse(new TextDecoder().decode(unb(p)));
    return o.t === t && o.exp > Date.now() ? o.id : null;
  } catch (e) {
    return null;
  }
}
__name(check, "check");
async function pw(password, salt) {
  const k = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb(salt), iterations: 1e5, hash: "SHA-256" }, k, 256));
}
__name(pw, "pw");
var ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var mkcode = /* @__PURE__ */ __name(() => {
  const r = crypto.getRandomValues(new Uint8Array(8));
  return [...r].map((x) => ALPHA[x % 32]).join("");
}, "mkcode");
var eq = /* @__PURE__ */ __name((a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}, "eq");
var clip = /* @__PURE__ */ __name((s, n) => String(s == null ? "" : s).slice(0, n), "clip");
var worker_default = { async fetch(req, env) {
  const u = new URL(req.url);
  if (!u.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
  if (!env.DB || !env.SESSION_SECRET || !env.TEACHER_INVITE) return err("\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644\u0629 \u0628\u0639\u062F", 503);
  try {
    await schema(env.DB);
  } catch (e) {
    return err("\u062A\u0639\u0630\u0651\u0631 \u062A\u062C\u0647\u064A\u0632 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", 503);
  }
  const db = env.DB, m = req.method, p = u.pathname;
  let body = {};
  if (m === "POST") {
    try {
      body = await req.json();
    } catch (e) {
      return err("\u0637\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
    }
  }
  if (p === "/api/teacher/register" && m === "POST") {
    if (!eq(String(body.invite || ""), env.TEACHER_INVITE)) return err("\u0631\u0645\u0632 \u0627\u0644\u062F\u0639\u0648\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D", 403);
    const un = clip(body.username, 40).trim().toLowerCase(), sc = clip(body.school, 80), ps = String(body.password || "");
    if (un.length < 3 || ps.length < 6) return err("\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631 \u0642\u0635\u064A\u0631\u0629");
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    try {
      const r = await db.prepare("INSERT INTO teachers(username,school,salt,hash,created) VALUES(?,?,?,?,?)").bind(un, sc, salt, await pw(ps, salt), Date.now()).run();
      return json({ token: await mint(env, "T", r.meta.last_row_id, 30), school: sc });
    } catch (e) {
      return err("\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0633\u062A\u062E\u062F\u0645", 409);
    }
  }
  if (p === "/api/teacher/login" && m === "POST") {
    const r = await db.prepare("SELECT * FROM teachers WHERE username=?").bind(clip(body.username, 40).trim().toLowerCase()).first();
    if (!r || !eq(await pw(String(body.password || ""), r.salt), r.hash)) return err("\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629", 401);
    return json({ token: await mint(env, "T", r.id, 30), school: r.school });
  }
  if (p === "/api/students" || p.startsWith("/api/students/")) {
    const tid = await check(env, req, "T");
    if (!tid) return err("\u063A\u064A\u0631 \u0645\u0635\u0631\u0651\u062D", 401);
    if (p === "/api/students" && m === "GET") {
      const st = (await db.prepare("SELECT id,code,enc_name,sec,no FROM students WHERE teacher_id=? ORDER BY sec,no").bind(tid).all()).results;
      const at = (await db.prepare("SELECT a.student_id,a.ts,a.title,a.mode,a.subject,a.right,a.total,a.d FROM attempts a JOIN students s ON s.id=a.student_id WHERE s.teacher_id=? ORDER BY a.ts DESC LIMIT 4000").bind(tid).all()).results;
      return json({ students: st, attempts: at });
    }
    if (p === "/api/students" && m === "POST") {
      const arr = Array.isArray(body.students) ? body.students.slice(0, 80) : [];
      const out = [];
      for (const s of arr) {
        let code, ok = false;
        for (let i = 0; i < 5 && !ok; i++) {
          code = mkcode();
          try {
            await db.prepare("INSERT INTO students(teacher_id,code,enc_name,sec,no,created) VALUES(?,?,?,?,?,?)").bind(tid, code, clip(s.encName, 500), clip(s.sec, 10), parseInt(s.no) || 0, Date.now()).run();
            ok = true;
          } catch (e) {
          }
        }
        if (ok) out.push({ code, sec: clip(s.sec, 10), no: parseInt(s.no) || 0 });
      }
      return json({ created: out });
    }
    if (m === "DELETE") {
      const id = parseInt(p.split("/").pop());
      await db.prepare("DELETE FROM attempts WHERE student_id IN (SELECT id FROM students WHERE id=? AND teacher_id=?)").bind(id, tid).run();
      await db.prepare("DELETE FROM students WHERE id=? AND teacher_id=?").bind(id, tid).run();
      return json({ ok: 1 });
    }
  }
  if (p === "/api/student/login" && m === "POST") {
    const r = await db.prepare("SELECT id,sec,no FROM students WHERE code=?").bind(clip(body.code, 12).trim().toUpperCase()).first();
    if (!r) return err("\u0627\u0644\u0631\u0645\u0632 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D", 401);
    return json({ token: await mint(env, "S", r.id, 365), sec: r.sec, no: r.no });
  }
  if (p === "/api/attempt" && m === "POST") {
    const sid = await check(env, req, "S");
    if (!sid) return err("\u063A\u064A\u0631 \u0645\u0635\u0631\u0651\u062D", 401);
    const d = Array.isArray(body.d) ? body.d.slice(0, 40).map((x) => [x[0] | 0, x[1] | 0, x[2] | 0, x[3] | 0]) : [];
    await db.prepare("INSERT INTO attempts(student_id,ts,title,mode,subject,right,total,d) VALUES(?,?,?,?,?,?,?,?)").bind(sid, Date.now(), clip(body.title, 80), clip(body.mode, 12), clip(body.subject, 12), body.right | 0, body.total | 0, JSON.stringify(d)).run();
    return json({ ok: 1 });
  }
  return err("\u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F", 404);
} };

// ../../../tmp/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../tmp/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-YRVCBB/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../tmp/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-YRVCBB/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
