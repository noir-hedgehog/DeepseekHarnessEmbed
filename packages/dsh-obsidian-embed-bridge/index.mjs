// DeepSeek Harness Obsidian bridge — user patch-layer plugin (installed by the dsh-harness Obsidian plugin).
// Registers an index.html transform that injects a postMessage bridge into the served Web GUI,
// so the Obsidian plugin can fill the composer draft with selected text. Zero DSH source changes.
// Also registers an agent/pre-step hook: when the newest user message carries a BRIDGES implicit
// line, it injects a deterministic edit instruction (model reads the region, presents the result,
// asks for consent, then writes with fs edit). The instruction itself never appears in the chat UI.
// v2.3.2 embedder-auth adapter (interim ③b): for DSH >=0.1.2 browser-session auth whose Strict cookie
// is structurally unusable inside cross-site iframes. Adds an extra accepted credential WITHOUT touching
// defaults: index GET /?token=<T>&ob=1 -> 200 (no ob -> original 303 cookie flow, real browsers intact);
// /api 401 verdict overridden by matching Bearer header or query token (403 fence verdicts untouched).
// Feature-detected: service/method absent (older DSH) or signature moved (newer refactor) -> inert fallback.
export const name = 'dsh-obsidian-bridge'

const BRIDGE = '(function(){if(window.__DSH_OBSIDIAN_BRIDGE__)return;window.__DSH_OBSIDIAN_BRIDGE__=true;var ET=\'\';try{ET=window.__DSH_EMBED_TOKEN__||\'\'}catch(_){}if(ET){function apiHdr(n){var h={};try{var s=n&&n.headers;if(s){if(typeof s.forEach===\'function\'){s.forEach(function(v,k){h[String(k)]=String(v)})}else{for(var k in s){h[k]=String(s[k])}}}}catch(_){}h.authorization=\'Bearer \'+ET;return h}var NF=window.fetch&&window.fetch.bind(window);if(NF){window.fetch=function(i,n){try{var s=\'\';if(typeof i===\'string\')s=i;else if(i)s=String(i.href||i.url||i);if(s.indexOf(\'/api\')>=0){n=Object.assign({},n||{},{headers:apiHdr(n)})}}catch(_){}return NF(i,n)}}var OW=window.WebSocket;if(OW){var EW=function(u,p){try{u=String(u)+(String(u).indexOf(\'?\')>=0?\'&\':\'?\')+\'token=\'+encodeURIComponent(ET)}catch(_){}return p===undefined?new OW(u):new OW(u,p)};EW.prototype=OW.prototype;EW.CONNECTING=OW.CONNECTING;EW.OPEN=OW.OPEN;EW.CLOSING=OW.CLOSING;EW.CLOSED=OW.CLOSED;window.WebSocket=EW}var OXP=window.XMLHttpRequest&&window.XMLHttpRequest.prototype;if(OXP&&OXP.open&&OXP.send){var xOpen=OXP.open,xSend=OXP.send;OXP.open=function(m,u){try{this.__dshBridgeUrl=String(u)}catch(_){}return xOpen.apply(this,arguments)};OXP.send=function(){try{if(String(this.__dshBridgeUrl||\'\').indexOf(\'/api\')>=0)this.setRequestHeader(\'authorization\',\'Bearer \'+ET)}catch(_){}return xSend.apply(this,arguments)}}var OE=window.EventSource;if(OE){var EES=function(u,c){try{u=String(u)+(String(u).indexOf(\'?\')>=0?\'&\':\'?\')+\'token=\'+encodeURIComponent(ET)}catch(_){}return c===undefined?new OE(u):new OE(u,c)};EES.prototype=OE.prototype;EES.CONNECTING=OE.CONNECTING;EES.OPEN=OE.OPEN;EES.CLOSED=OE.CLOSED;window.EventSource=EES}}var BRIDGE_LINE_RE=/\\[\\s*BRIDGES is delivering packages for you……\\s*·\\s*(\\d+)\\s*words\\s*·\\s*L(\\d+):(\\d+)-L(\\d+):(\\d+)\\s*·\\s*([^\\]]+?)\\s*·\\s*\\]/;function stripBridge(s){return String(s==null?\'\':s).replace(/\\[\\s*BRIDGES is delivering packages for you……[^\\]]*\\]/g,\'\')}function mergeFill(existing,incoming){var rest=stripBridge(existing).replace(/\\n{3,}/g,\'\\n\\n\').replace(/^\\s+|\\s+$/g,\'\');if(incoming===\'\')return rest;return rest===\'\'?incoming:incoming+\'\\n\'+rest}function pick(){var el=document.querySelector(\'textarea[data-phase]\')||document.querySelector(\'textarea\');if(el){return el.readOnly||el.disabled?null:el}var eds=document.querySelectorAll(\'[contenteditable="true"]\');for(var i=0;i<eds.length;i++){var ce=eds[i];if(ce.isContentEditable&&!ce.disabled&&ce.offsetParent!==null)return ce}return null}function isField(el){var t=el.tagName;return t===\'TEXTAREA\'||t===\'INPUT\'}function fieldSet(el,val){var p=el.tagName===\'INPUT\'?window.HTMLInputElement.prototype:window.HTMLTextAreaElement.prototype;var d=Object.getOwnPropertyDescriptor(p,\'value\');d.set.call(el,val);el.dispatchEvent(new Event(\'input\',{bubbles:true}))}function evType(t,o){try{var I=window.InputEvent;return I?new I(t,o):new Event(t,{bubbles:true})}catch(_){return new Event(t,{bubbles:true})}}function normWs(s){return String(s).replace(/\\s+/g,\'\')}function editFill(el,merged,line,cur,cb){var want=normWs(merged);var rest=(merged===line)?\'\':((merged.indexOf(line)===0)?merged.slice(line.length).replace(/^\\n/,\'\'):merged);function noFlash(on){try{var id=\'dsh-nf-css\',st=document.getElementById(id);if(on){if(!st){st=document.createElement(\'style\');st.id=id;st.textContent=\'.dsh-nf-sel::selection{background:transparent;color:inherit}\';document.head.appendChild(st)}el.classList.add(\'dsh-nf-sel\')}else{el.classList.remove(\'dsh-nf-sel\')}}catch(_){}}function txt(){try{return el.innerText||el.textContent||\'\'}catch(_){return \'\'}}function isEmpty(){return normWs(txt())===\'\'}function applied(){var t=normWs(txt());return want===\'\'?t===\'\':t.indexOf(want)>=0}function separated(){return txt().indexOf(\'\\n\')>=0}function selAll(){try{var s=window.getSelection();var r=document.createRange();r.selectNodeContents(el);s.removeAllRanges();s.addRange(r)}catch(_){}}function exec(c,v){try{return document.execCommand(c,false,v===undefined?undefined:v)}catch(_){return false}}function fireInput(type,data){try{el.dispatchEvent(evType(\'beforeinput\',{inputType:type,data:data,bubbles:true,cancelable:true}));el.dispatchEvent(evType(\'input\',{inputType:type,data:data,bubbles:true}))}catch(_){}}function dom(t){try{el.textContent=t;el.dispatchEvent(new Event(\'input\',{bubbles:true}))}catch(_){}}function finish(ok){noFlash(false);cb(ok)}try{el.focus()}catch(_){}noFlash(true);function clearAll(done){exec(\'selectAll\');setTimeout(function(){exec(\'delete\');setTimeout(function(){if(isEmpty())return done();selAll();setTimeout(function(){exec(\'delete\');setTimeout(done,60)},60)},80)},80)}function write(done){if(rest===\'\'){exec(\'insertText\',merged);setTimeout(function(){if(applied())return done(\'ok\');fireInput(\'insertText\',merged);setTimeout(function(){if(applied())return done(\'ok\');dom(merged);setTimeout(function(){done(applied()?\'ok\':\'bad\')},250)},70)},80);return}exec(\'insertText\',line);setTimeout(function(){fireInput(\'insertParagraph\');if(!separated())exec(\'insertParagraph\');setTimeout(function(){exec(\'insertText\',rest);setTimeout(function(){if(applied()&&separated())return done(\'ok\');if(applied())return done(\'nosep\');fireInput(\'insertText\',merged);setTimeout(function(){done(applied()?(separated()?\'ok\':\'nosep\'):\'bad\')},70)},80)},70)},80)}clearAll(function(){write(function(r){if(r===\'ok\'||r===\'nosep\')return finish(true);selAll();setTimeout(function(){exec(\'insertText\',merged);setTimeout(function(){finish(applied())},200)},80)})})}function fill(text){var n=0;function go(){var el=pick();if(el){var cur=isField(el)?el.value||\'\':(el.innerText||el.textContent||\'\');var merged=mergeFill(cur,text);if(isField(el)){fieldSet(el,merged);try{window.parent.postMessage({type:\'dsh-fill-ack\',ok:true},\'*\')}catch(_){}return}editFill(el,merged,text,cur,function(ok){var sep=false;try{sep=(el.innerText||el.textContent||\'\').indexOf(\'\\n\')>=0}catch(_){}try{window.parent.postMessage({type:\'dsh-fill-ack\',ok:!!ok,sep:sep},\'*\')}catch(_){}});return}if(n<10){n++;setTimeout(go,100)}else if(n<15){n++;setTimeout(go,400)}}go()}var vaultRoot=null;function normP(p){return p.replace(/\\\\/g,\'/\').replace(/\\/+/g,\'/\')}function coll(p){var m=/^[A-Za-z]:/.exec(p),drive=m?m[0]:\'\',body=p.slice(drive.length),rooted=body.charAt(0)===\'/\',segs=[],i,parts=body.split(\'/\');for(i=0;i<parts.length;i++){var s=parts[i];if(s===\'\'||s===\'.\')continue;if(s===\'..\'){if(segs.length)segs.pop()}else{segs.push(s)}}return drive+(rooted?\'/\':\'\')+segs.join(\'/\')}function resolveTxt(text){var t=text.trim();if(!t||t.length>300||!vaultRoot)return null;var r=normP(vaultRoot).replace(/\\/+$/,\'\');var abs=/^[A-Za-z]:/.test(t)||t.charAt(0)===\'/\'?normP(t):r+\'/\'+normP(t);var a=coll(abs);var rl=r.toLowerCase(),al=a.toLowerCase();if(al===rl||al.indexOf(rl+\'/\')===0)return a;return null}function isClickable(el){return el.tagName===\'BUTTON\'||el.tagName===\'A\'}function labelPrefixed(t){return /^(read|edit|write|think|grep|pwsh|tool|search|diff|web|bash|python|node|run|open|show|copy|cat|mkdir|rm|mv|add|delete)\\b/i.test(t)}function readable(p){return /\\.(md|markdown|txt|canvas|pdf|png|jpe?g|gif|svg|webp|bmp|ico|mp3|wav|ogg|oga|m4a|flac|opus|aac|mp4|webm|mov|mkv|avi|m4v|ogv|3gp|ts|js|jsx|tsx|mjs|cjs|json|css|scss|less|html|htm|xml|yaml|yml|csv|log|mdx|py|sh|bat|ps1)$/i.test(p)}function pathOf(el){var t=el.getAttribute?el.getAttribute(\'title\'):null;if(t&&/[\\\\/]/.test(t))return t;return (el.textContent||\'\').trim()}document.addEventListener(\'click\',function(e){if(!vaultRoot)return;var el=e.target;while(el&&el!==document.body){var txt=pathOf(el);if(txt.length>2&&txt.length<300&&/[\\\\/]/.test(txt)&&isClickable(el)&&!labelPrefixed(txt)){if(el.closest&&el.closest(\'.dsh-ob-bar\'))return;var r=resolveTxt(txt);if(r&&readable(r)){e.preventDefault();e.stopPropagation();try{window.parent.postMessage({type:\'dsh-open-in-obsidian\',path:r},\'*\')}catch(_){}}return}el=el.parentElement}},true);window.addEventListener(\'message\',function(e){if(e.source!==window.parent)return;var d=e.data;if(!d)return;if(d.type===\'dsh-fill-draft\'&&typeof d.text===\'string\'){fill(d.text);return}if(d.type===\'dsh-bridge-ping\'){try{window.parent.postMessage({type:\'dsh-bridge-ready\'},\'*\')}catch(_){};return}if(d.type===\'dsh-open-cfg\'&&typeof d.vaultRoot===\'string\'){vaultRoot=d.vaultRoot;return}if(d.type===\'dsh-kbd-cfg\'&&d.keys&&d.keys.length!==undefined){kbdKeys=d.keys;logKbd(\'kbd-cfg received: \'+kbdList());return}});var kbdKeys=[];function kbdMatch(e,k){if(!k||!e)return false;var wantC=k.indexOf(\'ctrl\')>=0,wantM=k.indexOf(\'meta\')>=0,wantA=k.indexOf(\'alt\')>=0;if(wantC!==e.ctrlKey||wantM!==e.metaKey||wantA!==e.altKey)return false;var key=(e.key||\'\').toLowerCase();if(k.indexOf(\'+\')>=0){var ch=k.slice(k.lastIndexOf(\'+\')+1).toLowerCase();return key===ch}return key===k.toLowerCase()}function requestKbd(){try{window.parent.postMessage({type:\'dsh-kbd-request\'},\'*\')}catch(_){}}function logKbd(m){try{console.log(\'[dsh-bridge]\',m)}catch(_){}}function kbdList(){var s=\'\';for(var i=0;i<kbdKeys.length;i++){s+=kbdKeys[i]+\' \'}return s}logKbd(\'keydown listener installed, kbdKeys=\'+kbdKeys.length+\': \'+kbdList());document.addEventListener(\'keydown\',function(e){logKbd(\'keydown ctrl=\'+e.ctrlKey+\' meta=\'+e.metaKey+\' key=\'+e.key+\' kbdKeys=\'+kbdKeys.length);if(!kbdKeys.length){requestKbd();return}for(var i=0;i<kbdKeys.length;i++){if(kbdMatch(e,kbdKeys[i])){e.preventDefault();e.stopPropagation();logKbd(\'MATCH \'+kbdKeys[i]+\' -> post\');try{window.parent.postMessage({type:\'dsh-kbd-shortcut\',key:kbdKeys[i]},\'*\')}catch(_){}return}}},true);try{window.parent.postMessage({type:\'dsh-bridge-ready\'},\'*\')}catch(_){}})()'

const EMBED_TOKEN_QUERY = 'token'
const EMBED_MARKER_QUERY = 'ob'
function embedHeader(req, name) {
  try {
    const h = req && req.headers
    if (!h) return ''
    if (typeof h.get === 'function') return h.get(name) || ''
    return h[name] || h[name.toLowerCase()] || ''
  } catch { return '' }
}
function embedParams(req) {
  try {
    const u = String((req && req.url) || '')
    const qi = u.indexOf('?')
    if (qi < 0) return new URLSearchParams()
    return new URLSearchParams(u.slice(qi + 1))
  } catch { return null }
}
function embedTokenOf(conn) {
  try {
    return new URL(conn.authenticatedUrl('http://127.0.0.1/')).searchParams.get(EMBED_TOKEN_QUERY) || ''
  } catch { return '' }
}
function embedPatchAuth(conn, token) {
  const proto = Object.getPrototypeOf(conn)
  if (!proto || proto.__dshEmbedPatched) return
  const origRejection = typeof conn.requestRejection === 'function' ? proto.requestRejection : null
  const origIndex = typeof conn.authorizeIndex === 'function' ? proto.authorizeIndex : null
  if (!origRejection && !origIndex) return
  proto.__dshEmbedPatched = true
  if (origRejection) {
    proto.requestRejection = function (req) {
      const verdict = origRejection.call(this, req)
      if (verdict !== 401) return verdict
      try {
        if (embedHeader(req, 'authorization') === 'Bearer ' + token) return undefined
        const sp = embedParams(req)
        if (sp && sp.get(EMBED_TOKEN_QUERY) === token) return undefined
      } catch {}
      return verdict
    }
  }
  if (origIndex) {
    proto.authorizeIndex = function (req, res) {
      try {
        if (req && req.method === 'GET') {
          const u = String(req.url || '')
          const pathOnly = u.slice(0, u.indexOf('?') < 0 ? u.length : u.indexOf('?'))
          if (pathOnly === '/' || pathOnly === '') {
            const sp = embedParams(req)
            if (sp && sp.get(EMBED_MARKER_QUERY) === '1' && sp.get(EMBED_TOKEN_QUERY) === token) return true
          }
        }
      } catch {}
      return origIndex.call(this, req, res)
    }
  }
}
let embedDone = false
let embedToken = ''
let embedLogged = false
function embedLog(msg) {
  if (embedLogged) return
  embedLogged = true
  try { console.log('[dsh-obsidian-bridge] embed adapter:', msg) } catch (_) {}
}
function embedActivate(conn) {
  if (embedDone) return
  embedDone = true
  try {
    if (!conn || typeof conn.authenticatedUrl !== 'function') { embedLog('no browser-auth API (pre-0.1.2) — idle'); return }
    const token = embedTokenOf(conn)
    if (!token) { embedLog('token parse empty'); return }
    embedPatchAuth(conn, token)
    embedLog('adapter active (token len ' + String(token.length) + ')')
    embedToken = token
  } catch (err) { embedLog('unexpected: ' + (err && err.message)) }
}

const BRIDGE_LINE_RE = /\[\s*BRIDGES is delivering packages for you……\s*·\s*(\d+)\s*words\s*·\s*L(\d+):(\d+)-L(\d+):(\d+)\s*·\s*([^\]]+?)\s*·\s*\]/
function bridgeMessageId() {
  try {
    const c = globalThis.crypto
    if (c && typeof c.randomUUID === 'function') return c.randomUUID()
    if (c && typeof c.getRandomValues === 'function') {
      const b = c.getRandomValues(new Uint8Array(16))
      b[6] = (b[6] & 15) | 64
      b[8] = (b[8] & 63) | 128
      let h = ''
      for (let i = 0; i < 16; i++) h += (b[i] + 256).toString(16).slice(1)
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20)
    }
  } catch (_) {}
  return 'bridge-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12)
}
function bridgeEditMaybeInject({ messages }) {
  if (!messages || !messages.length) return null
  const last = messages[messages.length - 1]
  const text = typeof last === 'string' ? last : ((last && last.content) || []).map((c) => (c && c.text) || '').join('')
  if (!text) return null
  const m = BRIDGE_LINE_RE.exec(text)
  if (!m) return null
  for (let i = 0; i < messages.length; i++) {
    const s = messages[i] && messages[i].source
    if (s && s.plugin === 'dsh-obsidian-bridge') return null
  }
  const path = m[6].trim()
  const loc = 'L' + m[2] + ':' + m[3] + '-L' + m[4] + ':' + m[5]
  const instruction = text.replace(BRIDGE_LINE_RE, '').trim() || '请读取该区域内容并处理'
  const text2 = '[BRIDGES 编辑指令] 目标文件：' + path + '；选区（1 基行:列）：' + loc + '；用户要求：' + instruction
    + '。处理要求：先用 fs read 读取该区域原文；按用户要求直接生成结果（只输出结果本身、一段即可，不要附带定位说明或补充）；随后询问用户是否同意将该结果写入文件；经用户同意后再用 fs edit 写入（old_string=读取到的原文，按用户要求替换或追加）。本编辑任务完成后请忽略本指令，勿在后续对话中重复执行。'
  const summary = '[BRIDGES 编辑指令] ' + path + ' · ' + loc
  return { id: bridgeMessageId(), role: 'user', source: { kind: 'plugin', plugin: 'dsh-obsidian-bridge', form: 'notice', summary: summary }, content: [{ type: 'text', text: text2 }] }
}

export function apply(ctx) {
  try { console.log('[dsh-obsidian-bridge] apply called') } catch (_) {}
  ctx.inject(['connection'], (actx) => {
    try { embedActivate(actx.connection) } catch (_) {}
  })
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex((html) => {
        const embedVar = embedToken ? '<script>window.__DSH_EMBED_TOKEN__=' + JSON.stringify(embedToken) + ';</script>' : ''
        return html.replace('<head>', '<head>' + embedVar + '<script>' + BRIDGE + '</script>')
      }),
      'dsh-obsidian-bridge: index bridge',
    )
  })
  try {
    ctx.on('agent/pre-step', async ({ messages }, next) => {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      const msg = bridgeEditMaybeInject({ messages })
      if (!msg) return decision
      return { kind: 'enter', messages: [...decision.messages, msg] }
    })
  } catch (err) {
    try { console.warn('[dsh-obsidian-bridge] pre-step unavailable:', err && err.message) } catch (_) {}
  }
}
