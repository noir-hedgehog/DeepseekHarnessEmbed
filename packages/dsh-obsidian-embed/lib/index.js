// dsh-obsidian-embed — host half.
//
// Two jobs:
//
// 1. Embed auth adapter (DSH ≥ 0.1.2): the browser-session cookie is
//    structurally unusable inside Obsidian's cross-site iframe, so embed
//    pages authenticate with the launch token instead. We accept the token
//    as `?token=` query or `Authorization: Bearer` for index GETs marked
//    `ob=1` and for /api requests — an extra accepted credential on top of
//    the untouched defaults. Feature-detected: on pre-0.1.2 servers without
//    the browser-auth API the adapter stays inert.
//
// 2. tapIndex injection: pages carrying `ob=1` additionally receive
//    `window.__DSH_EMBED_TOKEN__` plus a small interceptor script that
//    attaches the token to /api fetch/XHR calls and the WebSocket URL. The
//    interceptor script self-gates on the `ob=1` query param, so normal
//    browser windows are untouched even though tapIndex transforms every
//    served index.

const name = "dsh-obsidian-embed";

/** Client-side transport interceptor, injected before the app bundles. */
const INTERCEPTOR = `(function(){
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
})()`;

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
 * or `?token=` query (401s only — 403 fences stay untouched), and serve the
 * index directly for `GET /?ob=1&token=<T>` (no cookie-mint redirect, so the
 * embed page keeps its query string — the client module needs `ob=1`).
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

  // The connection service carries the BrowserAuth instance on ≥0.1.2; the
  // inject block simply never fires on older servers (adapter stays inert).
  ctx.inject(["connection"], (cctx) => {
    try {
      const conn = cctx.connection;
      if (!conn || typeof conn.authenticatedUrl !== "function") {
        console.log("[dsh-obsidian-embed] no browser-auth API (pre-0.1.2) — auth adapter idle");
        return;
      }
      token = tokenOf(conn);
      if (!token) {
        console.log("[dsh-obsidian-embed] launch token empty — auth adapter idle");
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
          // interceptor self-gates on `ob=1` in the page URL. The token var
          // is only written once the adapter resolved one.
          if (!token) return html;
          const inject =
            "<script>window.__DSH_EMBED_TOKEN__=" + JSON.stringify(token) + ";</script>" +
            "<script>" + INTERCEPTOR + "</script>";
          return html.replace("<head>", "<head>" + inject);
        }),
      "dsh-obsidian-embed: index auth injection",
    );
  });
}

export { apply, name };
