// dsh-obsidian-embed — client half (browser).
//
// Obsidian embed mode for the DSH Web GUI. Everything here is gated on the
// page being embedded (loaded inside an iframe, or carrying ?ob=1), so the
// GUI in a normal browser window is never touched.
//
// What it does in embed mode:
//   1. Hides the left sidebar completely: the `sidebar` slot is reseated with
//      an empty render (kills the rail), and CSS zeroes the frame's sidebar
//      track (the layout store maps "collapsed" to a 56px rail, so CSS is the
//      only way to reach 0). The details column and drag handles are hidden
//      too — unusable at Obsidian side-panel widths.
//   2. Registers a compact top bar into `shell.overlay`: workspace picker,
//      session picker, new-session button, and a zoom control scaling the
//      conversation/trajectory area.
//   3. Auto-connects the vault workspace: the Obsidian plugin passes the vault
//      root as ?obVault=<abs path>; once the workspace/session baselines are
//      ready the bar creates (or idempotently resolves) the workspace and
//      opens its newest session, so the panel always lands on vault work.
//   4. Injects embed CSS: bar styling, top clearance for the center column,
//      and the `zoom` factor (persisted per origin in localStorage).
//
// Module format: window.__ModuleLoader__.load factory, the same shape the
// shipped external client bundles use. No imports; react comes via require().

window.__ModuleLoader__.load({
  id: "dsh-obsidian-embed",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    // ---------------------------------------------------------------------
    // Embed detection
    // ---------------------------------------------------------------------

    function isEmbed() {
      try {
        if (window.self !== window.top) return true;
      } catch (_) {
        return true; // cross-origin frame access throws — definitely framed
      }
      try {
        return new URLSearchParams(window.location.search).get("ob") === "1";
      } catch (_) {
        return false;
      }
    }

    function queryParam(key) {
      try {
        return new URLSearchParams(window.location.search).get(key) || "";
      } catch (_) {
        return "";
      }
    }

    // The vault path travels base64url-encoded (obVaultB64): immune to every
    // URL-layer quirk (spaces as '+', unicode normalization, router rewrites)
    // that otherwise corrupts absolute paths in transit. Plain obVault remains
    // as a fallback for hand-built URLs.
    function vaultPathParam() {
      var b64 = queryParam("obVaultB64");
      if (b64) {
        try {
          var bin = window.atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new TextDecoder("utf-8").decode(bytes);
        } catch (_) {
          return "";
        }
      }
      return queryParam("obVault");
    }

    // ---------------------------------------------------------------------
    // Zoom preference (per-origin, embed only)
    // ---------------------------------------------------------------------

    var ZOOM_KEY = "dsh-obsidian-embed:zoom";
    var ZOOM_STEPS = [0.7, 0.8, 0.9, 1.0, 1.15];
    var ZOOM_DEFAULT = 0.9;

    function readZoom() {
      try {
        var v = parseFloat(window.localStorage.getItem(ZOOM_KEY) || "");
        if (isFinite(v) && v >= 0.5 && v <= 1.5) return v;
      } catch (_) {}
      return ZOOM_DEFAULT;
    }

    function writeZoom(z) {
      try {
        window.localStorage.setItem(ZOOM_KEY, String(z));
      } catch (_) {}
      try {
        document.documentElement.style.setProperty("--dsh-ob-zoom", String(z));
      } catch (_) {}
    }

    // ---------------------------------------------------------------------
    // Embed CSS
    // ---------------------------------------------------------------------

    // The frame div is the parent of the only element carrying a stable
    // marker ([data-shell-overlay]); its div children are, in order: sidebar
    // column, center column, details column, overlay layer. All class names
    // on those columns are per-build CSS-module hashes, so the marker walk is
    // the durable selector.
    var FRAME = "div:has(> [data-shell-overlay])";

    var EMBED_CSS = [
      // Top bar (rendered through shell.overlay, whose layer is absolute and
      // click-through except for direct children — opt back in explicitly).
      ".dsh-ob-bar{position:absolute;top:0;left:0;right:0;height:38px;display:flex;align-items:center;gap:6px;padding:0 10px;box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary);pointer-events:auto}",
      ".dsh-ob-bar select{flex:1 1 0;min-width:0;height:24px;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:0 4px;outline:none;text-overflow:ellipsis}",
      ".dsh-ob-bar select:focus-visible{border-color:var(--dsw-alias-brand-primary)}",
      ".dsh-ob-bar button{flex:none;height:24px;min-width:24px;font-size:12px;line-height:1;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;cursor:pointer;padding:0 7px}",
      ".dsh-ob-bar button:hover{background:var(--dsw-alias-bg-layer-2)}",
      ".dsh-ob-bar .dsh-ob-zoom{flex:none;font-size:11px;opacity:0.75;min-width:34px;text-align:center}",
      ".dsh-ob-bar .dsh-ob-err{color:var(--dsw-alias-state-error-primary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%}",
      // Settings popover anchored under the bar's gear button. Future embed
      // settings add rows here instead of new always-visible chrome.
      ".dsh-ob-pop{position:absolute;top:40px;right:8px;display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.28)}",
      ".dsh-ob-pop .dsh-ob-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}",
      ".dsh-ob-pop .dsh-ob-row .dsh-ob-cap{flex:none;opacity:0.8}",
      // Frame: drop the sidebar and details tracks entirely (the store's
      // collapsed state is still a 56px rail, so CSS has to zero the tracks).
      // NB: never display:none the column divs — grid auto-placement would
      // shift the remaining in-flow columns into the zero-width tracks. The
      // columns stay as overflow-hidden 0px items; only the (absolutely
      // positioned, non-grid-flow) drag handles get display:none.
      FRAME + "{grid-template-columns:0 minmax(0,1fr) 0 !important}",
      FRAME + " > div[class*='handle']{display:none}",
      FRAME + " > div:nth-of-type(2){padding-top:38px;box-sizing:border-box;zoom:var(--dsh-ob-zoom, 0.9)}",
    ].join("\n");

    function injectCssOnce() {
      var tagId = "dsh-obsidian-embed/embed-css";
      if (typeof document === "undefined") return;
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-obsidian-embed";
      tag.dataset.pluginCss = tagId;
      tag.textContent = EMBED_CSS;
      document.head.appendChild(tag);
    }

    // ---------------------------------------------------------------------
    // Top bar: workspace picker, session picker, new session, zoom.
    // ---------------------------------------------------------------------

    function EmbedBar(props) {
      var ctx = props.__ctx;
      var wsItems = props.useWorkspaces(function (s) { return s.items; }) || [];
      var archived = props.useWorkspaces(function (s) { return s.archivedSessionIds; }) || [];
      var baselinesReady = !!props.useWorkspaces(function (s) { return s.baselinesReady; });
      var byId = props.useSessions(function (s) { return s.byId; }) || {};
      var current = props.useSessions(function (s) { return s.current; });
      var zoomPair = React.useState(readZoom());
      var zoom = zoomPair[0];
      var setZoom = zoomPair[1];
      var errPair = React.useState("");
      var err = errPair[0];
      var setErr = errPair[1];
      var autoRef = React.useRef(false);
      var fallbackPair = React.useState(false);
      var fallbackReady = fallbackPair[0];
      var setFallbackReady = fallbackPair[1];

      React.useEffect(() => { writeZoom(zoom); }, [zoom]);

      // baselinesReady has proven unreliable on some builds (stuck false even
      // with the data visibly loaded), so arm a 4s fallback trigger.
      React.useEffect(() => {
        var t = setTimeout(function () { setFallbackReady(true); }, 4000);
        return function () { clearTimeout(t); };
      }, []);

      // Current workspace = the one accounting the current session.
      var curWs = null;
      for (var i = 0; i < wsItems.length; i++) {
        var w = wsItems[i];
        if (current && w.sessionIds && w.sessionIds.indexOf(current) >= 0) { curWs = w; break; }
      }
      var curWsId = curWs ? curWs.workspaceId : "";

      // Set when the user picks a session/workspace manually — retries must
      // never yank them back to the vault session.
      var userTouchedRef = React.useRef(false);

      // The canonical "open a session" UI navigation (what a sidebar click
      // does): select it in the store AND surface its Conversation.
      var openSession = function (sid) {
        var uiWs = ctx.uiWorkspace;
        if (uiWs && typeof uiWs.openSession === "function") {
          uiWs.openSession(sid);
          return;
        }
        ctx.sessions.open(sid);
        if (ctx.layout && typeof ctx.layout.selectPanel === "function") ctx.layout.selectPanel(null);
      };

      // Pick the most useful landing session from a workspace's session ids:
      // sessions with real conversation content first (a blank one would just
      // sit on the hero screen), newest activity breaking ties. The session
      // list entries carry `blank` and `updatedAt`.
      var pickBestSession = function (ids) {
        var byId = {};
        try { byId = ctx.sessions.list.getSnapshot().byId || {}; } catch (e) { /* older cores */ }
        return ids.slice().sort(function (a, b) {
          var ea = byId[a], eb = byId[b];
          var ca = ea && ea.blank === false ? 1 : 0, cb = eb && eb.blank === false ? 1 : 0;
          if (ca !== cb) return cb - ca;
          return ((eb && eb.updatedAt) || 0) - ((ea && ea.updatedAt) || 0);
        })[0];
      };

      // One-shot vault auto-connect once the stores are ready (baseline flag,
      // or the fallback timer — whichever fires first). An open issued before
      // the conversation pipeline is ready sets the store but leaves the view
      // on the hero screen, so keep re-opening until the conversation flips
      // to active (or the user takes over). A genuinely blank session shows
      // hero by design — the bounded retries are harmless there.
      React.useEffect(() => {
        if (autoRef.current || (!baselinesReady && !fallbackReady)) return;
        var vaultPath = vaultPathParam();
        if (!vaultPath) return;
        autoRef.current = true;
        ctx.workspaces.create({ path: vaultPath }).then((ws) => {
          var ids = (ws.sessionIds || []).filter((id) => archived.indexOf(id) < 0);
          if (current && ids.indexOf(current) >= 0) return; // already on vault work
          var openWithRetry = function (sid) {
            openSession(sid);
            var tries = 0;
            var timer = setInterval(function () {
              if (userTouchedRef.current || tries >= 8) { clearInterval(timer); return; }
              var el = document.querySelector("[data-phase]");
              if (el && el.getAttribute("data-phase") === "active") { clearInterval(timer); return; }
              tries++;
              openSession(sid);
            }, 1500);
          };
          if (ids.length > 0) {
            openWithRetry(pickBestSession(ids));
            return;
          }
          return ctx.uiWorkspace.connectWorkspace(ws.workspaceId).then((sid) => {
            openWithRetry(sid);
          });
        }).catch((e) => {
          setErr("vault: " + (e && e.message ? e.message : String(e)));
        });
      }, [baselinesReady, fallbackReady]);

      function openWorkspace(id) {
        if (!id) return;
        var ws = null;
        for (var k = 0; k < wsItems.length; k++) if (wsItems[k].workspaceId === id) ws = wsItems[k];
        if (!ws) return;
        var ids = (ws.sessionIds || []).filter((sid) => archived.indexOf(sid) < 0);
        if (ids.length > 0) {
          openSession(pickBestSession(ids));
          return;
        }
        ctx.uiWorkspace.connectWorkspace(id).then((sid) => openSession(sid)).catch((e) => {
          setErr("workspace: " + (e && e.message ? e.message : String(e)));
        });
      }

      function stepZoom(dir) {
        var idx = 0;
        for (var k = 0; k < ZOOM_STEPS.length; k++) {
          if (ZOOM_STEPS[k] <= zoom + 0.001) idx = k;
        }
        var next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + dir))];
        setZoom(next);
      }

      var gearPair = React.useState(false);
      var gearOpen = gearPair[0];
      var setGearOpen = gearPair[1];

      var children = [];

      // Workspace picker
      var wsOptions = [];
      if (curWsId === "") {
        wsOptions.push(React.createElement("option", { key: "none", value: "" }, "工作区…"));
      }
      for (var wi = 0; wi < wsItems.length; wi++) {
        var wv = wsItems[wi];
        wsOptions.push(React.createElement("option", { key: wv.workspaceId, value: wv.workspaceId }, wv.title || wv.path));
      }
      children.push(React.createElement(
        "select",
        {
          key: "ws",
          title: "选择工作区 / Workspace",
          value: curWsId,
          onChange: (e) => { userTouchedRef.current = true; openWorkspace(e.target.value); },
        },
        wsOptions,
      ));

      // Session picker (sessions accounted to the current workspace, minus
      // archived ones and stale blanks the browser keeps only while selected).
      var sessionOptions = [];
      if (curWs) {
        var ids = curWs.sessionIds || [];
        for (var j = 0; j < ids.length; j++) {
          var sid = ids[j];
          if (archived.indexOf(sid) >= 0) continue;
          var s = byId[sid];
          if (s && s.blank && sid !== current) continue;
          sessionOptions.push({ id: sid, title: s && s.displayTitle ? s.displayTitle : sid, running: !!(s && s.running) });
        }
      }
      children.push(React.createElement(
        "select",
        {
          key: "ss",
          title: "选择会话 / Session",
          value: current || "",
          disabled: !curWs,
          onChange: (e) => { userTouchedRef.current = true; if (e.target.value) openSession(e.target.value); },
        },
        sessionOptions.length === 0
          ? [React.createElement("option", { key: "none", value: "" }, "会话…")]
          : sessionOptions.map((o) => React.createElement("option", { key: o.id, value: o.id }, (o.running ? "● " : "") + o.title)),
      ));

      // New session in the current workspace
      children.push(React.createElement(
        "button",
        {
          key: "new",
          title: "新建会话 / New session",
          onClick: () => {
            try {
              ctx.uiWorkspace.startSession(curWsId || undefined);
            } catch (e) {
              setErr("new: " + (e && e.message ? e.message : String(e)));
            }
          },
        },
        "＋",
      ));

      children.push(React.createElement("span", { key: "sp", style: { flex: 1 } }));

      if (err) {
        children.push(React.createElement("span", { key: "err", className: "dsh-ob-err", title: err }, err));
      }

      // Settings gear: infrequent controls (zoom today, more later) live in
      // the popover it toggles instead of spending always-visible bar width.
      children.push(React.createElement(
        "button",
        {
          key: "gear",
          title: "嵌入设置 / Embed settings",
          "aria-expanded": gearOpen,
          onClick: () => setGearOpen(!gearOpen),
        },
        "⚙",
      ));
      if (gearOpen) {
        children.push(React.createElement(
          "div",
          { key: "pop", className: "dsh-ob-pop" },
          React.createElement(
            "div",
            { key: "zr", className: "dsh-ob-row" },
            React.createElement("span", { key: "zc", className: "dsh-ob-cap" }, "字号"),
            React.createElement("button", { key: "zo", title: "缩小 / Zoom out", onClick: () => stepZoom(-1) }, "A−"),
            React.createElement("span", { key: "zv", className: "dsh-ob-zoom" }, Math.round(zoom * 100) + "%"),
            React.createElement("button", { key: "zi", title: "放大 / Zoom in", onClick: () => stepZoom(1) }, "A＋"),
          ),
        ));
      }

      return React.createElement("div", { className: "dsh-ob-bar" }, children);
    }

    // ---------------------------------------------------------------------
    // apply
    // ---------------------------------------------------------------------

    var inject = ["slots", "sessions", "workspaces", "uiWorkspace", "layout"];

    function apply(ctx) {
      if (!isEmbed()) return; // normal browser windows stay untouched
      injectCssOnce();
      writeZoom(readZoom());

      // Reseat the sidebar with an empty render; CSS zeroes its track.
      // priority -100 shadows the shipped SidebarRoot (priority 0) without a
      // same-priority conflict — equal priorities throw and would break the
      // shipped package's whole apply.
      ctx.slots.inject("sidebar", () => ctx.slots.register(
        { name: "sidebar", priority: -100 },
        () => null,
      ));

      ctx.slots.inject("shell.overlay", () => ctx.slots.register(
        { name: "shell.overlay", id: "dsh-obsidian-embed-bar", order: 100 },
        (props) => React.createElement(EmbedBar, Object.assign({}, props, { __ctx: ctx })),
      ));

      // -------------------------------------------------------------------
      // Selection bridge: the Obsidian parent posts {type:"dsh-ob-fill"|
      // "dsh-ob-send", text} to quote editor selections into the composer.
      // The active session's input actions are captured through a null-render
      // occupant of a session-scoped slot (its standard props carry
      // `inputActions`, the real composer face: setDraft/submit).
      // -------------------------------------------------------------------
      var captured = { inputActions: null };
      ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register(
        { name: "conversation.session.header.utilities", id: "dsh-obsidian-embed-input", order: 1000 },
        (props) => {
          captured.inputActions = (props && props.inputActions) || null;
          return null;
        },
      ));

      var onMessage = (ev) => {
        if (!ev || ev.source !== window.parent) return;
        var d = ev.data;
        if (!d || typeof d !== "object") return;
        if (d.type !== "dsh-ob-fill" && d.type !== "dsh-ob-send") return;
        var text = typeof d.text === "string" ? d.text : "";
        if (!text.trim()) return;
        var reply = (ok, reason) => {
          try {
            window.parent.postMessage({ type: "dsh-ob-ack", mode: d.type, ok: ok, reason: reason || "" }, "*");
          } catch (_) {}
        };
        var actions = captured.inputActions;
        if (!actions || typeof actions.setDraft !== "function") {
          reply(false, "no-session");
          return;
        }
        try {
          actions.setDraft(text);
          if (d.type === "dsh-ob-send" && typeof actions.submit === "function") {
            // Let the Lexical update flush through the submit machine first.
            setTimeout(() => {
              try {
                actions.submit();
                reply(true);
              } catch (e2) {
                reply(false, String((e2 && e2.message) || e2));
              }
            }, 250);
          } else {
            reply(true);
          }
        } catch (e) {
          reply(false, String((e && e.message) || e));
        }
      };
      window.addEventListener("message", onMessage);

      // Tell the Obsidian parent the bridge is listening (it queues payloads
      // until this arrives).
      try {
        window.parent.postMessage({ type: "dsh-ob-ready" }, "*");
      } catch (_) {}
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
