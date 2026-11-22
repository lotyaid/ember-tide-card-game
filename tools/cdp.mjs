// cdp.mjs — headless Chrome driver over CDP (Node 22, stdlib only).
// Modes:
//   node tools/cdp.mjs shots     — render the 4 deterministic shots to screenshots/
//   node tools/cdp.mjs playtest  — play live: title -> Play -> a few real
//                                  turns via clicks and keys, then run scripted
//                                  full games across seeds to prove a win and
//                                  a loss are both reachable. Reports console
//                                  errors and the game state.
// Chrome binary: the Puppeteer cache build. Server must already run on
// http://localhost:8124 (node serve.ts --port 8124).

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const CHROME = `${process.env.HOME}/.cache/puppeteer/chrome/linux-157.0.8103.78/chrome-linux64/chrome`;
const BASE = 'http://localhost:8124';
const MODE = process.argv[2] || 'shots';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChrome() {
  const proc = spawn(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9223',
    '--window-size=1280,720',
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9223/json/version');
      if (res.ok) return proc;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chrome did not start');
}

async function connect() {
  const res = await fetch('http://localhost:9223/json/list');
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    } else if (data.method) {
      events.push(data);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  return { ws, send, events };
}

async function navigate(send, url) {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(1500);
}

async function evaluate(send, expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text || 'exception' };
  return r.result?.result?.value;
}

async function dispatchKey(send, type, code, key, keyCode) {
  await send('Input.dispatchKeyEvent', {
    type,
    code,
    key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

async function press(send, code, key, keyCode, holdMs = 90) {
  await dispatchKey(send, 'keyDown', code, key, keyCode);
  await sleep(holdMs);
  await dispatchKey(send, 'keyUp', code, key, keyCode);
}

async function click(send, x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(200);
}

async function screenshot(send, path, quality = 82) {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: true });
  const buf = Buffer.from(r.result.data, 'base64');
  writeFileSync(path, buf);
  return buf.length;
}

function consoleErrors(events) {
  return events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map((e) => JSON.stringify(e.params).slice(0, 400));
}

const proc = await launchChrome();
try {
  const { ws, send, events } = await connect();

  if (MODE === 'shots') {
    const shots = JSON.parse(readFileSync('shots.json', 'utf8'));
    mkdirSync('screenshots', { recursive: true });
    await navigate(send, `${BASE}/index.html${shots[0].query}`);
    const geo = await evaluate(send, `(() => ({ innerW: window.innerWidth, innerH: window.innerHeight }))()`);
    console.log('viewport:', JSON.stringify(geo));
    for (const s of shots) {
      await navigate(send, `${BASE}/index.html${s.query}`);
      const size = await screenshot(send, `screenshots/${s.name}`);
      console.log(`${s.name}: ${size} bytes`);
    }
    // Determinism: re-shoot the cover and compare bytes.
    await navigate(send, `${BASE}/index.html${shots[0].query}`);
    const again = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    const againBuf = Buffer.from(again.result.data, 'base64');
    const firstBuf = readFileSync('screenshots/1-cover.jpg');
    console.log(`cover re-shoot byte-identical: ${againBuf.equals(firstBuf)}`);
    console.log('console errors:', JSON.stringify(consoleErrors(events)));
  } else if (MODE === 'playtest') {
    await navigate(send, `${BASE}/index.html`);
    console.log('screen at load:', await evaluate(send, 'window.__ember.game.screen'));
    // Click PLAY (centre of the title overlay button).
    const playBox = await evaluate(send, `(() => { const b = document.getElementById('play-button'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await click(send, Math.round(playBox.x), Math.round(playBox.y));
    await sleep(300);
    console.log('screen after PLAY click:', await evaluate(send, 'window.__ember.game.screen'));
    // Play three real turns through the keyboard: Space ends the turn.
    for (let i = 0; i < 3; i++) {
      await press(send, 'Space', ' ', 32);
      await sleep(800);
      console.log(`after Space ${i + 1}:`, JSON.stringify(await evaluate(send, `(() => { const g = window.__ember.game; return { screen: g.screen, turn: g.turn, owner: g.turnOwner, pLife: g.player.life, eLife: g.enemy.life, pHand: g.player.hand.length, pTable: g.player.table.length, eTable: g.enemy.table.length }; })()`)));
    }
    // Mouse test on the scripted mid-game table (?shot=table): click a
    // hand spell, target a Rival creature with it, then attack face with
    // a ready creature by clicking it and the Rival hero.
    await navigate(send, `${BASE}/index.html?shot=table&seed=7`);
    const before = await evaluate(send, `(() => { const g = window.__ember.game; return { eLife: g.enemy.life, guardHp: g.enemy.table.find(c => c.id === 'coral-guard')?.hp, pHand: g.player.hand.length }; })()`);
    console.log('mouse test before:', JSON.stringify(before));
    const burstBox = await evaluate(send, `(() => { const els = [...document.querySelectorAll('.hand-player .card')]; const el = els.find(e => e.textContent.includes('Cinder Burst')); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await click(send, Math.round(burstBox.x), Math.round(burstBox.y));
    await sleep(200);
    console.log('targeting after spell click:', await evaluate(send, 'window.__ember.game.spellTargeting?.name ?? null'));
    const guardBox = await evaluate(send, `(() => { const els = [...document.querySelectorAll('.table-enemy .card')]; const el = els.find(e => e.textContent.includes('Coral Guard')); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await click(send, Math.round(guardBox.x), Math.round(guardBox.y));
    await sleep(200);
    const afterSpell = await evaluate(send, `(() => { const g = window.__ember.game; return { guardHp: g.enemy.table.find(c => c.id === 'coral-guard')?.hp, pHand: g.player.hand.length, targeting: g.spellTargeting }; })()`);
    console.log('after Cinder Burst on Coral Guard:', JSON.stringify(afterSpell));
    const foxBox = await evaluate(send, `(() => { const els = [...document.querySelectorAll('.table-player .card')]; const el = els.find(e => e.textContent.includes('Cinder Fox')); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await click(send, Math.round(foxBox.x), Math.round(foxBox.y));
    await sleep(200);
    const heroBox = await evaluate(send, `(() => { const el = document.querySelector('.hero.enemy'); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await click(send, Math.round(heroBox.x), Math.round(heroBox.y));
    await sleep(200);
    console.log('after Cinder Fox attacks Rival face:', JSON.stringify(await evaluate(send, `(() => { const g = window.__ember.game; return { eLife: g.enemy.life, foxCanAttack: g.player.table.find(c => c.id === 'cinder-fox')?.canAttack }; })()`)));
    // Scripted full games across seeds: prove win AND loss are reachable.
    const outcomes = await evaluate(send, `(async () => {
      const out = { wins: 0, losses: 0, draws: 0, samples: [] };
      for (let seed = 1; seed <= 30; seed++) {
        const g = window.__ember.createGame(seed);
        g.screen = 'table';
        window.__ember.setGame(g);
        const r = window.__ember.playFullGame(80);
        out.samples.push({ seed, screen: r.screen, rounds: r.rounds, pLife: r.playerLife, eLife: r.enemyLife });
        if (r.screen === 'win') out.wins++;
        else if (r.screen === 'loss') out.losses++;
        else out.draws++;
      }
      return out;
    })()`);
    console.log('full-game outcomes:', JSON.stringify(outcomes));
    console.log('console errors:', JSON.stringify(consoleErrors(events)));
  }
  ws.close();
} finally {
  proc.kill();
}
