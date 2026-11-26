var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => DshEmbedPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/view.ts
var import_obsidian = require("obsidian");
var VIEW_TYPE_DSH_EMBED = "dsh-embed-view";
var DshEmbedView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  /** The live embed iframe, when rendered. */
  frame = null;
  /** Launch token baked into the current iframe URL (for rotation watch). */
  frameToken = "";
  healTimer = null;
  getViewType() {
    return VIEW_TYPE_DSH_EMBED;
  }
  getDisplayText() {
    return "DeepSeek Harness";
  }
  getIcon() {
    return "bot";
  }
  async onOpen() {
    await this.render();
  }
  async render() {
    this.stopHealWatch();
    const container = this.contentEl;
    container.empty();
    container.addClass("dsh-embed-view");
    const status = container.createDiv({ cls: "dsh-embed-status" });
    status.setText("Connecting to DSH\u2026");
    const base = this.plugin.settings.serverUrl.trim() || "http://127.0.0.1:3080";
    const online = await this.probe(base);
    if (!online) {
      this.renderOffline(container, base);
      return;
    }
    let token = await this.plugin.resolveToken();
    let url = this.plugin.buildFrameUrl(token);
    if (!await this.probeEmbed(url)) {
      token = await this.plugin.resolveToken();
      url = this.plugin.buildFrameUrl(token);
      if (!await this.probeEmbed(url)) {
        this.renderAuthError(container, base);
        return;
      }
    }
    container.removeChild(status);
    const frame = container.createEl("iframe", { cls: "dsh-embed-frame" });
    frame.setAttribute("src", url);
    frame.setAttribute("allow", "clipboard-read; clipboard-write");
    this.frame = frame;
    this.frameToken = token;
    this.plugin.registerFrame(this);
    this.startHealWatch();
  }
  /**
   * Self-heal after server restarts: the launch token rotates per process, so
   * a panel that stayed open across a restart holds a dead URL. Poll the log
   * and re-render when the token changed.
   */
  startHealWatch() {
    this.stopHealWatch();
    this.healTimer = window.setInterval(() => void this.healCheck(), 2e4);
    this.plugin.registerInterval(this.healTimer);
  }
  stopHealWatch() {
    if (this.healTimer !== null) {
      window.clearInterval(this.healTimer);
      this.healTimer = null;
    }
  }
  async healCheck() {
    if (!this.frame || !this.frame.isConnected) {
      this.stopHealWatch();
      return;
    }
    const token = await this.plugin.resolveToken();
    if (!token || !this.frameToken || token === this.frameToken) return;
    new import_obsidian.Notice("DSH \u670D\u52A1\u5DF2\u91CD\u542F\uFF0C\u6B63\u5728\u5237\u65B0\u9762\u677F\u2026");
    await this.render();
  }
  /**
   * The exact embed URL: accepted tokens yield 200 (bridge serves directly)
   * or a 303 cookie-mint redirect; a stale token yields the 401 auth wall.
   */
  async probeEmbed(url) {
    try {
      const res = await (0, import_obsidian.requestUrl)({ url, method: "GET", throw: false });
      return res.status >= 200 && res.status < 400;
    } catch {
      return false;
    }
  }
  renderAuthError(container, base) {
    const status = container.querySelector(".dsh-embed-status");
    if (status) container.removeChild(status);
    const box = container.createDiv({ cls: "dsh-embed-offline" });
    box.createEl("p", { text: `DSH at ${base} rejected the launch token (401).` });
    box.createEl("p", {
      cls: "dsh-embed-hint",
      text: "The token rotates on every server restart. Check Settings \u2192 DeepSeek Harness (Embed) \u2192 Token log path, or paste the current 'dsh web' URL into Auth URL."
    });
    const row = box.createDiv({ cls: "dsh-embed-actions" });
    const retry = row.createEl("button", { text: "Retry" });
    retry.addEventListener("click", () => void this.render());
  }
  renderOffline(container, base) {
    const box = container.createDiv({ cls: "dsh-embed-offline" });
    box.createEl("p", { text: `DSH server is not reachable at ${base}.` });
    box.createEl("p", {
      cls: "dsh-embed-hint",
      text: "Start your harness (e.g. launchd service or `dsh web`), then retry."
    });
    const row = box.createDiv({ cls: "dsh-embed-actions" });
    const retry = row.createEl("button", { text: "Retry" });
    retry.addEventListener("click", () => void this.render());
    const startCommand = this.plugin.settings.startCommand.trim();
    if (startCommand) {
      const start = row.createEl("button", { text: "Start service" });
      start.addEventListener("click", () => {
        void this.startService(startCommand);
      });
    }
  }
  async probe(base) {
    try {
      const res = await (0, import_obsidian.requestUrl)({ url: `${base.replace(/\/+$/, "")}/`, method: "GET", throw: false });
      return res.status < 500;
    } catch {
      return false;
    }
  }
  async startService(command) {
    try {
      const req = window.require;
      if (!req) throw new Error("node require unavailable");
      const { exec } = req("child_process");
      exec(command, (error) => {
        if (error) new import_obsidian.Notice(`DSH start failed: ${error.message}`);
      });
      new import_obsidian.Notice("Starting DSH\u2026");
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1e3));
        if (await this.probe(this.plugin.settings.serverUrl)) {
          await this.render();
          return;
        }
      }
      new import_obsidian.Notice("DSH did not become ready in 30s \u2014 check its logs.");
    } catch (e) {
      new import_obsidian.Notice(`DSH start failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async onClose() {
    this.stopHealWatch();
    if (this.frame) this.plugin.unregisterFrame(this);
    this.frame = null;
    this.contentEl.empty();
  }
};

// src/web-preview-view.ts
var import_obsidian2 = require("obsidian");
var VIEW_TYPE_WEB_PREVIEW = "dsh-embed-web-preview";
var WebPreviewView = class extends import_obsidian2.ItemView {
  filePath = "";
  constructor(leaf) {
    super(leaf);
  }
  getViewType() {
    return VIEW_TYPE_WEB_PREVIEW;
  }
  getDisplayText() {
    const name = this.filePath.split("/").pop();
    return name || "\u9884\u89C8";
  }
  getIcon() {
    return "globe";
  }
  /** Obsidian calls this on setViewState and on workspace restore. */
  async setState(state) {
    if (state && typeof state.path === "string" && state.path !== this.filePath) {
      this.filePath = state.path;
      this.renderWebview();
      this.leaf.updateHeader?.();
    }
    return Promise.resolve();
  }
  getState() {
    return { path: this.filePath };
  }
  async onOpen() {
    this.renderWebview();
    return Promise.resolve();
  }
  renderWebview() {
    const el = this.contentEl;
    el.empty();
    el.addClass("dsh-embed-web-preview");
    if (!this.filePath) return;
    const wv = document.createElement("webview");
    wv.setAttribute(
      "src",
      "file://" + this.filePath.split("/").map(encodeURIComponent).join("/")
    );
    wv.setAttribute("allowpopups", "true");
    wv.classList.add("dsh-embed-web-preview-frame");
    el.appendChild(wv);
  }
};

// src/annotate-modal.ts
var import_obsidian3 = require("obsidian");
var AnnotateModal = class extends import_obsidian3.Modal {
  constructor(app, payload, onDone) {
    super(app);
    this.payload = payload;
    this.onDone = onDone;
  }
  annotation = "";
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("dsh-embed-annotate");
    const { relPath, fromLine, toLine, selection } = this.payload;
    contentEl.createEl("h3", { text: "\u53D1\u9001\u5230 DeepSeek Harness" });
    contentEl.createEl("div", {
      cls: "dsh-embed-annotate-src",
      text: `${relPath} \xB7 \u7B2C ${fromLine}\u2013${toLine} \u884C`
    });
    const quote = contentEl.createEl("pre", { cls: "dsh-embed-annotate-quote" });
    quote.setText(selection.length > 800 ? selection.slice(0, 800) + "\n\u2026" : selection);
    const ta = contentEl.createEl("textarea", {
      cls: "dsh-embed-annotate-input",
      placeholder: "\u6279\u6CE8\uFF08\u53EF\u9009\uFF09\u2014 \u8BF4\u660E\u8FD9\u6BB5\u6587\u5B57\u8981\u505A\u4EC0\u4E48"
    });
    ta.rows = 4;
    ta.addEventListener("input", () => {
      this.annotation = ta.value;
    });
    window.setTimeout(() => ta.focus(), 0);
    ta.addEventListener("keydown", (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
        ev.preventDefault();
        this.finish("send");
      }
    });
    const row = contentEl.createDiv({ cls: "dsh-embed-annotate-actions" });
    const fillBtn = row.createEl("button", { text: "\u52A0\u5165\u8F93\u5165\u6846" });
    fillBtn.addEventListener("click", () => this.finish("fill"));
    const sendBtn = row.createEl("button", { text: "\u76F4\u63A5\u53D1\u9001 (\u2318\u23CE)", cls: "mod-cta" });
    sendBtn.addEventListener("click", () => this.finish("send"));
  }
  compose() {
    const { relPath, fromLine, toLine, selection } = this.payload;
    const quoted = selection.split("\n").map((l) => `> ${l}`).join("\n");
    let text = `\u5F15\u7528\u81EA ${relPath}\uFF08\u7B2C ${fromLine}\u2013${toLine} \u884C\uFF09\uFF1A
${quoted}`;
    const note = this.annotation.trim();
    if (note) text += `

\u6279\u6CE8\uFF1A${note}`;
    return text;
  }
  finish(action) {
    const text = this.compose();
    if (!text.trim()) {
      new import_obsidian3.Notice("\u6CA1\u6709\u53EF\u53D1\u9001\u7684\u5185\u5BB9");
      return;
    }
    this.close();
    this.onDone(text, action);
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/install-modal.ts
var import_obsidian4 = require("obsidian");
var InstallConsentModal = class extends import_obsidian4.Modal {
  constructor(app, profileDir, onDecision) {
    super(app);
    this.profileDir = profileDir;
    this.onDecision = onDecision;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("dsh-embed-annotate");
    contentEl.createEl("h3", { text: "\u5B89\u88C5 DSH \u670D\u52A1\u7AEF\u7EC4\u4EF6" });
    contentEl.createEl("p", {
      text: "\u672C\u63D2\u4EF6\u628A DSH Web GUI \u5D4C\u5165\u4FA7\u8FB9\u680F\u3002\u9690\u85CF\u4FA7\u680F\u3001\u9876\u680F\u5207\u6362\u5668\u3001\u5D4C\u5165\u8BA4\u8BC1\u7B49\u5B9A\u5236\u7531\u4E00\u4E2A\u5C0F\u578B\u670D\u52A1\u7AEF\u7EC4\u4EF6\uFF08dsh-obsidian-embed\uFF09\u63D0\u4F9B\u3002\u8BE5\u7EC4\u4EF6\u5DF2\u6253\u5305\u5728\u672C\u63D2\u4EF6\u5185\uFF08\u4E0D\u4F1A\u8054\u7F51\u4E0B\u8F7D\u4EFB\u4F55\u5185\u5BB9\uFF09\uFF0C\u9700\u8981\u5199\u5165 DSH \u7684 profile \u76EE\u5F55\uFF1A"
    });
    contentEl.createEl("pre", {
      cls: "dsh-embed-annotate-quote",
      text: `${this.profileDir}/packages/dsh-obsidian-embed/
${this.profileDir}/cordis.patch.yml\uFF08\u8FFD\u52A0\u4E00\u884C\u6302\u8F7D\uFF09`
    });
    contentEl.createEl("p", {
      cls: "dsh-embed-hint",
      text: "\u53EA\u5199\u8FD9\u4E24\u4E2A\u4F4D\u7F6E\uFF0C\u4E14\u53EA\u5728\u4F60\u70B9\u300C\u5B89\u88C5\u300D\u540E\u5199\u5165\uFF1B\u5B89\u88C5\u540E\u9700\u8981\u91CD\u542F\u4E00\u6B21 DSH \u670D\u52A1\u751F\u6548\u3002\u4E5F\u53EF\u4EE5\u5728\u8BBE\u7F6E\u9875\u968F\u65F6\u5B89\u88C5/\u4FEE\u590D\u3002"
    });
    const row = contentEl.createDiv({ cls: "dsh-embed-annotate-actions" });
    const later = row.createEl("button", { text: "\u4EE5\u540E\u518D\u8BF4" });
    later.addEventListener("click", () => {
      this.close();
      this.onDecision(false);
    });
    const ok = row.createEl("button", { text: "\u5B89\u88C5", cls: "mod-cta" });
    ok.addEventListener("click", () => {
      this.close();
      this.onDecision(true);
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/embedded-server-package.ts
var SERVER_PACKAGE_VERSION = "0.3.0";
var SERVER_FILES = {
  "package.json": '{\n  "name": "dsh-obsidian-embed",\n  "description": "Obsidian embed mode for the DSH Web GUI: hides the sidebar, adds a compact workspace/session top bar, scales conversation fonts, auto-connects the vault workspace, accepts the launch token for iframe auth (DSH >= 0.1.2), and bridges editor selections into the composer.",\n  "version": "0.3.0",\n  "private": true,\n  "type": "module",\n  "main": "lib/index.js",\n  "exports": {\n    ".": "./lib/index.js",\n    "./client": "./lib/client.js",\n    "./package.json": "./package.json"\n  },\n  "files": [\n    "lib/index.js",\n    "lib/client.js"\n  ],\n  "license": "MIT",\n  "dsh": {\n    "client": {\n      "platform": "web",\n      "immediately": true,\n      "inject": [\n        "@deepseek-ai/dsh-client-runtime",\n        "@deepseek-ai/dsh-client-ui-layout"\n      ]\n    }\n  }\n}\n',
  "lib/index.js": `// dsh-obsidian-embed \u2014 host half.
//
// Two jobs:
//
// 1. Embed auth adapter (DSH \u2265 0.1.2): the browser-session cookie is
//    structurally unusable inside Obsidian's cross-site iframe, so embed
//    pages authenticate with the launch token instead. We accept the token
//    as \`?token=\` query or \`Authorization: Bearer\` for index GETs marked
//    \`ob=1\` and for /api requests \u2014 an extra accepted credential on top of
//    the untouched defaults. Feature-detected: on pre-0.1.2 servers without
//    the browser-auth API the adapter stays inert.
//
// 2. tapIndex injection: pages carrying \`ob=1\` additionally receive
//    \`window.__DSH_EMBED_TOKEN__\` plus a small interceptor script that
//    attaches the token to /api fetch/XHR calls and the WebSocket URL. The
//    interceptor script self-gates on the \`ob=1\` query param, so normal
//    browser windows are untouched even though tapIndex transforms every
//    served index.

const name = "dsh-obsidian-embed";

/** Client-side transport interceptor, injected before the app bundles. */
const INTERCEPTOR = \`(function(){
try {
  var q = new URLSearchParams(window.location.search);
  if (!q.has('ob')) return; // normal browser windows stay untouched
  var ET = window.__DSH_EMBED_TOKEN__ || '';
  if (!ET) return;
  var addQ = function (u) {
    try { u = String(u); return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(ET); }
    catch (_) { return u; }
  };
  var NF = window.fetch && window.fetch.bind(window);
  if (NF) {
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : String((input && (input.href || input.url)) || '');
        if (url.indexOf('/api') >= 0) {
          var headers = {};
          var h = init && init.headers;
          if (h) {
            if (typeof h.forEach === 'function') h.forEach(function (v, k) { headers[String(k)] = String(v); });
            else for (var k in h) headers[String(k)] = String(h[k]);
          }
          headers.authorization = 'Bearer ' + ET;
          init = Object.assign({}, init || {}, { headers: headers });
        }
      } catch (_) {}
      return NF(input, init);
    };
  }
  var OW = window.WebSocket;
  if (OW) {
    var EW = function (url, protocols) {
      try { url = addQ(url); } catch (_) {}
      return protocols === undefined ? new OW(url) : new OW(url, protocols);
    };
    EW.prototype = OW.prototype;
    EW.CONNECTING = OW.CONNECTING; EW.OPEN = OW.OPEN; EW.CLOSING = OW.CLOSING; EW.CLOSED = OW.CLOSED;
    window.WebSocket = EW;
  }
  var XP = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (XP && XP.open && XP.send) {
    var xOpen = XP.open, xSend = XP.send;
    XP.open = function (method, url) {
      try { this.__dshEmbedUrl = String(url); } catch (_) {}
      return xOpen.apply(this, arguments);
    };
    XP.send = function () {
      try { if (String(this.__dshEmbedUrl || '').indexOf('/api') >= 0) this.setRequestHeader('authorization', 'Bearer ' + ET); } catch (_) {}
      return xSend.apply(this, arguments);
    };
  }
  var OE = window.EventSource;
  if (OE) {
    var EE = function (url, cfg) {
      try { url = addQ(url); } catch (_) {}
      return cfg === undefined ? new OE(url) : new OE(url, cfg);
    };
    EE.prototype = OE.prototype;
    window.EventSource = EE;
  }
} catch (_) {}
})()\`;

// ---------------------------------------------------------------------------
// Auth adapter
// ---------------------------------------------------------------------------

function headerOf(req, headerName) {
  try {
    const h = req && req.headers;
    if (!h) return "";
    if (typeof h.get === "function") return h.get(headerName) || "";
    return h[headerName] || h[headerName.toLowerCase()] || "";
  } catch {
    return "";
  }
}

function queryOf(req) {
  try {
    const u = String((req && req.url) || "");
    const qi = u.indexOf("?");
    if (qi < 0) return new URLSearchParams();
    return new URLSearchParams(u.slice(qi + 1));
  } catch {
    return null;
  }
}

function tokenOf(connection) {
  try {
    return new URL(connection.authenticatedUrl("http://127.0.0.1/")).searchParams.get("token") || "";
  } catch {
    return "";
  }
}

/**
 * Patch the BrowserAuth prototype once: keep every default verdict, but let a
 * request through when it carries the current launch token as Bearer header
 * or \`?token=\` query (401s only \u2014 403 fences stay untouched), and serve the
 * index directly for \`GET /?ob=1&token=<T>\` (no cookie-mint redirect, so the
 * embed page keeps its query string \u2014 the client module needs \`ob=1\`).
 */
function patchAuth(connection, token) {
  const proto = Object.getPrototypeOf(connection);
  if (!proto || proto.__dshObsidianEmbedPatched) return;
  const origRejection = typeof connection.requestRejection === "function" ? proto.requestRejection : null;
  const origIndex = typeof connection.authorizeIndex === "function" ? proto.authorizeIndex : null;
  if (!origRejection && !origIndex) return;
  proto.__dshObsidianEmbedPatched = true;

  if (origRejection) {
    proto.requestRejection = function (req) {
      const verdict = origRejection.call(this, req);
      if (verdict !== 401) return verdict;
      try {
        if (headerOf(req, "authorization") === "Bearer " + token) return undefined;
        const q = queryOf(req);
        if (q && q.get("token") === token) return undefined;
      } catch {}
      return verdict;
    };
  }

  if (origIndex) {
    proto.authorizeIndex = function (req, res) {
      try {
        if (req && req.method === "GET") {
          const u = String(req.url || "");
          const qi = u.indexOf("?");
          const pathOnly = qi < 0 ? u : u.slice(0, qi);
          if (pathOnly === "/" || pathOnly === "") {
            const q = queryOf(req);
            if (q && q.get("ob") === "1" && q.get("token") === token) return true;
          }
        }
      } catch {}
      return origIndex.call(this, req, res);
    };
  }
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

function apply(ctx) {
  let token = "";

  // The connection service carries the BrowserAuth instance on \u22650.1.2; the
  // inject block simply never fires on older servers (adapter stays inert).
  ctx.inject(["connection"], (cctx) => {
    try {
      const conn = cctx.connection;
      if (!conn || typeof conn.authenticatedUrl !== "function") {
        console.log("[dsh-obsidian-embed] no browser-auth API (pre-0.1.2) \u2014 auth adapter idle");
        return;
      }
      token = tokenOf(conn);
      if (!token) {
        console.log("[dsh-obsidian-embed] launch token empty \u2014 auth adapter idle");
        return;
      }
      patchAuth(conn, token);
      console.log("[dsh-obsidian-embed] embed auth adapter active (token len " + String(token.length) + ")");
    } catch (err) {
      console.warn("[dsh-obsidian-embed] auth adapter failed:", err && err.message);
    }
  });

  ctx.inject(["webServer"], (wctx) => {
    wctx.effect(
      () =>
        wctx.webServer.tapIndex((html) => {
          // tapIndex sees no request, so every index gets the injection; the
          // interceptor self-gates on \`ob=1\` in the page URL. The token var
          // is only written once the adapter resolved one.
          if (!token) return html;
          const inject =
            "<script>window.__DSH_EMBED_TOKEN__=" + JSON.stringify(token) + ";<\/script>" +
            "<script>" + INTERCEPTOR + "<\/script>";
          return html.replace("<head>", "<head>" + inject);
        }),
      "dsh-obsidian-embed: index auth injection",
    );
  });
}

export { apply, name };
`,
  "lib/client.js": '// dsh-obsidian-embed \u2014 client half (browser).\n//\n// Obsidian embed mode for the DSH Web GUI. Everything here is gated on the\n// page being embedded (loaded inside an iframe, or carrying ?ob=1), so the\n// GUI in a normal browser window is never touched.\n//\n// What it does in embed mode:\n//   1. Hides the left sidebar completely: the `sidebar` slot is reseated with\n//      an empty render (kills the rail), and CSS zeroes the frame\'s sidebar\n//      track (the layout store maps "collapsed" to a 56px rail, so CSS is the\n//      only way to reach 0). The details column and drag handles are hidden\n//      too \u2014 unusable at Obsidian side-panel widths.\n//   2. Registers a compact top bar into `shell.overlay`: workspace picker,\n//      session picker, new-session button, and a zoom control scaling the\n//      conversation/trajectory area.\n//   3. Auto-connects the vault workspace: the Obsidian plugin passes the vault\n//      root as ?obVault=<abs path>; once the workspace/session baselines are\n//      ready the bar creates (or idempotently resolves) the workspace and\n//      opens its newest session, so the panel always lands on vault work.\n//   4. Injects embed CSS: bar styling, top clearance for the center column,\n//      and the `zoom` factor (persisted per origin in localStorage).\n//\n// Module format: window.__ModuleLoader__.load factory, the same shape the\n// shipped external client bundles use. No imports; react comes via require().\n\nwindow.__ModuleLoader__.load({\n  id: "dsh-obsidian-embed",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n    var React = require("react");\n\n    // ---------------------------------------------------------------------\n    // Embed detection\n    // ---------------------------------------------------------------------\n\n    function isEmbed() {\n      try {\n        if (window.self !== window.top) return true;\n      } catch (_) {\n        return true; // cross-origin frame access throws \u2014 definitely framed\n      }\n      try {\n        return new URLSearchParams(window.location.search).get("ob") === "1";\n      } catch (_) {\n        return false;\n      }\n    }\n\n    function queryParam(key) {\n      try {\n        return new URLSearchParams(window.location.search).get(key) || "";\n      } catch (_) {\n        return "";\n      }\n    }\n\n    // The vault path travels base64url-encoded (obVaultB64): immune to every\n    // URL-layer quirk (spaces as \'+\', unicode normalization, router rewrites)\n    // that otherwise corrupts absolute paths in transit. Plain obVault remains\n    // as a fallback for hand-built URLs.\n    function vaultPathParam() {\n      var b64 = queryParam("obVaultB64");\n      if (b64) {\n        try {\n          var bin = window.atob(b64.replace(/-/g, "+").replace(/_/g, "/"));\n          var bytes = new Uint8Array(bin.length);\n          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);\n          return new TextDecoder("utf-8").decode(bytes);\n        } catch (_) {\n          return "";\n        }\n      }\n      return queryParam("obVault");\n    }\n\n    // ---------------------------------------------------------------------\n    // Zoom preference (per-origin, embed only)\n    // ---------------------------------------------------------------------\n\n    var ZOOM_KEY = "dsh-obsidian-embed:zoom";\n    var ZOOM_STEPS = [0.7, 0.8, 0.9, 1.0, 1.15];\n    var ZOOM_DEFAULT = 0.9;\n\n    function readZoom() {\n      try {\n        var v = parseFloat(window.localStorage.getItem(ZOOM_KEY) || "");\n        if (isFinite(v) && v >= 0.5 && v <= 1.5) return v;\n      } catch (_) {}\n      return ZOOM_DEFAULT;\n    }\n\n    function writeZoom(z) {\n      try {\n        window.localStorage.setItem(ZOOM_KEY, String(z));\n      } catch (_) {}\n      try {\n        document.documentElement.style.setProperty("--dsh-ob-zoom", String(z));\n      } catch (_) {}\n    }\n\n    // ---------------------------------------------------------------------\n    // Embed CSS\n    // ---------------------------------------------------------------------\n\n    // The frame div is the parent of the only element carrying a stable\n    // marker ([data-shell-overlay]); its div children are, in order: sidebar\n    // column, center column, details column, overlay layer. All class names\n    // on those columns are per-build CSS-module hashes, so the marker walk is\n    // the durable selector.\n    var FRAME = "div:has(> [data-shell-overlay])";\n\n    var EMBED_CSS = [\n      // Top bar (rendered through shell.overlay, whose layer is absolute and\n      // click-through except for direct children \u2014 opt back in explicitly).\n      ".dsh-ob-bar{position:absolute;top:0;left:0;right:0;height:38px;display:flex;align-items:center;gap:6px;padding:0 10px;box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary);pointer-events:auto}",\n      ".dsh-ob-bar select{flex:1 1 0;min-width:0;height:24px;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:0 4px;outline:none;text-overflow:ellipsis}",\n      ".dsh-ob-bar select:focus-visible{border-color:var(--dsw-alias-brand-primary)}",\n      ".dsh-ob-bar button{flex:none;height:24px;min-width:24px;font-size:12px;line-height:1;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;cursor:pointer;padding:0 7px}",\n      ".dsh-ob-bar button:hover{background:var(--dsw-alias-bg-layer-2)}",\n      ".dsh-ob-bar .dsh-ob-zoom{flex:none;font-size:11px;opacity:0.75;min-width:34px;text-align:center}",\n      ".dsh-ob-bar .dsh-ob-err{color:var(--dsw-alias-state-error-primary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%}",\n      // Settings popover anchored under the bar\'s gear button. Future embed\n      // settings add rows here instead of new always-visible chrome.\n      ".dsh-ob-pop{position:absolute;top:40px;right:8px;display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.28)}",\n      ".dsh-ob-pop .dsh-ob-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}",\n      ".dsh-ob-pop .dsh-ob-row .dsh-ob-cap{flex:none;opacity:0.8}",\n      // Frame: drop the sidebar and details tracks entirely (the store\'s\n      // collapsed state is still a 56px rail, so CSS has to zero the tracks).\n      // NB: never display:none the column divs \u2014 grid auto-placement would\n      // shift the remaining in-flow columns into the zero-width tracks. The\n      // columns stay as overflow-hidden 0px items; only the (absolutely\n      // positioned, non-grid-flow) drag handles get display:none.\n      FRAME + "{grid-template-columns:0 minmax(0,1fr) 0 !important}",\n      FRAME + " > div[class*=\'handle\']{display:none}",\n      FRAME + " > div:nth-of-type(2){padding-top:38px;box-sizing:border-box;zoom:var(--dsh-ob-zoom, 0.9)}",\n    ].join("\\n");\n\n    function injectCssOnce() {\n      var tagId = "dsh-obsidian-embed/embed-css";\n      if (typeof document === "undefined") return;\n      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;\n      var tag = document.createElement("style");\n      tag.dataset.plugin = "dsh-obsidian-embed";\n      tag.dataset.pluginCss = tagId;\n      tag.textContent = EMBED_CSS;\n      document.head.appendChild(tag);\n    }\n\n    // ---------------------------------------------------------------------\n    // Top bar: workspace picker, session picker, new session, zoom.\n    // ---------------------------------------------------------------------\n\n    function EmbedBar(props) {\n      var ctx = props.__ctx;\n      var wsItems = props.useWorkspaces(function (s) { return s.items; }) || [];\n      var archived = props.useWorkspaces(function (s) { return s.archivedSessionIds; }) || [];\n      var baselinesReady = !!props.useWorkspaces(function (s) { return s.baselinesReady; });\n      var byId = props.useSessions(function (s) { return s.byId; }) || {};\n      var current = props.useSessions(function (s) { return s.current; });\n      var zoomPair = React.useState(readZoom());\n      var zoom = zoomPair[0];\n      var setZoom = zoomPair[1];\n      var errPair = React.useState("");\n      var err = errPair[0];\n      var setErr = errPair[1];\n      var autoRef = React.useRef(false);\n      var fallbackPair = React.useState(false);\n      var fallbackReady = fallbackPair[0];\n      var setFallbackReady = fallbackPair[1];\n\n      React.useEffect(() => { writeZoom(zoom); }, [zoom]);\n\n      // baselinesReady has proven unreliable on some builds (stuck false even\n      // with the data visibly loaded), so arm a 4s fallback trigger.\n      React.useEffect(() => {\n        var t = setTimeout(function () { setFallbackReady(true); }, 4000);\n        return function () { clearTimeout(t); };\n      }, []);\n\n      // Current workspace = the one accounting the current session.\n      var curWs = null;\n      for (var i = 0; i < wsItems.length; i++) {\n        var w = wsItems[i];\n        if (current && w.sessionIds && w.sessionIds.indexOf(current) >= 0) { curWs = w; break; }\n      }\n      var curWsId = curWs ? curWs.workspaceId : "";\n\n      // Set when the user picks a session/workspace manually \u2014 retries must\n      // never yank them back to the vault session.\n      var userTouchedRef = React.useRef(false);\n\n      // The canonical "open a session" UI navigation (what a sidebar click\n      // does): select it in the store AND surface its Conversation.\n      var openSession = function (sid) {\n        var uiWs = ctx.uiWorkspace;\n        if (uiWs && typeof uiWs.openSession === "function") {\n          uiWs.openSession(sid);\n          return;\n        }\n        ctx.sessions.open(sid);\n        if (ctx.layout && typeof ctx.layout.selectPanel === "function") ctx.layout.selectPanel(null);\n      };\n\n      // Pick the most useful landing session from a workspace\'s session ids:\n      // sessions with real conversation content first (a blank one would just\n      // sit on the hero screen), newest activity breaking ties. The session\n      // list entries carry `blank` and `updatedAt`.\n      var pickBestSession = function (ids) {\n        var byId = {};\n        try { byId = ctx.sessions.list.getSnapshot().byId || {}; } catch (e) { /* older cores */ }\n        return ids.slice().sort(function (a, b) {\n          var ea = byId[a], eb = byId[b];\n          var ca = ea && ea.blank === false ? 1 : 0, cb = eb && eb.blank === false ? 1 : 0;\n          if (ca !== cb) return cb - ca;\n          return ((eb && eb.updatedAt) || 0) - ((ea && ea.updatedAt) || 0);\n        })[0];\n      };\n\n      // One-shot vault auto-connect once the stores are ready (baseline flag,\n      // or the fallback timer \u2014 whichever fires first). An open issued before\n      // the conversation pipeline is ready sets the store but leaves the view\n      // on the hero screen, so keep re-opening until the conversation flips\n      // to active (or the user takes over). A genuinely blank session shows\n      // hero by design \u2014 the bounded retries are harmless there.\n      React.useEffect(() => {\n        if (autoRef.current || (!baselinesReady && !fallbackReady)) return;\n        var vaultPath = vaultPathParam();\n        if (!vaultPath) return;\n        autoRef.current = true;\n        ctx.workspaces.create({ path: vaultPath }).then((ws) => {\n          var ids = (ws.sessionIds || []).filter((id) => archived.indexOf(id) < 0);\n          if (current && ids.indexOf(current) >= 0) return; // already on vault work\n          var openWithRetry = function (sid) {\n            openSession(sid);\n            var tries = 0;\n            var timer = setInterval(function () {\n              if (userTouchedRef.current || tries >= 8) { clearInterval(timer); return; }\n              var el = document.querySelector("[data-phase]");\n              if (el && el.getAttribute("data-phase") === "active") { clearInterval(timer); return; }\n              tries++;\n              openSession(sid);\n            }, 1500);\n          };\n          if (ids.length > 0) {\n            openWithRetry(pickBestSession(ids));\n            return;\n          }\n          return ctx.uiWorkspace.connectWorkspace(ws.workspaceId).then((sid) => {\n            openWithRetry(sid);\n          });\n        }).catch((e) => {\n          setErr("vault: " + (e && e.message ? e.message : String(e)));\n        });\n      }, [baselinesReady, fallbackReady]);\n\n      function openWorkspace(id) {\n        if (!id) return;\n        var ws = null;\n        for (var k = 0; k < wsItems.length; k++) if (wsItems[k].workspaceId === id) ws = wsItems[k];\n        if (!ws) return;\n        var ids = (ws.sessionIds || []).filter((sid) => archived.indexOf(sid) < 0);\n        if (ids.length > 0) {\n          openSession(pickBestSession(ids));\n          return;\n        }\n        ctx.uiWorkspace.connectWorkspace(id).then((sid) => openSession(sid)).catch((e) => {\n          setErr("workspace: " + (e && e.message ? e.message : String(e)));\n        });\n      }\n\n      function stepZoom(dir) {\n        var idx = 0;\n        for (var k = 0; k < ZOOM_STEPS.length; k++) {\n          if (ZOOM_STEPS[k] <= zoom + 0.001) idx = k;\n        }\n        var next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + dir))];\n        setZoom(next);\n      }\n\n      var gearPair = React.useState(false);\n      var gearOpen = gearPair[0];\n      var setGearOpen = gearPair[1];\n\n      var children = [];\n\n      // Workspace picker\n      var wsOptions = [];\n      if (curWsId === "") {\n        wsOptions.push(React.createElement("option", { key: "none", value: "" }, "\u5DE5\u4F5C\u533A\u2026"));\n      }\n      for (var wi = 0; wi < wsItems.length; wi++) {\n        var wv = wsItems[wi];\n        wsOptions.push(React.createElement("option", { key: wv.workspaceId, value: wv.workspaceId }, wv.title || wv.path));\n      }\n      children.push(React.createElement(\n        "select",\n        {\n          key: "ws",\n          title: "\u9009\u62E9\u5DE5\u4F5C\u533A / Workspace",\n          value: curWsId,\n          onChange: (e) => { userTouchedRef.current = true; openWorkspace(e.target.value); },\n        },\n        wsOptions,\n      ));\n\n      // Session picker (sessions accounted to the current workspace, minus\n      // archived ones and stale blanks the browser keeps only while selected).\n      var sessionOptions = [];\n      if (curWs) {\n        var ids = curWs.sessionIds || [];\n        for (var j = 0; j < ids.length; j++) {\n          var sid = ids[j];\n          if (archived.indexOf(sid) >= 0) continue;\n          var s = byId[sid];\n          if (s && s.blank && sid !== current) continue;\n          sessionOptions.push({ id: sid, title: s && s.displayTitle ? s.displayTitle : sid, running: !!(s && s.running) });\n        }\n      }\n      children.push(React.createElement(\n        "select",\n        {\n          key: "ss",\n          title: "\u9009\u62E9\u4F1A\u8BDD / Session",\n          value: current || "",\n          disabled: !curWs,\n          onChange: (e) => { userTouchedRef.current = true; if (e.target.value) openSession(e.target.value); },\n        },\n        sessionOptions.length === 0\n          ? [React.createElement("option", { key: "none", value: "" }, "\u4F1A\u8BDD\u2026")]\n          : sessionOptions.map((o) => React.createElement("option", { key: o.id, value: o.id }, (o.running ? "\u25CF " : "") + o.title)),\n      ));\n\n      // New session in the current workspace\n      children.push(React.createElement(\n        "button",\n        {\n          key: "new",\n          title: "\u65B0\u5EFA\u4F1A\u8BDD / New session",\n          onClick: () => {\n            try {\n              ctx.uiWorkspace.startSession(curWsId || undefined);\n            } catch (e) {\n              setErr("new: " + (e && e.message ? e.message : String(e)));\n            }\n          },\n        },\n        "\uFF0B",\n      ));\n\n      children.push(React.createElement("span", { key: "sp", style: { flex: 1 } }));\n\n      if (err) {\n        children.push(React.createElement("span", { key: "err", className: "dsh-ob-err", title: err }, err));\n      }\n\n      // Settings gear: infrequent controls (zoom today, more later) live in\n      // the popover it toggles instead of spending always-visible bar width.\n      children.push(React.createElement(\n        "button",\n        {\n          key: "gear",\n          title: "\u5D4C\u5165\u8BBE\u7F6E / Embed settings",\n          "aria-expanded": gearOpen,\n          onClick: () => setGearOpen(!gearOpen),\n        },\n        "\u2699",\n      ));\n      if (gearOpen) {\n        children.push(React.createElement(\n          "div",\n          { key: "pop", className: "dsh-ob-pop" },\n          React.createElement(\n            "div",\n            { key: "zr", className: "dsh-ob-row" },\n            React.createElement("span", { key: "zc", className: "dsh-ob-cap" }, "\u5B57\u53F7"),\n            React.createElement("button", { key: "zo", title: "\u7F29\u5C0F / Zoom out", onClick: () => stepZoom(-1) }, "A\u2212"),\n            React.createElement("span", { key: "zv", className: "dsh-ob-zoom" }, Math.round(zoom * 100) + "%"),\n            React.createElement("button", { key: "zi", title: "\u653E\u5927 / Zoom in", onClick: () => stepZoom(1) }, "A\uFF0B"),\n          ),\n        ));\n      }\n\n      return React.createElement("div", { className: "dsh-ob-bar" }, children);\n    }\n\n    // ---------------------------------------------------------------------\n    // apply\n    // ---------------------------------------------------------------------\n\n    var inject = ["slots", "sessions", "workspaces", "uiWorkspace", "layout"];\n\n    function apply(ctx) {\n      if (!isEmbed()) return; // normal browser windows stay untouched\n      injectCssOnce();\n      writeZoom(readZoom());\n\n      // Reseat the sidebar with an empty render; CSS zeroes its track.\n      // priority -100 shadows the shipped SidebarRoot (priority 0) without a\n      // same-priority conflict \u2014 equal priorities throw and would break the\n      // shipped package\'s whole apply.\n      ctx.slots.inject("sidebar", () => ctx.slots.register(\n        { name: "sidebar", priority: -100 },\n        () => null,\n      ));\n\n      ctx.slots.inject("shell.overlay", () => ctx.slots.register(\n        { name: "shell.overlay", id: "dsh-obsidian-embed-bar", order: 100 },\n        (props) => React.createElement(EmbedBar, Object.assign({}, props, { __ctx: ctx })),\n      ));\n\n      // -------------------------------------------------------------------\n      // Selection bridge: the Obsidian parent posts {type:"dsh-ob-fill"|\n      // "dsh-ob-send", text} to quote editor selections into the composer.\n      // The active session\'s input actions are captured through a null-render\n      // occupant of a session-scoped slot (its standard props carry\n      // `inputActions`, the real composer face: setDraft/submit).\n      // -------------------------------------------------------------------\n      // `captured` is shared across re-applies: apply() re-runs on every\n      // client resync/reconnect, and whichever slot occupant is live feeds\n      // this one box \u2014 the single guarded listener below always reads the\n      // current actions regardless of which apply won the slot.\n      var captured = null;\n      try { captured = window.__dshObEmbedCaptured__ || null; } catch (_) {}\n      if (!captured) {\n        captured = { inputActions: null };\n        try { window.__dshObEmbedCaptured__ = captured; } catch (_) {}\n      }\n      ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register(\n        { name: "conversation.session.header.utilities", id: "dsh-obsidian-embed-input", order: 1000 },\n        (props) => {\n          captured.inputActions = (props && props.inputActions) || null;\n          return null;\n        },\n      ));\n\n      var onMessage = (ev) => {\n        if (!ev || ev.source !== window.parent) return;\n        var d = ev.data;\n        if (!d || typeof d !== "object") return;\n        if (d.type !== "dsh-ob-fill" && d.type !== "dsh-ob-send") return;\n        var text = typeof d.text === "string" ? d.text : "";\n        if (!text.trim()) return;\n        var reply = (ok, reason) => {\n          try {\n            window.parent.postMessage({ type: "dsh-ob-ack", mode: d.type, ok: ok, reason: reason || "" }, "*");\n          } catch (_) {}\n        };\n        var actions = captured.inputActions;\n        if (!actions || typeof actions.setDraft !== "function") {\n          reply(false, "no-session");\n          return;\n        }\n        try {\n          actions.setDraft(text);\n          if (d.type === "dsh-ob-send" && typeof actions.submit === "function") {\n            // Let the Lexical update flush through the submit machine first.\n            setTimeout(() => {\n              try {\n                actions.submit();\n                reply(true);\n              } catch (e2) {\n                reply(false, String((e2 && e2.message) || e2));\n              }\n            }, 250);\n          } else {\n            reply(true);\n          }\n        } catch (e) {\n          reply(false, String((e && e.message) || e));\n        }\n      };\n      // apply() re-runs on every resync/reconnect; a bare addEventListener\n      // stacks one listener per run and every ack/setDraft/submit then fires\n      // N times (observed: 34 acks for one send). Keep exactly one active\n      // listener \u2014 replace the previous apply\'s registration.\n      try {\n        var prevOnMessage = window.__dshObEmbedOnMessage__;\n        if (prevOnMessage) window.removeEventListener("message", prevOnMessage);\n        window.__dshObEmbedOnMessage__ = onMessage;\n        window.addEventListener("message", onMessage);\n      } catch (_) {}\n\n      // Tell the Obsidian parent the bridge is listening (it queues payloads\n      // until this arrives).\n      try {\n        window.parent.postMessage({ type: "dsh-ob-ready" }, "*");\n      } catch (_) {}\n    }\n\n    exports.apply = apply;\n    exports.inject = inject;\n    return module.exports;\n  },\n});\n'
};

// src/main.ts
var DEFAULT_SETTINGS = {
  serverUrl: "http://127.0.0.1:3080",
  authUrl: "",
  tokenLogPath: "~/Library/Application Support/DeepSeek-Harness/logs/launchd.out.log",
  startCommand: "",
  dshProfileDir: "~/.dsh/profiles/web",
  fileClickPreview: false,
  installPromptedVersion: ""
};
function nodeRequire() {
  const req = window.require;
  return typeof req === "function" ? req : null;
}
function expandHome(raw) {
  const p = raw.trim();
  if (!p.startsWith("~")) return p;
  const req = nodeRequire();
  if (!req) return p;
  const os = req("os");
  return p.replace(/^~/, os.homedir());
}
function readLogTail(path) {
  const req = nodeRequire();
  if (!req) return "";
  const fs = req("fs");
  const fd = fs.openSync(path, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - 1024 * 1024);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}
var DshEmbedPlugin = class _DshEmbedPlugin extends import_obsidian5.Plugin {
  settings = { ...DEFAULT_SETTINGS };
  views = /* @__PURE__ */ new Set();
  ready = false;
  pending = null;
  queuedText = null;
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.registerView(VIEW_TYPE_DSH_EMBED, (leaf) => new DshEmbedView(leaf, this));
    this.registerView(VIEW_TYPE_WEB_PREVIEW, (leaf) => new WebPreviewView(leaf));
    this.addRibbonIcon("bot", "DeepSeek Harness", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-panel",
      name: "Open DeepSeek Harness panel",
      callback: () => void this.activateView()
    });
    this.addCommand({
      id: "reload-panel",
      name: "Reload DeepSeek Harness panel",
      callback: () => this.reloadViews()
    });
    this.addCommand({
      id: "send-selection",
      name: "Send selection to DeepSeek Harness\u2026",
      editorCheckCallback: (checking, editor, view) => {
        const sel = editor.getSelection();
        if (!sel || !sel.trim()) return false;
        if (!checking) this.openAnnotate(editor, view);
        return true;
      }
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const sel = editor.getSelection();
        if (!sel || !sel.trim()) return;
        menu.addItem((item) => {
          item.setTitle("\u53D1\u9001\u5230 DeepSeek Harness\u2026").setIcon("bot").onClick(() => this.openAnnotate(editor, view));
        });
      })
    );
    this.registerDomEvent(window, "message", (ev) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "dsh-ob-ready") {
        this.ready = true;
        const f = this.activeFrame();
        if (f) this.postOpenCfg(f);
        const q = this.queuedText;
        this.queuedText = null;
        if (q) this.postToFrame(q.text, q.mode);
        return;
      }
      if (d.type === "dsh-open-in-obsidian" && typeof d.path === "string" && d.path !== "") {
        void this.openFilePreview(d.path);
        return;
      }
      if (d.type === "dsh-ob-ack") {
        const pending = this.pending;
        if (!pending) return;
        window.clearTimeout(pending.timer);
        this.pending = null;
        if (d.ok) {
          new import_obsidian5.Notice(d.mode === "dsh-ob-send" ? "\u5DF2\u53D1\u9001\u5230\u4F1A\u8BDD" : "\u5DF2\u52A0\u5165\u8F93\u5165\u6846");
        } else {
          new import_obsidian5.Notice(
            d.reason === "no-session" ? "\u9762\u677F\u91CC\u8FD8\u6CA1\u6709\u6253\u5F00\u7684\u4F1A\u8BDD\u2014\u2014\u8BF7\u5148\u5728\u9762\u677F\u4E2D\u6253\u5F00\u6216\u65B0\u5EFA\u4E00\u4E2A\u4F1A\u8BDD" : `\u53D1\u9001\u5931\u8D25\uFF1A${d.reason ?? "unknown"}`
          );
        }
      }
    });
    this.addSettingTab(new DshEmbedSettingTab(this.app, this));
    window.setTimeout(() => void this.maybeOfferInstall(), 2500);
  }
  // ---------------------------------------------------------------------
  // Server component (dsh-obsidian-embed) installation
  // ---------------------------------------------------------------------
  /** Resolved DSH profile dir (`~` expanded via Node's os.homedir). */
  profileDir() {
    return expandHome(this.settings.dshProfileDir.trim() || DEFAULT_SETTINGS.dshProfileDir);
  }
  serverPaths() {
    const req = nodeRequire();
    const path = req ? req("path") : null;
    const profile = this.profileDir();
    const join = (...parts) => path ? path.join(...parts) : parts.join("/");
    return {
      profile,
      pkgDir: join(profile, "packages", "dsh-obsidian-embed"),
      nmLink: join(profile, "node_modules", "dsh-obsidian-embed"),
      patchFile: join(profile, "cordis.patch.yml"),
      join
    };
  }
  /** What state the server component is in on this machine. */
  checkServerInstall() {
    const req = nodeRequire();
    if (!req) return { ok: false, detail: "node unavailable" };
    const fs = req("fs");
    const { pkgDir, nmLink, patchFile, join } = this.serverPaths();
    try {
      const pkgJson = JSON.parse(fs.readFileSync(join(pkgDir, "package.json"), "utf8"));
      const version = pkgJson.version ?? "?";
      const current = version === SERVER_PACKAGE_VERSION;
      const patch = fs.existsSync(patchFile) && fs.readFileSync(patchFile, "utf8").includes("dsh-obsidian-embed");
      const linked = fs.existsSync(nmLink);
      if (current && patch && linked) return { ok: true, detail: `v${version} \u5DF2\u5B89\u88C5` };
      const missing = [
        current ? null : `\u5305\u7248\u672C ${version} \u2260 \u5185\u7F6E ${SERVER_PACKAGE_VERSION}`,
        patch ? null : "cordis.patch.yml \u672A\u6302\u8F7D",
        linked ? null : "node_modules \u8F6F\u94FE\u7F3A\u5931"
      ].filter(Boolean);
      return { ok: false, detail: missing.join("\uFF1B") };
    } catch {
      return { ok: false, detail: "\u672A\u5B89\u88C5" };
    }
  }
  /** Write the embedded server package into the DSH profile. Idempotent. */
  installServerComponent() {
    const req = nodeRequire();
    if (!req) return { ok: false, message: "Node \u63A5\u53E3\u4E0D\u53EF\u7528\uFF08\u9700\u8981\u684C\u9762\u7AEF Obsidian\uFF09" };
    const fs = req("fs");
    const { pkgDir, nmLink, patchFile, join } = this.serverPaths();
    try {
      for (const [rel, content] of Object.entries(SERVER_FILES)) {
        const target = join(pkgDir, rel);
        fs.mkdirSync(join(target, ".."), { recursive: true });
        fs.writeFileSync(target, content, "utf8");
      }
      try {
        const existing = fs.readlinkSync(nmLink);
        if (existing !== "../packages/dsh-obsidian-embed") {
          fs.rmSync(nmLink, { recursive: true, force: true });
          fs.symlinkSync("../packages/dsh-obsidian-embed", nmLink);
        }
      } catch {
        fs.mkdirSync(join(nmLink, ".."), { recursive: true });
        if (!fs.existsSync(nmLink)) fs.symlinkSync("../packages/dsh-obsidian-embed", nmLink);
      }
      if (!fs.existsSync(patchFile)) {
        fs.writeFileSync(
          patchFile,
          "# cordis.patch.yml \u2014 profile composition overlay\n\n- insert:\n    - id: dsh-obsidian-embed\n      name: dsh-obsidian-embed\n",
          "utf8"
        );
      } else if (!fs.readFileSync(patchFile, "utf8").includes("dsh-obsidian-embed")) {
        fs.appendFileSync(
          patchFile,
          "\n# dsh-obsidian-embed \u2014 Obsidian embed mode (installed by the dsh-embed Obsidian plugin).\n- insert:\n    - id: dsh-obsidian-embed\n      name: dsh-obsidian-embed\n",
          "utf8"
        );
      }
      return { ok: true, message: `\u5DF2\u5B89\u88C5\u5230 ${pkgDir}\uFF08v${SERVER_PACKAGE_VERSION}\uFF09\u3002\u91CD\u542F DSH \u670D\u52A1\u540E\u751F\u6548\u3002` };
    } catch (e) {
      return { ok: false, message: `\u5B89\u88C5\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}` };
    }
  }
  async maybeOfferInstall() {
    if (this.checkServerInstall().ok) return;
    if (this.settings.installPromptedVersion === this.manifest.version) return;
    this.settings.installPromptedVersion = this.manifest.version;
    await this.saveData(this.settings);
    new InstallConsentModal(this.app, this.serverPaths().profile, (install) => {
      if (!install) return;
      const res = this.installServerComponent();
      new import_obsidian5.Notice(res.message, 8e3);
    }).open();
  }
  registerFrame(view) {
    this.views.add(view);
    this.ready = false;
    const frame = view.frame;
    if (frame) frame.addEventListener("load", () => this.postOpenCfg(frame));
  }
  unregisterFrame(view) {
    this.views.delete(view);
    if (this.views.size === 0) this.ready = false;
  }
  activeFrame() {
    for (const v of this.views) {
      if (v.frame && v.frame.isConnected) return v.frame;
    }
    return null;
  }
  // ---------------------------------------------------------------------
  // File click → center preview
  // ---------------------------------------------------------------------
  /** Extensions that render as pages in the embedded browser view. */
  static WEB_PREVIEW_EXTS = /* @__PURE__ */ new Set(["html", "htm", "xhtml", "svg", "xml"]);
  /** Tell the in-frame bridge this vault's root so it can resolve clicked paths. */
  postOpenCfg(frame) {
    try {
      const adapter = this.app.vault.adapter;
      if (!(adapter instanceof import_obsidian5.FileSystemAdapter) || !frame.contentWindow) return;
      const origin = new URL(this.settings.serverUrl.trim() || DEFAULT_SETTINGS.serverUrl).origin;
      frame.contentWindow.postMessage({ type: "dsh-open-cfg", vaultRoot: adapter.getBasePath() }, origin);
    } catch {
    }
  }
  /**
   * Open a file clicked in the DSH panel: web-native types render in the
   * center embedded-browser view (reused across clicks), everything else
   * opens natively in the current center leaf (md in reading mode).
   */
  async openFilePreview(absPath) {
    if (!this.settings.fileClickPreview) return;
    const plugins = this.app.plugins;
    if (plugins?.enabledPlugins?.has("dsh-harness")) return;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian5.FileSystemAdapter)) return;
    const root = adapter.getBasePath().replace(/\/+$/, "");
    if (!absPath.startsWith(root + "/")) {
      new import_obsidian5.Notice("\u6587\u4EF6\u4E0D\u5728\u5F53\u524D vault \u4E2D\uFF1A" + absPath);
      return;
    }
    const rel = absPath.slice(root.length + 1);
    const file = this.app.vault.getAbstractFileByPath(rel);
    if (!(file instanceof import_obsidian5.TFile)) {
      new import_obsidian5.Notice("\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A" + rel);
      return;
    }
    const { workspace } = this.app;
    const ext = file.extension.toLowerCase();
    if (_DshEmbedPlugin.WEB_PREVIEW_EXTS.has(ext)) {
      const leaf2 = workspace.getLeavesOfType(VIEW_TYPE_WEB_PREVIEW)[0] ?? workspace.getLeaf("tab");
      await leaf2.setViewState({ type: VIEW_TYPE_WEB_PREVIEW, active: true, state: { path: absPath } });
      workspace.revealLeaf(leaf2);
      return;
    }
    const leaf = workspace.getLeaf(false);
    if (!leaf) return;
    await leaf.openFile(file, ext === "md" ? { eState: { mode: "preview" } } : void 0);
    workspace.revealLeaf(leaf);
  }
  // ---------------------------------------------------------------------
  // Selection → annotate → deliver
  // ---------------------------------------------------------------------
  openAnnotate(editor, view) {
    const selection = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const file = this.app.workspace.getActiveFile();
    const relPath = file ? file.path : "\uFF08\u672A\u547D\u540D\uFF09";
    new AnnotateModal(
      this.app,
      {
        relPath,
        fromLine: from.line + 1,
        toLine: to.line + 1,
        selection
      },
      (text, action) => void this.deliver(text, action)
    ).open();
  }
  async deliver(text, mode) {
    await this.activateView();
    const frame = this.activeFrame();
    if (!frame) {
      new import_obsidian5.Notice("DSH \u9762\u677F\u5C1A\u672A\u52A0\u8F7D\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u5019\u518D\u8BD5");
      return;
    }
    if (this.ready) {
      this.postToFrame(text, mode);
    } else {
      this.queuedText = { text, mode };
      window.setTimeout(() => {
        if (this.queuedText) {
          const q = this.queuedText;
          this.queuedText = null;
          this.postToFrame(q.text, q.mode);
        }
      }, 4e3);
    }
  }
  postToFrame(text, mode) {
    const frame = this.activeFrame();
    if (!frame || !frame.contentWindow) {
      new import_obsidian5.Notice("DSH \u9762\u677F\u5C1A\u672A\u52A0\u8F7D\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u5019\u518D\u8BD5");
      return;
    }
    const origin = new URL(this.settings.serverUrl.trim() || DEFAULT_SETTINGS.serverUrl).origin;
    frame.contentWindow.postMessage({ type: mode === "send" ? "dsh-ob-send" : "dsh-ob-fill", text }, origin);
    if (this.pending) window.clearTimeout(this.pending.timer);
    this.pending = {
      mode,
      timer: window.setTimeout(() => {
        this.pending = null;
        new import_obsidian5.Notice("\u672A\u6536\u5230\u9762\u677F\u786E\u8BA4\u2014\u2014\u8BF7\u786E\u8BA4\u9762\u677F\u4E2D\u7684\u4F1A\u8BDD\u5DF2\u6253\u5F00");
      }, 6e3)
    };
  }
  // ---------------------------------------------------------------------
  // URL construction & token discovery
  // ---------------------------------------------------------------------
  /** Absolute vault root — the workspace the agent works in. */
  vaultRoot() {
    const adapter = this.app.vault.adapter;
    try {
      return adapter.getBasePath?.() ?? "";
    } catch {
      return "";
    }
  }
  /**
   * The launch token rotates per server process. Prefer the manual setting;
   * otherwise read the freshest `dsh web: …?token=…` line from the service
   * log. Returns "" when no token is discoverable (pre-0.1.2 servers).
   */
  async resolveToken() {
    const auth = this.settings.authUrl.trim();
    if (auth) {
      try {
        const token = new URL(auth).searchParams.get("token");
        if (token) return token;
      } catch {
        if (/^[\w-]{8,}$/.test(auth)) return auth;
      }
    }
    const logPath = expandHome(this.settings.tokenLogPath);
    if (!logPath) return "";
    try {
      const content = readLogTail(logPath);
      const matches = content.match(/token=([\w-]{20,})/g);
      if (matches && matches.length > 0) {
        return matches[matches.length - 1].slice("token=".length);
      }
    } catch {
    }
    return "";
  }
  /** URL the iframe loads for a given launch token. */
  buildFrameUrl(token) {
    const base = this.settings.serverUrl.trim().replace(/\/+$/, "") || DEFAULT_SETTINGS.serverUrl;
    const params = new URLSearchParams();
    params.set("ob", "1");
    const vault = this.vaultRoot();
    if (vault) {
      params.set("obVaultB64", Buffer.from(vault, "utf8").toString("base64url"));
    }
    if (token) params.set("token", token);
    return `${base}/?${params.toString()}`;
  }
  /** Convenience: resolve the current token, then build the iframe URL. */
  async frameUrl() {
    return this.buildFrameUrl(await this.resolveToken());
  }
  async activateView() {
    const { workspace } = this.app;
    const rightSplit = workspace.rightSplit;
    if (rightSplit?.collapsed) rightSplit.expand?.();
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_DSH_EMBED)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? void 0;
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_DSH_EMBED, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }
  reloadViews() {
    this.ready = false;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DSH_EMBED)) {
      const view = leaf.view;
      if (view instanceof DshEmbedView) void view.render();
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.reloadViews();
  }
};
var DshEmbedSettingTab = class extends import_obsidian5.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "DeepSeek Harness (Embed)" });
    const state = this.plugin.checkServerInstall();
    new import_obsidian5.Setting(containerEl).setName("Server component (dsh-obsidian-embed)").setDesc(state.ok ? `\u2705 ${state.detail}` : `\u26A0\uFE0F ${state.detail}`).addButton(
      (btn) => btn.setButtonText(state.ok ? "\u91CD\u65B0\u5B89\u88C5 / \u4FEE\u590D" : "\u5B89\u88C5").onClick(() => {
        const res = this.plugin.installServerComponent();
        new import_obsidian5.Notice(res.message, 8e3);
        this.display();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("Server URL").setDesc("Your running DSH Web server. The plugin embeds it; it never starts a second one.").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.serverUrl).setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
        this.plugin.settings.serverUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("Auth URL or token (DSH \u2265 0.1.2)").setDesc(
      "Usually leave empty: the token is auto-read from the service log below, and the panel self-heals after server restarts. Paste a launch URL here only to override."
    ).addText(
      (text) => text.setPlaceholder("auto from log").setValue(this.plugin.settings.authUrl).onChange(async (value) => {
        this.plugin.settings.authUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("Token log path").setDesc(
      "Log file containing the 'dsh web: \u2026?token=\u2026' line printed when the server starts; used to discover the current launch token. `~` is expanded. The default matches the macOS launchd setup in the README \u2014 Windows/Linux users should point this at their own `dsh web` log."
    ).addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.tokenLogPath).setValue(this.plugin.settings.tokenLogPath).onChange(async (value) => {
        this.plugin.settings.tokenLogPath = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("Start command (optional)").setDesc(
      "Shell command for the panel's Start button when the server is offline, e.g. ~/Library/Application Support/DeepSeek-Harness/start-harness.sh (~ is expanded)."
    ).addText(
      (text) => text.setPlaceholder("leave empty to disable auto-start").setValue(this.plugin.settings.startCommand).onChange(async (value) => {
        this.plugin.settings.startCommand = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u6587\u4EF6\u70B9\u51FB\u5728\u4E2D\u592E\u9884\u89C8 / File click preview").setDesc(
      "\u9700\u8981\u989D\u5916\u5B89\u88C5 dsh-obsidian-bridge \u4F34\u751F\u7EC4\u4EF6\uFF08\u4E0D\u5728\u672C\u63D2\u4EF6\u5185\uFF09\uFF1A\u70B9\u51FB\u9762\u677F\u91CC\u7684\u6587\u4EF6\u8DEF\u5F84\uFF0Chtml/svg \u7B49\u5728\u4E2D\u592E\u5185\u5D4C\u6D4F\u89C8\u5668\u6E32\u67D3\uFF0Cmd/\u56FE\u7247/pdf \u7528 Obsidian \u539F\u751F\u6253\u5F00\u3002\u672A\u88C5\u8BE5\u7EC4\u4EF6\u65F6\u6B64\u5F00\u5173\u4E0D\u751F\u6548\u3002"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.fileClickPreview).onChange(async (value) => {
        this.plugin.settings.fileClickPreview = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("DSH profile directory").setDesc("Where the server component installs. Default matches DSH_HOME's web profile.").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.dshProfileDir).setValue(this.plugin.settings.dshProfileDir).onChange(async (value) => {
        this.plugin.settings.dshProfileDir = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
};
