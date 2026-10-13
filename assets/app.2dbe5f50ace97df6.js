'use strict';
const KEY = 'meetup-wheel-v1';
const $ = id => document.getElementById(id);
const validIds = new Set(BANK.map(q => q.id));
let state = {
  order: [],
  used: [],
  history: [],
  mode: 'all',
  noRepeat: true
};
let rotation = 0,
  busy = false,
  current = null,
  timerHandle = null,
  timeLeft = 60,
  deadline = 0;

function randomInt(n) {
  if (!Number.isInteger(n) || n < 1) throw Error('invalid range');
  const a = new Uint32Array(1),
    limit = 4294967296 - (4294967296 % n);
  do {
    crypto.getRandomValues(a)
  } while (a[0] >= limit);
  return a[0] % n
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function normalize(saved) {
  if (!saved || !Array.isArray(saved.order) || saved.order.length !== BANK.length || new Set(saved.order).size !== BANK.length || !saved.order.every(id => validIds.has(id))) return null;
  return {
    order: saved.order,
    used: Array.isArray(saved.used) ? [...new Set(saved.used.filter(id => validIds.has(id)))] : [],
    history: Array.isArray(saved.history) ? saved.history.filter(h => h && validIds.has(h.id) && Number.isFinite(h.at)).slice(-300) : [],
    mode: ['all', 'truth', 'dare'].includes(saved.mode) ? saved.mode : 'all',
    noRepeat: saved.noRepeat !== false
  }
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toast.handle);
  toast.handle = setTimeout(() => $('toast').hidden = true, 4000)
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {
    toast('浏览器未能保存记录；当前页面仍可正常抽题。')
  }
}
try {
  const saved = normalize(JSON.parse(localStorage.getItem(KEY)));
  if (saved) state = saved
} catch (e) {}
if (!state.order.length) state.order = shuffle(BANK.map(q => q.id));
const lookup = new Map(BANK.map(q => [q.id, q]));

function entries() {
  return state.order.map(id => lookup.get(id)).filter(q => state.mode === 'all' || q.type === state.mode)
}

function candidates() {
  return entries().filter(q => !state.noRepeat || !state.used.includes(q.id))
}

function wheelDraw() {
  const canvas = $('wheel'),
    size = canvas.getBoundingClientRect().width || 500,
    dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(size / 2, size / 2);
  ctx.rotate(rotation * Math.PI / 180);
  const items = entries(),
    r = size / 2 - 3,
    step = Math.PI * 2 / items.length;
  items.forEach((q, i) => {
    const start = -Math.PI / 2 + i * step,
      used = state.used.includes(q.id);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, start, start + step);
    ctx.closePath();
    ctx.fillStyle = used ? '#ded3d5' : q.type === 'truth' ? (i % 2 ? '#fda8b3' : '#f47990') : (i % 2 ? '#bdabd6' : '#9476b7');
    ctx.fill();
    ctx.strokeStyle = '#fff8';
    ctx.lineWidth = .7;
    ctx.stroke();
    ctx.save();
    ctx.rotate(start + step / 2);
    ctx.fillStyle = used ? '#96888c' : '#fff';
    ctx.font = '600 ' + Math.max(9, Math.min(12, size / 39)) + 'px system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), r - 10, 0);
    ctx.restore()
  });
}

function controls() {
  const remaining = candidates().length,
    total = entries().length;
  $('spin').disabled = busy || remaining === 0;
  $('skip').disabled = busy || !current || remaining === 0;
  $('reset').disabled = busy;
  $('noRepeat').disabled = busy;
  document.querySelectorAll('[data-mode]').forEach(b => {
    b.disabled = busy;
    b.classList.toggle('active', b.dataset.mode === state.mode);
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode))
  });
  $('spin').textContent = busy ? '好运转动中…' : remaining === 0 ? '本轮已抽完' : '开始转动 ↗';
  $('progress').textContent = state.noRepeat ? '本模式剩余 ' + remaining + ' / ' + total + ' 题 · 本轮共抽 ' + state.history.length + ' 次' : '本模式 ' + total + ' 题 · 允许重复 · 本轮共抽 ' + state.history.length + ' 次';
  $('historyCount').textContent = state.history.length;
  $('noRepeat').checked = state.noRepeat;
}

function timerStop() {
  if (timerHandle !== null) clearInterval(timerHandle);
  timerHandle = null;
  $('timerStart').textContent = '开始计时'
}

function timerRender() {
  $('timer').textContent = String(Math.floor(timeLeft / 60)).padStart(2, '0') + ':' + String(timeLeft % 60).padStart(2, '0')
}

function timerReset() {
  timerStop();
  timeLeft = 60;
  timerRender()
}

function result(q) {
  current = q;
  $('badge').textContent = q.type === 'truth' ? '真心话' : '大冒险' + (q.spicy ? ' · ♡ 微心动' : '');
  $('badge').classList.toggle('dare', q.type === 'dare');
  $('number').textContent = (q.type === 'truth' ? '真心话' : '大冒险') + ' #' + String(q.number).padStart(2, '0');
  $('question').textContent = q.text;
  $('hint').textContent = q.type === 'truth' ? '说说理由，或讲一个具体故事。无需透露他人姓名。' : '由你完成，对方无需回应。邀请与告白属于游戏任务。';
  $('timerStart').disabled = false;
  $('timerReset').disabled = false;
  timerReset()
}

function idle() {
  current = null;
  $('badge').textContent = '今晚，从这一题开始';
  $('badge').classList.remove('dare');
  $('number').textContent = BANK.length + ' 道题已就绪';
  $('question').textContent = '真心话，还是大冒险？交给一点小小的运气。';
  $('hint').textContent = '点「开始转动」，抽出你的题目。无需道具，轻松开场。';
  $('timerStart').disabled = true;
  $('timerReset').disabled = true;
  timerReset()
}
async function spin() {
  if (busy) return;
  const pool = candidates();
  if (!pool.length) {
    toast('这个模式已经抽完，切换模式或重新开局吧。');
    return
  }
  busy = true;
  timerStop();
  controls();
  const selected = pool[randomInt(pool.length)],
    items = entries(),
    index = items.findIndex(q => q.id === selected.id),
    landing = (360 - (index + .5) * 360 / items.length) % 360;
  const start = rotation,
    target = start + 360 * 5 + ((landing - start % 360 + 360) % 360),
    duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 3900;
  $('badge').textContent = '好运转动中';
  $('question').textContent = '下一题，会是什么？';
  $('hint').textContent = '真诚一点，勇敢一点，也可以幽默一点。';
  await new Promise(resolve => {
    const began = performance.now();

    function frame(now) {
      const t = Math.min((now - began) / duration, 1);
      rotation = start + (target - start) * (1 - Math.pow(1 - t, 4));
      wheelDraw();
      if (t < 1) requestAnimationFrame(frame);
      else resolve()
    }
    requestAnimationFrame(frame)
  });
  rotation = landing;
  if (!state.used.includes(selected.id)) state.used.push(selected.id);
  state.history.push({
    id: selected.id,
    at: Date.now()
  });
  if (state.history.length > 300) state.history.shift();
  persist();
  result(selected);
  busy = false;
  controls();
  wheelDraw();
  if (innerWidth <= 760) document.querySelector('.card').scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start'
  });
}
$('spin').onclick = spin;
$('skip').onclick = spin;
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => {
  if (busy) return;
  state.mode = button.dataset.mode;
  rotation = 0;
  persist();
  controls();
  wheelDraw()
});
$('noRepeat').onchange = () => {
  state.noRepeat = $('noRepeat').checked;
  persist();
  controls()
};
$('timerStart').onclick = () => {
  if (timerHandle !== null) {
    timeLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerStop();
    $('timerStart').textContent = '继续计时';
    timerRender();
    return
  }
  if (timeLeft === 0) timeLeft = 60;
  deadline = Date.now() + timeLeft * 1000;
  $('timerStart').textContent = '暂停计时';
  timerHandle = setInterval(() => {
    timeLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerRender();
    if (timeLeft === 0) {
      timerStop();
      toast('一分钟到了，想继续聊也可以。')
    }
  }, 200)
};
$('timerReset').onclick = timerReset;
$('reset').onclick = () => {
  if (!busy) $('resetDialog').showModal()
};
$('confirmReset').onclick = () => {
  if (busy) return;
  $('resetDialog').close();
  state.order = shuffle(BANK.map(q => q.id));
  state.used = [];
  state.history = [];
  rotation = 0;
  idle();
  persist();
  controls();
  wheelDraw();
  toast('新一轮已就绪，' + BANK.length + '题重新打散。')
};

function listRender(root, items, history = false) {
  root.replaceChildren();
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = history ? '还没有抽题记录，开始转动吧。' : '没有找到对应题目。';
    root.append(p);
    return
  }
  items.forEach(item => {
    const q = history ? lookup.get(item.id) : item;
    const row = document.createElement('div');
    row.className = 'entry';
    const meta = document.createElement('small');
    meta.textContent = (q.type === 'truth' ? '真心话' : '大冒险') + ' #' + String(q.number).padStart(2, '0') + (q.spicy ? ' · ♡ 微心动' : '') + (history ? ' · ' + new Date(item.at).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    }) : state.used.includes(q.id) ? ' · 已抽过' : '');
    const p = document.createElement('p');
    p.textContent = q.text;
    row.append(meta, p);
    root.append(row)
  })
}

function bankRender() {
  const query = $('search').value.trim().toLowerCase();
  listRender($('bankList'), state.order.map(id => lookup.get(id)).filter(q => ((q.type === 'truth' ? '真心话' : '大冒险') + ' ' + q.id + ' ' + q.text).toLowerCase().includes(query)))
}
$('bankButton').onclick = () => {
  bankRender();
  $('bankDialog').showModal()
};
$('search').oninput = bankRender;
$('historyButton').onclick = () => {
  listRender($('historyList'), state.history.slice().reverse(), true);
  $('historyDialog').showModal()
};
$('rules').onclick = () => $('rulesDialog').showModal();
document.querySelectorAll('dialog .close').forEach(b => b.onclick = () => b.closest('dialog').close());
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else toast('此浏览器不支持全屏，可使用浏览器菜单放大页面。')
  } catch (e) {
    toast('无法进入全屏，可使用浏览器菜单放大页面。')
  }
};
document.addEventListener('fullscreenchange', () => $('fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏');
window.addEventListener('resize', wheelDraw);
if (state.history.length) result(lookup.get(state.history[state.history.length - 1].id));
controls();
wheelDraw();
persist();

const truthCount = BANK.filter(q => q.type === 'truth').length;
document.querySelector('[data-bank-summary]').textContent = truthCount + ' 道真心话 · ' + (BANK.length - truthCount) + ' 道大冒险';
document.querySelectorAll('[data-bank-count]').forEach(el => el.textContent = BANK.length);
$('wheel').setAttribute('aria-label', BANK.length + '题随机转盘，按开始转动抽题');
if (!current) $('number').textContent = BANK.length + ' 道题已就绪';
