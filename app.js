import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword,
  sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where, limit,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove, deleteField, getDocs, getDoc, getCountFromServer, startAfter, documentId
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// 지금 브라우저가 쓰는 app.js 버전: 화면 맨 아래 저작권 옆에 보임 (예전 파일을 쓰는지 확인용 · index.html의 ?v=와 같게)
const APP_VER = '20261112e';
document.querySelector('.copyright')?.append(` · ver ${APP_VER}`);
import { getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ★ 국내용 Firebase 프로젝트 설정값 (README 1단계). Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)의 firebaseConfig를 그대로 붙여넣기
//   Global Opening Prep와 데이터(POG·도면·매장)가 섞이지 않도록 새 프로젝트를 쓰세요
const firebaseConfig = {
  apiKey: "AIzaSyB-NK3AqrszXFBpFe5Nk9CB6cdtr4S5y7g",
  authDomain: "korea-store-prep.firebaseapp.com",
  projectId: "korea-store-prep",
  storageBucket: "korea-store-prep.firebasestorage.app",
  messagingSenderId: "1091211185066",
  appId: "1:1091211185066:web:978bec6c5b5cd513fa39d3"
};
const FB_READY = !firebaseConfig.apiKey.startsWith('여기에');

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const st = getStorage(fbApp);

/* ---------- 공통 ---------- */
// 국내용: 영어 번역·바이어·집기도면·초도 계산은 없음. 용어 사전은 POG 입력칸 선택지(한국어)로만 씀
const CATS = ['매대타입', '고리타입', '선반/파이프', '집기'];
// 계정 레벨. roles/{이메일} 문서가 없으면 'none' (아무것도 못 봄)
// 보기는 모두 가능. 편집은 VMD팀 = 도면만, POG팀 = POG만, MD = 피드백 POG 메모만. 매장 등록·바코드·용어 사전 고치기·계정은 관리자
const LEVELS = { admin: '관리자', pog: 'POG팀', vmd: 'VMD팀', md: 'MD', finder: '제품 찾기만', none: '권한 없음', blocked: '접속 막힘' };
const ASSIGNABLE = ['admin', 'pog', 'vmd', 'md', 'finder'];
// 레벨마다 볼 수 있는 화면(views)과 편집할 수 있는 부분(edit). 진짜 차단은 firestore.rules / storage.rules가 함
const STAFF_VIEWS = ['home', 'stores', 'barcodes', 'drawing', 'dw-up', 'dw-online', 'pog-home', 'pog-make', 'pog-online', 'pog-fb', 'glossary', 'finder'];
const ALL_EDIT = ['stores', 'barcodes', 'drawing', 'pog-make', 'pog-fb', 'glossary', 'glossary-add', 'glossary-make'];
// glossary-add = 용어 사전에 새 이름 넣기만, glossary-make = 선반/파이프·집기 '제작필요' 체크만 (POG팀: POG 만들 때 씀)
const ACCESS = {
  admin: { views: [...STAFF_VIEWS, 'accounts'], edit: ALL_EDIT },
  pog: { views: STAFF_VIEWS, edit: ['pog-make', 'glossary-add', 'glossary-make'] },
  vmd: { views: STAFF_VIEWS, edit: ['drawing'] },
  md: { views: STAFF_VIEWS, edit: ['pog-fb'] },
  finder: { views: ['finder'], edit: [] }, // 매장 계정: 제품 찾기만 (최종본만 읽음)
  none: { views: [], edit: [] },    // 관리자가 만들지 않은(레벨 문서가 없는) 계정: 아무것도 못 봄
  blocked: { views: [], edit: [] }, // 관리자가 접속을 막은 계정
};
const access = () => ACCESS[state.level] || ACCESS.none;
const canSee = v => access().views.includes(v);
const canEdit = area => access().edit.includes(area);
const isStaff = () => canSee('glossary'); // 내부 직원 (작성 중 POG·용어 사전을 볼 수 있음)
function applyAccess() {
  $$('[data-view], [data-go]').forEach(el => el.classList.toggle('hidden', !canSee(el.dataset.view || el.dataset.go)));
  $$('[data-edit]').forEach(el => el.classList.toggle('hidden', !canEdit(el.dataset.edit)));
  $('#subnav').classList.toggle('hidden', !canSee('pog-make'));
  $$('.tiles').forEach(t => t.classList.toggle('few', [...t.children].filter(c => c.classList.contains('tile') && !c.classList.contains('hidden')).length <= 2));
  $$('[data-staff]').forEach(el => el.classList.toggle('hidden', !isStaff()));
  $$('[data-admin]').forEach(el => el.classList.toggle('hidden', state.level !== 'admin')); // 관리자만 보이는 버튼
}
const CANVAS_W = 540, CANVAS_H = 930;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
let toastTimer;
function toast(msg, action) { // action = [버튼 글자, 누르면 할 일] (예: 되돌리기)
  const t = $('#toast'); t.replaceChildren(msg);
  if (action) t.append(h('button', { class: 'toast-act', onclick: () => { t.classList.remove('on'); action[1](); } }, action[0]));
  t.classList.add('on'); t.classList.toggle('act', !!action);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), action ? 7000 : 2600);
}
// 예 / 아니오 창 (닫으면 null)
function askYesNo(title, text) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; close(); res(v); };
    const close = modal(h('div', { class: 'yn-pop' }, h('h3', {}, title), text ? h('p', { class: 'mut', style: 'white-space:pre-line' }, text) : null,
      h('div', { class: 'modal-act' }, h('button', { class: 'btn ghost', onclick: () => fin(false) }, '아니오'), h('button', { class: 'btn primary', onclick: () => fin(true) }, '예'))));
    const bg = $$('#modal-root .modal-bg').at(-1); bg?.addEventListener('click', e => { if (e.target === bg) fin(null); });
    bg?.querySelector('.modal-x')?.addEventListener('click', () => fin(null));
  });
}
function modal(content, { wide = false } = {}) {
  const root = $('#modal-root');
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'modal-bg', onclick: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'modal' + (wide ? ' wide' : '') },
      h('button', { class: 'modal-x', onclick: close }, '×'), content));
  root.append(wrap);
  return close;
}
const catName = t => (t || '').replace(/^\d+\s*/, '');
const fmtDate = ts => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  return d && !isNaN(d) ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '';
};
// POG 원본 이름. 칸이 여러 개인 매대는 '(1/2)'처럼 몇 번째 칸인지 붙임
const origName = fx => (fx.mdName || '') + (fx.bayCount > 1 ? ` (${fx.bayNo}/${fx.bayCount})` : '');
const displayName = fx => fx.kind === 'free' ? (fx.headerName || '추가 페이지') : (fx.headerName || origName(fx));
const LABELS_KO = { type: '매대 타입', hook: '고리타입/갯수', sp: '선반/파이프여부', other: '이외집기(8코드포함)', mgr: 'POG 담당자', team: 'POG 팀' }; // 페이지 고정 문구
const glossaryOf = cat => state.glossary.filter(g => g.cat === cat).sort((a, b) => (a.ko || '').localeCompare(b.ko || '', 'ko'));

const state = {
  user: null, level: null, myName: '', view: 'home', roles: [], glLang: '', stores: [], dwMap: new Map(),
  pogs: [], managers: [], glossary: [], glCat: CATS[0],
  currentPog: null, fixtures: new Map(), pageEls: new Map(), lockKey: null, unsubPog: null, unsubFx: null,
  viewer: { unsubPog: null, unsubFx: null, pog: null, fixtures: [] },
};

let edThumbs, vwThumbs; // 아래 썸네일 함수가 정의된 뒤 만들어짐

/* ---------- 로그인 ---------- */
let unsubRole = null;
onAuthStateChanged(auth, user => {
  state.user = user;
  unsubRole?.(); unsubRole = null;
  stopListeners(); setLevel(null);
  $('#login').classList.toggle('hidden', !!user);
  $('#app').classList.toggle('hidden', !user);
  if (!user) return;
  state.view = 'home'; // 로그인하면 늘 처음 화면부터 (로그아웃 전 화면이 남지 않게)
  state.myName = ''; showMe();
  // 내 레벨을 읽고, 관리자가 바꾸면 바로 반영
  unsubRole = onSnapshot(doc(db, 'roles', user.email.toLowerCase()),
    d => {
      const lv = d.data()?.level;
      if (!d.exists()) console.warn(`roles/${user.email.toLowerCase()} 문서가 없어서 아무 화면도 열지 않아요 (계정 관리에서 레벨을 받아야 해요)`);
      else if (!LEVELS[lv]) console.warn(`roles/${user.email.toLowerCase()}의 level 값 '${lv}'을 알 수 없어요`);
      state.myName = String(d.data()?.name || '').trim(); showMe();
      setLevel(LEVELS[lv] && d.exists() ? lv : 'none');
    },
    e => {
      setLevel('none');
      alert(`계정 레벨을 읽지 못했어요.\n(${e.code || e.message})\n\nFirebase 콘솔 → Firestore Database → 규칙 탭에 firestore.rules 내용이 게시돼 있는지 확인해주세요.`);
    });
});
function setLevel(lv) {
  if (lv === state.level) return;
  state.level = lv;
  document.body.dataset.level = lv || '';
  $('#me-level').textContent = lv ? LEVELS[lv] : '';
  if (!lv) return;
  applyAccess();
  stopListeners(); if (access().views.length) startListeners();
  $('#na-msg').textContent = lv === 'blocked' ? '관리자가 이 계정의 접속을 막았어요. 다시 쓰려면 관리자에게 말해주세요.' : '아직 사용 권한이 없는 계정이에요. 관리자에게 계정 관리에서 레벨을 받아주세요.';
  go(state.view);
}
if (!FB_READY) $('#login-err').textContent = 'Firebase 설정값이 아직 없어요. app.js 맨 위 firebaseConfig에 국내용 프로젝트 값을 넣어주세요 (README 참고).';
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!FB_READY) return;
  $('#login-err').textContent = '';
  try { await signInWithEmailAndPassword(auth, $('#login-email').value.trim(), $('#login-pw').value); }
  catch { $('#login-err').textContent = '로그인 실패: 이메일 또는 비밀번호를 확인해주세요.'; }
});
$('#logout').onclick = () => signOut(auth);
// 로그인 화면 우주선: 누르면 둥실
const ufo = $('.login-ufo');
if (ufo) {
  ufo.onclick = () => { ufo.classList.remove('fly'); void ufo.offsetWidth; ufo.classList.add('fly'); };
  ufo.onanimationend = e => { if (e.animationName === 'ufo-fly') ufo.classList.remove('fly'); };
}
auth.languageCode = 'ko'; // 비밀번호 재설정 메일을 한국어로
$('#login-forgot').onclick = async e => {
  e.preventDefault();
  const email = (prompt('가입한 이메일을 넣어주세요. 비밀번호를 바꾸는 메일을 보내드려요.', $('#login-email').value.trim()) || '').trim();
  if (!email) return;
  try { await sendPasswordResetEmail(auth, email); alert(`${email}(으)로 비밀번호 재설정 메일을 보냈어요.\n메일의 링크를 눌러 새 비밀번호를 정해주세요. (안 보이면 스팸함도 확인해주세요)`); }
  catch (err) { alert(err.code === 'auth/invalid-email' ? '이메일 형식이 맞지 않아요.' : '메일을 보내지 못했어요: ' + (err.code || err.message)); }
};
// 화면에 보일 이름 = roles 문서의 name. 없으면 이메일 앞부분
const myName = () => state.myName || me().split('@')[0];
// 기록에 보일 이름: 남길 때 저장한 이름 → (관리자는) 계정 목록의 이름 → 이메일 앞부분
const nameOf = (email, saved) => saved || state.roles.find(r => r.id === String(email || '').toLowerCase())?.name || String(email || '').split('@')[0];
function showMe() { $('#me-email').textContent = state.user ? myName() : ''; $('#me-email').title = state.user?.email || ''; }
// 이름은 관리자만 계정 관리 '이름' 칸에서 정함 (사용자: 일반 계정에는 '이름 바꾸기' 안 보이게)
// 내 비밀번호 바꾸기 (지금 비밀번호 확인 → 새 비밀번호)
$('#btn-pw').onclick = () => {
  const cur = h('input', { type: 'password', placeholder: '지금 비밀번호', autocomplete: 'current-password' });
  const n1 = h('input', { type: 'password', placeholder: '새 비밀번호 (6자 이상)', autocomplete: 'new-password' });
  const n2 = h('input', { type: 'password', placeholder: '새 비밀번호 한 번 더', autocomplete: 'new-password' });
  const err = h('div', { class: 'err' }), go_ = h('button', { class: 'btn primary', type: 'submit' }, '바꾸기');
  const form = h('form', { class: 'pw-form' }, h('h3', {}, '비밀번호 바꾸기'), cur, n1, n2, err, h('div', { class: 'modal-act' }, go_));
  const close = modal(form);
  form.onsubmit = async ev => {
    ev.preventDefault(); err.textContent = '';
    if (n1.value.length < 6) { err.textContent = '새 비밀번호는 6자 이상이에요.'; return; }
    if (n1.value !== n2.value) { err.textContent = '새 비밀번호 두 칸이 달라요.'; return; }
    go_.disabled = true;
    try {
      const u = auth.currentUser || state.user;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur.value));
      await updatePassword(u, n1.value);
      close(); toast('비밀번호를 바꿨어요');
    } catch (e2) { err.textContent = /wrong-password|invalid-credential/.test(e2.code || '') ? '지금 비밀번호가 맞지 않아요.' : '바꾸지 못했어요: ' + (e2.code || e2.message); go_.disabled = false; }
  };
  cur.focus();
};

/* ---------- 실시간 구독 ---------- */
let unsubs = [];
function startListeners() {
  stopListeners();
  // 매장 계정(제품 찾기만)은 최종 POG·도면만 읽을 수 있음 (규칙도 같음). 정렬은 여기서 (색인 없이)
  const pq = isStaff() ? query(collection(db, 'pogs'), orderBy('createdAt', 'desc')) : query(collection(db, 'pogs'), where('status', '==', 'final'));
  if (!isStaff()) unsubs.push(onSnapshot(query(collection(db, 'drawings'), where('status', '==', 'final')), s => {
    state.dwMap = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    renderDwList(); renderFdStores();
  }, e => toast('도면 목록을 읽지 못했어요: ' + e.code)));
  unsubs.push(onSnapshot(pq, s => {
    state.pogs = s.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    renderPogList(); renderOnlineList(); renderFbList(); renderFdStores();
  }, e => toast('POG 목록을 읽지 못했어요: ' + e.code)));
  if (state.level === 'admin') unsubs.push(onSnapshot(collection(db, 'roles'), s => {
    state.roles = s.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAccounts();
  }));
  if (!isStaff()) return; // 매장 계정: 사전·담당자는 필요 없음
  unsubs.push(onSnapshot(collection(db, 'stores'), s => {
    state.stores = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    renderStores(); renderDwList(); renderPogList(); renderOnlineList(); renderFbList();
  }, e => toast('매장 목록을 읽지 못했어요: ' + e.code)));
  unsubs.push(onSnapshot(collection(db, 'drawings'), s => {
    state.dwMap = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    renderStores(); renderDwList(); renderFdStores();
  }, () => { }));
  unsubs.push(onSnapshot(query(collection(db, 'managers'), orderBy('name')), s => {
    state.managers = s.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshManagerSelect(); renderMgrAdmin();
  }));
  unsubs.push(onSnapshot(collection(db, 'glossary'), s => {
    state.glossary = s.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshGlossaryLists(); renderGlossary();
  }));
}
function stopListeners() { unsubs.forEach(u => u()); unsubs = []; closePog(); closeViewer(); closeFb(); closeDw(); }

/* ---------- 메뉴 이동 ---------- */
const secOf = v => v.startsWith('dw-') ? 'dw' : v; // 도면 업로드·온라인 도면은 같은 화면(#v-dw)
function go(v) {
  if (v === 'drawing') v = 'dw-online'; // 도면은 한 화면 (사용자: 온라인 도면·도면 업로드 합치기). 업로드는 그 안의 '📤 도면 업로드'
  if (!$('#v-' + secOf(v))) v = 'home';
  if (!canSee(v)) v = canSee('home') ? 'home' : canSee('finder') ? 'finder' : 'noaccess';
  state.view = v;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v || (!!b.dataset.group && v.startsWith(b.dataset.group))));
  { const on = [...$$('#nav button.on')].pop(), nav = $('#nav'); if (on && nav && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - nav.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2); } // 메뉴가 화면보다 길면 지금 메뉴가 보이게
  // 1. 도면 / 2. POG를 누르면 (그 아래 화면 포함) 메뉴에 그 메뉴와 하위 메뉴만 보임 (예: 1. 도면 | 도면 업로드 | 온라인 도면). 홈은 왼쪽 'ARTBOX 국내 POG'로 (사용자)
  const gPog = v.startsWith('pog-');
  $('#subnav').classList.toggle('on', gPog);
  $('#nav').classList.toggle('grp-pog', gPog && !$('#subnav').classList.contains('hidden'));
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + secOf(v)));
  if (v.startsWith('dw-')) setDwMode({ 'dw-up': 'up', 'dw-online': 'on' }[v]);
  window.scrollTo(0, 0);
  if (v === 'finder') { fdStep(1); renderFdStores(); } // 제품 찾기는 늘 매장 고르기부터
  if (v === 'barcodes') { bcCount(); bcList(true); } else bcReport([], '', 0); // 건너뛴 줄 알림은 이 화면을 나가면 사라짐
}
$$('#nav button').forEach(b => b.onclick = () => go(b.dataset.view));
// 메뉴가 화면보다 길 때: 마우스 휠(위아래)로 옆으로 밀기 (스크롤바는 숨김)
$('#nav').addEventListener('wheel', e => { const n = e.currentTarget; if (n.scrollWidth <= n.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; e.preventDefault(); n.scrollLeft += e.deltaY; }, { passive: false });
// 휴대폰: A4 페이지(794px)를 화면 폭에 맞게 줄이는 비율 (style.css의 zoom: var(--pz))
// 상단 메뉴 실제 높이 → CSS --top (휴대폰에서는 메뉴가 두 줄이라 52px보다 큼). 화면 높이 계산에 씀
{ const tb = document.querySelector('.topbar'); const setTop = () => { const hgt = tb && tb.offsetHeight; if (hgt) document.documentElement.style.setProperty('--top', hgt + 'px'); };
  if (tb && window.ResizeObserver) new ResizeObserver(setTop).observe(tb); window.addEventListener('resize', setTop); setTop(); }
/* 화면 높이 --vh를 실제 보이는 높이로 직접 잼 (사용자: 아이패드 가로에서 화면 전체가 위아래로 스크롤됨)
   PC 80% 크기(html zoom)일 때 100vh를 zoom으로 나누는 계산이 사파리에서는 맞지 않아 화면보다 길어졌음.
   화면에 딱 붙인 투명 칸(position: fixed; top·bottom 0)의 높이 = 지금 zoom 기준 화면 높이 → 브라우저와 상관없이 맞음 */
{ const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none;';
  document.body.append(probe);
  const setVh = () => { const hgt = probe.offsetHeight; if (hgt > 100) document.documentElement.style.setProperty('--vh', hgt + 'px'); };
  setVh(); window.addEventListener('resize', setVh); window.addEventListener('orientationchange', () => setTimeout(setVh, 300));
  window.visualViewport?.addEventListener('resize', setVh); }
/* 좁은 화면(아이패드 세로·휴대폰, 900px 이하): 오른쪽 편집 패널을 화면 아래 서랍으로 (사용자: 세로로 보면 나누기·합치기가 없음)
   서랍 위 손잡이 '🛠 편집 도구 ▼/▲'로 접고 펴기 (body.drawer-closed, 브라우저에 기억). 보이는 패널이 있을 때만 body.has-drawer */
{ const tg = document.createElement('button'); tg.type = 'button'; tg.id = 'drawer-tg'; document.body.append(tg);
  let closed = true; try { closed = localStorage.getItem('drawerClosed') !== '0'; } catch { } // 처음엔 닫힘 (작은 버튼만)
  const paint = () => { document.body.classList.toggle('drawer-closed', closed); tg.textContent = closed ? '🛠 편집 도구' : '✕ 닫기'; };
  tg.onclick = () => { closed = !closed; try { localStorage.setItem('drawerClosed', closed ? '1' : '0'); } catch { } paint(); };
  const check = () => { const on = window.innerWidth <= 900 && [...document.querySelectorAll('.side-edit')].some(el => el.parentElement?.offsetParent && el.childElementCount && !el.classList.contains('hidden')); document.body.classList.toggle('has-drawer', on); };
  paint(); const mo = new MutationObserver(() => requestAnimationFrame(check));
  document.querySelectorAll('.side-edit').forEach(el => mo.observe(el, { childList: true, attributes: true, attributeFilter: ['class'] }));
  document.querySelectorAll('section.view, main > section, [id^="v-"]').forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] }));
  window.addEventListener('resize', check); setInterval(check, 1500); check(); }
const setPz = () => document.documentElement.style.setProperty('--pz', String(Math.min(1, (window.innerWidth - 16) / 794)));
setPz(); window.addEventListener('resize', setPz);
$$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
$('#btn-accounts').onclick = () => go('accounts');

/* ---------- 저장 (디바운스) ---------- */
const timers = {}; let pending = 0;
function setSaving() {
  for (const el of [$('#ed-saving'), $('#dw-saving')]) if (el) el.textContent = pending > 0 ? '저장 중…' : '저장됨';
}
const queued = {}; // 기다리는 저장 (되돌리기 전에 먼저 저장해 둠)
function queueWrite(key, fn) {
  if (!timers[key]) { pending++; setSaving(); }
  clearTimeout(timers[key]);
  queued[key] = fn;
  timers[key] = setTimeout(() => runQueued(key), 500);
}
async function runQueued(key) {
  const fn = queued[key]; clearTimeout(timers[key]); delete timers[key]; delete queued[key];
  if (!fn) return;
  try { await fn(); } catch (e) { toast('저장 실패: ' + e.message); }
  pending--; setSaving();
}
const flushWrites = () => Promise.all(Object.keys(queued).map(runQueued));
const pendingKey = key => !!timers[key];
// gk = 되돌리기 묶음 이름 (여러 칸을 한 번에 바꿀 때 같은 이름이면 한 번에 되돌림)
const saveFx = (pogId, fxId, f, v, gk) => { track(pogId, fxId, [f], gk || `${fxId}|${f}`); queueWrite(`${fxId}|${f}`, () =>
  updateDoc(doc(db, 'pogs', pogId, 'fixtures', fxId), { [f]: v, updatedAt: serverTimestamp(), updatedBy: state.user.email })); };
const savePog = (pogId, f, v) => { track(pogId, '__pog', [f], `__pog|${f}`); queueWrite(`${pogId}|${f}`, () =>
  updateDoc(doc(db, 'pogs', pogId), { [f]: v, updatedAt: serverTimestamp() })); };

/* ---------- 수정 기록 (사용자): 누가 무엇을 무엇으로 고쳤는지 ----------
   pogs/{id}/logs = { fx: 페이지 id('__cover' = 표지·고정 문구), area: make|trans, lang?, field, act?, from, to, by, at }
   drawings/{id}/logs = { vId, gid?, x?, y?(SVG 단위, 도면 확대 구역 거르기용), area: up|dwtr, lang?, field, act?, from, to, by, at }
   같은 칸을 계속 고치면 4초 동안 모아서 한 줄 (처음 값 → 마지막 값). 같으면 안 남김 */
const LOG_F = {
  headerName: '매대명', fixtureType: '매대 타입', hookType: '고리타입', hookCount: '고리 갯수', sp: '선반/파이프', shelfPipe: '선반/파이프',
  extras: '이외집기', otherFixtures: '기타 메모', manager: '담당자', notes: '메모 상자', itemZ: '제품 앞뒤', order: '페이지 순서', merged: '매대 붙이기',
  mergedInto: '붙인 곳', drawingRef: '도면 매대 연결', items: '제품', props: '집기', coverTitle: '표지 제목', hooks: '쓸 고리', cat: '카테고리',
  memo: '메모', crop: '저장 구역', tr: '번역', groups: '매대명 묶음', outsideItems: '매대 밖 제품', area: '평수',
  blocks: '매대 나누기 묶음', base: '원래 매대 위치·크기', info: '집기 정보 칸', mdName: 'POG 사이트 매대', teamName: '카테고리(팀명)',
};
// 기록에 안 남기는 칸 (화면에 이름이 없는 내부 값 · 사용자: 기록이 너무 복잡하다고 함)
const LOG_HIDE = new Set(['order', 'frame', 'panels', 'board', 'src', 'mdidx', 'bayNo', 'bayCount', 'itemCount', 'shelfCount', 'pipeCount', 'shelfPipe', 'fixtureCount', 'regrabbedAt', 'updatedAt', 'updatedBy', 'outsideItems', 'kind']);
const logLabel = (f = '') => LOG_F[f] || LABELS_KO[f] || (f.startsWith('x_') ? '이외집기 줄' : f.startsWith('n_') ? '글상자' : f);
function logShort(f, v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return '';
  if (Array.isArray(v) && !v.length) return '';
  if (typeof v === 'boolean') return v ? '넣음' : '뺌';
  if (f === 'items') return `제품 ${v.length}개`;
  if (f === 'props') return `선반·파이프 ${v.length}개`;
  if (f === 'blocks') return `묶음 ${v.length}개` + v.map((b, i) => { const kx = b.sx ?? b.s ?? 1, ky = b.sy ?? b.s ?? 1, t = [(b.dx || b.dy) ? '옮김' : '', kx !== 1 || ky !== 1 ? `크기 ${Math.round(kx * 100)}%` : ''].filter(Boolean).join('·'); return t ? ` · ${i + 1}: ${t}` : ''; }).join('');
  if (f === 'itemZ') return `제품 ${Object.keys(v).length}개 순서 바꿈`;
  if (f === 'base') { const kx = v.sx ?? v.s ?? 1, ky = v.sy ?? v.s ?? 1; return [(v.dx || v.dy) ? '옮김' : '', kx !== 1 || ky !== 1 ? `크기 ${Math.round(kx * 100)}%` + (ky !== kx ? ` × ${Math.round(ky * 100)}%` : '') : ''].filter(Boolean).join(' · ') || '처음 상태'; }
  if (f === 'merged') return v.map(id => { const x = state.fixtures?.get(id); return x ? displayName(x) : '매대'; }).join(', ');
  if (f === 'mergedInto') { const x = state.fixtures?.get(v); return x ? displayName(x) : '다른 페이지'; }
  if (f === 'order') return `${Math.round(v * 10) / 10}번째`;
  if (f === 'teamName') return catName(v);
  if (f === 'notes' && Array.isArray(v)) return `${v.length}개 (글: ${v.filter(n => n.t === 'text').map(n => n.text).filter(Boolean).join(' / ').slice(0, 60)})`;
  if ((f === 'sp' || f === 'extras') && Array.isArray(v)) return v.map(x => `${x.name || ''}${x.qty ? ' × ' + x.qty : ''}`).join(', ');
  if (Array.isArray(v)) return `${v.length}개`;
  if (f === 'drawingRef') return v.ko || '';
  if (f === 'tr' && typeof v === 'object') return [v.text, (v.dx || v.dy) ? '위치 옮김' : '', v.sc && v.sc !== 1 ? `크기 ${Math.round(v.sc * 100)}%` : ''].filter(Boolean).join(' · ');
  if (f === 'crop' && typeof v === 'object') return '구역 정함';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
}
const logBuf = new Map();
function logEdit(path, key, info, before, afterFn) {
  let b = logBuf.get(key);
  if (!b) { b = { path, info, before: structuredClone(before ?? null) }; logBuf.set(key, b); }
  b.afterFn = afterFn; clearTimeout(b.t);
  b.t = setTimeout(() => flushLog(key), 4000);
}
function flushLog(key) {
  const b = logBuf.get(key); if (!b) return; logBuf.delete(key); clearTimeout(b.t);
  const f = b.info.field, after = b.afterFn(), from = logShort(f, b.before), to = logShort(f, after);
  if (from === to) return;
  const det = logDetail(f, b.before, after);
  addLog(b.path, { ...b.info, from, to, ...(det ? { d: det } : {}) });
}
// 줄을 눌렀을 때 보여줄 자세한 내용 (사용자: 구글 문서 수정 기록처럼). 추가·빠짐 목록, 긴 글은 전체
function logDetail(f, a, b) {
  const cut = (arr, n = 40) => arr.slice(0, n);
  const lab = o => o?.name ? `${o.name}${o.code ? ` [${o.code}]` : ''}` : o?.kind || o?.text || '';
  if (['items', 'props', 'notes', 'sp', 'extras'].includes(f) && (Array.isArray(a) || Array.isArray(b))) {
    const A = Array.isArray(a) ? a : [], B = Array.isArray(b) ? b : [];
    const key = o => f === 'items' ? `${o.code}|${o.id}` : String(o.id ?? JSON.stringify(o));
    const ka = new Map(A.map(o => [key(o), o])), kb = new Map(B.map(o => [key(o), o]));
    const add = B.filter(o => !ka.has(key(o))), del = A.filter(o => !kb.has(key(o)));
    const chg = B.filter(o => ka.has(key(o)) && JSON.stringify(ka.get(key(o))) !== JSON.stringify(o));
    const show = o => f === 'notes' ? ({ box: '네모', text: `글상자 '${o.text || ''}'`, arrow: '화살표', img: '사진' }[o.t] || '메모') : f === 'sp' || f === 'extras' ? `${o.name || ''}${o.qty ? ' × ' + o.qty : ''}` : lab(o);
    // gone = 지워진 것 자체 (사용자: 기록을 누르면 사라진 것의 잔상을 보여주기)
    const gone = f === 'items' ? del.slice(0, 120).map(o => ({ code: o.code, name: o.name, img: o.img || '', x: o.x, y: o.y, w: o.w, h: o.h }))
      : f === 'props' ? del.slice(0, 60).map(o => ({ kind: o.kind || '', x: o.x, y: o.y, w: o.w, h: o.h || 4 }))
      : f === 'notes' ? del.slice(0, 30).map(o => ({ ...o, path: undefined })) : undefined;
    return { add: cut(add.map(show)), del: cut(del.map(show)), chg: chg.length, codes: f === 'items' ? cut(add.map(o => o.code), 80) : undefined, ...(gone?.length ? { gone } : {}) };
  }
  const s = v => v == null ? '' : typeof v === 'object' ? '' : String(v);
  if ((s(a).length > 110 || s(b).length > 110)) return { full: [s(a).slice(0, 2000), s(b).slice(0, 2000)] };
  return null;
}
// 지운 페이지의 잔상 (제품 사진·위치, 선반, 메모 글)
const ghostPage = f => ({ name: displayName(f), kind: f.kind || '', team: catName(f.teamName || ''), mdName: f.mdName || '',
  items: (f.items || []).slice(0, 250).map(o => ({ code: o.code, name: o.name, img: o.img || '', x: o.x, y: o.y, w: o.w, h: o.h })),
  props: (f.props || []).slice(0, 80).map(o => ({ kind: o.kind || '', x: o.x, y: o.y, w: o.w, h: o.h || 4, color: o.color || '' })),
  notes: (f.notes || []).filter(n => n.t === 'text' && n.text).slice(0, 20).map(n => n.text) });
// 잔상 그림: 지워진 제품·선반을 흐리게 + 빨간 점선 (기록 창 안)
function ghostView(items, props, label) {
  const fx = { id: 'ghost', items: items || [], props: props || [], panels: [] };
  const wrap = h('div', { class: 'ld-ghost' }, buildCanvas(fx, 300, 200, null, { lazy: true }), h('span', { class: 'ld-ghost-tag' }, label));
  return wrap;
}
function addLog(path, entry) {
  if (!state.user) return;
  if (entry.d) entry = { ...entry, d: JSON.parse(JSON.stringify(entry.d)) }; // 안쪽 undefined 빼기 (Firestore가 못 받음)
  addDoc(collection(db, ...path, 'logs'), { ...Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined)), by: me(), byName: myName(), at: serverTimestamp() }).catch(e => console.warn('수정 기록을 남기지 못했어요', e.code || e));
}
window.addEventListener('beforeunload', () => [...logBuf.keys()].forEach(flushLog));
const flushLogs = () => [...logBuf.keys()].forEach(flushLog);
// 기록 창: rows = 문서 데이터 배열 (최신 먼저)
const logVal = s => s === '{}' || s === '[]' ? '' : s; // 예전 기록의 빈 값
// 줄을 누르면 그 아래에 자세한 내용 (사용자: 구글 문서 수정 기록처럼). opt.where(r) = 어느 페이지인지 글, opt.go(r) = 그 자리로 가서 표시
function logDetailBox(r, opt) {
  const d = r.d || {}, kids = [];
  const list = (t, arr, cls) => arr?.length ? h('div', { class: 'ld-sec ' + cls }, h('b', {}, t), h('ul', {}, ...arr.map(x => h('li', {}, x)))) : null;
  if (opt.where) { const w = opt.where(r); if (w) kids.push(h('div', { class: 'ld-where' }, '📄 ', w)); }
  kids.push(h('div', { class: 'ld-what' }, (r.lang ? `[${r.lang}] ` : '') + (r.act || logLabel(r.field)) + (r.what ? ` · ${r.what}` : '')));
  if (d.full) kids.push(h('div', { class: 'ld-full' }, h('div', {}, h('span', { class: 'mut' }, '전: '), h('s', {}, d.full[0] || '(없음)')), h('div', {}, h('span', { class: 'mut' }, '후: '), h('b', {}, d.full[1] || '(없음)'))));
  else if (!(r.act && !r.from && !r.to)) kids.push(h('div', { class: 'ld-full' }, h('s', { class: 'mut' }, logVal(r.from) || '(없음)'), ' → ', h('b', {}, logVal(r.to) || '(없음)')));
  kids.push(list('추가', d.add, 'add'), list('빠짐', d.del, 'del'));
  // 잔상 (사용자): 지워진 제품·선반·메모·페이지를 흐리게 보여줌
  if (d.page) kids.push(h('div', { class: 'ld-sec del' }, h('b', {}, `지워진 페이지 '${d.page.name}'`), d.page.mdName ? h('div', { class: 'mut' }, `POG 원본: ${d.page.mdName}${d.page.team ? ' · ' + d.page.team : ''} · 제품 ${d.page.items.length}개`) : null,
    d.page.items.length || d.page.props.length ? ghostView(d.page.items, d.page.props, '삭제됨') : null,
    d.page.notes?.length ? h('div', { class: 'mut' }, '글상자: ' + d.page.notes.join(' / ')) : null,
    h('div', { class: 'mut' }, '되살리려면 POG 만들기에서 Ctrl+Z (그 자리에서 바로) 또는 \'↻ 다시 가져오기 → 추가하기\'')));
  if (d.gone?.length && (r.field === 'items' || r.field === 'props')) kids.push(ghostView(r.field === 'items' ? d.gone : [], r.field === 'props' ? d.gone : [], `지워진 ${r.field === 'items' ? '제품' : '선반·파이프'} ${d.gone.length}개`));
  if (d.gone?.length && r.field === 'notes') kids.push(h('div', { class: 'ld-ghost-notes' }, ...d.gone.map(n => h('span', { class: 'ld-gn' }, n.t === 'text' ? `글상자 '${n.text || ''}'` : n.t === 'img' ? '사진' : n.t === 'arrow' ? '화살표' : '네모'))));
  if (d.chg) kids.push(h('div', { class: 'mut' }, `위치·내용이 바뀐 것 ${d.chg}개`));
  if (!d.add && !d.full && ['items', 'props', 'notes'].includes(r.field)) kids.push(h('p', { class: 'mut' }, '예전 기록이라 무엇이 바뀌었는지 자세한 목록은 없어요.'));
  if (opt.go && opt.go(r, true)) kids.push(h('div', { class: 'se-btns' }, h('button', { class: 'btn small primary', onclick: () => opt.go(r) }, '이 자리로 가서 보기')));
  return h('div', { class: 'ld-box' }, ...kids.filter(Boolean));
}
function logModal(title, sub, rows, extra, opt = {}) {
  rows = rows.filter(r => !LOG_HIDE.has(r.field) || r.act); // 예전 기록 중 내부 값(틀 등)은 안 보임
  rows.sort((x, y) => (y.at?.toMillis?.() || 0) - (x.at?.toMillis?.() || 0));
  modal(h('div', { class: 'log-pop' }, h('h3', {}, title), sub ? h('p', { class: 'mut' }, sub) : null, extra || null,
    rows.length ? h('table', { class: 'gl-table log-table' }, h('thead', {}, h('tr', {}, h('th', {}, '언제'), h('th', {}, '누가'), h('th', {}, '무엇을'), h('th', {}, '바뀐 내용'))),
      h('tbody', {}, ...rows.map(r => h('tr', { class: 'log-row', title: '눌러서 자세히 보기', onclick: ev => {
        const tr0 = ev.currentTarget, nx = tr0.nextElementSibling;
        if (nx?.classList.contains('log-det')) { nx.remove(); tr0.classList.remove('on'); return; }
        tr0.closest('tbody').querySelectorAll('.log-det').forEach(x => { x.previousElementSibling?.classList.remove('on'); x.remove(); });
        tr0.classList.add('on'); tr0.after(h('tr', { class: 'log-det' }, h('td', { colspan: 4 }, logDetailBox(r, opt))));
      } },
        h('td', { class: 'nowrap' }, fmtTime(r.at)), h('td', {}, nameOf(r.by, r.byName)),
        h('td', {}, opt.page && opt.where ? h('div', { class: 'mut small' }, opt.where(r)) : null, (r.lang ? `[${r.lang}] ` : '') + (r.act || logLabel(r.field)) + (r.what ? ` · ${r.what}` : '')),
        h('td', {}, r.act && !r.from && !r.to ? '' : h('span', {}, h('s', { class: 'mut' }, logVal(r.from) || '(없음)'), ' → ', h('b', {}, logVal(r.to) || '(없음)')))))))
      : h('p', { class: 'mut pad' }, '아직 기록이 없어요.')), { wide: true });
}

/* ---------- 되돌리기 (POG 만들기: Ctrl+Z 되돌리기, Ctrl+Y 다시 하기, 툴바 ↶ ↷) ----------
   바꾸기 직전 값(state.fxRaw = 서버에서 받은 그대로)을 한 단계씩 기억. 같은 칸을 1.5초 안에 계속 고치면 한 단계.
   what = 바꾼 칸 이름들 | '*'(페이지 삭제: 문서 통째로) | 'new'(새로 만든 페이지). 되돌릴 때는 그 칸만 예전 값으로 씀 */
const undo = { steps: [], redo: [], pogId: null };
let undoBusy = false;
function track(pogId, docKey, what, gk) {
  if (undoBusy || !state.edEditable || state.currentPog?.id !== pogId) return;
  if (undo.pogId !== pogId) { undo.steps = []; undo.redo = []; undo.pogId = pogId; }
  const now = Date.now();
  let st = undo.steps.at(-1);
  if (!st || !gk || st.key !== gk || now - st.t > 1500) {
    st = { key: gk || now + Math.random(), t: now, ops: new Map() };
    undo.steps.push(st); if (undo.steps.length > 100) undo.steps.shift();
  }
  st.t = now; undo.redo = [];
  const raw = docKey === '__pog' ? state.pogRaw : state.fxRaw.get(docKey);
  logTrack(pogId, docKey, what, raw);
  let op = st.ops.get(docKey);
  if (!op) { op = what === 'new' ? { whole: true, before: null } : what === '*' ? { whole: true, before: raw || null } : { whole: false, before: {}, fields: new Set() }; st.ops.set(docKey, op); }
  if (!op.whole) for (const f of what) if (!op.fields.has(f)) { op.fields.add(f); op.before[f] = raw && f in raw ? structuredClone(raw[f]) : undefined; }
  updateUndoBtns();
}
const undoGroup = () => 'g' + Date.now() + Math.random();
function logTrack(pogId, docKey, what, raw) {
  const fx = docKey === '__pog' ? '__cover' : docKey;
  if (what === 'new') return addLog(['pogs', pogId], { fx, area: 'make', act: String(docKey).startsWith('free_') ? '빈 페이지 추가' : '매대 페이지 추가' });
  // 지운 페이지는 그 페이지 기록을 볼 수 없으니 표지 기록에 남김 (어느 페이지를 지웠는지 · 사용자)
  if (what === '*') return addLog(['pogs', pogId], { fx: '__cover', area: 'make', act: '페이지 삭제', what: raw ? displayName(raw) : '', ...(raw ? { d: { page: ghostPage(raw) } } : {}) });
  const cur = () => docKey === '__pog' ? state.pogRaw : state.fxRaw.get(docKey);
  for (const f of what) if (!LOG_HIDE.has(f)) // 내부 값(틀·페이지 수 등)은 기록 안 함 ('73'·{"x0":…}처럼 보여 헷갈림 · 사용자)
    logEdit(['pogs', pogId], `p|${pogId}|${docKey}|${f}`, { fx, area: 'make', field: f }, raw?.[f], () => cur()?.[f]);
}
async function applyStep(st) { // 이 단계 전 상태로 되돌리고, 반대로 갈 단계(지금 상태)를 돌려줌
  const pogId = undo.pogId, rev = { key: undoGroup(), t: 0, ops: new Map() }, b = writeBatch(db);
  for (const [k, op] of st.ops) {
    const ref = k === '__pog' ? doc(db, 'pogs', pogId) : doc(db, 'pogs', pogId, 'fixtures', k);
    const cur = k === '__pog' ? state.pogRaw : state.fxRaw.get(k);
    if (op.whole) {
      rev.ops.set(k, { whole: true, before: cur || null });
      if (op.before) b.set(ref, op.before); else if (cur) b.delete(ref);
    } else {
      const patch = {}, rb = {};
      for (const f of op.fields) { rb[f] = cur && f in cur ? structuredClone(cur[f]) : undefined; patch[f] = op.before[f] === undefined ? deleteField() : op.before[f]; }
      rev.ops.set(k, { whole: false, before: rb, fields: new Set(op.fields) });
      if (cur) b.update(ref, patch);
    }
  }
  await b.commit();
  return rev;
}
async function doUndo(redo = false) {
  if (undoBusy || !state.edEditable || undo.pogId !== state.currentPog?.id) return;
  const from = redo ? undo.redo : undo.steps, to = redo ? undo.steps : undo.redo;
  undoBusy = true;
  try {
    await flushWrites(); // 아직 안 보낸 저장을 먼저 보내고
    const st = from.pop();
    if (!st) { toast(redo ? '다시 할 것이 없어요' : '되돌릴 것이 없어요'); return; }
    to.push(await applyStep(st));
    toast(redo ? '다시 했어요 (Ctrl+Y)' : '되돌렸어요 (Ctrl+Z)');
  } catch (e) { alert('되돌리지 못했어요: ' + (e.code || e.message)); }
  finally { undoBusy = false; updateUndoBtns(); }
}
function updateUndoBtns() {
  const ok = undo.pogId === state.currentPog?.id && state.edEditable;
  const u = $('#ed-undo'), r = $('#ed-redo'); if (!u) return;
  u.disabled = !ok || !undo.steps.length; r.disabled = !ok || !undo.redo.length;
}
$('#ed-undo').onclick = () => doUndo(false);
$('#ed-redo').onclick = () => doUndo(true);
const clearUndo = () => { undo.steps = []; undo.redo = []; undo.pogId = state.currentPog?.id || null; updateUndoBtns(); };
document.addEventListener('keydown', e => {
  if (state.view !== 'pog-make' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'y') return;
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return; // 글 쓰는 중이면 그 칸의 되돌리기
  if ($('#modal-root')?.children.length) return;
  e.preventDefault();
  doUndo(k === 'y' || e.shiftKey);
});

/* ---------- 매대 그리기 ---------- */
// 겹친 제품의 앞뒤: POG 사이트 값(it.z), POG 만들기에서 '맨 앞으로/맨 뒤로' 한 값(fx.itemZ)이 우선
const itemZ = (fx, it) => 1000 + (fx.itemZ?.[it.id] ?? it.z ?? 0);
function applyItemZ(block, fx) {
  const byId = new Map((fx.items || []).map(it => [String(it.id), it]));
  block.querySelectorAll('.page .cv-item').forEach(el => { const it = byId.get(el.dataset.id); if (it) el.style.zIndex = itemZ(fx, it); });
}
/* 제품 사진 (img.artbox.kr): 가끔 늦거나 실패함 → 자동으로 다시 불러오기 (조금 기다렸다가 2번, 그다음 referrer를 바꿔서 1번).
   그래도 안 되면 깨진 아이콘 대신 제품명 글자 (PDF에도 글자로 나옴) */
function prodImg(src, name = '', { lazy = false, fallback = true } = {}) {
  const img = h('img', { src, alt: '', referrerpolicy: 'no-referrer', loading: lazy ? 'lazy' : null });
  img.dataset.src0 = src; img.dataset.name = name; img.dataset.fb = fallback ? '1' : '';
  img.addEventListener('error', () => imgRetry(img));
  return img;
}
function imgRetry(img) {
  const n = +(img.dataset.try || 0), src = img.dataset.src0;
  img.dataset.try = n + 1;
  if (n < 2) { setTimeout(() => { img.src = src + (src.includes('?') ? '&' : '?') + 'r=' + Date.now(); }, 700 * (n + 1)); return; }
  if (n === 2) { img.referrerPolicy = 'strict-origin-when-cross-origin'; img.src = src; return; }
  img.dataset.failed = '1';
  if (img.dataset.fb) {
    // 글자 칸에 사진 주소를 남겨서 나중에 다시 불러올 수 있게 (사용자: 한번 깨진 사진도 복구)
    const sp = h('span', { class: 'cv-noimg', title: '사진을 불러오지 못했어요 · 잠시 뒤 다시 불러와요' }, img.dataset.name || '');
    sp.dataset.src0 = img.dataset.src0; sp.dataset.name = img.dataset.name || ''; sp.dataset.round = String(+(img.dataset.round || 0) + 1);
    img.replaceWith(sp);
  } else img.style.visibility = 'hidden';
  img.dispatchEvent(new Event('gaveup'));
}
// 깨진 사진(제품명 글자 칸)을 다시 불러오기: 20초마다(칸마다 최대 6번), 창으로 돌아오거나 인터넷이 다시 연결될 때, PDF 저장 전
function retryBroken(root = document, force = false) {
  const spans = $$('.cv-noimg', root).filter(s => s.dataset.src0 && s.isConnected && (force || +(s.dataset.round || 0) < 6));
  spans.forEach(s => {
    const img = prodImg(s.dataset.src0 + (s.dataset.src0.includes('?') ? '&' : '?') + 'k=' + Date.now(), s.dataset.name || '');
    img.dataset.src0 = s.dataset.src0; img.dataset.round = s.dataset.round || '1';
    s.replaceWith(img);
  });
  return spans.length;
}
setInterval(() => { if (document.visibilityState === 'visible') retryBroken(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') retryBroken(); });
window.addEventListener('online', () => retryBroken(document, true));
function buildCanvas(fx, W, H, onItem, { lazy = false, blockUI = false } = {}) {
  fx = withBlocks(jjNorm(fx));
  const items = fx.items || [], hasBlocks = !!fx._blocks;
  const wrap = h('div', { class: 'cv' + (hasBlocks ? ' has-blk' : ''), style: `width:${W}px;height:${H}px` });
  // 가로 범위 = 매대(선반·파이프·넓은 판) 폭 + 제품이 삐져나온 만큼만. 여러 칸에 걸친 긴 집기는 이 범위에서 자른다
  const core = objs => { const ws = objs.map(o => o.w).sort((a, b) => a - b), med = ws[Math.floor(ws.length / 2)]; return objs.filter(o => o.w <= med * 1.6); };
  const frameAll = [...(fx.props || []), ...(fx.panels || []).filter(p => p.w >= 40)];
  let wx0 = -Infinity, wx1 = Infinity;
  if (frameAll.length && !hasBlocks) { // 묶음이 있으면 자르지 않음 (옮긴 묶음이 잘리지 않게)
    const c = core(frameAll);
    wx0 = Math.min(...c.map(o => o.x), ...items.map(i => i.x));
    wx1 = Math.max(...c.map(o => o.x + o.w), ...items.map(i => i.x + i.w));
  }
  const clip = o => { const a = Math.max(o.x, wx0), b = Math.min(o.x + o.w, wx1); return b > a ? { ...o, x: a, w: b - a } : null; };
  const props = (fx.props || []).map(clip).filter(Boolean), panels = (fx.panels || []).map(clip).filter(Boolean);
  const objs = [...panels, ...props, ...items];
  if (!objs.length) { wrap.append(h('div', { class: 'cv-empty' }, '매대 데이터 없음')); return wrap; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  if (hasBlocks && fx.frame) ({ x0, y0, x1, y1 } = fx.frame); // 묶음이 있으면 기억해 둔 틀로 (튀어나온 묶음 때문에 작아지지 않게)
  else for (const o of objs) {
    x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y);
    x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + Math.max(o.h || 0, 4));
  }
  const pad = 8, bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
  const sc = Math.min(W / bw, H / bh);
  const inner = h('div', { class: 'cv-in', style: `width:${bw}px;height:${bh}px;left:${(W - bw * sc) / 2}px;transform:scale(${sc})` });
  inner._sc = sc; inner._x0 = x0; inner._y0 = y0; inner._pad = pad;
  // 매대 나누기로 만든 묶음이 있으면: 묶음마다·나머지마다 그 제품·집기를 감싸는 곳만 회색 바탕 (사용자). 묶음은 따로 한 층(.cv-bgrp)이라 끌어서 옮길 수 있음
  const grpOf = new Map(); // 묶음 id → 층
  const layer = o => o._b ? grpOf.get(o._b) : inner;
  if (hasBlocks) {
    const sets = [{ id: null }, ...fx._blocks];
    for (const b of sets) {
      const mem = [...panels, ...props, ...items].filter(o => (o._b || null) === b.id);
      if (b.id) { const gEl = h('div', { class: 'cv-bgrp', 'data-b': b.id }); grpOf.set(b.id, gEl); inner.append(gEl); }
      if (!mem.length) continue;
      const bx0 = Math.min(...mem.map(o => o.x)), by0 = Math.min(...mem.map(o => o.y)), bx1 = Math.max(...mem.map(o => o.x + o.w)), by1 = Math.max(...mem.map(o => o.y + Math.max(o.h || 0, 4)));
      const back = h('div', { class: 'cv-back', style: `left:${bx0 - x0 + pad - 4}px;top:${by0 - y0 + pad - 4}px;width:${bx1 - bx0 + 8}px;height:${by1 - by0 + 8}px` });
      (b.id ? grpOf.get(b.id) : inner).append(back);
      if (b.id && blockUI) grpOf.get(b.id).append(h('div', { class: 'cv-blk no-print', 'data-b': b.id, style: `left:${bx0 - x0 + pad - 4}px;top:${by0 - y0 + pad - 4}px;width:${bx1 - bx0 + 8}px;height:${by1 - by0 + 8}px` },
        h('span', { class: 'cv-blk-h', 'data-b': b.id, title: b.base ? '끌어서 원래 매대 옮기기 · 누르면 선택' : '끌어서 옮기기 · 누르면 선택 (Ctrl+X로 잘라내기)' }, b.base ? '✥ 매대' : `✥ 묶음 ${fx._blocks.filter(x => !x.base).indexOf(b) + 1}`),
        h('span', { class: 'cv-blk-r', 'data-b': b.id, title: '끌어서 크기 조절' })));
    }
  }
  // 매대 뒤 회색 바탕: 선반·파이프·배경판의 가로 범위 × 전체 높이 (붙인 매대는 매대마다 따로). 줄줄 매대는 판을 깔지 않음 (줄만 그림)
  const groups = new Map();
  if (!hasBlocks) for (const o of [...props.filter(p => !p.jj), ...panels.filter(p => p.w >= 40)]) { const g = o._g || 0; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); }
  for (const [g, frame] of groups) {
    const c = core(frame), fx0 = Math.min(...c.map(o => o.x)), fx1 = Math.max(...c.map(o => o.x + o.w));
    const back = h('div', { class: 'cv-back', style: `left:${fx0 - x0 + pad}px;top:${pad}px;width:${fx1 - fx0}px;height:${y1 - y0}px` });
    const part = (fx._parts || [fx])[g] || fx;
    if (!panels.some(p => p.bg && (p._g || 0) === g)) holesOn(back, perfOf(part, fx1 - fx0), fx0 - x0 + pad, pad); // 타공판: 매대 뒤에 구멍
    inner.append(back);
  }
  for (const p of panels) {
    // 배경판은 POG 사이트 색과 상관없이 연한 회색 (진하게 칠하면 선반·파이프와 구분이 안 됨 · 사용자). 무늬(타공판)가 있으면 그 간격대로 구멍
    const pe = h('div', { class: 'cv-panel', style: `left:${p.x - x0 + pad}px;top:${p.y - y0 + pad}px;width:${p.w}px;height:${p.h}px` });
    if (p.bg) holesOn(pe, bgPitch(p.bg), 0, 0, p.bg);
    layer(p).append(pe);
  }
  for (const p of props) {
    const color = p.color && !/rgba\(0, 0, 0, 0\)|transparent/.test(p.color) ? p.color : '#7d7d7d';
    const jr = Math.max(1, p.w * 0.12); // 줄줄 매대 줄: 가운데 구멍
    layer(p).append(h('div', { class: 'cv-prop' + (p.jj ? ' cv-strip' : ''), 'data-pid': p.id, title: p.kind || '',
      style: `left:${p.x - x0 + pad}px;top:${p.y - y0 + pad}px;width:${p.w}px;height:${Math.max(p.h || 0, 4)}px;background:${color}` + (p.jj ? `;background-image:radial-gradient(circle, #6f6f6f ${jr}px, transparent ${jr + 0.5}px);background-size:${p.w}px ${p.w * 1.5}px;background-position:center` : '') }));
  }
  for (const it of items) {
    const el = h('div', { class: 'cv-item' + (onItem ? ' click' : ''), 'data-code': it.code, 'data-id': it.id, title: `[${it.code}] ${it.name}`,
      style: `left:${it.x - x0 + pad}px;top:${it.y - y0 + pad}px;width:${it.w}px;height:${it.h}px;z-index:${itemZ(fx, it)}` },
      it.img ? prodImg(it.img, it.name, { lazy }) : h('span', {}, it.name));
    if (onItem) el.onclick = () => onItem(it, fx);
    if (it._b) el.dataset.b = it._b;
    layer(it).append(el);
  }
  wrap.append(inner);
  return wrap;
}

/* 줄줄 매대 (POG 사이트 매대 타입 C · 배경 그림 juljulbg…): 몸통 칸(140px = 280mm) 양쪽 끝에 세로 줄(20px)이 하나씩 있고 제품은 줄에 걸림 (사용자)
   넓은 회색 판 대신 POG 사이트처럼 양쪽 줄만 그림. 줄은 선반·파이프처럼 집기(props, kind '줄줄', jj)로 바꿔서
   매대 나누기 때 골라서 묶음과 같이 옮길 수 있음 (사용자). 줄 그림은 다른 사이트 것이라 직접 그림 (회색 줄 + 구멍) */
const isJuljul = p => /juljul/i.test(p?.bg?.img || '');
const jjFixed = new WeakSet(); // 판을 줄로 바꾼 매대 (저장할 때 panels도 같이 저장)
function jjNorm(fx) {
  if (!fx || !(fx.panels || []).some(isJuljul)) return fx;
  const have = new Set((fx.props || []).map(o => String(o.id)));
  const strips = [];
  for (const p of fx.panels.filter(isJuljul)) {
    const sw = Math.max(6, Math.min(20, p.w * 0.15));
    [['L', p.x], ['R', p.x + p.w - sw]].forEach(([k, x]) => {
      const id = `jj-${p.id || p.x + '_' + p.y}-${k}`;
      if (!have.has(id)) strips.push({ id, kind: '줄줄', jj: 1, color: '#a7a7a7', x, y: p.y, w: sw, h: p.h });
    });
  }
  const out = { ...fx, props: [...(fx.props || []), ...strips], panels: fx.panels.filter(p => !isJuljul(p)) };
  jjFixed.add(out);
  return out;
}
// 줄을 바꾼 매대를 저장할 때: 판(panels)도 줄로 바꾼 상태로 저장 (옮겨 간 줄이 다시 생기지 않게)
const jjSave = (pogId, fx, ug) => { if (jjFixed.has(fx)) { saveFx(pogId, fx.id, 'props', fx.props || [], ug); saveFx(pogId, fx.id, 'panels', fx.panels || [], ug); jjFixed.delete(fx); } };

/* 타공판 구멍: POG 사이트의 배경 무늬(타공판 그림) 크기를 구멍 간격으로 씀. 그림을 그대로 쓰지 않고 구멍을 직접 그림 (다른 사이트 그림이 막혀도 보이게)
   무늬를 못 읽은 예전 데이터는 매대명·매대 타입에 '타공'이 있으면 기본 간격으로 그림 */
const imgSize = new Map(); // 무늬 그림 주소 → { w, h } (크기가 'auto'일 때 그림 크기가 간격)
const bgUrl = img => (String(img || '').match(/url\(["']?(.*?)["']?\)/) || [])[1] || '';
function bgPitch(bg) {
  const m = String(bg?.size || '').match(/([\d.]+)px(?:\s+([\d.]+)px)?/);
  if (m) return { x: +m[1], y: +(m[2] || m[1]) };
  const u = bgUrl(bg?.img), z = u && imgSize.get(u);
  return z && z.w ? { x: z.w, y: z.h } : u ? { url: u } : null;
}
function perfOf(f, frameW) {
  const b = f.board && (f.board.holes ? { x: f.board.holes.px, y: f.board.holes.py } : bgPitch(f.board));
  if (b) return { ...b, bg: f.board };
  if (/타공/.test(`${f.mdName || ''} ${f.fixtureType || ''} ${f.headerName || ''}`)) {
    const mm = +((f.mdName || '').match(/_(\d{3,4})(?:\D*)$/) || [])[1]; // 매대명 끝 숫자 = 폭(mm)일 때 25mm 간격으로
    const p = mm >= 300 && mm <= 3000 && frameW ? frameW / mm * 25 : 10;
    return { x: Math.max(5, Math.min(p, 30)), y: Math.max(5, Math.min(p, 30)) };
  }
  return null;
}
function holesOn(el, pitch, ox, oy, bg) {
  if (!pitch) return;
  if (pitch.url) { // 그림 크기를 아직 모름 → 불러와서 크기를 안 뒤에 그림
    const im = new Image();
    im.onload = () => { imgSize.set(pitch.url, { w: im.naturalWidth, h: im.naturalHeight }); holesOn(el, { x: im.naturalWidth, y: im.naturalHeight }, ox, oy, bg); };
    im.referrerPolicy = 'no-referrer'; im.src = pitch.url;
    return;
  }
  const px = Math.max(3, pitch.x), py = Math.max(3, pitch.y), r = Math.max(0.7, Math.min(px, py) * 0.16);
  el.classList.add('perf');
  el.style.backgroundImage = `radial-gradient(circle, #9e9e9e ${r}px, transparent ${r + 0.5}px)`;
  el.style.backgroundSize = `${px}px ${py}px`;
  el.style.backgroundPosition = bg?.pos && /px/.test(bg.pos) ? bg.pos : `${px / 2}px ${py / 2}px`;
}

/* ---------- 표지 (매장명 + POG) ---------- */
// 제목을 따로 안 적으면 지점명에서 끝의 '점'을 뺀 이름 (Keruen City점 → Keruen City)
const autoCoverTitle = pog => (pog.branchName || pog.storeName || '').trim().replace(/\s*점$/, '');
// 페이지 왼쪽 아래 매장명: 지점명, 없으면 POG 사이트의 매장명
const footStore = pog => pog.branchName || pog.storeName || '';
const coverTitle = pog => pog.coverTitle || autoCoverTitle(pog);
function buildCover(pog, { editable, L = LABELS_KO }) {
  const title = h('input', { class: 'f cover-title', title: '눌러서 표지 매장명 고치기' });
  // 표지 아래 매장명도 여기서 고침 (사용자) = branchName. 모든 페이지 아래 매장명도 같이 바뀜
  const store = h('input', { class: 'f cover-store', title: '눌러서 매장명 고치기 (모든 페이지 아래 매장명도 같이 바뀌어요)' });
  if (!editable) { title.disabled = true; store.disabled = true; }
  else { title.addEventListener('input', () => savePog(pog.id, 'coverTitle', title.value)); store.addEventListener('input', () => savePog(pog.id, 'branchName', store.value)); }
  // 표지의 담당자 글자는 'POG 팀' (사용자)
  const team = L.team || LABELS_KO.team;
  const page = h('div', { class: 'page cover' },
    h('div', { class: 'ph' }),
    h('div', { class: 'cover-gap' }),
    h('div', { class: 'cover-body' }, title, h('div', { class: 'cover-pog' }, 'POG')), // 아래 syncCover에서 '{팀} POG'
    h('div', { class: 'pf1' }, team + ' ', h('span', { class: 'pf-mgr' })),
    h('div', { class: 'pf2' }, store));
  return h('div', { class: 'page-block cover-block', 'data-id': '__cover' }, page);
}
function syncCover(block, pog) {
  const t = $('.cover-title', block);
  t.placeholder = autoCoverTitle(pog) || '매장명';
  if (t !== document.activeElement && t.value !== (pog.coverTitle || '')) t.value = pog.coverTitle || '';
  $('.pf-mgr', block).textContent = pog.manager || '';
  $('.cover-pog', block).textContent = pogTeam(pog) ? `${pogTeam(pog)} POG` : 'POG'; // 국내: 표지에 팀명
  const s = $('.cover-store', block);
  s.placeholder = pog.storeName || '매장명';
  if (s !== document.activeElement && s.value !== (pog.branchName || '')) s.value = pog.branchName || '';
}

/* ---------- 슬라이드 목록 (PPT처럼 왼쪽 썸네일) ---------- */
function makeThumbs(box, scroller, onActive, tools = null) { // tools = { can(), del(id), move(ids, dir), place(ids, beforeId) } : POG 만들기에서만
  const els = new Map();
  let active = null;
  // 여러 장 고르기 (POG 만들기): Shift+클릭 = 처음 누른 장부터 여기까지, Ctrl(⌘)+클릭 = 하나씩 넣고 빼기. 고른 장은 함께 끌거나 ▲▼로 옮김
  const sel = new Set(); let anchor = null;
  const fxIds = () => [...els.keys()].filter(k => els.get(k)._fxId);
  const paint = () => els.forEach((t, k) => t.classList.toggle('picked', sel.has(k)));
  const clearPick = () => { if (sel.size) { sel.clear(); paint(); } };
  const pick = (id, range) => {
    if (range && anchor && anchor !== id) {
      const ids = fxIds(), a = ids.indexOf(anchor), b = ids.indexOf(id);
      if (a >= 0 && b >= 0) { sel.clear(); ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(k => sel.add(k)); }
    } else { sel.has(id) ? sel.delete(id) : sel.add(id); anchor = id; }
    paint();
    if (sel.size > 1) toast(`${sel.size}장 골랐어요 · 끌어서 놓거나 ▲▼로 한꺼번에 옮겨요 (Esc = 고르기 풀기)`);
  };
  const group = id => sel.has(id) && sel.size > 1 ? fxIds().filter(k => sel.has(k)) : [id]; // 보이는 순서대로
  if (tools) document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && sel.size && box.isConnected && box.offsetParent) clearPick(); });
  const setActive = id => {
    els.forEach((t, k) => {
      const on = k === id;
      if (on && !t.classList.contains('on')) { // 썸네일 목록만 움직임 (페이지 화면은 그대로)
        const a = t.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (a.top < b.top) box.scrollTop += (a.top - b.top) / ZM();
        else if (a.bottom > b.bottom) box.scrollTop += (a.bottom - b.bottom) / ZM();
      }
      t.classList.toggle('on', on);
    });
    if (id !== active) { active = id; onActive?.(id); }
  };
  if (tools) { // 끌어다 놓을 자리: 마우스가 썸네일 위쪽 반이면 그 앞, 아래쪽 반이면 그 뒤
    const spot = ev => { const t = ev.target.closest('.thumb'); if (!t || !t._fxId) return null; const r = t.getBoundingClientRect(); return { t, after: ev.clientY > r.top + r.height / 2 }; };
    box.addEventListener('dragover', ev => {
      if (!ev.dataTransfer.types.includes('text/x-page')) return;
      ev.preventDefault(); const sp = spot(ev);
      $$('.thumb.drop-before, .thumb.drop-after', box).forEach(x => x.classList.remove('drop-before', 'drop-after'));
      if (sp) sp.t.classList.add(sp.after ? 'drop-after' : 'drop-before');
    });
    box.addEventListener('drop', ev => {
      const moving = ev.dataTransfer.getData('text/x-page').split(',').filter(Boolean), sp = spot(ev);
      $$('.thumb.drop-before, .thumb.drop-after', box).forEach(x => x.classList.remove('drop-before', 'drop-after'));
      if (!moving.length || !sp) return; ev.preventDefault();
      // 놓을 자리 = 끌고 있지 않은 페이지 중 그 자리 바로 다음 페이지 앞 (없으면 맨 뒤)
      const ids = fxIds(), i = ids.indexOf(sp.t._fxId) + (sp.after ? 1 : 0);
      tools.place(moving, ids.slice(i).find(k => !moving.includes(k)) ?? null);
    });
  }
  // 스크롤하면 지금 보고 있는 페이지를 표시
  let raf = 0;
  scroller.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const top = scroller.getBoundingClientRect().top + 120;
      let cur = els.keys().next().value;
      for (const [id, t] of els) if (t._block?.getBoundingClientRect().top <= top) cur = id;
      setActive(cur);
    });
  });
  return {
    clear() { els.clear(); box.innerHTML = ''; active = null; },
    setActive,
    // entries: [{ id, block, name, fx }]  fx가 없으면 표지
    sync(entries) {
      const ids = new Set(entries.map(e => e.id));
      for (const [id, t] of els) if (!ids.has(id)) { t.remove(); els.delete(id); }
      entries.forEach((e, i) => {
        let t = els.get(e.id);
        if (!t) {
          const body = thCv(e.fx) ? buildCanvas(e.fx, 116, 150, null, { lazy: true }) : h('div', { class: 'th-cover' });
          t = h('div', { class: 'thumb', title: e.name },
            h('div', { class: 'th-no' }),
            h('div', { class: 'th-page' }, h('div', { class: 'th-head' }, h('span', { class: 'th-name' })), h('div', { class: 'th-body' }, body)));
          t.onclick = ev => {
            if (tools && e.fx && tools.can() && (ev.shiftKey || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); pick(e.id, ev.shiftKey); return; }
            if (tools) { clearPick(); anchor = e.fx ? e.id : null; }
            t._block?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActive(e.id);
          };
          if (tools && e.fx) { // 페이지 위로·아래로·삭제 + 끌어서 순서 바꾸기
            const ab = (txt, title, fn, cls = '') => h('button', { type: 'button', class: cls, title, onclick: ev => { ev.stopPropagation(); fn(); } }, txt);
            $('.th-page', t).append(h('div', { class: 'th-act no-print' },
              ab('▲', '앞으로 (고른 장이 여럿이면 함께)', () => tools.move(group(e.id), -1)), ab('▼', '뒤로 (고른 장이 여럿이면 함께)', () => tools.move(group(e.id), 1)), ab('🗑', '이 페이지 삭제', () => tools.del(e.id), 'del')));
            t.draggable = true;
            t.addEventListener('dragstart', ev => {
              if (!tools.can()) { ev.preventDefault(); return; }
              const g = group(e.id); if (g.length === 1 && !sel.has(e.id)) clearPick();
              ev.dataTransfer.setData('text/x-page', g.join(',')); ev.dataTransfer.effectAllowed = 'move';
              g.forEach(k => els.get(k)?.classList.add('dragging'));
            });
            t.addEventListener('dragend', () => { $$('.thumb.dragging', box).forEach(x => x.classList.remove('dragging')); $$('.thumb.drop-before, .thumb.drop-after', box).forEach(x => x.classList.remove('drop-before', 'drop-after')); });
          }
          els.set(e.id, t);
        }
        t._block = e.block; t._fxId = e.fx ? e.id : null;
        t.title = e.name;
        const sig = e.fx ? itemSig(e.fx) : '';
        if (thCv(e.fx) && ((t._sig !== undefined && t._sig !== sig) || $('.th-cover', t))) $('.th-body', t).replaceChildren(buildCanvas(e.fx, 116, 150, null, { lazy: true }));
        t._sig = sig;
        $('.th-no', t).textContent = i + 1;
        t.classList.toggle('need', !!e.need); t.dataset.need = e.need || '';
        $('.th-name', t).textContent = e.fx ? e.name : '';
        if (!thCv(e.fx)) { let c = $('.th-cover', t); if (!c) $('.th-body', t).replaceChildren(c = h('div', { class: 'th-cover' })); c.innerHTML = ''; c.append(h('b', {}, e.name), e.fx ? h('small', {}, '추가 페이지') : h('b', {}, e.team ? `${e.team} POG` : 'POG')); }
        if (box.children[i] !== t) box.insertBefore(t, box.children[i] || null);
      });
      if (!box.querySelector('.thumb.on') && entries[0]) setActive(entries[0].id);
      [...sel].forEach(k => { if (!ids.has(k)) sel.delete(k); }); if (!tools?.can()) sel.clear(); paint();
      box.classList.toggle('editing', !!tools?.can());
    },
  };
}
// 제품·집기가 바뀌었는지 (바뀌면 그림을 다시 그림): 개수 + 코드·위치를 짧게 줄인 값
const itemSig = fx => {
  const str = [...(fx.items || []).map(i => `${i.code}@${i.x},${i.y},${i.w},${i.h}`), ...(fx.props || []).map(p => `${p.x},${p.y},${p.w}`), ...(fx.panels || []).map(p => `${p.x},${p.y},${p.w},${p.h}`)].join('|');
  let hh = 0; for (let i = 0; i < str.length; i++) hh = (hh * 31 + str.charCodeAt(i)) | 0;
  return `${(fx.items || []).length}:${(fx.props || []).length}:${hh}:${JSON.stringify(fx.blocks || [])}:${JSON.stringify(fx.base || null)}:${fx.info ? 1 : 0}`;
};
/* 매대 붙이기: 얇은 매대(스페이스월 등) 두 개를 한 페이지에. 붙인 쪽 fixture.merged = [id…], 붙여진 쪽 .mergedInto = id.
   붙여진 페이지는 따로 안 나오고, 붙인 페이지 그림 오른쪽에 나란히 그린다 (입력칸·번역은 붙인 페이지 것) */
/* ---------- 매대 나누기 (사용자): fx.blocks = [{ id, items: [제품 id], props: [집기 id], dx, dy }]
   고른 제품(과 그 안의 집기)을 '묶음'으로 떼어 따로 회색 바탕을 칠하고, 끌어서 옮기거나(dx, dy = POG 사이트 px) 다른 페이지로 잘라 붙임.
   묶음에 없는 것 = 나머지. 그림은 withBlocks로 위치를 옮긴 복사본으로 그림 (원래 좌표는 그대로) */
// 매대 나누기 묶음 + 원래 매대(BASE) 옮기기·크기. 묶음 = fx.blocks[{id,items,props,dx,dy,s}], 원래 매대 = fx.base{dx,dy,s} (사용자)
// 크기(s)는 그 묶음의 왼쪽 위 모서리를 기준으로 키우거나 줄임. 묶음도 base도 없으면 그대로
const BASE = '__base';
function withBlocks(fx) {
  if (fx._blocks) return fx;
  const bl = (fx.blocks || []).filter(b => (b.items || []).length || (b.props || []).length);
  if (!bl.length && !fx.base) return fx;
  const ofI = new Map(), ofP = new Map();
  bl.forEach(b => { (b.items || []).forEach(id => ofI.set(String(id), b)); (b.props || []).forEach(id => ofP.set(String(id), b)); });
  const base = { id: BASE, base: true, dx: fx.base?.dx || 0, dy: fx.base?.dy || 0, s: fx.base?.s || 1, sx: fx.base?.sx, sy: fx.base?.sy };
  const raw = new Map(), add = (g, o) => { const r = raw.get(g.id) || { x0: Infinity, y0: Infinity }; r.x0 = Math.min(r.x0, o.x); r.y0 = Math.min(r.y0, o.y); raw.set(g.id, r); };
  const gI = o => ofI.get(String(o.id)) || base, gP = o => ofP.get(String(o.id)) || base;
  (fx.items || []).forEach(o => add(gI(o), o)); (fx.props || []).forEach(o => add(gP(o), o)); (fx.panels || []).forEach(o => add(base, o));
  const tr = (o, g) => { const r = raw.get(g.id), kx = g.sx ?? g.s ?? 1, ky = g.sy ?? g.s ?? 1; return { ...o, x: r.x0 + (o.x - r.x0) * kx + (g.dx || 0), y: r.y0 + (o.y - r.y0) * ky + (g.dy || 0), w: o.w * kx, h: (o.h || 0) * ky, _b: g.id }; };
  return { ...fx, items: (fx.items || []).map(o => tr(o, gI(o))), props: (fx.props || []).map(o => tr(o, gP(o))), panels: (fx.panels || []).map(o => tr(o, base)), _blocks: [base, ...bl] };
}
// 매대 그림의 범위 (제품·집기·판, 묶음 위치 반영). 묶음을 처음 만들거나 붙여넣기 직전에 fx.frame으로 기억해 두고,
// 그 뒤에는 이 틀로만 그림 크기를 정함 → 묶음을 옮기거나 붙여넣어 매대 밖으로 튀어나와도 원래 매대가 작아지지 않음 (사용자)
function cvBox(fx) {
  const f = withBlocks(fx), objs = [...(f.panels || []), ...(f.props || []), ...(f.items || [])].filter(o => o.w > 0);
  if (!objs.length) return null;
  return { x0: Math.min(...objs.map(o => o.x)), y0: Math.min(...objs.map(o => o.y)), x1: Math.max(...objs.map(o => o.x + o.w)), y1: Math.max(...objs.map(o => o.y + Math.max(o.h || 0, 4))) };
}
const blkId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
function combineFx(host, kids) {
  const ext = f => { const xs = [...(f.props || []), ...(f.panels || []), ...(f.items || [])]; return xs.length ? [Math.min(...xs.map(o => o.x)), Math.max(...xs.map(o => o.x + o.w))] : [0, 0]; };
  let right = ext(host)[1];
  const out = { ...host, items: [...(host.items || [])], props: [...(host.props || [])], panels: [...(host.panels || [])], _kids: kids.map(k => k.id), _parts: [host, ...kids] };
  kids.forEach((k, gi) => {
    const [l, r] = ext(k), dx = right + 40 - l, sh = o => ({ ...o, x: o.x + dx, _g: gi + 1 });
    out.items.push(...(k.items || []).map(sh)); out.props.push(...(k.props || []).map(sh)); out.panels.push(...(k.panels || []).map(sh));
    right = r + dx;
  });
  return out;
}
function composeFx(list) {
  const byId = new Map(list.map(f => [f.id, f]));
  return list.filter(f => !(f.mergedInto && byId.has(f.mergedInto))).map(f => {
    const kids = (f.merged || []).map(id => byId.get(id)).filter(k => k && k.mergedInto === f.id);
    return kids.length ? combineFx(f, kids) : f;
  });
}
async function mergeNext(pogId, host, kid) {
  const b = writeBatch(db), ids = [kid.id, ...(kid.merged || [])], g = undoGroup();
  track(pogId, host.id, ['merged'], g); ids.forEach(id => track(pogId, id, ['mergedInto', 'merged'], g));
  b.update(doc(db, 'pogs', pogId, 'fixtures', host.id), { merged: [...(host.merged || []), ...ids], updatedAt: serverTimestamp() });
  ids.forEach(id => b.update(doc(db, 'pogs', pogId, 'fixtures', id), { mergedInto: host.id }));
  if ((kid.merged || []).length) b.update(doc(db, 'pogs', pogId, 'fixtures', kid.id), { merged: [] });
  await b.commit();
  toast(`'${displayName(kid)}'을(를) 이 페이지에 붙였어요`, ['↶ 되돌리기', () => undoMerge(pogId, host.id, ids, kid)]);
}
// 붙이기 되돌리기: 방금 붙인 매대(그 매대에 붙어 있던 것까지)를 원래대로
async function undoMerge(pogId, hostId, ids, kid) {
  const host = state.fixtures.get(hostId); if (!host) return;
  const b = writeBatch(db), g = undoGroup();
  track(pogId, hostId, ['merged'], g); [kid.id, ...(kid.merged || [])].forEach(id => track(pogId, id, ['mergedInto', 'merged'], g));
  b.update(doc(db, 'pogs', pogId, 'fixtures', hostId), { merged: (host.merged || []).filter(x => !ids.includes(x)), updatedAt: serverTimestamp() });
  b.update(doc(db, 'pogs', pogId, 'fixtures', kid.id), { mergedInto: '', merged: kid.merged || [] });
  (kid.merged || []).forEach(id => b.update(doc(db, 'pogs', pogId, 'fixtures', id), { mergedInto: kid.id }));
  await b.commit();
  toast('붙이기를 되돌렸어요');
}
async function unmerge(pogId, host, kidId) {
  const b = writeBatch(db), g = undoGroup();
  track(pogId, host.id, ['merged'], g); track(pogId, kidId, ['mergedInto'], g);
  b.update(doc(db, 'pogs', pogId, 'fixtures', host.id), { merged: (host.merged || []).filter(x => x !== kidId), updatedAt: serverTimestamp() });
  b.update(doc(db, 'pogs', pogId, 'fixtures', kidId), { mergedInto: '' });
  await b.commit();
  toast('떼어냈어요. 다시 따로 한 페이지가 돼요');
}

const slideEntries = (cover, pog, fixtures, blockOf) => [
  { id: '__cover', block: cover, name: coverTitle(pog) || '표지', team: pogTeam(pog) },
  ...fixtures.map(fx => ({ id: fx.id, block: blockOf(fx), name: displayName(fx), fx })),
];
edThumbs = makeThumbs($('#ed-thumbs'), $('#ed-pages'), id => {
  if (state.edPin && Date.now() < state.edPin.t && id !== state.edPin.id) return; // ▲▼로 옮기는 중: 옮긴 페이지를 그대로 '지금 페이지'로
  state.edActive = id; renderSidePanel();
}, {
  can: () => !!state.edEditable,
  del: id => { const fx = state.fixtures.get(id); if (fx) deletePage(state.currentPog.id, fx); },
  move: (ids, dir) => movePage(state.currentPog.id, ids, dir),
  place: (ids, beforeId) => placePage(state.currentPog.id, ids, beforeId),
});
vwThumbs = makeThumbs($('#vw-thumbs'), $('#vw-pages'));
$$('.list-toggle').forEach(b => b.onclick = () => b.closest('.split').classList.toggle('list-off'));

/* ---------- POG 페이지 (A4 한 장 = 매대 하나) ---------- */
function buildPage(fx, pog, { editable, onItem, L = LABELS_KO }) {
  const pid = pog.id;
  const field = (f, el) => {
    el.dataset.f = f; el.classList.add('f');
    if (!editable) el.disabled = true;
    else {
      const fn = () => saveFx(pid, fx.id, f, el.value);
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', fn);
    }
    return el;
  };
  const box = (label, ...c) => h('div', { class: 'sbox' }, h('div', { class: 'sbox-l' }, label), h('div', { class: 'sbox-c' }, ...c));

  if (fx.kind === 'free') return buildFreePage(fx, pog, { editable, field, L, box, onItem });
  const page = h('div', { class: 'page' },
    h('div', { class: 'ph' },
      field('headerName', h('input', { class: 'ph-name', placeholder: origName(fx) || '매대명',
        onclick: e => { if (editable && !e.target.value) openHeaderPicker(pog, fx); } })), // 비어 있으면 누를 때 도면이 뜸
      editable ? h('button', { class: 'ph-dw no-print', type: 'button', title: '도면에서 매대를 골라 헤더에 넣어요', onclick: () => openHeaderPicker(pog, fx) }, '📐 도면에서 고르기') : null,
      h('div', { class: 'ph-cat' }, fx._cat ?? catName(fx.teamName))),
    h('div', { class: 'pb' },
      h('div', { class: 'pcanvas' }, buildCanvas(fx, CANVAS_W, CANVAS_H, onItem, { blockUI: editable && !(fx._parts) })),
      infoSide(box, field, L, editable)),
    h('div', { class: 'pf1' }, L.mgr + ' ', h('span', { class: 'pf-mgr' }), editable ? mgrSelect(fx, pog) : null),
    h('div', { class: 'pf2' }, h('span', { class: 'pf-branch' })));

  return initInfo(finishBlock(fx, pog, page, editable), fx);
}
// 오른쪽 집기 정보 칸 (매대 타입·고리·선반/파이프·이외집기)
const infoSide = (box, field, L, editable) => h('div', { class: 'pside' },
  box(L.type, field('fixtureType', h('input', { list: 'dl-fixtureType', placeholder: '예: 벽매대1000' }))),
  box(L.hook, h('div', { class: 'hook-row' },
    field('hookType', h('select', { class: 'hook-sel' })),
    h('span', { class: 'x' }, '×'),
    field('hookCount', h('input', { type: 'number', min: 0, class: 'hook-cnt', placeholder: '0' })))),
  box(L.sp, h('div', { class: 'sp-list' })),
  box(L.other, h('div', { class: 'ex-list' }), field('otherFixtures', h('textarea', { rows: 2, class: 'ex-memo', placeholder: editable ? '기타 메모 (선택)' : '' }))));
function initInfo(block, fx) {
  if (!block.querySelector('.pside')) return block;
  block._extras = structuredClone(fx.extras || []);
  renderExtras(block);
  block._sp = spRows(fx); renderSp(block);
  return block;
}

/* 이외집기: 사전 '집기'에서 고르고 × 수량 (여러 줄). fixture.extras = [{ id, name, qty }]
   사전에 없는 이름을 직접 쓰면 2.2 번역에서 빨간 ! 로 표시됨 */
/* 선반/파이프여부: 고리타입처럼 [선반 ▾] × [수량] 줄들. fixture.sp = [{ id, name, qty }]
   가져올 때 POG 사이트 선반·파이프 수로 자동으로 채움. 예전 글자(shelfPipe '선반 3 / 파이프 12')만 있으면 읽어서 줄로 바꿈.
   저장할 때 shelfPipe 글자도 같이 맞춰 둠 */
const SP_DEFAULT = ['선반', '파이프'];
const autoSp = (sh, pi) => [...(sh ? [{ id: 'p0', name: '선반', qty: sh }] : []), ...(pi ? [{ id: 'p1', name: '파이프', qty: pi }] : [])];
function spRows(fx) {
  if (Array.isArray(fx.sp)) return structuredClone(fx.sp);
  const t = (fx.shelfPipe || '').trim();
  if (!t) return autoSp(fx.shelfCount, fx.pipeCount);
  const rows = []; let m, i = 0; const re = /([^\d\/,·]+?)\s*(\d+)/g;
  while ((m = re.exec(t))) rows.push({ id: 'p' + i++, name: m[1].trim(), qty: Number(m[2]) });
  return rows.length ? rows : [{ id: 'p0', name: t, qty: '' }];
}
const spText = rows => rows.filter(r => (r.name || '').trim()).map(r => `${r.name}${r.qty !== '' && r.qty != null ? ' ' + r.qty : ''}`).join(' / ');
function renderSp(block) {
  const box = block.querySelector('.page .sp-list'); if (!box) return;
  const ed = block._editable, list = block._sp;
  const save = () => { const g = `${block._fx}|sp`; saveFx(block._pog, block._fx, 'sp', structuredClone(list), g); saveFx(block._pog, block._fx, 'shelfPipe', spText(list), g); };
  // 선택지 = 선반·파이프 + 사전 '선반/파이프' + 이 POG에서 직접 넣은 이름. 없으면 '+ 직접 입력…' (사용자: POG팀이 옵션에 없는 것도 넣게)
  const used = () => [...(state.fixtures?.values?.() || [])].flatMap(f => Array.isArray(f.sp) ? f.sp.map(r => r.name) : []).filter(Boolean);
  // 사전 이름과 이 POG에서만 쓴 이름을 나눠 보여줌. 띄어쓰기·대소문자만 다른 이름은 하나로 (사용자: 'BK 거는화일집기'가 두 번 보였음)
  const opts = cur => {
    const seen = new Set(), dict = [], only = [];
    const put = (arr, v) => { const k = norm(v); if (!k || seen.has(k)) return; seen.add(k); arr.push(v); };
    [...SP_DEFAULT, ...glossaryOf('선반/파이프').map(g => g.ko)].forEach(v => put(dict, v));
    if (cur && !seen.has(norm(cur))) put(only, cur);
    used().forEach(v => put(only, v));
    return { dict, only };
  };
  const CUSTOM = '__custom';
  box.replaceChildren(...list.map(x => {
    const { dict, only } = opts(x.name), opt = o => h('option', { value: o }, o);
    // 지금 값이 사전 이름과 띄어쓰기만 다르면 그 칸은 지금 값 그대로 보여줌
    const curAlias = x.name && !dict.includes(x.name) && !only.includes(x.name) ? [opt(x.name)] : [];
    const sel = h('select', { class: 'f sp-sel', disabled: !ed }, h('option', { value: '' }, ''), ...curAlias,
      h('optgroup', { label: '집기·고리·매대 등록' }, ...dict.map(opt)),
      only.length ? h('optgroup', { label: '이 POG에서 직접 쓴 이름 (등록 안 됨)' }, ...only.map(opt)) : null,
      ed ? h('option', { value: CUSTOM }, '+ 직접 입력…') : null);
    sel.value = x.name || '';
    const qty = h('input', { class: 'f ex-qty', type: 'number', min: 0, placeholder: '0', disabled: !ed });
    qty.value = x.qty ?? '';
    // 사전에 없는 이름이면 ERP 질문 먼저. 창을 X로 닫으면 아무것도 저장 안 함 (사용자)
    sel.addEventListener('change', async () => {
      if (sel.value === CUSTOM) {
        const v = (prompt('선반/파이프 이름을 직접 써 주세요 (예: 걸이봉, 아크릴 선반)', '') || '').trim();
        if (!v) { sel.value = x.name || ''; return; }
        if (await addFxGlossary('선반/파이프', v) === null) { sel.value = x.name || ''; return; }
        x.name = v; save(); renderSp(block); return;
      }
      const v = sel.value;
      if (only.includes(v) && await addFxGlossary('선반/파이프', v) === null) { sel.value = x.name || ''; return; }
      x.name = v; save();
    });
    qty.addEventListener('input', () => { x.qty = qty.value === '' ? '' : Number(qty.value); save(); });
    return h('div', { class: 'ex-row' }, sel, h('span', { class: 'x' }, '×'), qty,
      ed ? h('button', { class: 'ex-del no-print', title: '삭제', onclick: () => { block._sp = list.filter(y => y !== x); save(); renderSp(block); } }, '×') : null);
  }), ...(ed ? [h('button', { class: 'ex-add no-print', onclick: () => { list.push({ id: uid(), name: '', qty: '' }); save(); renderSp(block); } }, '+ 추가')] : []));
  roFill(block);
}
// POG팀이 새로 넣은 선반/파이프·집기 이름은 사전에도 넣음. 넣기 전에 'ERP 주문이 되는 제품입니까?' → 아니오 = 제작필요 (사용자)
const fxAsked = new Set();
async function addFxGlossary(cat, name) {
  name = (name || '').trim();
  const n = norm(name); if (!n || (cat === '선반/파이프' && SP_DEFAULT.some(x => norm(x) === n)) || glossaryOf(cat).some(g => norm(g.ko) === n)) return;
  const key = cat + '|' + n; if (fxAsked.has(key)) return; fxAsked.add(key);
  const erp = await askYesNo('ERP 주문이 되는 제품입니까?', `'${name}' (${cat === '집기' ? '이외집기' : '선반/파이프'})은(는) 집기·고리·매대 등록에 없는 새 이름이에요.\n아니오를 누르면 집기·고리·매대 등록에 '제작필요'로 표시돼요.`);
  if (erp === null) { fxAsked.delete(key); return null; } // X·바깥 누름 = 취소 (사전에도, 페이지에도 저장 안 함)
  const make = erp === false;
  const id = (cat === '집기' ? 'ex_' : 'sp_') + name.replace(/[\/.#$\[\]]/g, '_');
  try {
    await setDoc(doc(db, 'glossary', id), { cat, ko: name, auto: true, ...(make ? { make: true } : {}), createdAt: serverTimestamp(), createdBy: me() }, { merge: true });
    glLog({ id, cat, ko: name }, 'auto', make ? [{ f: 'make', from: '', to: '○' }] : []);
    toast(`'${name}'을 집기·고리·매대 등록 '${cat}'에도 넣었어요` + (make ? ' (제작필요)' : ''));
  } catch (e) { fxAsked.delete(key); console.warn('사전에 넣지 못했어요 (보안 규칙)', e.code || e); }
}
function renderExtras(block) {
  const box = block.querySelector('.page .ex-list'); if (!box) return;
  const ed = block._editable, list = block._extras;
  const save = () => saveFx(block._pog, block._fx, 'extras', structuredClone(list));
  box.replaceChildren(...list.map(x => {
    const name = h('input', { class: 'f ex-name', list: 'dl-extras', placeholder: '집기 고르기', disabled: !ed });
    const qty = h('input', { class: 'f ex-qty', type: 'number', min: 0, placeholder: '0', disabled: !ed });
    name.value = x.name || ''; qty.value = x.qty ?? '';
    if (x.color) { name.style.color = x.color; qty.style.color = x.color; } // 수량에도 같은 색 (사용자)
    const col = ed ? h('input', { type: 'color', class: 'ex-color no-print', title: '글자 색', value: x.color || '#000000' }) : null;
    col?.addEventListener('input', () => { x.color = col.value; name.style.color = col.value; qty.style.color = col.value; save(); });
    name.addEventListener('input', () => { x.name = name.value; save(); });
    // 사전에 없는 새 집기면 ERP 질문 (사용자). 창을 X로 닫으면 고치기 전 이름으로 되돌림 (저장 안 함)
    let prev = x.name || '';
    name.addEventListener('focus', () => { prev = x.name || ''; });
    name.addEventListener('change', async () => {
      if (!ed) return;
      if (await addFxGlossary('집기', name.value) === null) { x.name = prev; name.value = prev; save(); toast('넣지 않았어요'); return; }
      prev = x.name || '';
    });
    qty.addEventListener('input', () => { x.qty = qty.value === '' ? '' : Number(qty.value); save(); });
    return h('div', { class: 'ex-row' }, col, name, h('span', { class: 'x' }, '×'), qty,
      ed ? h('button', { class: 'ex-del no-print', title: '삭제', onclick: () => { block._extras = list.filter(y => y !== x); save(); renderExtras(block); } }, '×') : null);
  }), ...(ed ? [h('button', { class: 'ex-add no-print', onclick: () => { list.push({ id: uid(), name: '', qty: '' }); save(); renderExtras(block); block.querySelector('.page .ex-row:last-of-type .ex-name')?.focus(); } }, '+ 집기 추가')] : []));
  roFill(block);
}
// 페이지 블록 마무리: 메모 층(네모·글상자·화살표·사진)과 편집 막대를 붙임
function finishBlock(fx, pog, page, editable) {
  const block = h('div', { class: 'page-block', 'data-id': fx.id });
  block._editable = editable;
  block._pog = pog.id; block._fx = fx.id;
  block._notes = structuredClone(fx.notes || []);
  block._sel = null;
  page.append(h('div', { class: 'anno' + (editable ? ' edit' : '') }));
  block._itemSig = itemSig(fx);
  if (editable) block._bar = buildNoteBar(block); // 오른쪽 패널에 붙여서 보여줌
  block.append(page);
  if (editable) page.addEventListener('pointerdown', e => {
    setEdActive(fx.id);
    if (e.target.closest('.nt, .nh')) return;
    if (state.split?.id === fx.id && e.target.closest('.pcanvas')) { splitPointer(e, block); return; }
    const rz = e.target.closest('.cv-blk-r');
    if (rz) { resizeBlock(e, block, rz.dataset.b); return; }
    const hd = e.target.closest('.cv-blk-h');
    if (hd) { dragBlock(e, block, hd.dataset.b); return; }
    selectNote(block, null);
    const item = e.target.closest('.cv-item');
    selectItem(block, item ? item.dataset.id : null);
  });
  renderNotes(block);
  return block;
}

/* ---------- 추가 페이지 (POG 없이 사진·글·메모만) ---------- */
// 빈 페이지 팀명 선택지: 사전 '팀명' + 이 POG 페이지들의 팀명 (지금 값도 남겨 둠)
function teamOptions(cur) {
  const names = [...glossaryOf('팀명').map(g => g.ko), ...[...(state.fixtures?.values?.() || [])].filter(f => f.kind !== 'free').map(f => catName(f.teamName))].filter(Boolean);
  return ['', ...new Set([...names.sort((a, b) => a.localeCompare(b, 'ko')), ...(cur ? [catName(cur)] : [])])];
}
function fillTeamSelect(sel, v) {
  const opts = teamOptions(v), sig = opts.join('|');
  if (sel.dataset.sig !== sig) { sel.replaceChildren(...opts.map(t => h('option', { value: t }, t || '팀명 고르기'))); sel.dataset.sig = sig; }
  if (sel !== document.activeElement) sel.value = catName(v || '');
}
function buildFreePage(fx, pog, { editable, field, L = LABELS_KO, box, onItem }) {
  // 빈 페이지 (사용자): fx.info = 오른쪽 집기 정보 칸, 다른 페이지에서 잘라 붙인 매대(items·props)가 있으면 그림
  const hasCv = (fx.items || []).length || (fx.props || []).length;
  const body = hasCv || fx.info
    ? h('div', { class: 'pb' },
      hasCv ? h('div', { class: 'pcanvas' }, buildCanvas(fx, fx.info ? CANVAS_W : CANVAS_W + 220, CANVAS_H, onItem, { blockUI: editable })) : h('div', { class: 'pcanvas free-blank' }),
      fx.info ? infoSide(box, field, L, editable) : null)
    : h('div', { class: 'pb free-body' });
  const page = h('div', { class: 'page free' },
    h('div', { class: 'ph' }, field('headerName', h('input', { class: 'ph-name', placeholder: '제목 (예: 3단 각고리 참고사진)' })),
      // 빈 페이지도 도면 매대에 연결 (사용자). 고르면 제목에 도면 매대명이 들어감
      editable ? h('button', { class: 'ph-dw no-print', type: 'button', title: '도면에서 매대를 골라 제목에 넣어요', onclick: () => openHeaderPicker(pog, fx) }, '📐 도면에서 고르기') : null,
      // 팀명(카테고리): 있는 것 중에서만 고름 (사용자) — 사전 '팀명' + 이 POG에 있는 팀명
      editable ? field('teamName', h('select', { class: 'ph-cat ph-cat-sel', title: '팀명(카테고리) 고르기' }, ...teamOptions(fx.teamName).map(t => h('option', { value: t }, t || '팀명 고르기'))))
        : h('div', { class: 'ph-cat' }, fx._cat ?? catName(fx.teamName))),
    body,
    h('div', { class: 'pf1' }, L.mgr + ' ', h('span', { class: 'pf-mgr' }), editable ? mgrSelect(fx, pog) : null),
    h('div', { class: 'pf2' }, h('span', { class: 'pf-branch' })));
  return initInfo(finishBlock(fx, pog, page, editable), fx);
}
// 썸네일에 매대 그림을 그릴지: 매대 페이지, 또는 매대를 붙여넣은 빈 페이지
const thCv = fx => !!fx && (fx.kind !== 'free' || !!(fx.items || []).length || !!(fx.props || []).length);
const sortedFx = () => [...state.fixtures.values()].sort((a, b) => a.order - b.order);
async function addFreePage(pogId, afterOrder) {
  const list = sortedFx(), next = list.find(f => f.order > afterOrder);
  const order = next ? (afterOrder + next.order) / 2 : afterOrder + 1; // 사이에 끼워 넣기
  const id = 'free_' + Date.now().toString(36);
  track(pogId, id, 'new');
  try {
    await setDoc(doc(db, 'pogs', pogId, 'fixtures', id), {
      kind: 'free', order, headerName: '', notes: [], items: [], props: [], memo: '', photos: [],
      teamName: '', mdName: '', createdAt: serverTimestamp(), createdBy: me(),
    });
    toast('빈 페이지를 추가했어요');
    setTimeout(() => { state.pageEls.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setEdActive(id); }, 300);
  } catch (e) { toast('추가 실패: ' + e.message); }
}
// 페이지 순서 바꾸기 (화면에 보이는 페이지 기준. 붙인 매대는 붙은 페이지를 따라감). 바뀐 순서대로 order를 1, 2, 3… 다시 매김
// opt = { g: 되돌리기 묶음, act: 기록 글, fx: 기록할 페이지, what } — 순서 기록은 줄마다가 아니라 한 줄로 (사용자)
async function reorderPages(pogId, ids, opt = {}) {
  const changed = ids.map((id, i) => [id, i + 1]).filter(([id, o]) => state.fixtures.get(id)?.order !== o), g = opt.g || undoGroup();
  if (!changed.length) return;
  changed.forEach(([id]) => track(pogId, id, ['order'], g));
  addLog(['pogs', pogId], { fx: opt.fx || '__cover', area: 'make', act: opt.act || '페이지 순서 바꿈', what: opt.what || `${changed.length}장` });
  try {
    for (let i = 0; i < changed.length; i += 400) {
      const b = writeBatch(db);
      changed.slice(i, i + 400).forEach(([id, o]) => b.update(doc(db, 'pogs', pogId, 'fixtures', id), { order: o }));
      await b.commit();
    }
  } catch (e) { alert('순서를 바꾸지 못했어요: ' + (e.code || e.message)); }
}
const shownIds = () => [...(state.edComposed?.keys() || [])];
// fxIds = 페이지 하나 또는 여러 장 (썸네일에서 Shift·Ctrl로 고른 것). 여러 장이면 서로 순서는 그대로 두고 함께 움직임
function movePage(pogId, fxIds, dir, opt = {}) {
  const ids = shownIds(), mv = new Set([fxIds].flat());
  const idx = ids.map((x, i) => mv.has(x) ? i : -1).filter(i => i >= 0);
  if (!idx.length || (dir < 0 ? idx[0] === 0 : idx.at(-1) === ids.length - 1)) return;
  for (const i of dir < 0 ? idx : idx.reverse()) [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
  const names = [...mv].map(id => state.fixtures.get(id)).filter(Boolean).map(displayName);
  return reorderPages(pogId, ids, { act: dir < 0 ? '페이지 앞으로' : '페이지 뒤로', fx: mv.size === 1 ? [...mv][0] : '__cover', what: names.slice(0, 3).join(', ') + (names.length > 3 ? ` 외 ${names.length - 3}장` : ''), ...opt });
}
function placePage(pogId, fxIds, beforeId) { // beforeId 앞으로 (null이면 맨 뒤)
  const all = shownIds(), mv = new Set([fxIds].flat()), moving = all.filter(x => mv.has(x));
  if (!moving.length || mv.has(beforeId)) return;
  const ids = all.filter(x => !mv.has(x)), k = beforeId ? ids.indexOf(beforeId) : ids.length;
  ids.splice(k < 0 ? ids.length : k, 0, ...moving);
  if (ids.every((x, i) => x === all[i])) return;
  const names = moving.map(id => state.fixtures.get(id)).filter(Boolean).map(displayName);
  return reorderPages(pogId, ids, { act: '페이지 옮김', fx: moving.length === 1 ? moving[0] : '__cover', what: names.slice(0, 3).join(', ') + (names.length > 3 ? ` 외 ${names.length - 3}장` : '') });
}
// 페이지 삭제 (매대 페이지·추가 페이지 모두). 붙여 둔 매대가 있으면 떼어서 따로 페이지로 남김
// 제품이 하나도 없는 매대 페이지 (추가 페이지·붙여진 매대 제외, 붙인 페이지는 붙은 매대까지 합쳐서 봄)
const emptyPages = () => composeFx(sortedFx()).filter(f => f.kind !== 'free' && !(f.items || []).length);
async function deleteEmptyPages(pogId) {
  const list = emptyPages(); if (!list.length) return;
  if (!confirm(`제품이 하나도 없는 매대 페이지 ${list.length}장을 지울까요?\n${list.map(displayName).join(', ')}\n(Ctrl+Z로 되돌릴 수 있어요)`)) return;
  try {
    const g = undoGroup(), ids = list.flatMap(f => [f.id, ...((f._parts || []).map(p => p.id))]).filter((v, i, s) => s.indexOf(v) === i);
    let b = writeBatch(db), n = 0;
    for (const id of ids) { track(pogId, id, '*', g); b.delete(doc(db, 'pogs', pogId, 'fixtures', id)); if (++n >= 400) { await b.commit(); b = writeBatch(db); n = 0; } }
    track(pogId, '__pog', ['fixtureCount'], g);
    b.update(doc(db, 'pogs', pogId), { fixtureCount: Math.max(0, (state.currentPog?.fixtureCount || ids.length) - ids.length), updatedAt: serverTimestamp() });
    await b.commit();
    toast(`제품 없는 페이지 ${ids.length}장을 지웠어요 · Ctrl+Z로 되돌릴 수 있어요`);
  } catch (e) { alert('지우지 못했어요: ' + (e.code || e.message)); }
}
async function deletePage(pogId, fx) {
  const kids = (fx.merged || []).filter(id => state.fixtures.get(id)?.mergedInto === fx.id);
  const msg = fx.kind === 'free' ? `'${displayName(fx)}' 페이지를 삭제할까요?`
    : `'${displayName(fx)}' 페이지를 삭제할까요?\n입력한 매대명·고리·이외집기·메모도 함께 지워져요.${kids.length ? `\n붙여 둔 매대 ${kids.length}개는 떼어져서 따로 페이지로 남아요.` : ''}\n(나중에 POG 사이트에서 다시 가져오면 이 매대가 맨 뒤에 다시 생길 수 있어요)`;
  if (!confirm(msg)) return;
  try {
    const b = writeBatch(db), g = undoGroup();
    kids.forEach(id => track(pogId, id, ['mergedInto'], g)); track(pogId, fx.id, '*', g); track(pogId, '__pog', ['fixtureCount'], g);
    kids.forEach(id => b.update(doc(db, 'pogs', pogId, 'fixtures', id), { mergedInto: '' }));
    b.delete(doc(db, 'pogs', pogId, 'fixtures', fx.id));
    if (fx.kind !== 'free') b.update(doc(db, 'pogs', pogId), { fixtureCount: Math.max(0, (state.currentPog?.fixtureCount || 1) - 1), updatedAt: serverTimestamp() });
    await b.commit();
    toast(`'${displayName(fx)}' 페이지를 삭제했어요 · Ctrl+Z로 되돌릴 수 있어요`); // 메모 사진 파일은 되돌릴 수 있게 남겨 둠
  } catch (e) { alert('삭제하지 못했어요: ' + (e.code || e.message)); }
}

/* ---------- 메모: 네모 박스 · 글상자 · 화살표 · 사진 ----------
   fixture.notes = [{ id, t:'box'|'text'|'arrow'|'img', ... }]  좌표는 A4 페이지 안의 px
   글상자 글자(text)는 2.2 번역에서 id로 언어별 번역을 붙임 */
const NOTE_COLORS = ['#e60012', '#f7931e', '#ffd400', '#2e9e5b', '#00a0e9', '#7b4fd6', '#222222', '#ffffff'];
const uid = () => Math.random().toString(36).slice(2, 9);
const rgba = (hex, a) => { const n = parseInt((hex || '#000000').slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const NOTE_NEW = {
  box: () => ({ t: 'box', x: 120, y: 320, w: 240, h: 120, color: '#e60012', fill: false, alpha: 0.3, bw: 3 }),
  text: () => ({ t: 'text', x: 150, y: 360, w: 170, h: 30, text: '메모', bg: '#ffd400', color: '#222222', border: '', fs: 14 }),
  arrow: () => ({ t: 'arrow', x1: 220, y1: 330, x2: 360, y2: 420, color: '#2e9e5b', bw: 3 }),
};
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
let noteSaveBlock = null; // Delete 키로 지울 때 쓰는, 지금 선택된 메모가 있는 페이지

function saveNotes(block) { saveFx(block._pog, block._fx, 'notes', structuredClone(block._notes)); }
function selectNote(block, id) {
  if (id) setEdActive(block._fx);
  if (block._sel === id) return;
  block._sel = id; noteSaveBlock = id ? block : null;
  renderNotes(block); renderNoteBar(block);
}
function renderNotes(block) {
  const layer = $('.anno', block); if (!layer) return;
  layer.innerHTML = '';
  const ed = block._editable;
  for (const n of block._notes) {
    const sel = ed && n.id === block._sel;
    if (n.t === 'arrow') {
      const svg = svgEl('svg', { class: 'nt-svg' }), mid = 'm' + uid();
      const mk = svgEl('marker', { id: mid, viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' });
      mk.append(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: n.color }));
      const defs = svgEl('defs'); defs.append(mk); svg.append(defs);
      svg.append(svgEl('line', { x1: n.x1, y1: n.y1, x2: n.x2, y2: n.y2, stroke: n.color, 'stroke-width': n.bw || 3, 'marker-end': `url(#${mid})`, 'stroke-linecap': 'round' }));
      if (ed) {
        const hit = svgEl('line', { x1: n.x1, y1: n.y1, x2: n.x2, y2: n.y2, class: 'nt nt-hit' + (sel ? ' sel' : ''), 'data-id': n.id });
        hit.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'move'));
        svg.append(hit);
      }
      layer.append(svg);
      if (sel) for (const k of ['1', '2']) {
        const hd = h('div', { class: 'nh nh-pt', style: `left:${n['x' + k]}px;top:${n['y' + k]}px` });
        hd.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'p' + k));
        layer.append(hd);
      }
      continue;
    }
    const st = `left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;`;
    let el;
    if (n.t === 'box') el = h('div', { class: 'nt nt-box', style: st + `border:${n.bw || 3}px solid ${n.color};background:${n.fill ? rgba(n.color, n.alpha ?? 0.3) : 'transparent'}` });
    else if (n.t === 'text') el = h('div', { class: 'nt nt-text', style: st + `background:${n.bg || 'transparent'};color:${n.color || '#222'};border:${n.border ? '2px solid ' + n.border : '0'}` },
      h('div', { class: 'nt-tx', style: `font-size:${n.fs || 14}px` }, n.text || '')); // 글은 안쪽 칸에 (모서리 점이 잘리지 않게)
    else if (n.t === 'img') el = h('div', { class: 'nt nt-img', style: st }, h('img', { src: n.url, alt: '', draggable: 'false' }));
    else continue;
    el.dataset.id = n.id;
    if (sel) el.classList.add('sel');
    if (ed) {
      el.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'move'));
      if (n.t === 'text') el.addEventListener('dblclick', () => block._bar?.querySelector('.nb-text')?.focus());
      if (sel) for (const c of ['nw', 'ne', 'sw', 'se']) { const hd = h('div', { class: 'nh nh-' + c }); hd.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'r-' + c)); el.append(hd); }
    }
    layer.append(el);
    if (n.t === 'text') fitText(el.querySelector('.nt-tx'), n.fs || 14);
  }
}
// 글상자: 상자 크기는 그대로 두고, 글이 넘치면 글자를 줄여서 맞춤 (화면에 보일 때만 잴 수 있음)
function fitText(el, fs) {
  if (!el.isConnected || !el.clientHeight) return;
  let f = fs;
  while (f > 7 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) { f -= 1; el.style.fontSize = f + 'px'; }
}
function startNoteDrag(e, block, n, mode) {
  const z = ZP();
  e.preventDefault(); e.stopPropagation();
  if ($('#ed-side')?.contains(document.activeElement)) document.activeElement.blur(); // 패널에서 글 쓰던 중이면 끝내고 이 페이지로
  selectNote(block, n.id);
  const sx = e.clientX, sy = e.clientY, o = { ...n };
  let moved = false;
  block._dragging = true;
  const mv = ev => {
    const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    if (mode === 'move' && n.t === 'arrow') { n.x1 = o.x1 + dx; n.y1 = o.y1 + dy; n.x2 = o.x2 + dx; n.y2 = o.y2 + dy; }
    else if (mode === 'move') { n.x = Math.round(o.x + dx); n.y = Math.round(o.y + dy); }
    else if (mode.startsWith('r-')) { // 네 모서리: 반대쪽 모서리는 그대로
      const c = mode.slice(2), west = c.includes('w'), north = c.includes('n');
      let w = Math.max(16, Math.round(west ? o.w - dx : o.w + dx));
      let hh = Math.max(16, Math.round(north ? o.h - dy : o.h + dy));
      if (n.t === 'img') hh = Math.max(16, Math.round(w * o.h / o.w)); // 사진은 비율 유지
      n.w = w; n.h = hh;
      n.x = west ? o.x + o.w - w : o.x;
      n.y = north ? o.y + o.h - hh : o.y;
    }
    else { n['x' + mode[1]] = o['x' + mode[1]] + dx; n['y' + mode[1]] = o['y' + mode[1]] + dy; }
    renderNotes(block);
  };
  const up = () => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
    block._dragging = false;
    if (moved) saveNotes(block);
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
function addNote(block, n) {
  n.id = uid();
  block._notes.push(n);
  saveNotes(block); selectNote(block, n.id);
}
function removeNote(block, id) {
  const n = block._notes.find(x => x.id === id); if (!n) return;
  block._notes = block._notes.filter(x => x.id !== id);
  if (n.path) deleteObject(sRef(st, n.path)).catch(() => { });
  block._sel = null; noteSaveBlock = null;
  saveNotes(block); renderNotes(block); renderNoteBar(block);
}
async function addImageNote(block, file) {
  toast('사진 올리는 중…');
  try {
    const blob = await resizeImage(file, 1400);
    const bmp = await createImageBitmap(blob);
    const path = `pogs/${block._pog}/${block._fx}/notes/${Date.now()}_${uid()}.jpg`;
    await uploadBytes(sRef(st, path), blob, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(sRef(st, path));
    const w = 240, hh = Math.round(w * bmp.height / bmp.width);
    addNote(block, { t: 'img', x: 140, y: 300, w, h: hh, url, path });
  } catch (e) { toast('사진 올리기 실패: ' + e.message); }
}

// 편집 막대: 추가 버튼 + 선택한 메모의 색·채우기·글 등
function buildNoteBar(block) {
  const file = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  file.onchange = () => { if (file.files[0]) addImageNote(block, file.files[0]); file.value = ''; };
  return h('div', { class: 'nbar no-print' },
    h('div', { class: 'nb-add' }, h('span', { class: 'mut' }, '메모 추가'),
      h('button', { class: 'btn small', onclick: () => addNote(block, NOTE_NEW.box()) }, '▭ 네모'),
      h('button', { class: 'btn small', onclick: () => addNote(block, NOTE_NEW.text()) }, '✎ 글상자'),
      h('button', { class: 'btn small', onclick: () => addNote(block, NOTE_NEW.arrow()) }, '↗ 화살표'),
      h('button', { class: 'btn small', onclick: () => file.click() }, '🖼 사진'), file),
    h('div', { class: 'nb-props' }));
}
function swatches(cur, onPick, { none = false } = {}) {
  return h('span', { class: 'sw-row' },
    none ? h('button', { class: 'sw sw-none' + (!cur ? ' on' : ''), title: '없음', onclick: () => onPick('') }, '×') : null,
    ...NOTE_COLORS.map(c => h('button', { class: 'sw' + (cur === c ? ' on' : ''), style: `background:${c}`, title: c, onclick: () => onPick(c) })),
    h('input', { type: 'color', class: 'sw-pick', value: cur || '#000000', title: '다른 색', onchange: e => onPick(e.target.value) }));
}
function renderNoteBar(block) {
  const box = block._bar?.querySelector('.nb-props'); if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return; // 글 쓰는 중
  box.innerHTML = '';
  const n = block._notes.find(x => x.id === block._sel);
  if (!n) { box.append(h('span', { class: 'mut' }, '메모를 누르면 색·채우기를 바꿀 수 있어요. 끌어서 옮기고, 모서리로 크기를 바꿔요.')); return; }
  const set = (patch) => { Object.assign(n, patch); saveNotes(block); renderNotes(block); renderNoteBar(block); };
  const lab = t => h('span', { class: 'nb-l' }, t);
  const sel = (v, opts, on) => { const s = h('select', { class: 'nb-sel' }, ...opts.map(([k, t]) => h('option', { value: k }, t))); s.value = String(v); s.onchange = () => on(s.value); return s; };
  if (n.t === 'box') box.append(
    lab('색'), swatches(n.color, c => set({ color: c || n.color })),
    h('label', { class: 'nb-chk' }, h('input', { type: 'checkbox', checked: !!n.fill, onchange: e => set({ fill: e.target.checked }) }), ' 채우기'),
    n.fill ? sel(n.alpha ?? 0.3, [['0.25', '연하게'], ['0.5', '중간'], ['1', '진하게']], v => set({ alpha: Number(v) })) : null,
    lab('굵기'), sel(n.bw || 3, [['1', '1'], ['2', '2'], ['3', '3'], ['5', '5']], v => set({ bw: Number(v) })));
  if (n.t === 'text') {
    const ta = h('textarea', { class: 'nb-text', rows: 2 });
    ta.value = n.text || '';
    ta.addEventListener('input', () => {
      n.text = ta.value; renderNotes(block); // 상자 크기는 그대로 (넘치면 글자가 작아짐)
      saveNotes(block);
    });
    box.append(ta,
      lab('배경'), swatches(n.bg, c => set({ bg: c }), { none: true }),
      lab('글자'), swatches(n.color, c => set({ color: c || '#222222' })),
      lab('테두리'), swatches(n.border, c => set({ border: c }), { none: true }),
      lab('크기'), sel(n.fs || 14, [['10', '10'], ['12', '12'], ['14', '14'], ['18', '18'], ['24', '24'], ['32', '32']], v => set({ fs: Number(v) })));
  }
  if (n.t === 'arrow') box.append(lab('색'), swatches(n.color, c => set({ color: c || n.color })),
    lab('굵기'), sel(n.bw || 3, [['2', '2'], ['3', '3'], ['5', '5'], ['8', '8']], v => set({ bw: Number(v) })));
  if (n.t === 'img') box.append(h('span', { class: 'mut' }, '모서리를 끌면 비율을 유지하며 크기가 바뀌어요.'));
  if (n.t === 'text') box.append(h('span', { class: 'mut nb-tip' }, '네 모서리 점을 끌어 상자 크기를 바꿔요. 글이 넘치면 글자가 자동으로 작아져요.'));
  box.append(h('span', { class: 'nb-sp' }),
    n.t !== 'img' ? h('button', { class: 'btn small ghost', onclick: () => { const c = structuredClone(n); delete c.id; if (c.t === 'arrow') { c.x1 += 20; c.y1 += 20; c.x2 += 20; c.y2 += 20; } else { c.x += 20; c.y += 20; } addNote(block, c); } }, '복제') : null,
    h('button', { class: 'btn small ghost danger', onclick: () => removeNote(block, n.id) }, '삭제'));
}
document.addEventListener('keydown', e => {
  const b = noteSaveBlock; if (!b || !b._sel || !b.isConnected) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeNote(b, b._sel); }
  if (e.key === 'Escape') selectNote(b, null);
});

function fillHookSelect(sel, v) {
  if (sel === document.activeElement) return;
  // 고리타입 칸 = 집기·고리·매대 등록의 고리 전부 (표지의 '이 POG에서 쓸 고리' 고르기는 없앰 · 사용자)
  const opts = glossaryOf('고리타입').map(g => g.ko);
  if (v && !opts.includes(v)) opts.push(v);
  const sig = opts.join('\u0001');
  if (sel.dataset.sig !== sig) {
    sel.innerHTML = '';
    sel.append(h('option', { value: '' }, ''), ...opts.map(o => h('option', { value: o }, o)));
    sel.dataset.sig = sig;
  }
  sel.value = v || '';
}

function syncPage(block, fx, pog) {
  $$('[data-f]', block).forEach(el => {
    const v = fx[el.dataset.f] ?? '';
    if (el.dataset.f === 'teamName' && el.tagName === 'SELECT') fillTeamSelect(el, v); // 빈 페이지 팀명
    else if (el.tagName === 'SELECT') fillHookSelect(el, v);
    else if (el !== document.activeElement && el.value !== String(v)) el.value = v;
  });
  $('.pf-mgr', block).textContent = fx.manager || pog.manager || ''; // 페이지마다 다른 담당자를 정할 수 있음 (비우면 POG 담당자)
  const ms = $('.pf-mgr-sel', block); if (ms) fillMgrSelect(ms, fx, pog);
  $('.pf-branch', block).textContent = footStore(pog);
  if (!pendingKey(`${fx.id}|itemZ`)) applyItemZ(block, fx);
  const spBox = block.querySelector('.page .sp-list'), spNow = spRows(fx);
  if (spBox && !spBox.contains(document.activeElement) && !pendingKey(`${fx.id}|sp`) && JSON.stringify(spNow) !== JSON.stringify(block._sp)) {
    block._sp = spNow; renderSp(block);
  }
  const exBox = block.querySelector('.page .ex-list');
  if (exBox && !exBox.contains(document.activeElement) && !pendingKey(`${fx.id}|extras`) && JSON.stringify(fx.extras || []) !== JSON.stringify(block._extras)) {
    block._extras = structuredClone(fx.extras || []); renderExtras(block);
  }
  const typing = !!block._bar && block._bar.querySelector('.nb-text') === document.activeElement;
  if (!block._dragging && !typing && !pendingKey(`${fx.id}|notes`) && JSON.stringify(fx.notes || []) !== JSON.stringify(block._notes)) {
    block._notes = structuredClone(fx.notes || []);
    if (!block._notes.some(n => n.id === block._sel)) block._sel = null;
    renderNotes(block); renderNoteBar(block);
  }
  roFill(block);
}
// 보기 전용 페이지(최종·번역·온라인 POG·PDF): 오른쪽 칸 값을 글자로 바꿔 보여줌. 긴 글은 줄바꿈, 수량 0·빈칸은 비워 둠 (× 도 숨김)
function roFill(block) {
  if (block._editable) return;
  $$('.page .pside .f', block).forEach(el => {
    if (el.tagName === 'TEXTAREA') return;
    const qty = el.type === 'number';
    let v = el.tagName === 'SELECT' ? (el.selectedOptions[0]?.textContent || el.value || '') : el.value;
    if (qty && (v === '' || Number(v) === 0)) v = '';
    let t = el._ro;
    if (!t) { t = el._ro = h('div', { class: 'ro-v' + (qty ? ' q' : '') }); el.after(t); el.classList.add('ro-hide'); }
    t.textContent = v; t.style.color = el.style.color || '';
    const x = el.previousElementSibling?.classList.contains('x') ? el.previousElementSibling : null;
    if (x) x.style.display = v ? '' : 'none';
  });
}

async function resizeImage(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = h('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  } catch { return file; }
}
/* ---------- 2.1 POG 목록 (매장마다 묶고, 그 안에 팀별 POG) ---------- */
$('#pog-search').addEventListener('input', renderPogList);
// 이 POG의 팀 (국내: POG 하나 = 매장 하나의 팀 하나)
const pogTeam = p => (p?.team ?? (Array.isArray(p?.teams) && p.teams.length === 1 ? p.teams[0] : '')) || '';
const pogStore = p => p ? (p.branchName || p.storeName || p.storeCode || '') : '';
const pogTitle = p => [pogStore(p), pogTeam(p)].filter(Boolean).join(' · ');
const teamNo = p => { const m = String(p.teamName || '').match(/^\s*(\d+)/); return m ? Number(m[1]) : 999; }; // POG 사이트 팀 번호 순서 (01 디자인지제 …)
function pogListItem(p, active, onClick) {
  return h('div', { class: 'pitem pitem-team' + (active ? ' on' : ''), onclick: onClick },
    h('div', { class: 'pi-top' }, h('b', {}, pogTeam(p) || '(팀 없음)'),
      h('span', { class: 'badge ' + (p.status === 'final' ? 'final' : 'draft') }, p.status === 'final' ? '최종' : '작성 중')),
    h('div', { class: 'pi-sub' }, `매대 ${p.fixtureCount || 0}개 · ${fmtDate(p.createdAt)}${p.manager ? ' · ' + p.manager : ''}`));
}
// 매장마다 머리줄 + 팀 POG들 (팀 번호 순)
function groupedPogList(list, rows, activeId, onOpen) {
  list.innerHTML = '';
  const groups = new Map();
  for (const p of rows) { const k = String(p.storeCode || p.id); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  for (const ps of groups.values()) {
    ps.sort((a, b) => teamNo(a) - teamNo(b) || pogTeam(a).localeCompare(pogTeam(b), 'ko') || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    const p0 = ps[0], st = storeForPog(p0);
    list.append(h('div', { class: 'pstore' }, h('b', {}, (st && storeName(st)) || pogStore(p0) || '(이름 없음)'), h('span', { class: 'mut' }, ` ${p0.storeCode || ''} · 팀 ${ps.length}개`)));
    ps.forEach(p => list.append(pogListItem(p, activeId === p.id, () => onOpen(p.id))));
  }
}
const pogMatch = (p, q) => !q || [p.storeName, p.branchName, p.storeCode, p.manager, p.team, p.teamName, storeName(storeForPog(p))].join(' ').toLowerCase().includes(q);
function renderPogList() {
  const q = $('#pog-search').value.trim().toLowerCase();
  const list = $('#pog-list');
  const rows = state.pogs.filter(p => pogMatch(p, q));
  groupedPogList(list, rows, state.currentPog?.id, openPog);
  if (!rows.length) list.append(h('div', { class: 'mut pad' }, 'POG가 없어요.'));
}

/* ---------- 2.1 편집기 ---------- */
function closePog() {
  state.unsubPog?.(); state.unsubFx?.();
  state.unsubPog = state.unsubFx = null;
  state.currentPog = null; state.fixtures = new Map(); state.fxRaw = new Map(); state.pogRaw = null; clearUndo(); state.pageEls = new Map(); state.lockKey = null; state.coverEl = null; state.edActive = null;
  $('#ed-side')?.replaceChildren();
  edThumbs.clear();
  $('#editor-body')?.classList.add('hidden'); $('#editor-empty')?.classList.remove('hidden');
  $('#v-pog-make .split')?.classList.remove('list-off');
}
function openPog(id) {
  closePog();
  $('#editor-empty').classList.add('hidden'); $('#editor-body').classList.remove('hidden');
  $('#v-pog-make .split').classList.add('list-off'); // 페이지를 넓게 보도록 목록은 접어둠
  $('#ed-pages').innerHTML = '<div class="mut pad">불러오는 중…</div>';
  state.currentPog = { id };
  renderPogList();
  state.unsubPog = onSnapshot(doc(db, 'pogs', id), d => {
    if (!d.exists()) { closePog(); renderPogList(); return; }
    state.currentPog = { id: d.id, ...d.data() }; state.pogRaw = d.data();
    applyPogDoc(); updateUndoBtns();
  });
  state.unsubFx = onSnapshot(query(collection(db, 'pogs', id, 'fixtures'), orderBy('order')), s => {
    const ids = new Set();
    state.fxRaw = new Map(s.docs.map(d => [d.id, d.data()])); // 되돌리기용 서버 원본
    s.docs.forEach(d => { ids.add(d.id); state.fixtures.set(d.id, jjNorm({ id: d.id, ...d.data() })); }); // 줄줄 매대: 판 → 줄 집기
    [...state.fixtures.keys()].forEach(k => { if (!ids.has(k)) state.fixtures.delete(k); });
    renderEditorPages();
  });
}
function applyPogDoc() {
  const p = state.currentPog;
  $('#ed-title').textContent = `${pogTitle(p)} ${p.storeCode ? '(' + p.storeCode + ')' : ''}`;
  refreshManagerSelect();
  const final = p.status === 'final';
  const editable = !final && canEdit('pog-make'); // POG팀·관리자만 편집, 나머지는 보기
  state.edEditable = editable;
  $('#ed-status').textContent = final ? '최종' : canEdit('pog-make') ? '작성 중' : '작성 중 · 보기 전용';
  $('#ed-status').className = 'badge ' + (final ? 'final' : canEdit('pog-make') ? 'draft' : 'ro');
  $('#ed-final').textContent = final ? '잠금 해제 (다시 수정)' : '최종 POG 내보내기';
  $('#ed-final').classList.toggle('primary', !final);
  { const m = $('#ed-manager'); if (m) m.disabled = !editable; } // 담당자 칸이 잠깐 화면에 없을 때도 (오른쪽 패널을 다시 그리는 중)
  const key = editable ? 'rw' : 'ro';
  if (state.lockKey !== key) {
    state.lockKey = key;
    state.pageEls.forEach(el => el.remove()); state.pageEls = new Map();
    state.coverEl?.remove(); state.coverEl = null;
  }
  renderEditorPages();
}
function renderEditorPages() {
  const pog = state.currentPog;
  if (!pog || pog.status === undefined) return; // 문서 본체가 아직 안 왔으면 대기
  const wrap = $('#ed-pages');
  wrap.querySelector(':scope > .pad')?.remove();
  if (!state.coverEl) state.coverEl = buildCover(pog, { editable: state.edEditable });
  syncCover(state.coverEl, pog);
  if (wrap.firstElementChild !== state.coverEl) wrap.prepend(state.coverEl);
  const order = composeFx([...state.fixtures.values()].sort((a, b) => a.order - b.order));
  const shown = new Set(order.map(f => f.id));
  for (const [id, el] of state.pageEls) if (!shown.has(id)) { el.remove(); state.pageEls.delete(id); }
  state.edComposed = new Map(order.map(f => [f.id, f]));
  order.forEach((fx, i) => {
    let el = state.pageEls.get(fx.id);
    if (el && el._itemSig !== itemSig(fx)) { el.remove(); el = null; }
    if (!el) { el = buildPage(fx, pog, { editable: state.edEditable }); state.pageEls.set(fx.id, el); }
    syncPage(el, fx, pog);
    if (wrap.children[i + 1] !== el) wrap.insertBefore(el, wrap.children[i + 1] || null); // 0번은 표지
  });
  edThumbs.sync(slideEntries(state.coverEl, pog, order, fx => state.pageEls.get(fx.id)));
  renderSidePanel();
  if ($('#ed-find')?.value) edFind(); // 다시 그린 뒤에도 찾기 표시 유지
  requestAnimationFrame(() => state.pageEls.forEach(fitHandles));
}
// 묶음·매대가 페이지 밖으로 나가도 '✥' 손잡이와 크기 네모는 페이지 안 보이는 곳에 붙여 둠 (사용자: 밖으로 나가면 잡을 수 없었음)
function fitHandles(block) {
  const page = block?.querySelector('.page'); if (!page) return;
  const hs = block.querySelectorAll('.cv-blk-h, .cv-blk-r'); if (!hs.length) return;
  const pr = page.getBoundingClientRect(); if (!pr.width) return;
  const box = { l: pr.left + 2, t: pr.top + 2, r: pr.right - 2, b: pr.bottom - 2 };
  hs.forEach(el => {
    el.style.transform = '';
    const r = el.getBoundingClientRect(), k = r.width / (el.offsetWidth || 1) || 1;
    const x = Math.min(Math.max(r.left, box.l), box.r - r.width) - r.left, y = Math.min(Math.max(r.top, box.t), box.b - r.height) - r.top;
    el.classList.toggle('pinned', Math.abs(x) > 1 || Math.abs(y) > 1);
    if (Math.abs(x) > 1 || Math.abs(y) > 1) el.style.transform = `translate(${x / k}px, ${y / k}px)`;
  });
}
/* POG 만들기 안에서 찾기 (사용자): 매대명(헤더·POG 원래 이름)·카테고리(팀명)·매대 타입·제품명·제품코드·추가 페이지 제목.
   온라인 POG 찾기(vwFind)와 같은 방식 — 맞는 페이지는 빨간 테두리, 제품은 깜빡임, 썸네일도 빨간 테두리, ◀ ▶·Enter로 이동 */
const ef = { hits: [], i: -1 };
function edFind(jump = 0) {
  const q = findNorm($('#ed-find').value), pages = $('#ed-pages'), mode = $('#ed-find-mode').value; // page = 매대명(페이지명), item = 제품명·제품코드
  $$('.fd-dim', pages).forEach(x => x.classList.remove('fd-dim'));
  $$('.fd-hit', pages).forEach(x => x.classList.remove('fd-hit'));
  $$('.find-page', pages).forEach(x => x.classList.remove('find-page'));
  $$('#ed-thumbs .thumb.find-hit').forEach(x => x.classList.remove('find-hit'));
  const n = $('#ed-find-n'), prev = ef.hits[ef.i];
  ef.hits = []; ef.i = -1;
  $('#ed-find-prev').classList.toggle('hidden', !q); $('#ed-find-next').classList.toggle('hidden', !q);
  if (!q) { n.textContent = ''; return; }
  let items = 0;
  for (const f of composeFx(sortedFx())) {
    const blk = state.pageEls.get(f.id); if (!blk) continue;
    const fxHit = mode === 'page' && findNorm([displayName(f), f.headerName, f.mdName].join('|')).includes(q);
    const its = mode === 'item' ? (f.items || []).filter(it => findNorm(it.name).includes(q) || findNorm(it.code).includes(q)) : [];
    if (!fxHit && !its.length) continue;
    ef.hits.push(f.id); items += its.length;
    if (fxHit) blk.classList.add('find-page');
    const cv = $('.pcanvas .cv', blk);
    if (its.length && cv) { cv.classList.add('fd-dim'); its.forEach(it => cv.querySelector(`.cv-item[data-id="${CSS.escape(String(it.id))}"]`)?.classList.add('fd-hit')); }
  }
  $$('#ed-thumbs .thumb').forEach(t => { if (ef.hits.includes(t._fxId)) t.classList.add('find-hit'); });
  n.textContent = ef.hits.length ? `${ef.hits.length}쪽${items ? ` · 제품 ${items}개` : ''}` : '없어요';
  n.classList.toggle('none', !ef.hits.length);
  ef.i = Math.max(0, ef.hits.indexOf(prev));
  if (jump && ef.hits.length && !ef.hits.includes(prev)) ef.i = -1; // 새로 찾으면 첫 쪽부터
  if (jump && ef.hits.length) {
    ef.i = prev && ef.hits.includes(prev) ? (ef.hits.indexOf(prev) + jump + ef.hits.length) % ef.hits.length : 0;
    const id = ef.hits[ef.i];
    state.pageEls.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setEdActive(id);
  }
}
let edFindT = 0;
$('#ed-find').addEventListener('input', () => { clearTimeout(edFindT); edFindT = setTimeout(() => { ef.hits = []; edFind(1); }, 250); });
$('#ed-find').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); edFind(e.shiftKey ? -1 : 1); } });
$('#ed-find-mode').addEventListener('change', e => {
  $('#ed-find').placeholder = e.target.value === 'item' ? '제품명·제품코드 찾기' : '매대명(페이지) 찾기';
  ef.hits = []; edFind(1); $('#ed-find').focus();
});
$('#ed-find-next').onclick = () => edFind(1);
$('#ed-find-prev').onclick = () => edFind(-1);

// 제품 선택 (앞뒤 순서 바꾸기용)
function selectItem(block, id) {
  if ((block._selItem || null) === (id || null)) return;
  block._selItem = id || null;
  block.querySelectorAll('.cv-item.isel').forEach(el => el.classList.remove('isel'));
  if (id) block.querySelector(`.page .cv-item[data-id="${CSS.escape(id)}"]`)?.classList.add('isel');
  renderSidePanel();
}
function moveItemZ(pogId, fx, id, dir) {
  const zs = (fx.items || []).map(it => fx.itemZ?.[it.id] ?? it.z ?? 0);
  const map = { ...(fx.itemZ || {}), [id]: dir > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1 };
  fx.itemZ = map; // 바로 보이게
  const block = state.pageEls.get(fx.id); if (block) applyItemZ(block, fx);
  saveFx(pogId, fx.id, 'itemZ', map);
}

// 오른쪽 패널 '매대 나누기' 칸
function splitSection(pog, fx, block) {
  const btn = (t, fn, cls = '') => h('button', { class: 'btn small ' + cls, onclick: fn }, t);
  const sec = (t, ...k) => h('section', { class: 'se-sec' }, h('h4', {}, t), ...k);
  if (fx.merged?.length) return sec('매대 나누기', h('p', { class: 'se-help' }, '매대를 붙인 페이지는 나눌 수 없어요. 붙이기를 취소하고 나눠 주세요.'));
  const bl = fx.blocks || [], selBase = block._selBlock === BASE && (bl.length || fx.base), sel = !selBase && block._selBlock && bl.find(b => b.id === block._selBlock);
  const pct = g => { const x = Math.round((g?.sx ?? g?.s ?? 1) * 100), y = Math.round((g?.sy ?? g?.s ?? 1) * 100); return x === y ? `${x}%` : `가로 ${x}% · 세로 ${y}%`; };
  if (state.split?.id === fx.id) {
    const n = state.split.items.size;
    return sec('매대 나누기', h('p', { class: 'se-help' }, HAS_TOUCH
        ? '손가락으로 제품 위를 쓱 긁으면 지나간 제품이 골라져요 (여러 번 긁으면 더해져요). 잘못 고른 제품·넣을 선반·줄은 톡 눌러서 빼거나 넣어요. 고른 제품과 선반·파이프·줄(줄줄 매대)이 한 묶음이 되고, 나머지는 그대로 남아요.'
        : '제품 위에서 시작해 끌면 지나간 제품이 골라지고(긁기), 빈 곳에서 시작해 끌면 네모로 골라요. 여러 번 하면 더해져요. 톡 누르면 그 제품·선반을 빼거나 넣어요. 고른 제품과 선반·파이프·줄(줄줄 매대)이 한 묶음이 되고, 나머지는 그대로 남아요.'),
      h('div', { class: 'se-btns' }, btn(`✂ 고른 ${n}개를 묶음으로 나누기`, () => makeBlock(pog.id, fx, block), 'primary'), btn('다시 고르기', () => { state.split.items.clear(); state.split.props.clear(); paintSplit(block); renderSidePanel(); }, 'ghost'), btn('취소', () => { state.split = null; paintSplit(block); renderSidePanel(); }, 'ghost')));
  }
  return sec('매대 나누기', h('p', { class: 'se-help' }, '제품 일부를 떼어 따로 묶음으로 만들어요. 묶음은 회색 바탕을 따로 칠하고, ✥를 끌어 옮기거나 Ctrl+X → 다른 페이지에서 Ctrl+V로 옮길 수 있어요.'),
    h('div', { class: 'se-btns' }, btn('✂ 매대 나누기', () => { state.split = { id: fx.id, items: new Set(), props: new Set() }; block._selBlock = null; paintSplit(block); renderSidePanel(); }),
      btn('↔ 매대 위치·크기 조정', () => { if (!bl.length && !fx.base) saveGroup(pog.id, fx, BASE, {}); else { block._selBlock = BASE; paintBlockSel(block); renderSidePanel(); } }, 'ghost')), // 늘 보임 (사용자)
    bl.length || fx.base ? h('p', { class: 'se-help' }, "그림의 '✥' 표시를 끌면 옮겨지고, 오른쪽 아래 작은 네모를 끌면 크기가 바뀌어요 (제품이 있으면 비율 그대로, 제품 없는 빈 매대만 가로·세로 따로). 누르면 골라져요.") : null,
    selBase ? h('div', { class: 'se-kid' }, h('span', {}, '선택: ', h('b', {}, '원래 매대'), ` · 크기 ${pct(fx.base)}`)) : null,
    selBase ? h('div', { class: 'se-btns' }, btn('제자리로', () => saveGroup(pog.id, fx, BASE, { dx: 0, dy: 0 }), 'ghost'), btn('원래 크기', () => saveGroup(pog.id, fx, BASE, { s: 1, sx: 1, sy: 1 }), 'ghost'),
      fx.base ? btn('처음 상태로', () => resetBase(pog.id, fx), 'ghost') : null) : null,
    sel ? h('div', { class: 'se-kid' }, h('span', {}, '선택한 묶음: ', h('b', {}, `묶음 ${bl.indexOf(sel) + 1}`), ` · 제품 ${(sel.items || []).length}개 · 크기 ${pct(sel)}`)) : null,
    sel ? h('div', { class: 'se-btns' }, btn('✂ 잘라내기 (Ctrl+X)', () => cutBlock(pog.id, fx, sel)), btn('제자리로', () => saveGroup(pog.id, fx, sel.id, { dx: 0, dy: 0 }), 'ghost'),
      btn('원래 크기', () => saveGroup(pog.id, fx, sel.id, { s: 1, sx: 1, sy: 1 }), 'ghost'),
      btn('묶음 풀기', () => saveBlocks(pog.id, fx, bl.filter(b => b.id !== sel.id), sel), 'ghost')) : null);
}
// 나누기: 끌어서 네모 → 걸친 제품(과 완전히 들어간 선반·파이프)을 고름
function splitBand(e, block) {
  e.preventDefault();
  const cvIn = block.querySelector('.pcanvas .cv-in'); if (!cvIn) return;
  const host = block.querySelector('.pcanvas'), r0 = host.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
  const band = h('div', { class: 'split-band' }); host.append(band);
  const box = ev => ({ l: Math.min(sx, ev.clientX), t: Math.min(sy, ev.clientY), r: Math.max(sx, ev.clientX), b: Math.max(sy, ev.clientY) });
  const mv = ev => { const b = box(ev), z = ZP(); Object.assign(band.style, { left: (b.l - r0.left) / z + 'px', top: (b.t - r0.top) / z + 'px', width: (b.r - b.l) / z + 'px', height: (b.b - b.t) / z + 'px' }); };
  const up = ev => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); band.remove();
    const b = box(ev); if (b.r - b.l < 3 && b.b - b.t < 3) return;
    cvIn.querySelectorAll('.cv-item').forEach(el => { const q = el.getBoundingClientRect(); if (q.right >= b.l && q.left <= b.r && q.bottom >= b.t && q.top <= b.b) state.split.items.add(el.dataset.id); });
    // 집기는 네모 안에 다 들어간 것만
    cvIn.querySelectorAll('.cv-prop').forEach(el => { const q = el.getBoundingClientRect(); if (el.dataset.pid && q.left >= b.l - 1 && q.right <= b.r + 1 && q.top >= b.t - 1 && q.bottom <= b.b + 1) state.split.props.add(el.dataset.pid); });
    paintSplit(block); renderSidePanel();
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
function paintSplit(block) {
  const on = state.split?.id === block._fx;
  block.classList.toggle('splitting', on);
  block.querySelectorAll('.cv-item').forEach(el => el.classList.toggle('split-pick', on && state.split.items.has(el.dataset.id)));
  block.querySelectorAll('.cv-prop').forEach(el => el.classList.toggle('split-pick', on && !!el.dataset.pid && state.split.props.has(el.dataset.pid)));
}
/* 매대 나누기에서 고르기 (사용자: 손가락으로 긁으면 지나간 제품이 한 묶음)
   - 긁기: 손가락(터치)은 늘, 마우스는 제품 위에서 시작했을 때. 지나간 제품을 더함 (선반·파이프는 긁어도 안 골라짐 — 얇아서 자꾸 걸림)
   - 네모: 마우스로 빈 곳에서 시작해 끌 때 (예전 방식)
   - 톡 누르기: 그 자리의 제품(없으면 선반·파이프)을 넣거나 뺌
   - 두 손가락이 닿으면 긁기 멈춤 */
/* 아이패드 사파리: 매대 나누기 중 그림 위에서 손가락을 대면 기본 스크롤을 바로 막음.
   touch-action만으로는 사파리가 스크롤을 먼저 시작해서 긁기가 중간에 끊겼음 (pointercancel → 처음 몇 개만 잡힘 · 사용자)
   두 손가락은 막지 않음 (확대·화면 이동) */
{
  const inSplit = e => e.touches.length === 1 && e.target.closest?.('.page-block.splitting .pcanvas');
  document.addEventListener('touchstart', e => { if (inSplit(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', e => { if (inSplit(e)) e.preventDefault(); }, { passive: false });
}
function splitPointer(e, block) {
  const cvIn = block.querySelector('.pcanvas .cv-in'); if (!cvIn) return;
  const touch = e.pointerType === 'touch', tol = touch ? 12 : 2; // 손가락은 굵어서 넓게
  const items = [...cvIn.querySelectorAll('.cv-item')].map(el => ({ id: el.dataset.id, r: el.getBoundingClientRect() }));
  const props = [...cvIn.querySelectorAll('.cv-prop')].filter(el => el.dataset.pid).map(el => ({ id: el.dataset.pid, r: el.getBoundingClientRect() }));
  const hitAt = (list, x, y, t) => list.filter(o => x >= o.r.left - t && x <= o.r.right + t && y >= o.r.top - t && y <= o.r.bottom + t);
  if (!touch && !hitAt(items, e.clientX, e.clientY, 0).length) { splitBand(e, block); return; } // 마우스로 빈 곳 → 네모
  e.preventDefault();
  const host = block.querySelector('.pcanvas'), r0 = host.getBoundingClientRect(), pid = e.pointerId, z = ZP();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'split-trail');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); svg.append(line); host.append(svg);
  const pts = [[e.clientX, e.clientY]]; let moved = false, stop = false, last = [e.clientX, e.clientY];
  const drawTrail = () => line.setAttribute('points', pts.map(([x, y]) => `${(x - r0.left) / z},${(y - r0.top) / z}`).join(' '));
  const grab = (x, y) => { let n = 0; for (const o of hitAt(items, x, y, tol)) if (!state.split.items.has(o.id)) { state.split.items.add(o.id); n++; } return n; };
  const others = new Set();
  const down2 = ev => { if (ev.pointerType === 'touch' && ev.pointerId !== pid) { others.add(ev.pointerId); stop = true; } };
  const mv = ev => {
    if (ev.pointerId !== pid || stop) return;
    const x = ev.clientX, y = ev.clientY;
    if (!moved && Math.hypot(x - pts[0][0], y - pts[0][1]) < 5) return;
    if (!moved) { moved = true; grab(pts[0][0], pts[0][1]); }
    const [lx, ly] = last, steps = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / 5)); // 빨리 긁어도 작은 제품을 건너뛰지 않게 5px마다
    let n = 0; for (let k = 1; k <= steps; k++) n += grab(lx + (x - lx) * k / steps, ly + (y - ly) * k / steps);
    last = [x, y]; pts.push([x, y]); drawTrail();
    if (n) paintSplit(block);
  };
  const up = ev => {
    if (ev.pointerId !== pid) return;
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('pointerdown', down2, true);
    svg.classList.add('fade'); setTimeout(() => svg.remove(), 350);
    if (!moved && !stop) { // 톡: 넣거나 빼기
      const it0 = hitAt(items, e.clientX, e.clientY, 2)[0], pr = !it0 && hitAt(props, e.clientX, e.clientY, 10)[0], it = it0 || (!pr && hitAt(items, e.clientX, e.clientY, tol)[0]); // 톡: 바로 그 제품 → 선반·파이프 → 근처 제품
      if (it) state.split.items.has(it.id) ? state.split.items.delete(it.id) : state.split.items.add(it.id);
      else if (pr) state.split.props.has(pr.id) ? state.split.props.delete(pr.id) : state.split.props.add(pr.id);
    }
    paintSplit(block); renderSidePanel();
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  window.addEventListener('pointerdown', down2, true);
}
function saveBlocks(pogId, fx, list, unbake, keepSel = null) {
  const ug = undoGroup();
  jjSave(pogId, fx, ug);
  if (unbake && (unbake.dx || unbake.dy || (unbake.s && unbake.s !== 1))) { // 묶음 풀기: 옮긴 자리·크기 그대로 두기
    const ids = new Set((unbake.items || []).map(String)), pids = new Set((unbake.props || []).map(String)), T = withBlocks(fx);
    const bake = (list, tl, set) => list.map((o, i) => { if (!set.has(String(o.id))) return o; const { _b, ...t } = tl[i]; return t; });
    const items = bake(fx.items || [], T.items, ids), props = bake(fx.props || [], T.props, pids);
    saveFx(pogId, fx.id, 'items', items, ug); saveFx(pogId, fx.id, 'props', props, ug); fx.items = items; fx.props = props;
  }
  if (list.length && !fx.frame) { const fr = cvBox(fx); saveFx(pogId, fx.id, 'frame', fr, ug); fx.frame = fr; } // 처음 나눌 때의 매대 범위를 기억
  if (!list.length && fx.frame) { saveFx(pogId, fx.id, 'frame', null, ug); fx.frame = null; }
  saveFx(pogId, fx.id, 'blocks', list, ug); fx.blocks = list;
  rebuildPage(fx.id, keepSel);
}
// 페이지 그림 다시 그리기 (묶음이 바뀌었을 때)
function rebuildPage(id, selBlock) { const el = state.pageEls.get(id); if (el) el._itemSig = null; renderEditorPages(); const nb = state.pageEls.get(id); if (nb && selBlock !== undefined) { nb._selBlock = selBlock; paintBlockSel(nb); } }
function makeBlock(pogId, fx, block) {
  const s = state.split; if (!s?.items.size) { toast('먼저 매대 그림 위를 끌어서 제품을 골라 주세요'); return; }
  // 줄줄 매대: 고른 제품이 걸린 줄(위 칸·아래 칸)은 따로 안 눌러도 같이 묶음으로 (사용자)
  const picked = (fx.items || []).filter(o => s.items.has(String(o.id)));
  (fx.props || []).filter(p => p.jj && picked.some(o => o.x < p.x + p.w && o.x + o.w > p.x && o.y < p.y + p.h && o.y + o.h > p.y)).forEach(p => s.props.add(String(p.id)));
  const ids = [...s.items], pids = [...s.props];
  // 다른 묶음에 있던 것은 그 묶음에서 빼서 새 묶음으로 (옮겨 둔 위치는 그대로)
  let bl = (fx.blocks || []).map(b => ({ ...b, items: (b.items || []).filter(i => !s.items.has(String(i))), props: (b.props || []).filter(i => !s.props.has(String(i))) }));
  const moved = (fx.blocks || []).find(b => (b.items || []).some(i => s.items.has(String(i))));
  bl = bl.filter(b => (b.items || []).length || (b.props || []).length);
  const nb = { id: blkId(), items: ids, props: pids, dx: moved?.dx || 0, dy: moved?.dy || 0 };
  state.split = null;
  saveBlocks(pogId, fx, [...bl, nb], null, nb.id);
  toast(`제품 ${ids.length}개를 묶음으로 나눴어요. ✥를 끌어 옮기거나 Ctrl+X로 잘라낼 수 있어요`);
}
// 묶음·원래 매대의 위치·크기 저장 (patch = {dx, dy, s})
const groupOf = (fx, bid) => bid === BASE ? { id: BASE, base: true, dx: 0, dy: 0, s: 1, ...(fx.base || {}) } : (fx.blocks || []).find(x => x.id === bid);
function saveGroup(pogId, fx, bid, patch, keepSel = bid) {
  if (bid !== BASE) { saveBlocks(pogId, fx, (fx.blocks || []).map(x => x.id === bid ? { ...x, ...patch } : x), null, keepSel); return; }
  const ug = undoGroup();
  if (!fx.frame) { const fr = cvBox(fx); saveFx(pogId, fx.id, 'frame', fr, ug); fx.frame = fr; } // 처음 옮길 때의 매대 범위를 틀로
  const nb = { dx: 0, dy: 0, s: 1, ...(fx.base || {}), ...patch };
  saveFx(pogId, fx.id, 'base', nb, ug); fx.base = nb;
  rebuildPage(fx.id, keepSel);
}
// 원래 매대 처음 상태로 (위치·크기 조정 없애기)
function resetBase(pogId, fx) {
  const ug = undoGroup();
  saveFx(pogId, fx.id, 'base', null, ug); fx.base = null;
  if (!(fx.blocks || []).length) { saveFx(pogId, fx.id, 'frame', null, ug); fx.frame = null; }
  rebuildPage(fx.id, null);
}
// 크기 조절: 묶음 오른쪽 아래 손잡이를 끌면 왼쪽 위 기준으로 커지고 작아짐
function resizeBlock(e, block, bid) {
  e.preventDefault(); e.stopPropagation();
  const fx = state.fixtures.get(block._fx), b = fx && groupOf(fx, bid); if (!b) return;
  const cvIn = block.querySelector('.pcanvas .cv-in'), sc = (cvIn?._sc || 1) * ZP();
  const g = cvIn?.querySelector(`.cv-bgrp[data-b="${CSS.escape(bid)}"]`), box = cvIn?.querySelector(`.cv-blk[data-b="${CSS.escape(bid)}"]`); if (!g || !box) return;
  const l = parseFloat(box.style.left) + 4, t = parseFloat(box.style.top) + 4, w0 = Math.max(10, parseFloat(box.style.width) - 8), h0 = Math.max(10, parseFloat(box.style.height) - 8);
  g.style.transformOrigin = `${l}px ${t}px`;
  const sx = e.clientX, sy = e.clientY, lim = v => Math.min(5, Math.max(0.2, v)); let kx = 1, ky = 1;
  // 제품이 없는 빈 매대(회색 바탕·집기만)는 가로·세로를 따로 (비율이 바뀜, Shift = 비율 그대로).
  // 제품이 있는 묶음·매대는 비율 그대로 크기만 (사용자)
  const free = !g.querySelector('.cv-item');
  const mv = ev => {
    kx = (w0 + (ev.clientX - sx) / sc) / w0; ky = (h0 + (ev.clientY - sy) / sc) / h0;
    if (!free || ev.shiftKey) kx = ky = (kx + ky) / 2;
    kx = lim(kx); ky = lim(ky); g.style.transform = `scale(${kx}, ${ky})`;
  };
  const up = () => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
    if (Math.abs(kx - 1) < 0.01 && Math.abs(ky - 1) < 0.01) { g.style.transform = ''; return; }
    const r3 = v => Math.round(v * 1000) / 1000, bx = b.sx ?? b.s ?? 1, by = b.sy ?? b.s ?? 1;
    saveGroup(state.currentPog.id, fx, bid, { sx: r3(bx * kx), sy: r3(by * ky), s: r3(bx * kx) });
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
// 묶음 끌어 옮기기 (그림 위 ✥). 살짝만 누르면 선택
function dragBlock(e, block, bid) {
  e.preventDefault(); e.stopPropagation();
  const fx = state.fixtures.get(block._fx), b = fx && groupOf(fx, bid); if (!b) return;
  const cvIn = block.querySelector('.pcanvas .cv-in'), g = cvIn?.querySelector(`.cv-bgrp[data-b="${CSS.escape(bid)}"]`), sc = (cvIn?._sc || 1) * ZP();
  const sx = e.clientX, sy = e.clientY; let moved = false, ddx = 0, ddy = 0;
  const mv = ev => { ddx = (ev.clientX - sx) / sc; ddy = (ev.clientY - sy) / sc; if (Math.abs(ddx) + Math.abs(ddy) > 2) moved = true; if (g) g.style.transform = `translate(${ddx}px, ${ddy}px)`; };
  const up = () => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
    if (!moved) { block._selBlock = block._selBlock === bid ? null : bid; paintBlockSel(block); renderSidePanel(); return; }
    saveGroup(state.currentPog.id, fx, bid, { dx: Math.round((b.dx || 0) + ddx), dy: Math.round((b.dy || 0) + ddy) });
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
function paintBlockSel(block) { block.querySelectorAll('.cv-blk').forEach(el => el.classList.toggle('on', el.dataset.b === block._selBlock)); }
// 잘라내기 → 다른 페이지에서 붙여넣기 (붙여넣을 때 실제로 옮김)
function cutBlock(pogId, fx, b) {
  state.clip = { pogId, from: fx.id, bid: b.id, n: (b.items || []).length };
  toast(`묶음(제품 ${state.clip.n}개)을 잘라냈어요. 옮길 페이지를 보고 Ctrl+V (또는 오른쪽 '여기에 붙여넣기')`);
  renderSidePanel();
}
function pasteBlock(pogId, to) {
  const c = state.clip; if (!c || c.pogId !== pogId) return;
  const from = state.fixtures.get(c.from), b = (from?.blocks || []).find(x => x.id === c.bid);
  if (!from || !b) { state.clip = null; toast('잘라낸 묶음을 찾지 못했어요'); renderSidePanel(); return; }
  if (to.id === from.id) { toast('다른 페이지에서 붙여넣어 주세요'); return; }
  if (to.merged?.length) { toast('매대를 붙인 페이지에는 붙여넣을 수 없어요'); return; } // 빈 페이지에도 붙일 수 있음 (사용자)
  const ids = new Set((b.items || []).map(String)), pids = new Set((b.props || []).map(String));
  const mvI = (from.items || []).filter(o => ids.has(String(o.id))), mvP = (from.props || []).filter(o => pids.has(String(o.id)));
  if (!mvI.length && !mvP.length) { state.clip = null; return; }
  // 붙일 자리: 붙일 페이지 매대 틀 안 오른쪽 끝에 맞춰서 (화면 안에 보여야 끌어서 옮길 수 있음 · 사용자). 높이는 틀 안으로
  const F = withBlocks(from), strip = ({ _b, ...o }) => o;
  const tI = F.items.filter(o => ids.has(String(o.id))).map(strip), tP = F.props.filter(o => pids.has(String(o.id))).map(strip); // 옮긴 자리·크기 반영
  const fr = to.frame || cvBox(to), mv = [...tI, ...tP];
  const left = Math.min(...mv.map(o => o.x)), bw = Math.max(...mv.map(o => o.x + o.w)) - left, top = Math.min(...mv.map(o => o.y));
  const shift = fr ? Math.max(fr.x0, fr.x1 - bw) - left : -left;
  const vshift = fr ? Math.min(Math.max(top, fr.y0), Math.max(fr.y0, fr.y1 - 30)) - top : 0;
  const used = new Set([...(to.items || []), ...(to.props || [])].map(o => String(o.id)));
  const uid = id => { let s = String(id), k = 1; while (used.has(s)) s = `${id}~${k++}`; used.add(s); return s; };
  const nI = tI.map(o => ({ ...o, id: uid(o.id), x: o.x + shift, y: o.y + vshift }));
  const nP = tP.map(o => ({ ...o, id: uid(o.id), x: o.x + shift, y: o.y + vshift }));
  const nb = { id: blkId(), items: nI.map(o => o.id), props: nP.map(o => o.id), dx: 0, dy: 0 };
  const zFrom = { ...(from.itemZ || {}) }, zTo = { ...(to.itemZ || {}) };
  tI.forEach((o, i) => { if (zFrom[o.id] != null) { zTo[nI[i].id] = zFrom[o.id]; delete zFrom[o.id]; } });
  const ug = undoGroup();
  jjSave(pogId, from, ug); jjSave(pogId, to, ug);
  const fI = (from.items || []).filter(o => !ids.has(String(o.id))), fP = (from.props || []).filter(o => !pids.has(String(o.id)));
  const fB = (from.blocks || []).filter(x => x.id !== b.id);
  saveFx(pogId, from.id, 'items', fI, ug); saveFx(pogId, from.id, 'props', fP, ug); saveFx(pogId, from.id, 'blocks', fB, ug); saveFx(pogId, from.id, 'itemZ', zFrom, ug);
  saveFx(pogId, to.id, 'items', [...(to.items || []), ...nI], ug); saveFx(pogId, to.id, 'props', [...(to.props || []), ...nP], ug);
  const toFrame = to.frame || cvBox(to) || cvBox({ items: nI, props: nP }), fromFrame = fB.length ? from.frame || null : null; // 붙일 페이지는 붙이기 전 매대 범위를 틀로
  saveFx(pogId, to.id, 'frame', toFrame, ug); saveFx(pogId, from.id, 'frame', fromFrame, ug);
  saveFx(pogId, to.id, 'blocks', [...(to.blocks || []), nb], ug); saveFx(pogId, to.id, 'itemZ', zTo, ug);
  Object.assign(from, { items: fI, props: fP, blocks: fB, itemZ: zFrom, frame: fromFrame });
  Object.assign(to, { items: [...(to.items || []), ...nI], props: [...(to.props || []), ...nP], blocks: [...(to.blocks || []), nb], itemZ: zTo, frame: toFrame });
  state.clip = null;
  rebuildPage(from.id, null); rebuildPage(to.id, nb.id);
  toast(`'${displayName(to)}'에 붙였어요. ✥를 끌어 자리를 맞추세요 (Ctrl+Z로 되돌릴 수 있어요)`);
}
document.addEventListener('keydown', e => {
  if (state.view !== 'pog-make' || !state.edEditable || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase(); if (k !== 'x' && k !== 'v') return;
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
  if ($('#modal-root')?.children.length) return;
  const pog = state.currentPog, fx = state.fixtures.get(state.edActive), block = state.pageEls.get(state.edActive);
  if (!pog || !fx) return;
  if (k === 'x') { const b = block?._selBlock && (fx.blocks || []).find(x => x.id === block._selBlock); if (!b) return; e.preventDefault(); cutBlock(pog.id, fx, b); }
  else if (state.clip) { e.preventDefault(); pasteBlock(pog.id, fx); }
});

/* ---------- 오른쪽 편집 패널: 지금 보고 있는 페이지의 메모 도구·메모·사진·페이지 버튼 ---------- */
// 오른쪽 패널 ▲▼: 옮긴 페이지를 계속 따라감 (화면이 그 페이지로 같이 움직이고, 패널도 그 페이지 그대로).
// 예전엔 화면은 제자리라 그 자리에 새로 온 페이지가 '지금 페이지'가 돼서, 다시 누르면 다른 페이지가 움직였음 (사용자)
async function moveFollow(pogId, id, dir) {
  // 옆 페이지와 도면 연결(매대명·도면 매대)도 바꿀지 (사용자): 예 → 순서를 바꾸면서 도면 자리는 그대로 (예: 블박1 자리 페이지 ↔ 블박2 자리 페이지)
  const ids = shownIds(), i = ids.indexOf(id), nb = ids[i + dir] && state.fixtures.get(ids[i + dir]), me0 = state.fixtures.get(id);
  let swap = false; const a0 = me0 ? displayName(me0) : '', b0 = nb ? displayName(nb) : '';
  if (nb && me0 && (nb.drawingRef || me0.drawingRef)) {
    swap = await askYesNo(`${dir < 0 ? '앞' : '뒤'} 페이지의 도면 위치와 바꾸시겠습니까?`,
      `'${displayName(me0)}' ↔ '${displayName(nb)}'\n예: 순서를 바꾸면서 매대명·도면 연결도 서로 바꿔요 (도면 자리 순서는 그대로).\n아니오: 순서만 바꿔요.`);
    if (swap === null) return;
  }
  state.edPin = { id, t: Date.now() + 2500 };
  const g = undoGroup();
  if (swap) {
    const a = { ref: me0.drawingRef || null, name: me0.headerName || '' }, b = { ref: nb.drawingRef || null, name: nb.headerName || '' };
    saveFx(pogId, me0.id, 'drawingRef', b.ref, g); saveFx(pogId, me0.id, 'headerName', b.name, g);
    saveFx(pogId, nb.id, 'drawingRef', a.ref, g); saveFx(pogId, nb.id, 'headerName', a.name, g);
    me0.drawingRef = b.ref; me0.headerName = b.name; nb.drawingRef = a.ref; nb.headerName = a.name;
    [[me0, b.name], [nb, a.name]].forEach(([f, n]) => { const inp = state.pageEls.get(f.id)?.querySelector('[data-f="headerName"]'); if (inp) inp.value = n; });
  }
  await movePage(pogId, id, dir, swap ? { g, act: `페이지 ${dir < 0 ? '앞으로' : '뒤로'} + 도면 위치 바꿈`, what: `${a0} ↔ ${b0}` } : { g });
  const go = () => { state.pageEls.get(id)?.scrollIntoView({ block: 'start' }); state.edActive = null; setEdActive(id); };
  setTimeout(go, 250); setTimeout(go, 800);
}
function setEdActive(id) {
  if (state.edActive === id) return;
  state.edActive = id;
  edThumbs.setActive(id);
  renderSidePanel();
}
const NARROW = matchMedia('(max-width: 900px)');
// 사이트 전체 크기 (style.css의 html zoom: PC에서 80% · 사용자). 마우스로 끌 때 화면 px → 사이트 안 px로 바꿀 때 나눔
const ZM = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
/* 아이패드 가로 화면: POG 페이지(A4 세로)를 화면 높이에 딱 맞게 줄임 (사용자: 가로로 보면 페이지가 자꾸 위아래로 스크롤됨)
   body.pfit + --pf (페이지에만 zoom). 페이지 안에서 끄는 기능은 ZM() 대신 ZP()(= 사이트 zoom × 페이지 zoom)로 나눔 */
let PF = 1;
const ZP = () => ZM() * PF;
function setPf() {
  const box = ['#ed-pages', '#tr-pages', '#vw-pages'].map(s => $(s)).find(el => el && el.clientHeight > 0);
  const on = HAS_TOUCH && window.innerWidth > window.innerHeight && window.innerWidth > 700 && !!box;
  const pf = on ? Math.max(0.3, Math.min(1, (box.clientHeight - 36) / 1123)) : 1;
  document.body.classList.toggle('pfit', on && pf < 1);
  if (pf === PF) return;
  PF = on && pf < 1 ? pf : 1; document.documentElement.style.setProperty('--pf', String(PF));
}
window.addEventListener('resize', () => setPf());
{ const ro = new ResizeObserver(() => setPf()); ['#ed-pages', '#tr-pages', '#vw-pages'].forEach(s => { const el = $(s); if (el) ro.observe(el); }); }
const HAS_TOUCH = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0; // 터치 화면(아이패드·휴대폰)
NARROW.addEventListener?.('change', () => renderSidePanel());
function renderSidePanel() {
  const box = $('#ed-side'), pog = state.currentPog;
  if (!box || !pog?.status) return;
  const a = document.activeElement;
  if (box.contains(a) && /TEXTAREA|INPUT|SELECT/.test(a.tagName)) return; // 입력 중이면 그대로 둠
  const id = state.edActive || '__cover', ed = state.edEditable;
  const sec = (title, ...kids) => h('section', { class: 'se-sec' }, h('h4', {}, title), ...kids);
  const btn = (t, fn, cls = '') => h('button', { class: 'btn small ' + cls, onclick: fn }, t);
  const nodes = [];
  // 대표 담당자 칸은 표지를 볼 때 오른쪽 패널에 (사용자: 위 막대가 복잡해서 옮김).
  // 화면 폭이 좁아(900px 이하) 오른쪽 패널이 안 보이면 위 막대에 그대로 보여줌 (예전에 여기서 담당자 칸이 사라졌음 · 사용자)
  const mgrBox = $('#ed-mgr-box'), holder = $('#ed-mgr-holder'), narrow = NARROW.matches;
  holder.append(mgrBox); holder.classList.toggle('hidden', !narrow);
  if (id === '__cover') {
    nodes.push(h('div', { class: 'se-head' }, h('b', {}, '표지'), h('span', { class: 'mut' }, '매장명은 표지에서 바로 눌러 고쳐도 돼요')));
    // 표지 매장명 (가운데 큰 글씨) · 아래 매장명 (모든 페이지 아래) (사용자)
    const inp = (f, ph) => { const el = h('input', { class: 'se-input', value: pog[f] || '', placeholder: ph }); el.disabled = !ed; el.addEventListener('input', () => { savePog(pog.id, f, el.value); const c = state.coverEl && $(f === 'coverTitle' ? '.cover-title' : '.cover-store', state.coverEl); if (c) c.value = el.value; }); return el; };
    nodes.push(sec('매장명', h('label', { class: 'se-lab' }, '표지 가운데 큰 글씨'), inp('coverTitle', autoCoverTitle(pog) || '매장명'),
      h('label', { class: 'se-lab' }, '표지·모든 페이지 아래'), inp('branchName', pog.storeName || '매장명'),
      h('p', { class: 'se-help' }, '비우면 POG 사이트 매장명이 들어가요.')));
    if (!narrow) nodes.push(sec('대표 POG 담당자', h('p', { class: 'se-help' }, '모든 페이지 아래 \'POG 담당자\'에 들어가요. 페이지마다 다르면 그 페이지 아래 칸에서 따로 고를 수 있어요.'), mgrBox));
    const emp = emptyPages();
    if (ed) nodes.push(sec('페이지', h('div', { class: 'se-btns' }, btn('+ 표지 뒤에 빈 페이지 추가', () => addFreePage(pog.id, (sortedFx()[0]?.order ?? 0) - 1)),
      emp.length ? btn(`🧹 제품 없는 매대 페이지 지우기 (${emp.length}장)`, () => deleteEmptyPages(pog.id), 'danger') : null)));
    if (ed) nodes.push(sec('도면', h('p', { class: 'se-help' }, '페이지마다 도면 매대를 한꺼번에 연결하고, 온라인 도면에서 매긴 번호 순서로 페이지를 바꿀 수 있어요.'), h('div', { class: 'se-btns' }, btn('📐 POG랑 도면 연결하기', () => openPogDwLink(pog)))));
  } else {
    const fx = state.fixtures.get(id), block = state.pageEls.get(id);
    if (!fx || !block) { box.replaceChildren(); return; }
    const free = fx.kind === 'free', out = (fx.outsideItems || []).length;
    nodes.push(h('div', { class: 'se-head' }, h('b', {}, displayName(fx)),
      h('span', { class: 'mut' }, free ? '추가 페이지' : `POG 원본: ${origName(fx)} · 제품 ${(fx.items || []).length}개`)));
    if (out) nodes.push(h('div', { class: 'se-warn' }, `매대 밖이라 뺀 제품 ${out}개`,
      ed ? btn('되살리기', () => restoreOutside(pog.id, fx), 'ghost') : null));
    const view = state.edComposed?.get(id) || fx; // 붙인 매대까지 합친 것
    const selIt = block._selItem && (view.items || []).find(it => String(it.id) === block._selItem);
    if (ed && selIt) nodes.push(sec('선택한 제품', h('div', { class: 'se-item' }, selIt.img ? prodImg(selIt.img, '', { fallback: false }) : null,
      h('div', {}, h('b', {}, selIt.name), h('div', { class: 'mut' }, selIt.code))),
      h('div', { class: 'se-btns' }, btn('맨 앞으로', () => moveItemZ(pog.id, view, selIt.id, 1)), btn('맨 뒤로', () => moveItemZ(pog.id, view, selIt.id, -1)),
        btn('선택 해제', () => selectItem(block, null), 'ghost')),
      h('p', { class: 'se-help' }, '겹친 제품 중 어느 것이 앞에 보일지만 바꿔요. 위치는 그대로예요.')));
    if (ed && block._bar) nodes.push(sec('메모 넣기', block._bar));
    if (ed && free) nodes.push(sec('집기 정보', h('p', { class: 'se-help' }, fx.info ? '오른쪽에 매대 타입·고리·선반/파이프·이외집기 칸이 있어요.' : '매대 페이지처럼 오른쪽에 매대 타입·고리·선반/파이프·이외집기 칸을 넣어요.'),
      h('div', { class: 'se-btns' }, fx.info ? btn('집기 정보 빼기', () => { if (confirm('집기 정보 칸을 뺄까요? (입력한 값은 남아 있어서 다시 넣으면 보여요)')) saveFx(pog.id, fx.id, 'info', false); }, 'ghost')
        : btn('🧾 집기 정보 추가하기', () => saveFx(pog.id, fx.id, 'info', true)))));
    if (ed && free && ((fx.items || []).length || (fx.props || []).length)) nodes.push(splitSection(pog, fx, block)); // 붙여넣은 매대: 옮기기·크기
    if (ed && !free) {
      const list = [...state.edComposed.values()], i = list.findIndex(f => f.id === id), next = list.slice(i + 1).find(f => f.kind !== 'free');
      const kids = (fx.merged || []).map(k => state.fixtures.get(k)).filter(Boolean);
      // '다음 매대 붙이기'는 없앰 (사용자). 예전에 붙인 매대만 떼어낼 수 있게 남김
      if (kids.length) nodes.push(sec('붙인 매대', ...kids.map(k => h('div', { class: 'se-kid' }, h('span', {}, '붙인 매대: ', h('b', {}, displayName(k))), btn('↶ 떼어내기', () => unmerge(pog.id, fx, k.id), 'ghost')))));
      nodes.push(splitSection(pog, fx, block));
    }
    if (ed && !fx.merged?.length && state.clip && state.clip.pogId === pog.id && state.clip.from !== fx.id)
      nodes.push(sec('붙여넣기', h('p', { class: 'se-help' }, free ? `잘라낸 묶음(제품 ${state.clip.n}개)을 이 빈 페이지에 매대로 붙여요.` : `잘라낸 묶음(제품 ${state.clip.n}개)을 이 페이지 오른쪽에 붙여요.`), h('div', { class: 'se-btns' }, btn('📋 여기에 붙여넣기 (Ctrl+V)', () => pasteBlock(pog.id, fx)), btn('잘라내기 취소', () => { state.clip = null; renderSidePanel(); }, 'ghost'))));
    if (ed) nodes.push(sec('페이지', h('div', { class: 'se-btns' },
      btn('▲ 앞으로', () => moveFollow(pog.id, fx.id, -1), 'ghost'),
      btn('▼ 뒤로', () => moveFollow(pog.id, fx.id, 1), 'ghost'),
      btn('+ 이 뒤에 빈 페이지 추가', () => addFreePage(pog.id, fx.order), 'ghost'),
      btn('이 페이지 삭제', () => deletePage(pog.id, fx), 'ghost danger'))));
  }
  if (!ed) nodes.push(h('p', { class: 'se-help' }, pog.status === 'final' ? '최종 POG라 잠겨 있어요.' : '보기 전용이에요.'));
  box.replaceChildren(...nodes);
}
// 매대 밖이라 뺀 제품을 이 페이지에 다시 넣기
async function restoreOutside(pogId, fx) {
  const out = fx.outsideItems || [];
  if (!out.length || !confirm(`매대 밖이라 뺀 제품 ${out.length}개를 이 페이지에 되살릴까요?`)) return;
  const items = [...(fx.items || []), ...out];
  track(pogId, fx.id, ['items', 'outsideItems', 'itemCount']);
  await updateDoc(doc(db, 'pogs', pogId, 'fixtures', fx.id), { items, outsideItems: [], itemCount: items.length, updatedAt: serverTimestamp(), updatedBy: me() });
  toast(`${out.length}개를 되살렸어요`);
}

// 페이지 아래 'POG 담당자' 옆에서 이 페이지 담당자를 바로 고름 (비우면 위쪽 담당자)
function mgrSelect(fx, pog) {
  const sel = h('select', { class: 'pf-mgr-sel no-print', title: '이 페이지 POG 담당자' });
  sel.addEventListener('change', async () => {
    let v = sel.value;
    fx.manager = v; saveFx(pog.id, fx.id, 'manager', v);
    const blk = sel.closest('.page-block'), sp = blk && $('.pf-mgr', blk); if (sp) sp.textContent = v || state.currentPog?.manager || '';
    fillMgrSelect(sel, fx, state.currentPog || pog);
  });
  fillMgrSelect(sel, fx, pog);
  return sel;
}
function fillMgrSelect(sel, fx, pog) {
  if (sel === document.activeElement) return;
  const names = [...new Set([...state.managers.map(m => m.name), fx.manager].filter(Boolean))];
  sel.replaceChildren(h('option', { value: '' }, pog.manager ? `${pog.manager} (전체)` : '(전체 담당자)'), ...names.map(n => h('option', { value: n }, n))); // 담당자 추가는 관리자만 (계정 관리 화면 · 사용자)
  sel.value = fx.manager || '';
}
function refreshManagerSelect() {
  const sel = $('#ed-manager'); if (!sel) return;
  const cur = state.currentPog?.manager || '';
  const names = state.managers.map(m => m.name);
  if (cur && !names.includes(cur)) names.push(cur);
  sel.innerHTML = '';
  sel.append(h('option', { value: '' }, '선택'), ...names.map(n => h('option', { value: n }, n)));
  sel.value = cur;
  state.pageEls?.forEach((blk, id) => { const ms = $('.pf-mgr-sel', blk), fx = state.fixtures.get(id); if (ms && fx && state.currentPog) fillMgrSelect(ms, fx, state.currentPog); });
}
$('#ed-manager').addEventListener('change', async e => {
  const p = state.currentPog; if (!p) return;
  const v = e.target.value;
  track(p.id, '__pog', ['manager']);
  p.manager = v;
  await updateDoc(doc(db, 'pogs', p.id), { manager: v, updatedAt: serverTimestamp() });
});
$('#ed-final').onclick = async () => {
  const p = state.currentPog; if (!p) return;
  if (p.status === 'final') {
    if (!confirm('잠금을 풀고 다시 수정할 수 있게 할까요? 온라인 POG 목록에서는 빠져요.')) return;
    await updateDoc(doc(db, 'pogs', p.id), { status: 'draft', updatedAt: serverTimestamp() }); addLog(['pogs', p.id], { fx: '__cover', area: 'make', act: '잠금 해제 (다시 편집)' });
    return;
  }
  const miss = [];
  if (!p.manager) miss.push('담당자');
  const noName = [...state.fixtures.values()].filter(f => f.kind !== 'free' && !f.mergedInto && !f.headerName).length;
  if (noName) miss.push(`매대명 미입력 ${noName}개 (POG 원본 이름으로 표시돼요)`);
  const msg = (miss.length ? '확인 필요: ' + miss.join(', ') + '\n\n' : '') + '최종 POG로 내보낼까요? 내보내면 수정이 잠기고 온라인 POG·제품 찾기에서 쓸 수 있어요.';
  if (!confirm(msg)) return;
  await updateDoc(doc(db, 'pogs', p.id), { status: 'final', finalizedAt: serverTimestamp(), finalizedBy: state.user.email, updatedAt: serverTimestamp() });
  addLog(['pogs', p.id], { fx: '__cover', area: 'make', act: '최종 POG 내보내기' });
  toast('최종 POG로 내보냈어요');
  autoBarcodes({ fixtures: [...state.fixtures.values()] }); // 최종 POG 제품의 POG 사이트 바코드 → 바코드 등록 (새것만)
};
$('#ed-delete').onclick = async () => {
  const p = state.currentPog; if (!p) return;
  if (!confirm(`'${pogTitle(p)}' POG를 삭제할까요? 되돌릴 수 없어요.`)) return;
  try { await deletePogAll(p.id); } catch (e) { alert('삭제하지 못했어요: ' + (e.code || e.message)); return; }
  closePog(); renderPogList(); toast('삭제했어요');
};
// 문서 여러 개 지우기 (400개씩)
async function deleteDocs(refs) {
  for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
}
// POG 통째로: 페이지(사진·메모 사진 파일 포함)·POG 문서
async function deletePogAll(pogId) {
  const fxs = await getDocs(collection(db, 'pogs', pogId, 'fixtures'));
  for (const d of fxs.docs) for (const ph of [...(d.data().photos || []), ...(d.data().notes || []).filter(n => n.path)]) { if (ph.path) try { await deleteObject(sRef(st, ph.path)); } catch { } }
  await deleteDocs(fxs.docs.map(d => d.ref));
  try { const f = await getDocs(collection(db, 'pogs', pogId, 'feedback')); await deleteDocs(f.docs.map(d => d.ref)); } catch { } // 피드백 (관리자만 지울 수 있음)
  await dropLogs(['pogs', pogId]);
  await deleteDoc(doc(db, 'pogs', pogId));
}
// 도면 통째로: 모든 버전(SVG 파일 포함)·도면 문서
async function deleteDrawingAll(storeId) {
  const vs = await getDocs(collection(db, 'drawings', storeId, 'versions'));
  for (const d of vs.docs) for (const pth of [d.data().path, d.data().basePath]) { if (pth) try { await deleteObject(sRef(st, pth)); } catch { } }
  await deleteDocs(vs.docs.map(d => d.ref));
  await dropLogs(['drawings', storeId]);
  try { const s = await getDocs(collection(db, 'drawings', storeId, 'seq')); await deleteDocs(s.docs.map(d => d.ref)); } catch { }
  await deleteDoc(doc(db, 'drawings', storeId));
}
// 수정 기록도 지움 (규칙상 POG팀·VMD팀 등은 못 지움 → 그냥 남김)
async function dropLogs(path) { try { const s = await getDocs(collection(db, ...path, 'logs')); await deleteDocs(s.docs.map(d => d.ref)); } catch { } }
$('#ed-pdf').onclick = () => printPages($('#ed-pages'), state.currentPog);

/* ---------- PDF (인쇄) ---------- */
async function printPages(container, pog) {
  const old = document.title;
  document.title = `POG_${pogTitle(pog || {}).replace(/ · /g, '_')}_${fmtDate(new Date())}`.replace(/[\\/:*?"<>|]/g, '');
  const done = () => { document.title = old; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  // 아직 안 불러온 사진·실패한 사진: 다시 불러오고, 끝날 때까지(최대 20초) 기다렸다가 인쇄
  retryBroken(container, true); // 깨진 사진도 한 번 더
  const imgs = $$('img', container);
  imgs.forEach(i => { i.loading = 'eager'; if (i.complete && !i.naturalWidth && i.dataset.src0 && !i.dataset.failed) imgRetry(i); });
  const wait = imgs.filter(i => !(i.complete && i.naturalWidth) && !i.dataset.failed && i.isConnected);
  if (wait.length) {
    let left = wait.length;
    toast(`사진 불러오는 중… (${left}장)`);
    await Promise.race([
      Promise.all(wait.map(i => new Promise(r => {
        const fin = () => { toast(`사진 불러오는 중… (${--left}장 남음)`); r(); };
        i.addEventListener('load', fin, { once: true }); i.addEventListener('gaveup', fin, { once: true });
      }))),
      new Promise(r => setTimeout(r, 20000)),
    ]);
  }
  const bad = $$('.cv-noimg', container).length;
  if (bad) toast(`사진 ${bad}장은 불러오지 못해서 제품명으로 나와요`);
  window.print();
}

/* ---------- 새 POG 가져오기 ---------- */
$('#btn-import').onclick = openImport;
function openImport() {
  const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  const bm = `javascript:(function(){var s=document.createElement('script');s.charset='utf-8';s.src='${base}pog-grab.js?v='+Date.now();document.body.appendChild(s);})();`;
  const link = h('a', { class: 'bm-link', href: bm, onclick: e => { e.preventDefault(); toast('이 버튼을 북마크바로 끌어다 놓으세요'); } }, '🐥 POG 가져오기 (국내)'); // 북마크 이름 = 이 글자. Global Opening Prep 북마크(📥 POG 가져오기)와 헷갈리지 않게 (사용자)
  const ta = h('textarea', { class: 'import-ta', placeholder: '여기에 붙여넣기 (Ctrl+V)' });
  const go = h('button', { class: 'btn primary' }, '가져오기');
  const close = modal(h('div', {},
    h('h3', {}, '새 POG 가져오기'),
    h('ol', { class: 'steps' },
      h('li', {}, '처음 한 번만: 아래 버튼을 브라우저 북마크바로 끌어다 놓으세요. ', link,
        h('div', { class: 'mut' }, 'Global Opening Prep의 북마크(📥 POG 가져오기)와는 다른 북마크예요. 국내 POG는 꼭 🐥 (국내) 북마크로 가져와 주세요.')),
      h('li', {}, 'POG 사이트에서 매장의 매대 목록 화면을 열고 북마크를 누르세요. 아무것도 체크 안 했으면 팀 고르기 창이 떠요 → 가져올 팀을 고르세요 (팀마다 POG가 따로 생겨요). 매대를 체크했으면 체크한 매대만 가져와요. (매대 보기 화면에서 누르면 그 매대 하나만)'),
      h('li', {}, '다 모이면 뜨는 창에서 \'복사하기\'를 누르고, 아래 칸에 붙여넣으세요.')),
    ta,
    h('p', { class: 'mut' }, '매대 옆으로 완전히 벗어난 제품(매대 밖에 빼둔 제품)은 가져오지 않아요.'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true; go.textContent = '가져오는 중…';
    const ok = await doImport(ta.value);
    if (ok) close(); else { go.disabled = false; go.textContent = '가져오기'; }
  };
}
/* POG 사이트의 매대 한 줄에 칸(매대)이 좌우로 여러 개 있으면 칸마다 나눈다.
   칸 기준: 선반·파이프와 넓은 배경판(panels, 예: 옆의 회색 판). 가로 범위가 **반 이상 겹치는 것끼리** 한 칸.
   맞닿기만 한 것은 다른 칸이다 (예전엔 맞닿아도 합쳐서, 칸 3개가 붙어 있는 매대가 한 페이지로 뭉쳤음).
   여러 칸에 걸친 긴 집기는 칸을 정하는 데 쓰지 않고, 가운데 위치로 한 칸에 넣는다.
   expected = 목록의 '매대수' (집기로 못 나눌 때만 제품 사이 빈 곳으로 나누는 데 씀) */
function clusterX(objs) {
  if (!objs.length) return [];
  const ws = objs.map(o => o.w).sort((a, b) => a - b), med = ws[Math.floor(ws.length / 2)];
  const iv = objs.filter(o => o.w <= med * 1.6).map(o => [o.x, o.x + o.w]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of iv) {
    const last = out[out.length - 1];
    if (last && Math.min(last[1], b) - Math.max(last[0], a) > 0.5 * Math.min(b - a, last[1] - last[0])) { last[1] = Math.max(last[1], b); continue; }
    out.push([a, b]);
  }
  return out;
}
function splitBays(items, props, expected, panels = []) {
  const base = [...props, ...panels.filter(p => p.w >= 40)].filter(o => o.w > 0);
  let bays = clusterX(base);
  // 집기로 못 나누면 제품 위치로 (칸 사이가 40px 이상 비어 있을 때만)
  if (bays.length < 2 && expected > 1 && items.length) {
    const iv = items.filter(o => o.w > 0).map(o => [o.x, o.x + o.w]).sort((a, b) => a[0] - b[0]), merged = [];
    for (const x of iv) { const last = merged[merged.length - 1]; if (last && x[0] - last[1] < 40) last[1] = Math.max(last[1], x[1]); else merged.push([...x]); }
    if (merged.length > 1) bays = merged;
  }
  if (bays.length < 2) return [{ items, props, panels }];
  const at = o => {
    const cx = o.x + (o.w || 0) / 2;
    let best = 0, bd = Infinity;
    bays.forEach(([a, b], i) => { const d = cx < a ? a - cx : cx > b ? cx - b : 0; if (d < bd) { bd = d; best = i; } });
    return best;
  };
  let groups = bays.map(() => ({ items: [], props: [], panels: [] }));
  items.forEach(o => groups[at(o)].items.push(o));
  props.forEach(o => groups[at(o)].props.push(o));
  panels.forEach(o => groups[at(o)].panels.push(o));
  // 제품이 하나도 없는 좁은 조각(옆에 붙은 작은 집기 등)은 옆 칸에 합침
  const maxW = Math.max(...bays.map(([a, b]) => b - a));
  for (let i = groups.length - 1; i >= 0 && groups.length > 1; i--) {
    if (groups[i].items.length || bays[i][1] - bays[i][0] >= maxW * 0.4) continue;
    const j = i > 0 ? i - 1 : 1;
    groups[j].props.push(...groups[i].props); groups[j].panels.push(...groups[i].panels);
    groups.splice(i, 1); bays.splice(i, 1);
  }
  return groups;
}

/* 매대 밖에 놓인 제품 골라내기 (POG 사이트에서 매대 옆에 빼둔 제품 등)
   매대 전체(모든 선반·파이프)의 가로 범위에서 **완전히 벗어난** 제품만 밖으로 본다.
   위아래는 보지 않는다: 파이프에 거는 제품은 집기보다 한참 아래로 내려오고, 쌓아 진열하면 위로 올라감.
   (처음엔 아래쪽도 봤는데, 실제 거는화일 매대에서 24개 중 14개를 잘못 뺐음)
   배경판(panels, 예: 옆의 회색 판)도 매대로 본다. 집기가 없거나 전부 밖으로 판정되면 그대로 둔다. */
function splitOutside(items, props, panels = []) {
  const ps = [...props, ...panels.filter(p => p.w >= 40)].filter(p => p.w > 0); // 회색 배경판 위 제품은 매대 안
  if (!ps.length || !items.length) return { inside: items, outside: [] };
  const left = Math.min(...ps.map(p => p.x)) - 10, right = Math.max(...ps.map(p => p.x + p.w)) + 10;
  // 위아래도 봄 (사용자: 낮은 매대 위 허공에 떠 있는 제품까지 들어왔음). 제품 가운데 바로 위·아래에 있는 선반·파이프·판의
  // 높이 범위와 겹치거나 맞닿은(30px 이내) 제품만 매대 안. 선반 위에 올려둔 제품(밑면 ≈ 선반)·파이프에 건 제품은 그대로 들어옴
  const offV = o => {
    const cx = o.x + (o.w || 0) / 2, col = ps.filter(p => cx >= p.x - 10 && cx <= p.x + p.w + 10);
    if (!col.length) return false; // 칸 사이 틈 등: 예전처럼 가로만 봄
    const top = Math.min(...col.map(p => p.y)), bottom = Math.max(...col.map(p => p.y + (p.h || 0)));
    return o.y + (o.h || 0) < top - 30 || o.y > bottom + 30;
  };
  const out = o => o.x + (o.w || 0) < left || o.x > right || offV(o);
  const outside = items.filter(out);
  if (outside.length === items.length) return { inside: items, outside: [] };
  return { inside: items.filter(o => !out(o)), outside };
}

// 북마클릿이 읽은 매대 한 줄 → POG 페이지 목록 (칸 나누기·매대 밖 제품 빼기). 처음 가져오기·다시 가져오기에서 같이 씀
const autoShelfPipe = (sh, pi) => [sh ? `선반 ${sh}` : '', pi ? `파이프 ${pi}` : ''].filter(Boolean).join(' / ');
function pagesFromGrab(f, i) {
  const panels = f.panels || [];
  const { inside, outside } = splitOutside(f.items || [], f.props || [], panels); // 매대 밖 제품은 버림 (사용자 결정: 아예 안 가져옴)
  // 제품이 하나도 없는 칸은 페이지를 만들지 않음 (사용자)
  const bays = splitBays(inside, f.props || [], f.bayCount ?? null, panels).filter(b => b.items.length);
  const shelf = f.shelfCount ?? 0, pipe = f.pipeCount ?? 0;
  const kinds = (f.props || []).some(p => /선반|파이프/.test(p.kind || ''));
  const base = String(f.mdidx || 'fx' + i);
  const pages = bays.map((bay, k) => {
    const count = (re, total) => bays.length === 1 ? total
      : kinds ? bay.props.filter(p => re.test(p.kind || '')).length : Math.round(total / bays.length);
    const sh = count(/선반/, shelf), pi = count(/파이프/, pipe);
    return {
      id: bays.length > 1 ? `${base}-${k + 1}` : base,
      mdidx: String(f.mdidx || ''), bayNo: k + 1, bayCount: bays.length,
      teamName: f.teamName || '', mdName: f.mdName || '',
      shelfCount: sh, pipeCount: pi,
      itemCount: bays.length > 1 ? bay.items.length : (f.itemCount ?? bay.items.length),
      items: bay.items, props: bay.props, panels: bay.panels || [], board: f.board || null, src: f.src || null, // src = POG 계산기용 원본 정보 (매대 크기 mm·메모 등)
      shelfPipe: autoShelfPipe(sh, pi), sp: autoSp(sh, pi),
    };
  });
  return { pages, outN: outside.length };
}

// 국내는 매장 하나에 팀마다 POG가 따로 (POG 사이트 팀명 기준). 붙여넣은 데이터에 팀이 여러 개면 팀마다 POG를 하나씩 만듦
/* POG 사이트에서 같이 가져온 제품바코드를 바코드 등록에 자동으로 넣기 (사용자). 최종 POG 내보내기 때만 (사용자: 가져오기·열기 때는 안 넣음). 이미 있는 바코드는 그대로 두고 새것만 넣음 (POG팀도 새로 넣기만 가능 · 규칙) */
async function autoBarcodes(data, { quiet = false } = {}) { // 돌려줌: { found: POG 바코드 수, added: 새로 넣은 수 } (실패면 null)
  const map = new Map();
  for (const f of data.fixtures || []) for (const it of f.items || []) {
    const bc = String(it.barcode || '').trim(), code = code8(String(it.code || '').trim());
    if (/^\d{6,14}$/.test(bc) && code && !map.has(bc)) map.set(bc, { code, name: String(it.name || '').slice(0, 100) });
  }
  if (!map.size) return { found: 0, added: 0 };
  try {
    const bcs = [...map.keys()], have = new Set();
    for (let i = 0; i < bcs.length; i += 30) {
      const snap = await getDocs(query(collection(db, 'barcodes'), where(documentId(), 'in', bcs.slice(i, i + 30))));
      snap.docs.forEach(d => have.add(d.id));
    }
    const add = bcs.filter(b => !have.has(b));
    if (!add.length) return { found: bcs.length, added: 0 };
    for (let i = 0; i < add.length; i += 400) {
      const b = writeBatch(db);
      add.slice(i, i + 400).forEach(bc => { const r = map.get(bc); b.set(doc(db, 'barcodes', bc), { code: r.code, ...(r.name ? { name: r.name } : {}), auto: true, updatedAt: serverTimestamp(), updatedBy: me() }); });
      await b.commit();
    }
    toast(`POG 사이트 바코드 ${add.length}개를 바코드 등록에 넣었어요`);
    return { found: bcs.length, added: add.length };
  } catch (e) { if (!quiet) toast('바코드 등록에 자동으로 넣지 못했어요: ' + (e.code || e.message)); return null; }
}
// 바코드 등록 화면 (관리자): 모든 POG를 훑어서 한꺼번에
async function syncAllPogBarcodes() {
  const btn = $('#bc-frompog'), t0 = btn.textContent; btn.disabled = true;
  try {
    const fixtures = [], ps = state.pogs.filter(p => p.status === 'final'); // 최종 POG만
    for (let i = 0; i < ps.length; i++) {
      btn.textContent = `POG 읽는 중… ${i + 1} / ${ps.length}`;
      const s2 = await getDocs(collection(db, 'pogs', ps[i].id, 'fixtures'));
      s2.docs.forEach(d => fixtures.push({ items: d.data().items || [] }));
    }
    btn.textContent = '바코드 넣는 중…';
    const r = await autoBarcodes({ fixtures });
    if (r) alert(r.found ? `최종 POG ${ps.length}개에서 POG 사이트 바코드 ${r.found.toLocaleString()}개를 찾았어요.\n새로 넣은 것: ${r.added.toLocaleString()}개 (나머지는 이미 등록돼 있어요)` : `최종 POG ${ps.length}개에 POG 사이트 바코드가 없어요.\n바코드 기능 전에 가져온 POG는 POG 사이트에서 ↻ 다시 가져오기를 해야 바코드가 들어와요.`);
    bcCount();
  } catch (e) { alert('POG를 읽지 못했어요: ' + (e.code || e.message)); }
  finally { btn.textContent = t0; btn.disabled = false; }
}
$('#bc-frompog').onclick = syncAllPogBarcodes;
async function doImport(text) {
  let data;
  try { data = JSON.parse(text.trim()); } catch { toast('붙여넣은 내용이 올바르지 않아요'); return false; }
  if (!data || data.source !== 'pog.artbox.kr' || !Array.isArray(data.fixtures) || !data.fixtures.length) {
    toast('POG 데이터가 아니에요'); return false;
  }
  const empty = f => !(f.items || []).length && !(f.props || []).length && !(f.panels || []).length;
  const skipped = data.fixtures.filter(empty);
  // 팀마다 매대 줄 나누기 (POG 사이트 목록 순서 그대로)
  const byTeam = new Map();
  data.fixtures.forEach((f, i) => {
    if (empty(f)) return; // 제품·집기가 하나도 없는 줄 (목록의 '★1차POG/리스트 전달완료★' 같은 표시 줄)
    const raw = String(f.teamName || '').trim(), key = catName(raw) || '(팀 없음)';
    const g = byTeam.get(key) || { team: catName(raw), teamName: raw, rows: [] };
    g.rows.push([f, i]); byTeam.set(key, g);
  });
  if (!byTeam.size) { toast('가져올 매대가 없어요'); return false; }
  // 같은 매장·같은 팀 POG가 이미 있으면 물어봄
  const dup = [...byTeam.values()].filter(g => state.pogs.some(p => String(p.storeCode) === String(data.storeCode || '') && pogTeam(p) === g.team));
  if (dup.length && !confirm(`이 매장에 이미 있는 팀이에요: ${dup.map(g => g.team || '(팀 없음)').join(', ')}\n\n그래도 새 POG로 하나 더 만들까요?\n(기존 POG를 최신으로 바꾸려면 취소하고, 그 POG를 열어 '↻ 다시 가져오기'를 써주세요)`)) return false;
  const made = [];
  try {
    let splitN = 0, outN = 0, total = 0;
    for (const g of byTeam.values()) {
      // 매대 줄마다 칸을 나눠서 페이지 목록 만들기
      const pages = [];
      for (const [f, i] of g.rows) {
        const r = pagesFromGrab(f, i);
        const pg = r.pages.filter(p => (p.items || []).length); // 페이지로 나눈 뒤 제품 없는 페이지는 버림 (사용자)
        pages.push(...pg); outN += r.outN; if (pg.length > 1) splitN++;
      }
      if (!pages.length) continue;
      const ref = await addDoc(collection(db, 'pogs'), {
        storeCode: data.storeCode || '', storeName: data.storeName || '', saup: data.saup || '00',
        team: g.team, teamName: g.teamName, teams: g.team ? [g.team] : [],
        branchName: '', manager: '', status: 'draft', fixtureCount: pages.length,
        grabbedAt: data.grabbedAt || '', createdAt: serverTimestamp(), createdBy: state.user.email, updatedAt: serverTimestamp(),
      });
      made.push(ref);
      let b = writeBatch(db), n = 0;
      for (const [i, { id, ...pg }] of pages.entries()) {
        b.set(doc(db, 'pogs', ref.id, 'fixtures', id), {
          order: i, ...pg,
          headerName: '', fixtureType: '', hookType: '', hookCount: '',
          otherFixtures: '', memo: '', photos: [],
        });
        if (++n >= 400) { await b.commit(); b = writeBatch(db); n = 0; }
      }
      await b.commit();
      total += pages.length;
    }
    if (!made.length) { toast('제품이 있는 매대가 없어요'); return false; }
    const teams = [...byTeam.values()].map(g => g.team || '(팀 없음)');
    toast((made.length > 1 ? `팀 ${made.length}개(${teams.join(', ')})로 나눠서 ` : `${teams[0]} · `) + `매대 ${total}개를 가져왔어요`
      + (splitN ? ` · 칸이 여러 개인 매대 ${splitN}개는 칸마다 나눴어요` : '') + (outN ? ` · 매대 밖 제품 ${outN}개는 뺐어요` : '')
      + (skipped.length ? ` · 빈 줄 ${skipped.length}개(${skipped.map(f => f.mdName).join(', ').slice(0, 40)})는 건너뛰었어요` : ''));
    openPog(made[0].id);
    return true;
  } catch (e) {
    for (const ref of made) { try { await deleteDoc(ref); } catch { } } // 반쯤 만들어진 POG는 지움
    if (e.code === 'permission-denied') {
      alert('저장 권한이 없어요 (Missing or insufficient permissions).\n\n' +
        'Firebase 콘솔 → Firestore Database → 규칙 탭에서 firestore.rules 내용이 게시돼 있는지 확인해주세요.\n' +
        '(처음 만들 때 고른 기본 규칙이 남아 있거나, 테스트 모드 기간이 끝나면 이 오류가 나요.)');
    } else toast('가져오기 실패: ' + e.message);
    return false;
  }
}

/* ---------- 고리·집기 수량 엑셀: 페이지마다 넣은 고리타입×갯수, 이외집기×수량을 제품코드와 함께 합계 ---------- */
// 시트 1 '선반·파이프·제작비품' = 사전에서 '제작필요' 체크한 선반/파이프·집기 (+ 사전에 없는 기본 선반·파이프)
// 시트 2 '관리부 비품·집기·고리' = 고리 전부 + 나머지 선반/파이프·집기 (사용자). 엑셀 시트 이름에는 '/'를 못 써서 '·'
async function exportCounts(pog, fixtures) {
  if (!pog) return;
  try {
    const X = await loadXLSX();
    const glOf = (cat, name) => state.glossary.find(x => x.cat === cat && norm(x.ko) === norm(name));
    const isMake = (kind, name) => { if (kind === '고리') return false; const g = glOf(kind, name); return g ? !!g.make : kind === '선반/파이프' && SP_DEFAULT.some(x => norm(x) === norm(name)); };
    const KORD = { '선반/파이프': 0, '집기': 1, '고리': 2 };
    const pages = composeFx([...fixtures].sort((a, b) => a.order - b.order));
    const CAT = { '고리': '고리타입', '집기': '집기', '선반/파이프': '선반/파이프' }; // 구분 → 사전 분류
    const codeOf = (kind, name) => CODE_CATS.includes(CAT[kind]) ? glOf(CAT[kind], name)?.code || '' : '';
    const sum = new Map();
    pages.forEach((f, i) => {
      if (f.kind === 'free' && !f.info) return;
      const no = i + 2; // 1번은 표지
      const add = (kind, name, qty) => {
        name = (name || '').trim(); if (!name) return;
        const q = Number(qty) || 0, k = kind + '|' + norm(name);
        const r = sum.get(k) || { kind, code: codeOf(kind, name), name, qty: 0, pages: new Map(), make: isMake(kind, name) };
        r.qty += q; r.pages.set(no, (r.pages.get(no) || 0) + q); sum.set(k, r);
      };
      spRows(f).forEach(x => add('선반/파이프', x.name, x.qty));
      add('고리', f.hookType, f.hookCount);
      (f.extras || []).forEach(x => add('집기', x.name, x.qty));
    });
    if (!sum.size) { toast('입력된 선반/파이프·고리·집기가 없어요'); return; }
    const all = [...sum.values()].sort((a, b) => KORD[a.kind] - KORD[b.kind] || a.name.localeCompare(b.name, 'ko'));
    const pageTxt = r => [...r.pages].map(([p, q]) => `${p}쪽(${q})`).join(', ');
    const noCodeTxt = r => CODE_CATS.includes(CAT[r.kind]) ? '(등록된 코드 없음)' : '';
    const sheet = (list, withCode) => { // 시트 1(제작비품)은 제품코드 열 없음 (사용자)
      const cut = row => withCode ? row : row.filter((_, i) => i !== 1);
      const head = cut(['구분', '제품코드', '이름', '합계 수량', '들어간 페이지 (수량)']);
      const body = list.map(r => cut([r.kind, r.code || noCodeTxt(r), r.name, r.qty, pageTxt(r)]));
      const ws = X.utils.aoa_to_sheet([head, ...(body.length ? body : [['(없음)']])]);
      ws['!cols'] = cut([{ wch: 11 }, { wch: 18 }, { wch: 30 }, { wch: 10 }, { wch: 40 }]);
      return ws;
    };
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, sheet(all.filter(r => r.make), false), '선반·파이프·제작비품');
    X.utils.book_append_sheet(wb, sheet(all.filter(r => !r.make), true), '관리부 비품·집기·고리');
    X.writeFile(wb, `선반고리집기수량_${pogTitle(pog)}_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`.replace(/[\\/:*?"<>|]/g, ''));
    const noCode = all.filter(r => !r.make && !r.code && CODE_CATS.includes(CAT[r.kind])).length;
    toast('엑셀을 저장했어요' + (noCode ? ` · 집기·고리·매대 등록에 제품코드가 없는 것 ${noCode}개` : ''));
  } catch (e) { toast(e.message); }
}
$('#ed-counts').onclick = () => exportCounts(state.currentPog, [...state.fixtures.values()]);
$('#vw-counts').onclick = () => exportCounts(state.viewer.pog, state.viewer.fixtures);
$('#vw-nobc').onclick = () => exportNoBarcode(state.viewer.pog, state.viewer.fixtures);

/* ---------- 제품리스트 엑셀: 이 POG의 모든 매대(= 가져올 때 체크한 매대) 제품을 시트 하나에 ---------- */
// 순서: 페이지 → 칸 → 단(위에서부터, 선반·파이프를 같이 셈) → 왼쪽부터. 줄줄이처럼 선반이 없는 매대는 위에서부터
function productRows(f) {
  const props = (f.props || []).filter(p => !p.kind || /선반|파이프/.test(p.kind))
    .map(p => ({ x: +p.x || 0, y: +p.y || 0, w: +p.w || 0, h: +p.h || 18, pipe: p.opt === 'Y' || /파이프/.test(p.kind || '') }));
  const levels = [];
  for (const y of props.map(p => p.y).sort((a, b) => a - b)) if (!levels.length || y - levels[levels.length - 1] > 10) levels.push(y);
  // 선반 위 제품: 제품 밑면 ≈ 선반 윗면 / 걸이 제품: 제품 윗면 ≈ 파이프 아랫면. 진열방식(01 걸이 · 02 진열)이 맞는 쪽을 먼저 봄
  const support = it => {
    const cx = (+it.x || 0) + (+it.w || 0) / 2, m = it.data?.displaymethod;
    let best = null;
    for (const p of props) {
      if (cx < p.x - 2 || cx > p.x + p.w + 2) continue;
      let gap = p.pipe ? (+it.y || 0) - (p.y + p.h) : p.y - ((+it.y || 0) + (+it.h || 0));
      if (gap < -8) continue;
      if ((m === '01' && !p.pipe) || (m === '02' && p.pipe)) gap += 30;
      if (!best || gap < best.gap) best = { p, gap };
    }
    return best && best.gap <= 260 ? best.p : null;
  };
  const rows = (f.items || []).map(it => {
    const s = props.length ? support(it) : null;
    const lv = s ? levels.findIndex(y => s.y - y >= 0 && s.y - y <= 10) + 1 : 0;
    return { it, lv, kind: s ? (s.pipe ? '걸이' : '선반') : '' };
  });
  rows.sort((a, b) => props.length
    ? (a.lv || 999) - (b.lv || 999) || (+a.it.x || 0) - (+b.it.x || 0)
    : (+a.it.y || 0) - (+b.it.y || 0) || (+a.it.x || 0) - (+b.it.x || 0));
  let key = null, n = 0;
  rows.forEach(r => { n = r.lv === key ? n + 1 : 1; key = r.lv; r.order = n; });
  return rows;
}
async function exportProducts(pog, fixtures) {
  if (!pog) return;
  try {
    const X = await loadXLSX();
    const METHOD = { '01': '걸이', '02': '진열', '99': '기타' };
    const grp = g => { // '펜(형태펜)_110_240_130' → 분류 '펜(형태펜)', 사이즈 '110×240×130'
      const p = String(g || '').split('_');
      return p.length >= 4 && p.slice(-3).every(s => /^\d+(\.\d+)?$/.test(s)) ? [p.slice(0, -3).join('_'), p.slice(-3).join('×')] : [g || '', ''];
    };
    const pages = composeFx([...fixtures].sort((a, b) => a.order - b.order));
    const body = [];
    pages.forEach((pg, i) => {
      const no = i + 2; // 1번은 표지 (PDF 페이지 번호와 같게)
      for (const f of pg._parts || [pg]) { // 붙인 페이지는 매대마다 따로 계산
        if (!(f.items || []).length) continue;
        for (const r of productRows(f)) {
          const it = r.it, [cat, size] = grp(it.group || it.data?.groupname);
          body.push([body.length + 1, no, displayName(f), r.lv ? r.lv + '단' : '', r.order, // 맨 앞 = 순번 (칸·선반/걸이 열은 뺌 · 사용자)
            code8(String(it.code || it.data?.item || '').trim()), it.name || '',
            Number(it.price || it.data?.amtk) || '', METHOD[it.data?.displaymethod] || '', cat, size]);
        }
      }
    });
    if (!body.length) { toast('이 POG에 제품이 없어요'); return; }
    // 바코드 (바코드 등록에서 제품코드로 찾음, 한 제품에 여러 개면 쉼표로) → 제품코드 앞 열 (사용자)
    const codes = [...new Set(body.map(r => r[5]).filter(Boolean))], bcOf = new Map(), siteBc = new Map(); // siteBc = POG 사이트에서 같이 가져온 바코드 (먼저 씀)
    pages.forEach(pg => (pg._parts || [pg]).forEach(f => (f.items || []).forEach(it => { if (it.barcode) siteBc.set(code8(String(it.code || '').trim()), String(it.barcode)); })));
    toast('바코드 찾는 중…');
    try {
      for (let i = 0; i < codes.length; i += 30) { // 한 번에 30개씩 (Firestore 'in' 한도)
        const snap = await getDocs(query(collection(db, 'barcodes'), where('code', 'in', codes.slice(i, i + 30))));
        snap.docs.forEach(d => { const c = String(d.data().code); bcOf.set(c, [...(bcOf.get(c) || []), d.id]); });
      }
    } catch { toast('바코드를 읽지 못해서 바코드 칸은 비워 둘게요'); }
    body.forEach(r => r.splice(5, 0, siteBc.get(r[5]) || (bcOf.get(r[5]) || []).sort().join(', ')));
    const head = ['순번', '페이지', '매대명', '단', '순서', '바코드', '제품코드', '제품명', '판매가', '진열방식', '분류', '사이즈(W×H×D mm)'];
    const info = [
      ['매장', `${pog.storeName || ''} (${pog.storeCode || ''})`],
      ['POG', pogTitle(pog)],
      ['POG 가져온 날', fmtDate(pog.grabbedAt)],
      ['합계', `페이지 ${new Set(body.map(r => r[1])).size}개, 제품 ${body.length}개`],
      [],
    ];
    const ws = X.utils.aoa_to_sheet([...info, head, ...body]);
    ws['!cols'] = [6, 7, 26, 6, 6, 16, 11, 40, 9, 9, 22, 16].map(wch => ({ wch }));
    body.forEach((_, i) => ['F', 'G'].forEach(c => { const k = c + (info.length + 2 + i); if (ws[k]) ws[k].t = 's'; })); // 바코드·제품코드는 글자로 (앞의 0이 안 빠지게)
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: info.length, c: 0 }, e: { r: info.length + body.length, c: head.length - 1 } }) };
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, '제품리스트');
    X.writeFile(wb, `제품리스트_${pogTitle(pog)}_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`.replace(/[\\/:*?"<>|]/g, ''));
    toast(`엑셀을 저장했어요 · 제품 ${body.length}개`);
  } catch (e) { toast(e.message); }
}
$('#ed-products').onclick = () => exportProducts(state.currentPog, [...state.fixtures.values()]);
$('#vw-products').onclick = () => exportProducts(state.viewer.pog, state.viewer.fixtures);
// 관리자용: 이 POG 제품 중 바코드 등록이 안 된 제품코드만 엑셀로 (바코드 업로드 양식과 같은 열: 제품코드 · 바코드 · 제품명)
async function exportNoBarcode(pog, fixtures) {
  if (!pog) return;
  const names = new Map();
  for (const f of fixtures) if (f.kind !== 'free') for (const it of f.items || []) { const c = code8(String(it.code || '').trim()); if (c && !names.has(c)) names.set(c, it.name || ''); }
  if (!names.size) { alert('이 POG에 제품이 없어요.'); return; }
  const b = $('#vw-nobc'), t0 = b.textContent; b.disabled = true; b.textContent = '확인하는 중…';
  try {
    const codes = [...names.keys()], has = new Set();
    for (let i = 0; i < codes.length; i += 30) { // 한 번에 30개씩 (Firestore 'in' 한도)
      const part = codes.slice(i, i + 30);
      const snap = await getDocs(query(collection(db, 'barcodes'), where('code', 'in', part)));
      snap.docs.forEach(d => { const c = String(d.data().code); if (part.includes(c)) has.add(c); });
      b.textContent = `확인하는 중… ${Math.min(codes.length, i + 30)} / ${codes.length}`;
    }
    const miss = codes.filter(c => !has.has(c)).sort();
    if (!miss.length) { alert(`이 POG의 제품 ${codes.length.toLocaleString()}종 모두 바코드가 등록돼 있어요.`); return; }
    const X = await loadXLSX(), ws = X.utils.aoa_to_sheet([['제품코드', '바코드', '제품명'], ...miss.map(c => [c, '', names.get(c)])]);
    miss.forEach((_, i) => { const k = 'A' + (i + 2); if (ws[k]) ws[k].t = 's'; }); // 앞의 0이 안 빠지게 글자로
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 36 }];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '바코드');
    X.writeFile(wb, `바코드없음_${(pogTitle(pog) || pog.storeCode || 'POG').replace(/[\\/:*?"<>|]/g, '')}_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`);
    toast(`바코드 없는 제품 ${miss.length.toLocaleString()}종 (전체 ${codes.length.toLocaleString()}종 중). 바코드 칸을 채워서 바코드 등록에 올리면 돼요`);
  } catch (e) { alert('만들지 못했어요: ' + (e.code || e.message)); }
  finally { b.disabled = false; b.textContent = t0; }
}
/* ---------- POG 사이트에서 다시 가져오기 (POG팀이 일부 매대만 고쳤을 때) ----------
   고유번호(mdidx)로 이 POG의 페이지를 찾아 제품·집기 모양만 최신으로 바꾼다.
   매대명·매대 타입·고리·이외집기·메모·사진·메모 상자는 그대로. 선반/파이프 칸은 손대지 않았을 때만 새 값으로.
   칸 수가 늘면 페이지를 그 뒤에 추가, 줄면 남는 페이지를 지움(미리보기에서 알려줌). 처음 보는 매대는 맨 뒤에 추가. */
/* '다시 가져오기'를 누르면 두 가지 (사용자):
   대체하기 = 지금 보고 있는 페이지를 새로 읽은 매대(여러 개면 골라서)로 바꿈. 매대명·매대 타입·고리·이외집기·메모 상자·도면 연결은 그대로
   추가하기 = 새로 읽은 매대를 맨 뒤에 페이지로 추가
   (예전 방식: 고유번호로 이 POG의 매대를 찾아 한꺼번에 최신으로 = openRegrabAuto) */
function openRegrab(hintFx) {
  const pog = state.currentPog; if (!pog) return;
  if (!state.edEditable) { toast(pog.status === 'final' ? '최종 POG예요. 잠금 해제한 뒤 다시 가져올 수 있어요' : '편집 권한이 없어요'); return; }
  const cur = hintFx || state.fixtures.get(state.edActive);
  const canRep = cur && cur.kind !== 'free';
  const close = modal(h('div', { class: 'rg-pick' },
    h('h3', {}, 'POG 사이트에서 다시 가져오기'),
    h('p', { class: 'mut' }, '어떻게 가져올까요?'),
    h('div', { class: 'rg-opts' },
      h('button', { class: 'rg-opt', disabled: !canRep, onclick: () => { close(); grabPaste('replace', cur); } },
        h('b', {}, '↻ 대체하기'), h('span', {}, canRep ? `지금 보고 있는 페이지 '${displayName(cur)}'를 새로 읽은 매대로 바꿔요. 매대명·매대 타입·고리·이외집기·메모 상자는 그대로예요.` : '바꿀 매대 페이지를 먼저 보고 눌러주세요 (표지·추가 페이지는 바꿀 수 없어요).')),
      h('button', { class: 'rg-opt', onclick: () => { close(); grabPaste('add', null); } },
        h('b', {}, '+ 추가하기'), h('span', {}, '새로 읽은 매대를 맨 뒤에 새 페이지로 넣어요.'))),
    h('p', { class: 'mut rg-auto' }, h('a', { href: '#', onclick: e => { e.preventDefault(); close(); openRegrabAuto(hintFx); } }, '고유번호로 여러 매대를 한꺼번에 최신으로 바꾸기 (예전 방식)'))));
}
// 북마클릿 결과 붙여넣기 → 읽은 매대(칸)마다 페이지 후보
function grabPaste(mode, target) {
  const pog = state.currentPog;
  const ta = h('textarea', { class: 'import-ta', placeholder: '여기에 붙여넣기 (Ctrl+V)' });
  const go = h('button', { class: 'btn primary' }, '다음');
  const close = modal(h('div', {},
    h('h3', {}, mode === 'replace' ? `대체하기 · '${displayName(target)}'` : '매대 추가하기'),
    h('ol', { class: 'steps' },
      h('li', {}, 'POG 사이트에서 매대 보기 화면(여러 개면 매대 목록에서 체크)을 열고 북마크(🐥 POG 가져오기 (국내))를 누르세요.'),
      h('li', {}, "'복사하기'를 누르고 아래 칸에 붙여넣으세요.")),
    ta, h('p', { class: 'mut' }, '매대 밖에 빼둔 제품은 가져오지 않아요.'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = () => {
    let data;
    try { data = JSON.parse(ta.value.trim()); } catch { toast('붙여넣은 내용이 올바르지 않아요'); return; }
    if (!data || data.source !== 'pog.artbox.kr' || !Array.isArray(data.fixtures) || !data.fixtures.length) { toast('POG 데이터가 아니에요'); return; }
    const cands = [];
    data.fixtures.forEach((f, i) => {
      if (!(f.items || []).length && !(f.props || []).length && !(f.panels || []).length) return;
      cands.push(...pagesFromGrab(f, i).pages.filter(p => (p.items || []).length));
    });
    if (!cands.length) { toast('제품이 있는 매대가 없어요'); return; }
    const warn = data.storeCode && pog.storeCode && String(data.storeCode) !== String(pog.storeCode)
      ? `매장이 달라요. 붙여넣은 데이터: ${data.storeName} (${data.storeCode}) / 이 POG: ${pog.storeName} (${pog.storeCode})` : teamWarn(pog, data);
    close(); grabChoose(mode, target, cands, warn);
  };
}
// 다른 팀 매대가 섞여 있으면 알려줌 (국내: POG 하나 = 팀 하나)
function teamWarn(pog, data) {
  const t = pogTeam(pog); if (!t) return '';
  const others = [...new Set(data.fixtures.map(f => catName(f.teamName)).filter(x => x && x !== t))];
  return others.length ? `이 POG는 '${t}' 팀이에요. 붙여넣은 데이터에 다른 팀 매대가 있어요: ${others.join(', ')}` : '';
}
const candName = p => p.mdName + (p.bayCount > 1 ? ` (${p.bayNo}/${p.bayCount})` : '');
// 후보 고르기: 대체하기는 하나, 추가하기는 여러 개 (체크)
function grabChoose(mode, target, cands, warn) {
  const pog = state.currentPog, rep = mode === 'replace';
  const exist = new Set(sortedFx().filter(x => x.kind !== 'free').map(x => x.mdidx + '|' + (x.bayNo || 1)));
  let pick = rep ? 0 : null;
  const sel = new Set(rep ? [] : cands.map((_, i) => i));
  const go = h('button', { class: 'btn primary' }, rep ? '이 매대로 바꾸기' : '');
  const paint = () => {
    rows.forEach((r, i) => r.classList.toggle('on', rep ? pick === i : sel.has(i)));
    if (!rep) { go.textContent = `${sel.size}장 맨 뒤에 추가하기`; go.disabled = !sel.size; }
  };
  const rows = cands.map((p, i) => {
    const r = h('label', { class: 'rg-cand' },
      h('input', { type: rep ? 'radio' : 'checkbox', name: 'rgc', checked: rep ? i === 0 : true, onchange: e => { if (rep) pick = i; else e.target.checked ? sel.add(i) : sel.delete(i); paint(); } }),
      h('div', { class: 'rg-th' }, buildCanvas(p, 96, 72, null, { lazy: true })),
      h('div', {}, h('b', {}, candName(p)), h('div', { class: 'mut' }, `제품 ${p.items.length}개 · ${catName(p.teamName)}` + (!rep && exist.has(p.mdidx + '|' + p.bayNo) ? ' · 이미 이 POG에 있는 매대예요' : ''))));
    return r;
  });
  const close = modal(h('div', {},
    h('h3', {}, rep ? `'${displayName(target)}'를 어느 매대로 바꿀까요?` : '추가할 매대를 고르세요'),
    warn ? h('p', { class: 'err' }, warn) : null,
    rep ? h('p', { class: 'mut' }, `지금 제품 ${(target.items || []).length}개 → 고른 매대의 제품으로 바뀌어요. 매대 나누기 묶음·옮긴 위치·크기는 처음 상태로 돌아가요. Ctrl+Z로 되돌릴 수 있어요.`) : null,
    h('div', { class: 'rg-list' }, ...rows),
    h('div', { class: 'modal-act' }, go)), { wide: true });
  paint();
  go.onclick = async () => {
    go.disabled = true;
    try {
      if (rep) await replaceWithGrab(pog, target, cands[pick]);
      else await addGrabPages(pog, cands.filter((_, i) => sel.has(i)));
      close();
    } catch (e) { toast('가져오기 실패: ' + (e.code || e.message)); go.disabled = false; }
  };
}
async function replaceWithGrab(pog, o, pg) {
  await flushWrites();
  const patch = {
    mdidx: pg.mdidx, mdName: pg.mdName, teamName: pg.teamName, bayNo: pg.bayNo, bayCount: pg.bayCount,
    items: pg.items, props: pg.props, panels: pg.panels, board: pg.board || null, src: pg.src || null, outsideItems: [],
    itemCount: pg.itemCount, shelfCount: pg.shelfCount, pipeCount: pg.pipeCount,
    itemZ: {}, blocks: [], base: null, frame: null,
  };
  if (JSON.stringify(spRows(o)) === JSON.stringify(autoSp(o.shelfCount, o.pipeCount)) || !spRows(o).length) { patch.shelfPipe = pg.shelfPipe; patch.sp = pg.sp; }
  track(pog.id, o.id, Object.keys(patch), undoGroup());
  await updateDoc(doc(db, 'pogs', pog.id, 'fixtures', o.id), { ...patch, regrabbedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me() });
  const t = catName(pg.teamName); if (t && !(pog.teams || []).includes(t)) updateDoc(doc(db, 'pogs', pog.id), { teams: arrayUnion(t) }).catch(() => { });
  toast(`'${displayName(o)}' 페이지를 '${candName(pg)}' 매대로 바꿨어요`);
}
async function addGrabPages(pog, pages) {
  await flushWrites();
  const all = sortedFx(), ids = new Set(all.map(x => x.id)), g = undoGroup();
  const freeId = id => { let v = id; while (ids.has(v)) v = `${id}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`; ids.add(v); return v; };
  let end = Math.max(0, ...all.map(x => x.order)), first = null;
  const b = writeBatch(db);
  for (const { id, ...rest } of pages) {
    const nid = freeId(id); first = first || nid;
    track(pog.id, nid, 'new', g);
    b.set(doc(db, 'pogs', pog.id, 'fixtures', nid), { order: ++end, ...rest, headerName: '', fixtureType: '', hookType: '', hookCount: '', otherFixtures: '', memo: '', photos: [], notes: [], createdAt: serverTimestamp(), createdBy: me() });
  }
  await b.commit();
  const teams = [...new Set(pages.map(p => catName(p.teamName)).filter(t => t && !(pog.teams || []).includes(t)))];
  await updateDoc(doc(db, 'pogs', pog.id), { fixtureCount: all.length + pages.length, updatedAt: serverTimestamp(), ...(teams.length ? { teams: arrayUnion(...teams) } : {}) });
  toast(`매대 페이지 ${pages.length}장을 맨 뒤에 추가했어요`);
  setTimeout(() => { state.pageEls.get(first)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setEdActive(first); }, 400);
}
function openRegrabAuto(hintFx) {
  const pog = state.currentPog; if (!pog) return;
  if (!state.edEditable) { toast(pog.status === 'final' ? '최종 POG예요. 잠금 해제한 뒤 다시 가져올 수 있어요' : '편집 권한이 없어요'); return; }
  const ta = h('textarea', { class: 'import-ta', placeholder: '여기에 붙여넣기 (Ctrl+V)' });
  const go = h('button', { class: 'btn primary' }, '미리보기');
  const close = modal(h('div', {},
    h('h3', {}, 'POG 사이트에서 다시 가져오기'),
    h('p', { class: 'mut' }, '이미 입력한 매대명·매대 타입·고리·이외집기·메모·사진·메모 상자는 그대로 두고, 제품과 집기만 최신으로 바꿔요.'),
    h('ol', { class: 'steps' },
      h('li', {}, hintFx ? `POG 사이트에서 '${hintFx.mdName}' 매대 보기 화면을 열고 북마크(🐥 POG 가져오기 (국내))를 누르세요.`
        : 'POG 사이트에서 고친 매대의 보기 화면을 열고 북마크(🐥 POG 가져오기 (국내))를 누르세요. 여러 개면 매대 목록에서 체크하고 누르세요.'),
      h('li', {}, "'복사하기'를 누르고 아래 칸에 붙여넣으세요.")),
    ta, h('p', { class: 'mut' }, '매대 밖에 빼둔 제품은 가져오지 않아요.'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = () => {
    let data;
    try { data = JSON.parse(ta.value.trim()); } catch { toast('붙여넣은 내용이 올바르지 않아요'); return; }
    if (!data || data.source !== 'pog.artbox.kr' || !Array.isArray(data.fixtures) || !data.fixtures.length) { toast('POG 데이터가 아니에요'); return; }
    close(); showRegrabPreview(pog, planRegrab(pog, data));
  };
}
const countDiff = (a, b) => { const m = new Map(); b.forEach(x => m.set(x, (m.get(x) || 0) + 1)); let n = 0; a.forEach(x => { const c = m.get(x) || 0; if (c) m.set(x, c - 1); else n++; }); return n; };
function planRegrab(pog, data) {
  const all = sortedFx();
  const plan = { rows: [], updates: [], creates: [], deletes: [], adds: [], warn: '' };
  if (data.storeCode && pog.storeCode && String(data.storeCode) !== String(pog.storeCode))
    plan.warn = `매장이 달라요. 붙여넣은 데이터: ${data.storeName} (${data.storeCode}) / 이 POG: ${pog.storeName} (${pog.storeCode})`;
  else plan.warn = teamWarn(pog, data);
  data.fixtures.forEach((f, i) => {
    if (!(f.items || []).length && !(f.props || []).length && !(f.panels || []).length) return; // 빈 줄
    const { pages } = pagesFromGrab(f, i);
    const old = all.filter(x => x.kind !== 'free' && x.mdidx === String(f.mdidx)).sort((a, b) => (a.bayNo || 1) - (b.bayNo || 1));
    if (!old.length) { plan.adds.push(...pages); plan.rows.push({ name: f.mdName, text: `새 매대 · 페이지 ${pages.length}장을 맨 뒤에 추가` }); return; }
    const oc = old.flatMap(x => (x.items || []).map(it => it.code)), nc = pages.flatMap(p => p.items.map(it => it.code));
    const add = countDiff(nc, oc), del = countDiff(oc, nc);
    let text = `제품 ${oc.length} → ${nc.length}` + (add || del ? ` (추가 ${add} · 빠짐 ${del})` : ' (같은 제품, 위치만 새로)');
    if (old.length !== pages.length) text += ` · 칸 ${old.length} → ${pages.length}`;
    plan.rows.push({ name: f.mdName, text });
    pages.forEach((pg, k) => old[k] ? plan.updates.push({ o: old[k], pg }) : plan.creates.push({ after: old[old.length - 1], pg }));
    old.slice(pages.length).forEach(o => plan.deletes.push(o));
  });
  return plan;
}
function showRegrabPreview(pog, plan) {
  const nothing = !plan.updates.length && !plan.creates.length && !plan.adds.length && !plan.deletes.length;
  const go = h('button', { class: 'btn primary', disabled: nothing }, '적용하기');
  const close = modal(h('div', {},
    h('h3', {}, '다시 가져오기 미리보기'),
    plan.warn ? h('p', { class: 'err' }, plan.warn) : null,
    h('ul', { class: 'imp-sum' }, ...plan.rows.map(r => h('li', {}, h('b', {}, r.name), ` · ${r.text}`))),
    plan.deletes.length ? h('p', { class: 'err' }, `칸이 줄어서 페이지 ${plan.deletes.length}장(${plan.deletes.map(displayName).join(', ')})을 지워요. 그 페이지의 입력 내용·메모도 함께 지워져요.`) : null,
    h('p', { class: 'mut' }, '매대명·매대 타입·고리·이외집기·메모·사진·메모 상자는 그대로예요. 메모 상자 위치가 새 제품과 안 맞으면 옮겨주세요.'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true; go.textContent = '적용 중…';
    try { await applyRegrab(pog, plan); close(); }
    catch (e) { toast('다시 가져오기 실패: ' + e.message); go.disabled = false; go.textContent = '적용하기'; }
  };
}
async function applyRegrab(pog, plan) {
  await flushWrites(); clearUndo();
  const all = sortedFx(), ids = new Set(all.map(x => x.id));
  const freeId = id => { let v = id; while (ids.has(v)) v = `${id}_${Date.now().toString(36)}`; ids.add(v); return v; };
  const blank = { headerName: '', fixtureType: '', hookType: '', hookCount: '', otherFixtures: '', memo: '', photos: [], notes: [] };
  let b = writeBatch(db), n = 0;
  const flush = async () => { if (n) { await b.commit(); b = writeBatch(db); n = 0; } };
  const put = async (fn) => { fn(); if (++n >= 400) await flush(); };
  for (const { o, pg } of plan.updates) {
    const keep = new Set(pg.items.map(it => String(it.id)));
    const patch = {
      items: pg.items, props: pg.props, panels: pg.panels, board: pg.board || null, src: pg.src || null, outsideItems: [],
      mdName: pg.mdName, teamName: pg.teamName, bayNo: pg.bayNo, bayCount: pg.bayCount,
      itemCount: pg.itemCount, shelfCount: pg.shelfCount, pipeCount: pg.pipeCount,
      itemZ: Object.fromEntries(Object.entries(o.itemZ || {}).filter(([k]) => keep.has(k))),
      regrabbedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me(),
    };
    // 선반/파이프: 손대지 않았을 때만 새 수로
    if (JSON.stringify(spRows(o)) === JSON.stringify(autoSp(o.shelfCount, o.pipeCount)) || !spRows(o).length) { patch.shelfPipe = pg.shelfPipe; patch.sp = pg.sp; }
    await put(() => b.update(doc(db, 'pogs', pog.id, 'fixtures', o.id), patch));
  }
  // 칸이 늘어난 매대: 그 매대 마지막 페이지 바로 뒤에 끼워 넣기
  const lastOrder = new Map();
  for (const { after, pg } of plan.creates) {
    const prev = lastOrder.get(after.id) ?? after.order;
    const next = all.find(x => x.order > prev && x.id !== after.id);
    const order = next ? (prev + next.order) / 2 : prev + 1;
    lastOrder.set(after.id, order);
    const { id, ...rest } = pg;
    await put(() => b.set(doc(db, 'pogs', pog.id, 'fixtures', freeId(id)), { order, ...rest, ...blank }));
  }
  let end = Math.max(0, ...all.map(x => x.order));
  for (const pg of plan.adds) {
    const { id, ...rest } = pg;
    await put(() => b.set(doc(db, 'pogs', pog.id, 'fixtures', freeId(id)), { order: ++end, ...rest, ...blank }));
  }
  for (const o of plan.deletes) {
    for (const ph of [...(o.photos || []), ...(o.notes || []).filter(x => x.path)]) { try { await deleteObject(sRef(st, ph.path)); } catch { } }
    await put(() => b.delete(doc(db, 'pogs', pog.id, 'fixtures', o.id)));
  }
  await flush();
  const total = plan.updates.length + plan.creates.length + plan.adds.length;
  await updateDoc(doc(db, 'pogs', pog.id), { fixtureCount: all.length + plan.creates.length + plan.adds.length - plan.deletes.length, updatedAt: serverTimestamp() });
  toast(`페이지 ${total}장을 최신으로 바꿨어요` + (plan.deletes.length ? ` · ${plan.deletes.length}장 삭제` : ''));
}
$('#ed-regrab').onclick = () => openRegrab(null);

/* ---------- 매장 등록 ----------
   stores/{id}: code(지점코드 = POG 사이트 매장코드), branch(지점명), openDate(오픈 예정일). 도면은 drawings/{같은 id}
   (국내용: 파트너 이름 칸은 없앰 · 사용자. 예전에 넣은 partner는 지점명이 비었을 때만 씀) */
const storeName = st => st ? (st.branch || st.partner || '').trim() : '';
const storeForPog = pog => pog && (state.stores.find(x => x.id === pog.storeId) || state.stores.find(x => String(x.code).trim() === String(pog.storeCode || '').trim()));
// 도면 문서에 매장 정보 (매장 계정은 매장 목록을 못 읽어서 이름도 같이 둠)
const dwStoreInfo = st => ({ storeCode: st?.code || '', storeName: storeName(st), branch: storeName(st) });
// 제품 찾기 매장 이름: '업체 (매장명)' (사용자)
const partnerBranch = (partner, branch) => branch || partner || ''; // 국내용: 지점명만
// 매장 삭제: 이 매장의 POG(매장코드가 같거나 이어진 것)·도면을 모두 지움. '매장 삭제하겠습니다'를 똑같이 써야 지워짐
const STORE_DEL_WORD = '매장 삭제하겠습니다';
function deleteStoreAll(st) {
  const pogs = state.pogs.filter(p => p.storeId === st.id || (st.code && String(p.storeCode || '').trim() === String(st.code).trim()));
  const d = state.dwMap.get(st.id);
  const inp = h('input', { class: 'del-confirm', placeholder: STORE_DEL_WORD, autocomplete: 'off' });
  const go_ = h('button', { class: 'btn danger', disabled: true }, '모두 삭제');
  inp.addEventListener('input', () => { go_.disabled = inp.value.trim() !== STORE_DEL_WORD; });
  const close = modal(h('div', { class: 'del-box' },
    h('h3', {}, `'${storeName(st)}' (${st.code}) 매장 삭제`),
    h('p', {}, '아래가 모두 함께 지워지고 되돌릴 수 없어요.'),
    h('ul', { class: 'steps' },
      h('li', {}, '매장 정보'),
      h('li', {}, pogs.length ? `POG ${pogs.length}개 (모든 페이지·메모 사진): ${pogs.map(p => `${pogTitle(p)}${p.status === 'final' ? ' (최종)' : ' (작성 중)'}`).join(', ')}` : 'POG 없음'),
      h('li', {}, d?.latestNo ? `도면 (ver.${d.latestNo}까지 모든 버전·파일)` : '도면 없음')),
    h('p', {}, '지우려면 아래 칸에 ', h('b', {}, STORE_DEL_WORD), '를 똑같이 써주세요.'),
    inp, h('div', { class: 'modal-act' }, go_)));
  inp.focus();
  go_.onclick = async () => {
    if (inp.value.trim() !== STORE_DEL_WORD) return;
    go_.disabled = true; inp.disabled = true;
    try {
      for (const [i, p] of pogs.entries()) { go_.textContent = `POG 지우는 중… (${i + 1}/${pogs.length})`; if (state.currentPog?.id === p.id) closePog(); await deletePogAll(p.id); }
      if (d) { go_.textContent = '도면 지우는 중…'; if (dw.id === st.id) closeDw(); await deleteDrawingAll(st.id); }
      await deleteDoc(doc(db, 'stores', st.id));
      close(); toast(`매장을 삭제했어요 · POG ${pogs.length}개${d ? ' · 도면' : ''}도 함께 지웠어요`);
    } catch (e) { alert('지우다가 멈췄어요: ' + (e.code || e.message) + '\n다시 누르면 남은 것을 이어서 지워요.'); go_.textContent = '모두 삭제'; go_.disabled = false; inp.disabled = false; }
  };
}
function renderStores() {
  const body = $('#st-body'); if (!body) return;
  const ed = canEdit('stores');
  body.innerHTML = '';
  if (!state.stores.length) { body.append(h('tr', {}, h('td', { colspan: 6, class: 'mut pad' }, '등록된 매장이 없어요.'))); return; }
  for (const st of state.stores) {
    const inp = (f, type = 'text') => {
      const el = h('input', { type, value: st[f] || '', disabled: !ed });
      el.addEventListener('change', async () => {
        const v = el.value.trim();
        if (f === 'code' && state.stores.some(x => x.id !== st.id && String(x.code) === v)) { toast('이미 있는 지점코드예요'); el.value = st.code; return; }
        await updateDoc(doc(db, 'stores', st.id), { [f]: v, updatedAt: serverTimestamp(), updatedBy: me() }); toast('수정했어요');
      });
      return el;
    };
    const d = state.dwMap.get(st.id);
    const fin = d && dwFinalNo(d);
    const pogs = state.pogs.filter(p => String(p.storeCode) === String(st.code));
    body.append(h('tr', {}, h('td', {}, inp('code')), h('td', {}, inp('branch')), h('td', {}, inp('openDate', 'date')),
      h('td', { class: 'st-dw' }, d?.latestNo ? `ver.${d.latestNo}${fin ? ` · ★ver.${fin}` : ''}${d.area ? ` · ${d.area}평` : ''}` : '없음'),
      h('td', { class: 'st-dw' }, pogs.length ? `${pogs.length}개${pogs.some(p => p.status === 'final') ? ' (최종 있음)' : ''}` : '없음'),
      // 매장 삭제는 관리자만 (규칙도 같음). 이 매장의 POG·도면도 함께 지움 (deleteStoreAll)
      h('td', { class: 'tc' }, state.level === 'admin' ? h('button', { class: 'btn ghost danger small', onclick: () => deleteStoreAll(st) }, '삭제') : null)));
  }
}
$('#st-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, code = f.code.value.trim(), branch = f.branch.value.trim(), openDate = f.open.value;
  if (!code || !branch) return;
  if (state.stores.some(x => String(x.code) === code)) { toast('이미 등록된 지점코드예요'); return; }
  try {
    await addDoc(collection(db, 'stores'), { code, branch, openDate, createdAt: serverTimestamp(), createdBy: me() });
    toast('매장을 등록했어요'); f.reset(); f.code.focus();
  } catch (err) { toast('등록 실패: ' + err.message); }
});

/* ---------- 1. 도면: 업로드(VMD) · 온라인 도면 ----------
   drawings/{storeId}: storeId, storeCode, area(평수), latestNo, finalVersion(★ 최종본 버전 id), status('final' = 내보낸 버전이 있음)
   drawings/{storeId}/versions/{vId}: no, fileName, url/path(정리한 SVG),
     w, h(viewBox), groups(매대명 글자 묶음 [{id, ko, lines, x,y,w,h, fs}]), memo, exported, uploadedAt/By, exportedAt/By
   SVG는 올릴 때 한 번만 브라우저에서 읽어서 글자 위치를 저장한다 (나중엔 그림으로만 보여줘서 다른 설정이 필요 없음) */
const dwFinal = d => d?.finalVersion || null;
const dwFinalNo = d => d?.finalNo || null;
const dw = { tab: 'up', id: null, doc: null, versions: [], vId: null, sel: null, unsubs: [] };
// 화면: up = 도면 업로드(VMD), on = 온라인 도면(최종본 보기)
const dwf = { pog: undefined, jump: false }; // 도면 찾기 (아래 dwFindHits)
const DW_TITLE = { up: '도면 업로드', on: '도면' };
function setDwMode(m) {
  if (dw.tab === m && dw.modeSet) return;
  dw.modeSet = true; dw.tab = m;
  $('#dw-mode-title').textContent = DW_TITLE[m];
  const id = dw.id; closeDw(); renderDwList();
  if (id && dwListRows().some(x => x.id === id)) openDw(id);
}
$('#dw-search').addEventListener('input', renderDwList);
// 매장 계정은 매장 목록을 못 읽음 → 도면 문서의 매장 정보로 목록을 만듦
const dwStores = () => isStaff() ? state.stores : [...state.dwMap.values()].map(d => ({ id: d.id, code: d.storeCode || '', branch: d.storeName || '' }));
function dwListRows() {
  const q = $('#dw-search').value.trim().toLowerCase();
  return dwStores().filter(st => {
    const d = state.dwMap.get(st.id);
    if (dw.tab !== 'up' && !(d?.status === 'final') && !canEdit('drawing')) return false; // 도면 보기는 내보낸 도면만 (도면 편집 계정은 모든 매장 · 거기서 📤 도면 업로드)
    return !q || [st.code, st.partner, st.branch].join(' ').toLowerCase().includes(q);
  });
}
function renderDwList() {
  const list = $('#dw-list'); if (!list) return;
  const rows = dwListRows();
  list.innerHTML = '';
  const dq = $('#dw-search').value.trim();
  if (!rows.length && dq) list.append(h('div', { class: 'mut pad' }, `'${dq}'와 맞는 매장이 없어요. `, h('button', { class: 'btn small', onclick: () => { $('#dw-search').value = ''; renderDwList(); $('#dw-search').focus(); } }, '검색 지우기')));
  else if (!rows.length) list.append(h('div', { class: 'mut pad' }, dw.tab !== 'up' ? '내보낸 도면이 있는 매장이 없어요.' : '등록된 매장이 없어요. 처음 화면의 \'매장 등록\'에서 먼저 등록해주세요.'));
  for (const st of rows) {
    const d = state.dwMap.get(st.id);
    const sub = !d?.latestNo ? '도면 없음' : `ver.${d.latestNo}${d.latestExported ? '' : ' 작성 중'}${dwFinalNo(d) ? ` · ★ver.${dwFinalNo(d)}` : ''}`;
    list.append(h('div', { class: 'pitem' + (dw.id === st.id ? ' on' : ''), onclick: () => openDw(st.id) },
      h('div', { class: 'pi-top' }, h('b', {}, storeName(st)), d?.status === 'final' ? h('span', { class: 'badge final' }, '내보냄') : d?.latestNo ? h('span', { class: 'badge draft' }, '작성 중') : null),
      h('div', { class: 'pi-sub' }, `${st.code} · ${sub}`)));
  }
  $('#dw-empty').replaceChildren(...(dw.tab === 'up'
    ? [h('div', { class: 'upload-rule' }, h('b', {}, '업로드 파일은 SVG 파일'), ' · ', h('b', {}, '글씨는 윤곽선 만들기 하지 말아주세요'),
        h('div', { class: 'mut' }, '매대명이 글자로 남아 있어야 POG에서 매대를 고를 수 있어요.')),
       h('div', {}, '왼쪽에서 매장을 고르세요.')]
    : [h('div', {}, '볼 매장을 고르세요.'), h('div', { class: 'mut' }, canEdit('drawing') ? "도면을 올리거나 고치려면 매장을 고르고 위의 '📤 도면 업로드'를 누르세요." : 'VMD실이 내보낸 도면만 나와요.')]));
}
function closeDw() {
  dw.unsubs.forEach(u => u()); dw.unsubs = []; dw.id = null; dw.doc = null; dw.versions = []; dw.vId = null; dw.sel = null;
  $('#dw-body')?.classList.add('hidden'); $('#dw-empty')?.classList.remove('hidden');
  $('#v-dw .split')?.classList.remove('list-off');
}
function openDw(id) {
  closeDw();
  dw.id = id; $('#dw-find').value = ''; dwf.pog = undefined; dw.seqMode = false; dw.seqDraft = null; $('#dw-seqbtn')?.classList.remove('primary'); dw.seqUnsub?.(); dw.seqKey = null; dw.seq = []; dw.cropping = false; dw.cropDraft = null; dw.zoom = 1;
  $('#dw-empty').classList.add('hidden'); $('#dw-body').classList.remove('hidden');
  $('#dw-stage').replaceChildren(h('div', { class: 'mut pad' }, '불러오는 중…'));
  renderDwList();
  dw.unsubs.push(onSnapshot(doc(db, 'drawings', id), d => { dw.doc = d.exists() ? { id: d.id, ...d.data() } : null; renderDw(); }, () => { }));
  dw.unsubs.push(onSnapshot(query(collection(db, 'drawings', id, 'versions'), orderBy('no')), s => {
    dw.versions = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!dw.versions.some(v => v.id === dw.vId)) dw.vId = null;
    renderDw();
  }, () => { dw.versions = []; renderDw(); }));
}
const curVersion = () => dw.versions.find(v => v.id === dw.vId);
function pickDefaultVersion() {
  if (dw.vId && dw.versions.some(v => v.id === dw.vId)) return;
  const exported = dw.versions.filter(v => v.exported);
  dw.vId = dw.tab !== 'up' ? (dwFinal(dw.doc) && exported.some(v => v.id === dwFinal(dw.doc)) ? dwFinal(dw.doc) : exported.at(-1)?.id)
    : dw.versions.at(-1)?.id || null;
}
function renderDw() {
  if (!dw.id) return;
  const st = dwStores().find(x => x.id === dw.id);
  pickDefaultVersion();
  const v = curVersion(), up = dw.tab === 'up';
  $('#dw-title').textContent = `${storeName(st)} (${st?.code || ''})`;
  const area = $('#dw-area'); area.disabled = !up || !canEdit('drawing');
  if (area !== document.activeElement) area.value = dw.doc?.area ?? '';
  area.classList.toggle('need', up && canEdit('drawing') && !(Number(area.value) > 0));
  $('#dw-area-f').classList.toggle('hidden', !up && !dw.doc?.area);
  $('#dw-side').classList.toggle('hidden', dw.tab === 'on'); // 온라인 도면은 보기만
  $('#dw-log').classList.toggle('hidden', dw.tab === 'on');
  $('#dw-seqbtn').classList.toggle('hidden', dw.tab !== 'on' || !isStaff() || !v);
  dwUndoBtns();
  $('#dw-find-box').classList.toggle('hidden', up);
  const fin = dwFinal(dw.doc);
  $('#dw-ver').textContent = v ? `ver.${v.no}${v.id === fin ? ' ★최종본' : ''}${v.exported ? '' : ' · 작성 중'}` : '도면 없음';
  $('#dw-ver').className = 'badge ' + (v?.exported ? 'final' : 'draft');
  $('#dw-upload').classList.toggle('hidden', !up || !canEdit('drawing'));
  $('#dw-goup').classList.toggle('hidden', up || !canEdit('drawing'));
  $('#dw-goon').classList.toggle('hidden', !up);
  $('#dw-upload').textContent = dw.versions.length ? '재업로드' : '도면 파일 올리기';
  $('#dw-export').classList.toggle('hidden', !up || !canEdit('drawing') || !v || v.exported);
  $('#dw-reedit').classList.toggle('hidden', !up || !canEdit('drawing') || !v?.exported || v.id !== dw.versions.at(-1)?.id);
  $('#dw-print').classList.toggle('hidden', !v);
  renderDwStage(); renderDwSide();
}
$('#dw-goup').onclick = () => go('dw-up');
$('#dw-goon').onclick = () => go('dw-online');
$('#dw-area').addEventListener('input', e => {
  e.target.classList.toggle('need', !(Number(e.target.value) > 0));
  const id = dw.id, st = state.stores.find(x => x.id === id), val = e.target.value === '' ? '' : Number(e.target.value);
  { const ref = doc(db, 'drawings', id), b0 = dw.doc?.area ?? ''; dwTrack('area|' + id, '평수', () => setDoc(ref, { area: b0 }, { merge: true }), () => setDoc(ref, { area: val }, { merge: true })); }
  queueWrite(`dw|${id}|area`, () => setDoc(doc(db, 'drawings', id), { ...dwStoreInfo(st), storeId: id, area: val, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true }));
});
// 평수는 꼭 적어야 올리기·내보내기가 됨 (사용자)
function needArea() {
  const a = $('#dw-area'), ok = a.value.trim() !== '' && Number(a.value) > 0;
  a.classList.toggle('need', !ok);
  if (!ok) { alert('평수를 먼저 적어주세요. 평수가 있어야 도면을 저장할 수 있어요.'); a.focus(); }
  return ok;
}
$('#dw-upload').onclick = () => { if (needArea()) $('#dw-file').click(); };
$('#dw-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await uploadDrawing(f); };
// 도면 파일을 화면에 끌어다 놓아도 올라감 (도면 업로드 화면, VMD·관리자)
const canDrop = () => dw.id && dw.tab === 'up' && canEdit('drawing') && state.view === 'dw-up';
const dropZone = $('#dw-body');
dropZone.addEventListener('dragover', e => { if (!canDrop() || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dropZone.classList.add('dropping'); });
dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dropping'); });
dropZone.addEventListener('drop', async e => {
  dropZone.classList.remove('dropping');
  if (!canDrop()) return;
  e.preventDefault();
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (!needArea()) return;
  await uploadDrawing(f);
});
// 다른 곳에 떨어뜨려도 브라우저가 파일을 열어 사이트를 떠나지 않게
window.addEventListener('dragover', e => { if (state.view === 'dw-up' && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => { if (state.view === 'dw-up') e.preventDefault(); });
$('#dw-print').onclick = () => {
  const imgs = $$('#dw-stage img').filter(i => !i.complete);
  Promise.all(imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 8000); }))).then(() => window.print());
};

// SVG 읽기: 위험한 부분(script 등) 빼고, 화면 밖에 그려서 글자마다 위치를 잰 뒤 매대 단위로 묶음
async function analyzeSvg(text) {
  const xml = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = xml.documentElement;
  if (xml.querySelector('parsererror') || svg.nodeName.toLowerCase() !== 'svg') throw new Error('SVG 파일이 아니에요');
  svg.querySelectorAll('script, foreignObject, iframe').forEach(e => e.remove());
  svg.querySelectorAll('*').forEach(e => [...e.attributes].forEach(a => { if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) e.removeAttribute(a.name); }));
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const [vx, vy, vw, vh] = vb.length === 4 && vb.every(n => isFinite(n)) && vb[2] > 0 ? vb
    : [0, 0, parseFloat(svg.getAttribute('width')) || 1000, parseFloat(svg.getAttribute('height')) || 700];
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  const clean = new XMLSerializer().serializeToString(svg);
  const host = h('div', { style: 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none' });
  const live = document.importNode(svg, true);
  live.setAttribute('width', vw); live.setAttribute('height', vh);
  host.append(live); document.body.append(host);
  const root = live.getBoundingClientRect(), k = vw / (root.width || vw);
  const lines = [], dark = new Set(); // dark = 검은 글씨 (치수·W800 같은 것): 번역 칸을 만들지 않고 영문 도면에도 그대로 남김 (사용자)
  const leaves = t => { const ps = [...t.querySelectorAll('tspan')].filter(x => !x.querySelector('tspan')); return ps.length ? ps : [t]; };
  live.querySelectorAll('text').forEach((t, ti) => {
    leaves(t).forEach((el, li) => {
      if (!el.textContent.trim()) return;
      if (isDarkFill(getComputedStyle(el).fill)) { dark.add(ti + ':' + li); return; }
      for (const c of charRuns(el)) {
        const w = c.w * k, hh = c.h * k;
        lines.push({ text: c.text, x: (c.x - root.left) * k, y: (c.y - root.top) * k, w, h: hh, lh: c.text.length > 1 && hh > w * 1.5 ? w : hh }); // lh = 글자 굵기 (세로 글씨면 폭)
      }
    });
  });
  host.remove();
  // 바탕(영문 도면용): 검은 글씨만 남기고 나머지 글자를 지움
  const base = svg.cloneNode(true);
  base.querySelectorAll('text').forEach((t, ti) => {
    const ls = leaves(t), keep = ls.filter((_, li) => dark.has(ti + ':' + li));
    if (!keep.length) t.remove(); else if (keep.length < ls.length) ls.forEach((el, li) => { if (!dark.has(ti + ':' + li)) el.remove(); });
  });
  return { w: vw, h: vh, clean, base: new XMLSerializer().serializeToString(base), lines: lines.length, darkKept: dark.size, groups: groupLines(lines) };
}
// 검은색(또는 아주 진한 회색) 글씨인지: Illustrator 검정 #231F20 등
function isDarkFill(f) {
  const m = String(f || '').match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/); if (!m) return false;
  const c = [+m[1], +m[2], +m[3]];
  return Math.max(...c) < 90 && Math.max(...c) - Math.min(...c) < 40;
}
// 글자 조각 하나를 글자 위치로 다시 나눔: 한 조각 안에 멀리 떨어진 매대명 여러 개가 들어 있을 때 (글자 크기만큼 떨어지면 다른 덩어리)
function charRuns(el) {
  const whole = () => { const r = el.getBoundingClientRect(); return r.width && r.height ? [{ text: el.textContent.replace(/\s+/g, ' ').trim(), x: r.left, y: r.top, w: r.width, h: r.height }] : []; };
  let n, m;
  try { n = el.getNumberOfChars(); m = el.getScreenCTM(); } catch { return whole(); }
  if (!n || !m || n > 2000) return whole();
  const str = el.textContent, boxes = [];
  for (let i = 0; i < n; i++) {
    let e; try { e = el.getExtentOfChar(i); } catch { return whole(); }
    const pts = [[e.x, e.y], [e.x + e.width, e.y], [e.x, e.y + e.height], [e.x + e.width, e.y + e.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    boxes.push({ ch: str[i] ?? '', x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) });
  }
  const runs = []; let cur = null, prev = null;
  for (const bx of boxes) {
    if (/\s/.test(bx.ch)) { if (cur) cur.sp = true; continue; }
    const fs = Math.min(bx.r - bx.x, bx.b - bx.y) > 0 ? Math.max(bx.r - bx.x, bx.b - bx.y) : 0;
    const gap = prev ? Math.max(bx.x - prev.r, prev.x - bx.r, bx.y - prev.b, prev.y - bx.b, 0) : 0;
    if (!cur || gap > Math.max(fs, prev.b - prev.y, prev.r - prev.x) * 0.9) { cur = { text: '', x: bx.x, y: bx.y, r: bx.r, b: bx.b }; runs.push(cur); }
    else if (cur.sp) cur.text += ' ';
    cur.sp = false; cur.text += bx.ch;
    cur.x = Math.min(cur.x, bx.x); cur.y = Math.min(cur.y, bx.y); cur.r = Math.max(cur.r, bx.r); cur.b = Math.max(cur.b, bx.b);
    prev = bx;
  }
  const out = runs.filter(r => r.text && r.r > r.x && r.b > r.y).map(r => ({ text: r.text, x: r.x, y: r.y, w: r.r - r.x, h: r.b - r.y }));
  return out.length ? out : whole();
}
// 같은 매대 이름: 같은 줄에서 바로 붙은 조각 + 위아래로 이어지고 가로로 겹치는 줄 (예: '캐릭터인형' / 'ACC' / '/파우치 키링')
function groupLines(lines) {
  const par = lines.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
    const p = lines[a], q = lines[b], lh = Math.max(Math.min(p.lh, q.lh), 0.5);
    const hOver = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
    const vGap = Math.max(p.y, q.y) - Math.min(p.y + p.h, q.y + q.h);
    const sameRow = Math.abs((p.y + p.h / 2) - (q.y + q.h / 2)) < lh * 0.5;
    const near = sameRow ? -hOver < lh * 0.35
      : vGap < lh * 0.5 && Math.abs((p.x + p.w / 2) - (q.x + q.w / 2)) < Math.max(p.w, q.w) * 0.6 + lh;
    if (near) par[find(a)] = find(b);
  }
  const m = new Map(); lines.forEach((l, i) => { const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(l); });
  const groups = [...m.values()].map(makeGroup).sort((a, b) => a.y - b.y || a.x - b.x);
  return groups.map((g, i) => ({ id: 'g' + i, ...g }));
}
// 글자 조각들 → 매대명 묶음 하나 (parts = 나누기·합치기용 조각)
function makeGroup(ls) {
  ls.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const l of ls) { const last = rows.at(-1); if (last && Math.abs(last.cy - (l.y + l.h / 2)) < l.lh * 0.5) last.parts.push(l); else rows.push({ cy: l.y + l.h / 2, parts: [l] }); }
  const texts = rows.map(r => r.parts.sort((a, b) => a.x - b.x).reduce((acc, p, i, arr) => !i ? p.text : acc + (p.x - (arr[i - 1].x + arr[i - 1].w) > p.lh * 0.25 ? ' ' : '') + p.text, ''));
  const x = Math.min(...ls.map(l => l.x)), y = Math.min(...ls.map(l => l.y));
  const fs = ls.map(l => l.lh).sort((a, b) => a - b)[Math.floor(ls.length / 2)];
  const parts = ls.map(l => ({ text: l.text, x: +l.x.toFixed(2), y: +l.y.toFixed(2), w: +l.w.toFixed(2), h: +l.h.toFixed(2), lh: +(l.lh ?? l.h).toFixed(2) }));
  return { ko: joinLabel(texts), lines: texts, parts, x: +x.toFixed(2), y: +y.toFixed(2), w: +(Math.max(...ls.map(l => l.x + l.w)) - x).toFixed(2), h: +(Math.max(...ls.map(l => l.y + l.h)) - y).toFixed(2), fs: +fs.toFixed(2) };
}
// 줄 잇기: '/'로 끝나거나 시작하면 붙이고, 아니면 띄어쓰기
const joinLabel = ts => ts.reduce((acc, t) => !acc ? t : (acc.endsWith('/') || t.startsWith('/') ? acc + t : acc + ' ' + t), '');

async function uploadDrawing(file) {
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') { alert('SVG 파일만 올릴 수 있어요.\n(Illustrator: 파일 → 내보내기 → 다른 이름으로 내보내기 → SVG. 글씨는 윤곽선 만들기 하지 말아주세요)'); return; }
  const id = dw.id, store = state.stores.find(x => x.id === id);
  let an;
  try { toast('도면을 읽는 중…'); an = await analyzeSvg(await file.text()); }
  catch (e) { alert('도면을 읽지 못했어요: ' + e.message); return; }
  if (!an.groups.length && !confirm('도면에서 글자를 하나도 못 읽었어요.\n매대명을 윤곽선 만들기 했다면 POG에서 매대를 고를 수 없어요.\n그래도 올릴까요?')) return;
  const latest = dw.versions.at(-1), redo = latest && !latest.exported; // 아직 안 내보낸 버전이면 그 버전을 바꿈
  const no = redo ? latest.no : (latest?.no || 0) + 1, vId = redo ? latest.id : 'v' + no, ts = Date.now();
  const path = `drawings/${id}/v${no}_${ts}.svg`;
  try {
    toast('도면 올리는 중…');
    const typ = { contentType: 'image/svg+xml' };
    await uploadBytes(sRef(st, path), new Blob([an.clean], { type: 'image/svg+xml' }), typ);
    const url = await getDownloadURL(sRef(st, path));
    if (redo) for (const p of [latest.path, latest.basePath]) if (p) deleteObject(sRef(st, p)).catch(() => { });
    await setDoc(doc(db, 'drawings', id, 'versions', vId), {
      no, fileName: file.name, url, path, w: an.w, h: an.h, groups: an.groups, lineCount: an.lines,
      memo: redo ? (latest.memo || '') : '', exported: false, uploadedAt: serverTimestamp(), uploadedBy: me(), uploadedByName: myName(),
    });
    await setDoc(doc(db, 'drawings', id), { ...dwStoreInfo(store), storeId: id, latestNo: no, latestExported: false, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true });
    dw.vId = vId;
    toast(`ver.${no} 올렸어요 · 매대명 ${an.groups.length}개 읽음${an.darkKept ? ` (검은 글씨 ${an.darkKept}개는 매대명으로 안 봄)` : ''}. 다 되면 '내보내기'를 눌러주세요`);
  } catch (e) { toast('올리기 실패: ' + e.message); }
}
$('#dw-export').onclick = async () => {
  const v = curVersion(); if (!v || v.exported) return;
  if (!needArea()) return;
  if (!confirm(`ver.${v.no}을(를) 내보낼까요?\n내보내면 온라인 도면과 POG에서 쓸 수 있어요. 고칠 게 생기면 '재업로드'로 다음 버전을 올리면 돼요.`)) return;
  const b = writeBatch(db);
  b.update(doc(db, 'drawings', dw.id, 'versions', v.id), { exported: true, exportedAt: serverTimestamp(), exportedBy: me() });
  addLog(['drawings', dw.id], { vId: v.id, area: 'up', act: '내보내기', what: `ver.${v.no}` });
  b.set(doc(db, 'drawings', dw.id), { status: 'final', latestExported: v.no === dw.doc?.latestNo, updatedAt: serverTimestamp() }, { merge: true });
  await b.commit();
  toast(`ver.${v.no}을(를) 내보냈어요. 최종본이면 버전 기록에서 ★를 눌러주세요`);
};
// 다시 편집 (사용자): 내보낸 마지막 버전을 '작성 중'으로 되돌림 → 재업로드하면 같은 버전을 바꿔치기, 다 고치면 다시 '내보내기'
$('#dw-reedit').onclick = async () => {
  const v = curVersion(); if (!v || !v.exported || v.id !== dw.versions.at(-1)?.id) return;
  const others = dw.versions.filter(x => x.exported && x.id !== v.id);
  if (!confirm(`ver.${v.no}을(를) 다시 편집할까요?\n'작성 중'으로 바뀌어서 파일 바꾸기(재업로드)·매대명 묶음을 고칠 수 있어요. 다 고치면 '내보내기'를 다시 눌러 주세요.\n` +
    (others.length ? `다시 내보낼 때까지 온라인 도면·POG에는 ver.${others.at(-1).no}이(가) 보여요.` : '다시 내보낼 때까지 온라인 도면·POG에서 이 도면이 안 보여요.'))) return;
  const ref = doc(db, 'drawings', dw.id, 'versions', v.id), dref = doc(db, 'drawings', dw.id), st0 = dw.doc?.status || 'final';
  const open = async () => { const b = writeBatch(db); b.update(ref, { exported: false }); b.set(dref, { status: others.length ? 'final' : 'draft', latestExported: false, updatedAt: serverTimestamp() }, { merge: true }); await b.commit(); };
  try {
    await open();
    addLog(['drawings', dw.id], { vId: v.id, area: 'up', act: '다시 편집 (내보내기 취소)', what: `ver.${v.no}` });
    dwTrack(null, '다시 편집', async () => { const b = writeBatch(db); b.update(ref, { exported: true }); b.set(dref, { status: st0, latestExported: true, updatedAt: serverTimestamp() }, { merge: true }); await b.commit(); }, open);
    toast(`ver.${v.no}을(를) 다시 편집할 수 있어요. 다 고치면 '내보내기'를 눌러 주세요`);
  } catch (e) { alert('바꾸지 못했어요: ' + (e.code || e.message)); }
};
async function starVersion(v) {
  await setDoc(doc(db, 'drawings', dw.id), { finalVersion: v.id, finalNo: v.no, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true });
  addLog(['drawings', dw.id], { vId: v.id, area: 'up', act: '★ 최종본으로 정함', what: `ver.${v.no}` });
  toast(`ver.${v.no}을(를) 최종본(★)으로 정했어요. POG에서 이 도면이 보여요`);
}

// 그림: 업로드 화면 = 원본 + 읽은 매대명 표시 / 온라인 = 원본
// 저장 구역(v.crop, SVG 단위 {x,y,w,h}): 바깥 칸(.dw-canvas)은 그 구역 비율, 안쪽 전체 도면(.dw-full)을 밀어서 그 구역만 보이게
const dwCrop = v => { const c = v.crop; return c && c.w > 0 && c.h > 0 ? c : { x: 0, y: 0, w: v.w, h: v.h }; };
function drawingView(v, { onPick, onPickMany, used, others, selId, picks, plain, only, hits, full, seq } = {}) {
  const c = full ? { x: 0, y: 0, w: v.w, h: v.h } : dwCrop(v);
  // 글자 칸이 도면과 꼭 같이 움직이도록 위치·크기를 직접 씀 (style.css가 예전 것이어도 어긋나지 않게)
  const wrap = h('div', { class: 'dw-full', style: `position:absolute;container-type:inline-size;left:${-c.x / c.w * 100}%;top:${-c.y / c.h * 100}%;width:${v.w / c.w * 100}%;height:${v.h / c.h * 100}%` },
    h('img', { src: v.url, alt: '', draggable: 'false', style: 'display:block;width:100%;height:100%;max-width:none' }));
  const cropped = c.w < v.w || c.h < v.h;
  const outer = h('div', { class: 'dw-canvas' + (cropped ? ' cropped' : ''), style: `--ar:${(c.w / c.h).toFixed(4)};position:relative;flex-shrink:0;aspect-ratio:${c.w} / ${c.h}${cropped ? ';overflow:hidden' : ''}` }, wrap);
  outer._full = wrap;
  const pct = (n, of) => `${(n / of * 100).toFixed(3)}%`;
  // 제품 찾기 화살표: 매대가 도면 맨 위쪽이면 화살표가 잘리지 않게 아래에서 가리킴
  const fdBelow = g => (g.y - c.y) / c.h < 0.15 ? ' fd-below' : '';
  if (only) outer.classList.add('fd-only');
  for (const g of v.groups || []) {
    if (only) { if (g.id === only) wrap.append(h('div', { class: 'dw-box fd-on' + fdBelow(g), style: `left:${pct(g.x, v.w)};top:${pct(g.y, v.h)};width:${pct(g.w, v.w)};height:${pct(g.h, v.h)}`, title: g.ko }));
    } else if (!plain) {
      const el = h('div', { 'data-gid': g.id, class: 'dw-box' + (onPick ? ' pick' : '') + (used?.has(g.id) ? ' used' : '') + (others?.has(g.id) && !used?.has(g.id) ? ' other-team' : '') + (g.id === selId || picks?.has(g.id) ? ' on' : ''),
        style: `left:${pct(g.x, v.w)};top:${pct(g.y, v.h)};width:${pct(g.w, v.w)};height:${pct(g.h, v.h)}`, title: g.ko + (others?.has(g.id) ? ` · ${others.get(g.id)} POG에 연결됨` : '') });
      if (onPick) el.onclick = () => onPick(g);
      wrap.append(el);
    }
  }
  // 빈 곳을 끌면 네모 안에 걸친 칸을 한꺼번에 고름 (도면 업로드: 묶음 고치기)
  if (onPickMany) wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.dw-box')) return;
    if (e.pointerType === 'touch' && !dw.multiPick) return; // 터치: 한 손가락으로 끌면 화면 이동
    e.preventDefault(); e.dwHandled = true;
    const r0 = wrap.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const band = h('div', { class: 'dw-band' }); wrap.append(band);
    const box = ev => ({ l: Math.min(sx, ev.clientX), t: Math.min(sy, ev.clientY), r: Math.max(sx, ev.clientX), b: Math.max(sy, ev.clientY) });
    const mv = ev => { if (dwTouch.pinch) { band.style.display = 'none'; return; } const b = box(ev), z = ZM(); Object.assign(band.style, { left: (b.l - r0.left) / z + 'px', top: (b.t - r0.top) / z + 'px', width: (b.r - b.l) / z + 'px', height: (b.b - b.t) / z + 'px' }); };
    const up = ev => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); band.remove();
      const b = box(ev); if (dwTouch.pinch || (b.r - b.l < 4 && b.b - b.t < 4)) return;
      const ids = $$('.dw-box', wrap).filter(el => { const q = el.getBoundingClientRect(); return q.right >= b.l && q.left <= b.r && q.bottom >= b.t && q.top <= b.b; }).map(el => el.dataset.gid);
      if (ids.length) onPickMany(ids);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  // 도면 번호 (온라인 도면 🔢): seq = { order: [gid…], onToggle? }. 누르면 다음 번호, 다시 누르면 빠짐
  if (seq) for (const g of v.groups || []) {
    const n = (seq.order || []).indexOf(g.id) + 1;
    if (!n && !seq.onToggle) continue;
    const el = h('div', { 'data-gid': g.id, class: 'dw-box dw-seq' + (n ? ' on' : '') + (seq.onToggle ? ' pick' : ''), style: `left:${pct(g.x, v.w)};top:${pct(g.y, v.h)};width:${pct(g.w, v.w)};height:${pct(g.h, v.h)}`, title: g.ko },
      n ? h('b', { class: 'dw-seq-n' }, n) : null);
    if (seq.onToggle) el.onclick = e => { e.stopPropagation(); seq.onToggle(g); };
    wrap.append(el);
  }
  // 찾기 결과: 빨간 칸 (누르기는 그 아래 글자로 통과)
  if (hits?.size) for (const g of v.groups || []) if (hits.has(g.id))
    wrap.append(h('div', { class: 'dw-box fd-on dw-find', style: `left:${pct(g.x, v.w)};top:${pct(g.y, v.h)};width:${pct(g.w, v.w)};height:${pct(g.h, v.h)}`, title: g.ko }));
  return outer;
}
function renderDwStage() {
  const box = $('#dw-stage'), v = curVersion(); if (!box) return;
  if (!v) {
    box.replaceChildren(h('div', { class: 'upload-rule' }, h('b', {}, '업로드 파일은 SVG 파일'), ' · ', h('b', {}, '글씨는 윤곽선 만들기 하지 말아주세요'),
      h('div', { class: 'mut' }, !canEdit('drawing') ? 'VMD실이 아직 도면을 올리지 않았어요.' : dw.tab === 'up' ? "평수를 적고, 한글 도면 SVG 파일을 여기에 끌어다 놓거나 위의 '도면 파일 올리기'를 눌러주세요."
        : dw.versions.length ? "아직 내보낸 도면이 없어요. 위의 '📤 도면 업로드'에서 확인하고 내보내기를 눌러주세요." : "아직 올린 도면이 없어요. 위의 '📤 도면 업로드'를 눌러 올려주세요.")));
    return;
  }
  const legend = dw.tab === 'up'
    ? h('div', { class: 'dw-legend' }, `파란 칸 = 사이트가 읽은 매대명 ${v.groups?.length || 0}개. 파란 칸이 없는 글자는 윤곽선이 된 글자라 POG에서 고를 수 없어요.${canEdit('drawing') ? ' 칸을 누르거나 빈 곳을 끌어서 여러 칸을 고르고, 오른쪽에서 합치기(한 매대로)·나누기를 해요.' : ''}`,
      !v.groups?.length ? h('span', { class: 'warn' }, ' 글자를 하나도 못 읽었어요!') : null,
      canEdit('drawing') && HAS_TOUCH ? h('button', { class: 'btn small dw-multi' + (dw.multiPick ? ' primary' : ''), type: 'button', onclick: () => { dw.multiPick = !dw.multiPick; renderDwStage(); } },
        dw.multiPick ? '☑ 여러 칸 고르는 중 (끄기)' : '☐ 여러 칸 고르기') : null)
    : h('div', { class: 'dw-legend' }, $('#dw-ver').textContent);
  const pickable = dw.tab === 'up' && canEdit('drawing');
  box.classList.toggle('nopan', pickable && !dw.cropping && !!dw.multiPick); // 터치: 네모 그리기 중에는 한 손가락 = 그리기
  if (pickable && dw.cropping) { renderCropStage(box, v); return; }
  const hits = pickable ? null : dwFindHits(v);
  // 도면 번호 (온라인 도면, 직원): 🔢 번호 매기기를 켜면 누르는 순서대로 1, 2, 3… 다시 누르면 빠짐
  const seqOn = dw.tab === 'on' && isStaff();
  if (seqOn) subDwSeq(v);
  // 번호 매기는 동안은 화면에서만 바꾸고(다시 그리지 않음), '💾 저장'을 눌러야 저장 (사용자: 누를 때마다 저장하니 느림)
  if (dw.seqMode && !dw.seqDraft) dw.seqDraft = [...(dw.seq || [])];
  const order = dw.seqMode ? dw.seqDraft : dw.seq;
  const seq = seqOn && dw.seqMode ? { order: order || [], onToggle: dw.seqMode ? g => toggleSeq(g) : null } : null;
  if (seq && dw.seqMode) legend.append(h('span', { class: 'dw-seq-bar' }, ' · 🔢 번호 매기는 중: 매대를 누르는 순서대로 1, 2, 3… 번호가 있는 매대를 누르면 번호를 바꾸거나 뺄 수 있어요. ',
    h('button', { class: 'btn small', title: '도면의 모든 매대에 위에서 아래로, 같은 줄은 왼쪽에서 오른쪽으로 번호를 한 번에 매겨요', onclick: () => autoSeqByPos(v) }, '📐 도면 순서로 자동'), ' ',
    h('span', { id: 'dw-seq-n' }), ' ',
    h('button', { class: 'btn small primary', id: 'dw-seq-save', onclick: () => saveSeq(v) }, '💾 저장'), ' ',
    h('button', { class: 'btn small ghost', onclick: () => { dw.seqDraft = [...(dw.seq || [])]; paintSeq(); } }, '처음대로'), ' ',
    h('button', { class: 'btn small ghost', onclick: () => { if (confirm('번호를 모두 지울까요? (저장을 눌러야 반영돼요)')) { dw.seqDraft = []; paintSeq(); } } }, '모두 지우기')));
  box.replaceChildren(legend, drawingView(v, pickable ? { picks: dwPicks(), onPick: g => togglePick(g.id), onPickMany: ids => { const p = dwPicks(); ids.forEach(i => p.add(i)); paintPicks(); renderDwSide(); } } : { selId: dw.sel, plain: true, hits, seq }));
  dwZoomApply();
  if (seq && dw.seqMode) paintSeq();
  if (hits && dwf.jump) { dwf.jump = false; setTimeout(() => $('.dw-find', box)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 30); }
}
// 확대·축소: Alt + 마우스 휠 (마우스가 있는 곳을 중심으로). 툴바 '🔍 n%'를 누르면 원래 크기
function dwZoomApply() {
  const z = dw.zoom || 1, cv = $('#dw-stage > .dw-canvas');
  if (cv) Object.assign(cv.style, z === 1 ? { width: '', maxWidth: '' } : { width: `calc(min(100%, 1200px) * ${z})`, maxWidth: 'none' });
  const b = $('#dw-zoom'); if (b) { b.textContent = `🔍 ${Math.round(z * 100)}%`; b.classList.toggle('hidden', !cv); }
  $$('.dw-zbtn').forEach(x => x.classList.toggle('hidden', !cv));
}
$('#dw-stage').addEventListener('wheel', e => {
  if (!e.altKey) return;
  const cv = $('#dw-stage > .dw-canvas'); if (!cv) return;
  e.preventDefault();
  const st = $('#dw-stage'), r = cv.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
  dw.zoom = Math.min(8, Math.max(0.5, (dw.zoom || 1) * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  if (Math.abs(dw.zoom - 1) < 0.04) dw.zoom = 1;
  dwZoomApply();
  const r2 = cv.getBoundingClientRect();
  const z = ZM(); st.scrollLeft += (r2.left + fx * r2.width - e.clientX) / z; st.scrollTop += (r2.top + fy * r2.height - e.clientY) / z;
}, { passive: false });
$('#dw-zoom').onclick = () => { dw.zoom = 1; dwZoomApply(); };
// ＋ / － 버튼 (터치 화면에서 한 손으로 · 사용자)
const dwZoomStep = f => { const st = $('#dw-stage'), cv = $('#dw-stage > .dw-canvas'); if (!cv) return;
  const r = st.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2, c0 = cv.getBoundingClientRect(), fx = (mx - c0.left) / c0.width, fy = (my - c0.top) / c0.height;
  dw.zoom = Math.min(8, Math.max(0.5, (dw.zoom || 1) * f)); if (Math.abs(dw.zoom - 1) < 0.04) dw.zoom = 1; dwZoomApply();
  const c1 = cv.getBoundingClientRect(), z = ZM(); st.scrollLeft += (c1.left + fx * c1.width - mx) / z; st.scrollTop += (c1.top + fy * c1.height - my) / z; };
$('#dw-zin').onclick = () => dwZoomStep(1.3);
$('#dw-zout').onclick = () => dwZoomStep(1 / 1.3);
/* 터치 화면 손가락 규칙 (도면 업로드·번역·온라인 · 사용자)
   한 손가락으로 쓸기: 아이패드 기본 스크롤 (미끄러지는 느낌 그대로, 사용자: 버벅임)
   두 손가락: 벌리면 확대·오므리면 축소·끌면 이동. 움직이는 동안은 그림처럼 키우기만(transform) 하고 손을 떼면 한 번만 실제 크기 맞춤
   여러 칸 고르기·저장 구역 정하기를 켰을 때는 한 손가락이 네모 그리기 (#dw-stage.nopan) */
const dwTouch = { pinch: null, lab: null, moved: false };
{
  const st = $('#dw-stage');
  const cvOf = () => $('#dw-stage > .dw-canvas');
  const two = t => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2, d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1 });
  const putLab = (L, a, b) => { L.el.style.left = `${((L.g.x + L.g.w / 2 + a) / L.v.w * 100).toFixed(3)}%`; L.el.style.top = `${((L.g.y + b) / L.v.h * 100).toFixed(3)}%`; };
  const dropLab = (save) => {
    const L = dwTouch.lab; if (!L) return; dwTouch.lab = null; clearTimeout(L.timer); L.el.classList.remove('lift');
    if (L.pan) dwTouch.moved = true, setTimeout(() => { dwTouch.moved = false; }, 350);
    else if (!L.active && save) L.pick(); // 톡 = 고르기 (쓸어서 화면을 옮긴 것은 고르지 않음)
    if (L.active && L.moved) putLab(L, L.dx0, L.dy0);
  };
  st.addEventListener('touchstart', e => {
    if (e.touches.length === 1) { const L = dwTouch.lab; if ((L && L.el.contains(e.target)) || e.target.closest?.('.dw-crop-rect')) e.preventDefault(); return; } // 글자 위: 화면 이동은 앱이 대신 (아래 touchmove)
    if (e.touches.length < 2) return;
    dropLab(false); // 두 손가락이 되면 글자 옮기기 취소
    const cv = cvOf(); if (!cv) return;
    const m = two(e.touches), r = cv.getBoundingClientRect();
    dwTouch.pinch = { z0: dw.zoom || 1, d0: m.d, x0: m.x, y0: m.y, r0: r, s: 1, m, zm: ZM() };
    cv.style.transformOrigin = `${(m.x - r.left) / dwTouch.pinch.zm}px ${(m.y - r.top) / dwTouch.pinch.zm}px`;
    cv.style.willChange = 'transform';
    dwTouch.moved = true;
  }, { passive: false });
  st.addEventListener('touchmove', e => {
    const p = dwTouch.pinch;
    if (p && e.touches.length >= 2) {
      e.preventDefault(); // 기본 스크롤 대신 직접 확대·이동
      const cv = cvOf(); if (!cv) return;
      const m = two(e.touches);
      p.s = Math.min(8, Math.max(0.5, p.z0 * m.d / p.d0)) / p.z0; p.m = m;
      cv.style.transform = `translate(${(m.x - p.x0) / p.zm}px, ${(m.y - p.y0) / p.zm}px) scale(${p.s})`;
      return;
    }
    const L = dwTouch.lab; if (!L || e.touches.length !== 1) return;
    const t = e.touches[0];
    e.preventDefault();
    if (!L.active) { // 꾹 누르기 전에 움직이면 그냥 화면 이동 (글자 위는 touch-action: none이라 직접 스크롤)
      if (!L.pan && Math.hypot(t.clientX - L.sx, t.clientY - L.sy) > 8) { clearTimeout(L.timer); L.pan = { x: t.clientX, y: t.clientY }; }
      if (L.pan) { const z = L.zm || (L.zm = ZM()); st.scrollLeft -= (t.clientX - L.pan.x) / z; st.scrollTop -= (t.clientY - L.pan.y) / z; L.pan = { x: t.clientX, y: t.clientY }; }
      return;
    }
    const k = L.v.w / L.wrap.getBoundingClientRect().width;
    L.dx = L.dx0 + (t.clientX - L.sx) * k; L.dy = L.dy0 + (t.clientY - L.sy) * k; L.moved = true; putLab(L, L.dx, L.dy);
  }, { passive: false });
  const end = e => {
    const p = dwTouch.pinch;
    if (p && e.touches.length < 2) { // 손을 떼면 한 번만 실제 크기로 맞추고, 손가락 가운데 자리가 그대로 오게 스크롤
      dwTouch.pinch = null;
      const cv = cvOf();
      if (cv) {
        const fx = (p.x0 - p.r0.left) / p.r0.width, fy = (p.y0 - p.r0.top) / p.r0.height;
        cv.style.transform = ''; cv.style.transformOrigin = ''; cv.style.willChange = '';
        dw.zoom = p.z0 * p.s; if (Math.abs(dw.zoom - 1) < 0.04) dw.zoom = 1; dwZoomApply();
        const r = cv.getBoundingClientRect(), z = ZM();
        st.scrollLeft += (r.left + fx * r.width - p.m.x) / z; st.scrollTop += (r.top + fy * r.height - p.m.y) / z;
      }
      setTimeout(() => { dwTouch.moved = false; }, 350);
    }
    if (!e.touches.length) dropLab(e.type === 'touchend');
  };
  st.addEventListener('touchend', end); st.addEventListener('touchcancel', end);
  // 두 손가락을 쓴 뒤 손을 떼면 칸이 눌린 것으로 치지 않음
  st.addEventListener('click', e => { if (dwTouch.moved) { e.stopPropagation(); e.preventDefault(); dwTouch.moved = false; } }, true);
}

// 저장 구역 정하기 (도면 업로드, VMD): 전체 도면 위를 끌어서 남길 곳을 네모로. 온라인 도면·번역·POG·제품 찾기·PDF 모두 그 구역만 보임
function renderCropStage(box, v) {
  dw.cropDraft ||= { ...dwCrop(v) };
  const view = drawingView(v, { plain: true, full: true }), full = view._full;
  const pct = (n, of) => `${(n / of * 100).toFixed(3)}%`;
  /* 저장 구역 네모 (사용자: 끌 때마다 새 네모가 생겨서 이상한 구역이 잡혔음)
     - 네모 안을 끌면 옮기기, 모서리·변의 손잡이를 끌면 그쪽만 늘이고 줄이기 (반대쪽은 그대로)
     - 새로 그리기: 마우스로 네모 밖을 끌 때만. 손가락으로 네모 밖을 쓸면 화면 이동, 두 손가락은 확대
     - 손을 떼기 전에 다른 손가락이 닿으면 그 동작은 취소 */
  const rect = h('div', { class: 'dw-crop-rect' });
  const HS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  HS.forEach(k2 => rect.append(h('i', { class: 'dw-crop-h h-' + k2, 'data-h': k2 })));
  const paint = () => { const d = dw.cropDraft; Object.assign(rect.style, { left: pct(d.x, v.w), top: pct(d.y, v.h), width: pct(d.w, v.w), height: pct(d.h, v.h) }); };
  full.append(rect); paint();
  const minW = v.w * 0.03, minH = v.h * 0.03;
  full.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const hd = e.target.closest('.dw-crop-h')?.dataset.h, inRect = !hd && e.target.closest('.dw-crop-rect');
    if (!hd && !inRect && e.pointerType === 'touch') return; // 손가락: 네모 밖은 화면 이동
    e.preventDefault(); e.dwHandled = true;
    const r0 = full.getBoundingClientRect(), k = v.w / r0.width, pid = e.pointerId, d0 = { ...dw.cropDraft };
    const at = ev => ({ x: Math.min(v.w, Math.max(0, (ev.clientX - r0.left) * k)), y: Math.min(v.h, Math.max(0, (ev.clientY - r0.top) * k)) });
    const s = at(e); let stop = false;
    const mv = ev => {
      if (ev.pointerId !== pid || stop) return;
      const p = at(ev), ddx = p.x - s.x, ddy = p.y - s.y;
      if (hd) {
        let x0 = d0.x, y0 = d0.y, x1 = d0.x + d0.w, y1 = d0.y + d0.h;
        if (hd.includes('w')) x0 = Math.min(x1 - minW, Math.max(0, x0 + ddx));
        if (hd.includes('e')) x1 = Math.max(x0 + minW, Math.min(v.w, x1 + ddx));
        if (hd.includes('n')) y0 = Math.min(y1 - minH, Math.max(0, y0 + ddy));
        if (hd.includes('s')) y1 = Math.max(y0 + minH, Math.min(v.h, y1 + ddy));
        dw.cropDraft = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      } else if (inRect) {
        dw.cropDraft = { ...d0, x: Math.min(v.w - d0.w, Math.max(0, d0.x + ddx)), y: Math.min(v.h - d0.h, Math.max(0, d0.y + ddy)) };
      } else dw.cropDraft = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(ddx), h: Math.abs(ddy) };
      paint();
    };
    const other = ev => { if (ev.pointerId !== pid) { stop = true; dw.cropDraft = d0; paint(); } }; // 두 번째 손가락 = 취소
    const up = ev => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('pointerdown', other, true);
      if (dw.cropDraft.w < minW || dw.cropDraft.h < minH) { dw.cropDraft = d0; paint(); } // 너무 작게 그리면 그대로
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('pointerdown', other, true);
  });
  const done = () => { dw.cropping = false; dw.cropDraft = null; renderDwStage(); renderDwSide(); };
  const save = async crop => {
    try { await updateDoc(doc(db, 'drawings', dw.id, 'versions', v.id), { crop: crop ? Object.fromEntries(Object.entries(crop).map(([k2, n]) => [k2, +n.toFixed(2)])) : deleteField() }); toast(crop ? '저장 구역을 정했어요' : '전체 도면으로 되돌렸어요');
    { const ref = doc(db, 'drawings', dw.id, 'versions', v.id), b0 = v.crop ? { ...v.crop } : null, a0 = crop ? { ...crop } : null;
      dwTrack(null, '저장 구역', () => updateDoc(ref, { crop: b0 || deleteField() }), () => updateDoc(ref, { crop: a0 || deleteField() })); } addLog(['drawings', dw.id], { vId: v.id, area: 'up', act: crop ? '저장 구역 정함' : '저장 구역 없앰 (전체)' }); done(); }
    catch (e) { toast('저장하지 못했어요: ' + (e.code || e.message)); }
  };
  dw.cropSave = save;
  box.replaceChildren(h('div', { class: 'dw-legend dw-crop-bar' },
    h('b', {}, '✂ 저장 구역 정하기'), HAS_TOUCH
      ? ' · 주황 네모의 모서리·변 동그라미를 끌어서 크기를, 네모 안을 끌어서 위치를 맞춰요. 네모 밖은 온라인 도면·POG·PDF에서 안 보여요 (지워지지는 않아요).'
      : ' · 주황 네모의 모서리·변 동그라미를 끌어서 크기를, 네모 안을 끌어서 위치를 맞춰요. 네모 밖을 끌면 새로 그려요. 네모 밖은 온라인 도면·POG·PDF에서 안 보여요 (지워지지는 않아요).',
    h('span', { class: 'se-btns' }, h('button', { class: 'btn small primary', onclick: () => save(dw.cropDraft) }, '이 구역으로 저장'),
      v.crop ? h('button', { class: 'btn small ghost', onclick: () => save(null) }, '전체로 되돌리기') : null,
      h('button', { class: 'btn small ghost', onclick: done }, '취소'))), view);
  dwZoomApply();
}
function subDwSeq(v) {
  const key = dw.id + '|' + v.id; if (dw.seqKey === key) return;
  dw.seqUnsub?.(); dw.seqKey = key; dw.seq = [];
  dw.seqUnsub = onSnapshot(doc(db, 'drawings', dw.id, 'seq', v.id), d => {
    if (dw.seqKey !== key) return;
    dw.seq = d.exists() ? (d.data().order || []) : [];
    if (dw.seqMode) paintSeq(); else renderDwStage(); // 번호 매기는 중이면 다시 그리지 않음
  }, () => { });
}
const seqDirty = () => dw.seqMode && JSON.stringify(dw.seqDraft || []) !== JSON.stringify(dw.seq || []);
// 화면의 번호만 다시 씀 (도면은 그대로)
function paintSeq() {
  const o = dw.seqDraft || [];
  $$('#dw-stage .dw-seq').forEach(el => {
    const n = o.indexOf(el.dataset.gid) + 1;
    el.classList.toggle('on', !!n);
    let b = el.querySelector('.dw-seq-n');
    if (n) { if (!b) el.append(b = h('b', { class: 'dw-seq-n' })); b.textContent = n; }
    else if (b) el.removeChild(b);
  });
  const c = $('#dw-seq-n'); if (c) c.textContent = `지금 ${o.length}개${seqDirty() ? ' · 저장 안 됨' : ' · 저장됨'}`;
  const sv = $('#dw-seq-save'); if (sv) sv.disabled = !seqDirty();
}
// 번호 없는 매대 = 맨 뒤 번호로. 번호 있는 매대 = 새 번호로 옮기기 (0이나 빈칸 = 빼기) · 사용자: 자동으로 매긴 뒤 안 맞는 것만 고치기
function toggleSeq(g) {
  const o = dw.seqDraft ||= [], i = o.indexOf(g.id);
  if (i < 0) { o.push(g.id); paintSeq(); return; }
  const a = prompt(`'${g.ko}' · 지금 ${i + 1}번\n바꿀 번호를 넣으세요 (1 ~ ${o.length}). 번호를 빼려면 0 또는 비우고 확인`, String(i + 1));
  if (a === null) return;
  const n = parseInt(a, 10);
  o.splice(i, 1);
  if (n > 0) o.splice(Math.min(n, o.length + 1) - 1, 0, g.id);
  paintSeq();
}
// 도면 순서로 자동 번호 (사용자): 도면의 매대(파란 칸)를 위에서 아래로 줄을 나눠, 같은 줄은 왼쪽에서 오른쪽으로 1, 2, 3…
// 줄 = 칸 가운데 높이가 비슷한 것끼리 (칸 높이의 절반 안). 안 맞는 매대는 눌러서 번호를 바꾸고 저장
function autoSeqByPos(v) {
  const gs = (v.groups || []).filter(g => g.w > 0 && g.h > 0);
  if (!gs.length) { alert('도면에 매대가 없어요.'); return; }
  if ((dw.seqDraft || []).length && !confirm(`지금 매긴 번호 ${dw.seqDraft.length}개를 지우고, 도면 순서로 새로 매길까요?\n(저장을 눌러야 반영돼요)`)) return;
  const cy = g => g.y + g.h / 2, hs = gs.map(g => g.h).sort((a, b) => a - b), mh = hs[Math.floor(hs.length / 2)];
  const rows = [];
  for (const g of [...gs].sort((a, b) => cy(a) - cy(b))) {
    const r = rows.at(-1);
    if (r && cy(g) - r.cy <= mh * 0.6) r.gs.push(g); else rows.push({ cy: cy(g), gs: [g] });
  }
  dw.seqDraft = rows.flatMap(r => r.gs.sort((a, b) => a.x - b.x)).map(g => g.id);
  paintSeq();
  toast(`도면 순서로 ${dw.seqDraft.length}개를 매겼어요. 안 맞는 매대는 눌러서 번호를 바꾸고 💾 저장하세요`);
}
async function saveSeq(v) {
  const order = [...(dw.seqDraft || [])];
  try {
    await setDoc(doc(db, 'drawings', dw.id, 'seq', v.id), { order, vId: v.id, updatedAt: serverTimestamp(), updatedBy: me() });
    dw.seq = order; paintSeq(); toast(`번호 ${order.length}개를 저장했어요`);
  } catch (e) { alert('번호를 저장하지 못했어요: ' + (e.code || e.message)); }
}
// 저장 안 한 번호가 있으면 물어봄 (번호 매기기를 끌 때)
async function leaveSeq() {
  if (seqDirty() && confirm('저장 안 한 번호가 있어요. 저장할까요?\n(취소를 누르면 저장하지 않고 버려요)')) { const v = curVersion(); if (v) await saveSeq(v); }
  dw.seqMode = false; dw.seqDraft = null; $('#dw-seqbtn')?.classList.remove('primary');
}
$('#dw-seqbtn').onclick = async () => { if (dw.seqMode) await leaveSeq(); else { dw.seqMode = true; dw.seqDraft = null; $('#dw-seqbtn').classList.add('primary'); } renderDwStage(); };
window.addEventListener('beforeunload', e => { if (seqDirty()) { e.preventDefault(); e.returnValue = ''; } });
// 도면 찾기: 매대명 + 제품(그 매장 최종 POG에서 그 제품이 있는 페이지의 '도면에서 고르기' 매대)
function dwFindHits(v) {
  const q = findNorm($('#dw-find').value), n = $('#dw-find-n');
  if (!q) { n.textContent = ''; return null; }
  const hits = new Set();
  for (const g of v.groups || []) if (findNorm(g.ko).includes(q)) hits.add(g.id);
  let items = 0;
  if (dwf.pog === undefined) loadDwFindPog();
  for (const f of dwf.pog?.fixtures || []) {
    const its = (f.items || []).filter(it => findNorm(it.name).includes(q) || findNorm(it.code).includes(q));
    const fxHit = findNorm([f.teamName, f.fixtureType].join('|')).includes(q);
    if (!its.length && !fxHit) continue;
    const r = f.drawingRef; if (!r || r.storeId !== dw.id) continue;
    const g = (v.groups || []).find(x => r.vId === v.id ? x.id === r.gid : x.ko === r.ko);
    if (g) { hits.add(g.id); items += its.length; }
  }
  n.textContent = hits.size ? `매대 ${hits.size}곳${items ? ` · 제품 ${items}개` : ''}` : (dwf.pog === null ? '없어요' : dwf.pog ? '없어요' : '찾는 중…');
  n.classList.toggle('none', !hits.size);
  return hits;
}
// 이 매장의 최종 POG(팀별) 페이지를 한 번만 읽어 둠 (제품·카테고리 찾기용)
async function loadDwFindPog() {
  const id = dw.id, st = dwStores().find(x => x.id === id);
  // 국내: 팀마다 POG가 따로 → 팀마다 가장 최근 최종본을 모두 읽음
  const latest = new Map();
  for (const p of state.pogs) {
    if (p.status !== 'final' || !(p.storeId === id || (st?.code && String(p.storeCode) === String(st.code)))) continue;
    const o = latest.get(pogTeam(p)); if (!o || (p.finalizedAt?.toMillis?.() || 0) > (o.finalizedAt?.toMillis?.() || 0)) latest.set(pogTeam(p), p);
  }
  const ps = [...latest.values()];
  dwf.pog = ps.length ? false : null;
  if (!ps.length) return;
  try {
    const all = await Promise.all(ps.map(p => getDocs(query(collection(db, 'pogs', p.id, 'fixtures'), orderBy('order'))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))));
    if (dw.id !== id) return;
    dwf.pog = { ids: ps.map(p => p.id), fixtures: all.flat() };
  } catch { dwf.pog = null; }
  if ($('#dw-find').value.trim()) renderDwStage();
}
let dwFindT = 0;
$('#dw-find').addEventListener('input', () => { clearTimeout(dwFindT); dwFindT = setTimeout(() => { dwf.jump = true; renderDwStage(); }, 250); });
$('#dw-find').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dwf.jump = true; renderDwStage(); } });
/* ---------- 도면 되돌리기 (사용자): Ctrl+Z / Ctrl+Y, 툴바 ↶ ↷ ----------
   도면 업로드: 매대명 묶음(합치기·나누기·지우기)·저장 구역·메모·평수 / 도면 번역: 번역 글자·위치·크기.
   한 단계 = { key, t, undo(), redo(), label }. 같은 칸을 1.5초 안에 계속 고치면 한 단계 (처음 값으로 되돌림). 다른 도면을 열면 비움 */
const dwu = { steps: [], redo: [], id: null };
function dwTrack(key, label, undoFn, redoFn) {
  if (dwu.busy) return;
  if (dwu.id !== dw.id) { dwu.steps = []; dwu.redo = []; dwu.id = dw.id; }
  const last = dwu.steps.at(-1), now = Date.now();
  if (last && key && last.key === key && now - last.t < 1500) { last.t = now; last.redo = redoFn; }
  else { dwu.steps.push({ key, t: now, label, undo: undoFn, redo: redoFn }); if (dwu.steps.length > 100) dwu.steps.shift(); }
  dwu.redo = []; dwUndoBtns();
}
async function dwDoUndo(redo = false) {
  if (dwu.busy || dwu.id !== dw.id) return;
  const from = redo ? dwu.redo : dwu.steps, to = redo ? dwu.steps : dwu.redo;
  const st = from.pop(); if (!st) { toast(redo ? '다시 할 것이 없어요' : '되돌릴 것이 없어요'); return; }
  dwu.busy = true;
  try { await flushWrites(); await (redo ? st.redo() : st.undo()); to.push(st); toast(`${redo ? '다시 했어요' : '되돌렸어요'}: ${st.label} (${redo ? 'Ctrl+Y' : 'Ctrl+Z'})`); }
  catch (e) { from.push(st); alert('되돌리지 못했어요: ' + (e.code || e.message)); }
  finally { dwu.busy = false; dwUndoBtns(); }
}
function dwUndoBtns() {
  const ok = dw.tab === 'up' && canEdit('drawing');
  $('#dw-undo').classList.toggle('hidden', !ok); $('#dw-redo').classList.toggle('hidden', !ok);
  $('#dw-undo').disabled = !dwu.steps.length || dwu.id !== dw.id; $('#dw-redo').disabled = !dwu.redo.length || dwu.id !== dw.id;
}
$('#dw-undo').onclick = () => dwDoUndo(false);
$('#dw-redo').onclick = () => dwDoUndo(true);
document.addEventListener('keydown', e => {
  if (!['dw-up', 'dw-tr'].includes(state.view) || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'y') return;
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return; // 글 쓰는 중이면 그 칸의 되돌리기
  if ($('#modal-root')?.children.length) return;
  e.preventDefault(); dwDoUndo(k === 'y' || e.shiftKey);
});
// 도면 손으로 끌기: 마우스 휠(가운데 버튼)을 누른 채 움직이면 화면이 따라 움직임 (도면 위치는 그대로)
$('#dw-stage').addEventListener('mousedown', e => {
  if (e.button !== 1) return;
  e.preventDefault();
  const st = e.currentTarget, sx = e.clientX, sy = e.clientY, l0 = st.scrollLeft, t0 = st.scrollTop;
  st.classList.add('panning');
  const z = ZM(), mv = ev => { st.scrollLeft = l0 - (ev.clientX - sx) / z; st.scrollTop = t0 - (ev.clientY - sy) / z; };
  const up = () => { st.classList.remove('panning'); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
});
$('#dw-stage').addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });

// 수정 기록 보기: POG = 지금 보고 있는 페이지, 도면 = 전체 (확대했으면 화면에 보이는 구역 안에서 생긴 것만)
async function readLogs(path, filter) {
  flushLogs();
  try { const s = await getDocs(filter ? query(collection(db, ...path, 'logs'), where(...filter)) : collection(db, ...path, 'logs')); return s.docs.map(d => d.data()); }
  catch (e) { alert('기록을 읽지 못했어요: ' + (e.code || e.message) + '\n(보안 규칙이 아직 게시되지 않았을 수 있어요)'); return null; }
}
// 기록 줄 → 그 페이지로 가서 바뀐 칸·제품을 깜빡여 보여줌 (사용자: 구글 문서 수정 기록처럼)
function pogLogOpt() {
  const fxOf = id => state.fixtures.get(id);
  const blockOf = id => id === '__cover' ? state.coverEl : state.pageEls.get(id);
  return {
    where: r => r.fx === '__cover' ? '표지·고정 문구' : fxOf(r.fx) ? displayName(fxOf(r.fx)) : '(지금은 없는 페이지)',
    go: (r, check) => {
      const id = r.fx || '__cover';
      if (check) return id === '__cover' || !!fxOf(id);
      $$('#modal-root .modal-bg').forEach(x => x.remove());
      setEdActive(id);
      const blk = blockOf(id); if (!blk) return;
      blk.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const codes = r.d?.codes || [];
      let marks = codes.length ? [...blk.querySelectorAll('.cv-item')].filter(el => codes.includes(el.dataset.code)) : [];
      if (!marks.length) marks = [...blk.querySelectorAll(`[data-f="${CSS.escape(r.field || '')}"]`)];
      if (!marks.length && r.field === 'notes') marks = [...blk.querySelectorAll('.anno .nt')];
      if (!marks.length) marks = [blk.querySelector('.page') || blk];
      marks.forEach(el => { el.classList.remove('log-flash'); void el.offsetWidth; el.classList.add('log-flash'); setTimeout(() => el.classList.remove('log-flash'), 4200); });
      // 지워진 것의 잔상을 원래 자리에 (사용자). 다시 그리거나 10초 뒤 사라짐
      const gone = r.d?.gone || [], inner = blk.querySelector('.pcanvas .cv-in'), anno = blk.querySelector('.anno');
      const ghosts = [];
      if (gone.length && inner && (r.field === 'items' || r.field === 'props')) gone.forEach(o => {
        const el = h('div', { class: 'cv-ghost' + (r.field === 'props' ? ' prop' : ''), title: `지워짐: ${o.name || o.kind || ''}`,
          style: `left:${o.x - inner._x0 + inner._pad}px;top:${o.y - inner._y0 + inner._pad}px;width:${o.w}px;height:${Math.max(o.h || 0, 4)}px` },
          r.field === 'items' && o.img ? prodImg(o.img, o.name, { fallback: false }) : null);
        inner.append(el); ghosts.push(el);
      });
      if (gone.length && anno && r.field === 'notes') gone.forEach(n => {
        const x = n.t === 'arrow' ? Math.min(n.x1, n.x2) : n.x, y = n.t === 'arrow' ? Math.min(n.y1, n.y2) : n.y, w = n.t === 'arrow' ? Math.abs(n.x2 - n.x1) : n.w, hh = n.t === 'arrow' ? Math.abs(n.y2 - n.y1) : n.h;
        const el = h('div', { class: 'nt-ghost', style: `left:${x}px;top:${y}px;width:${Math.max(w, 20)}px;height:${Math.max(hh, 16)}px` }, n.t === 'text' ? n.text || '' : n.t === 'img' ? '사진' : '');
        anno.append(el); ghosts.push(el);
      });
      if (ghosts.length) { toast(`빨간 점선 = 지워진 것 (${ghosts.length}개) · 10초 뒤 사라져요`); setTimeout(() => ghosts.forEach(g => g.remove()), 10000); }
    },
  };
}
async function showPogLogs(pogId, fxId, name) {
  const pageId = !fxId || fxId === '__cover' ? '__cover' : fxId, opt = pogLogOpt();
  const rows = await readLogs(['pogs', pogId], ['fx', '==', pageId]); if (!rows) return;
  const all = h('button', { class: 'btn small ghost', onclick: async () => { const r = await readLogs(['pogs', pogId]); if (r) logModal('이 POG 전체 수정 기록', `${r.length}개 · 줄을 누르면 자세히 보여요`, r, null, { ...opt, page: true }); } }, '이 POG 전체 기록 보기');
  logModal(`수정 기록 · ${pageId === '__cover' ? '표지·고정 문구' : name}`, '이 페이지에서 고친 것 · 줄을 누르면 자세히 보여요', rows, all, opt);
}
$('#ed-top').onclick = () => { const c = state.coverEl; if (!c) return; state.edPin = { id: '__cover', t: Date.now() + 1200 }; c.scrollIntoView({ block: 'start' }); state.edActive = null; setEdActive('__cover'); }; // 표지로 (사용자)
$('#ed-log').onclick = () => { const p = state.currentPog; if (!p) return; const fx = state.fixtures.get(state.edActive); showPogLogs(p.id, state.edActive, fx ? displayName(fx) : ''); };
$('#dw-log').onclick = async () => {
  const v = curVersion(); if (!dw.id || !v) return;
  const rows0 = await readLogs(['drawings', dw.id]); if (!rows0) return;
  const rows = rows0.filter(r => !r.vId || r.vId === v.id);
  // 화면에 보이는 도면 구역 (SVG 단위)
  const cv = $('#dw-stage > .dw-canvas'), st = $('#dw-stage');
  let area = null;
  if (cv) {
    const r = cv.getBoundingClientRect(), s = st.getBoundingClientRect(), c = dwCrop(v);
    const L = Math.max(r.left, s.left), R = Math.min(r.right, s.right), T = Math.max(r.top, s.top), B = Math.min(r.bottom, s.bottom);
    if (R > L && B > T && ((R - L) < r.width * 0.97 || (B - T) < r.height * 0.97))
      area = { x0: c.x + (L - r.left) / r.width * c.w, x1: c.x + (R - r.left) / r.width * c.w, y0: c.y + (T - r.top) / r.height * c.h, y1: c.y + (B - r.top) / r.height * c.h };
  }
  const shown = area ? rows.filter(r => r.x != null && r.x >= area.x0 && r.x <= area.x1 && r.y >= area.y0 && r.y <= area.y1) : rows;
  logModal(`도면 수정 기록 · ver.${v.no}`, area ? `확대해서 보이는 구역 안에서 생긴 기록만 (${shown.length}개 / 전체 ${rows.length}개). 메모·내보내기처럼 위치가 없는 기록은 100%로 보면 나와요.` : `이 버전 전체 (${rows.length}개). Alt+휠로 확대하면 보이는 구역의 기록만 볼 수 있어요.` + ' · 줄을 누르면 자세히 보여요', shown, null, {
    // 매대 기록이면 그 매대로 가서 깜빡임 (사용자)
    where: r => { const g = r.gid && (v.groups || []).find(x => x.id === r.gid); return g ? `매대 '${g.ko}'` : ''; },
    go: (r, check) => {
      const g = r.gid && (v.groups || []).find(x => x.id === r.gid); if (check) return !!g; if (!g) return;
      $$('#modal-root .modal-bg').forEach(x => x.remove());
      dw.sel = g.id; renderDwStage(); renderDwSide();
      const el = document.querySelector(`#dw-stage .dw-box[data-gid="${CSS.escape(g.id)}"]`) || document.querySelector(`#dw-stage [data-gid="${CSS.escape(g.id)}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); el.classList.add('log-flash'); setTimeout(() => el.classList.remove('log-flash'), 4200); }
    },
  });
};
function verCard(v, { canStar, onOpen }) {
  const fin = dwFinal(dw.doc) === v.id;
  return h('div', { class: 'dw-ver' + (v.id === dw.vId ? ' cur' : ''), onclick: onOpen },
    h('div', { class: 't' }, h('b', {}, `ver.${v.no}`),
      h('span', { class: 'badge ' + (v.exported ? 'final' : 'draft') }, v.exported ? '내보냄' : '작성 중'),
      canStar && v.exported ? h('button', { class: 'dw-star' + (fin ? ' on' : ''), title: fin ? '최종본' : '최종본으로 정하기', onclick: e => { e.stopPropagation(); if (!fin) starVersion(v); } }, '★')
        : fin ? h('span', { class: 'dw-star on', title: '최종본' }, '★') : null),
    h('div', { class: 'd' }, `올림 ${fmtTime(v.uploadedAt)} · ${v.uploadedBy ? nameOf(v.uploadedBy, v.uploadedByName) : ''}${v.exportedAt ? ` · 내보냄 ${fmtTime(v.exportedAt)}` : ''}`),
    v.memo ? h('div', { class: 'm' }, v.memo) : null);
}
function renderDwSide() {
  const box = $('#dw-side'); if (!box || !dw.id) return;
  if (dw.tab === 'on') { box.replaceChildren(); return; }
  const a = document.activeElement;
  if (box.contains(a) && /INPUT|TEXTAREA/.test(a.tagName)) return; // 입력 중이면 그대로
  const v = curVersion(), nodes = [];
  const sec = (t, ...k) => h('section', { class: 'se-sec' }, h('h4', {}, t), ...k);
  const vers = [...dw.versions].reverse();
  if (dw.tab === 'up') {
    const ed = canEdit('drawing');
    if (v) {
      nodes.push(h('div', { class: 'se-head' }, h('b', {}, `ver.${v.no}${dwFinal(dw.doc) === v.id ? ' ★최종본' : ''}`), h('span', { class: 'mut' }, `${v.fileName || ''} · 매대명 ${v.groups?.length || 0}개 읽음`)));
      const ta = h('textarea', { class: 'se-memo', rows: 5, placeholder: ed ? (v.no > 1 ? '이번 버전에서 바뀐 것, 특이사항' : '특이사항 메모') : '', disabled: !ed });
      ta.value = v.memo || '';
      ta.addEventListener('input', () => { { const ref = doc(db, 'drawings', dw.id, 'versions', v.id), b0 = v.memo || '', a0 = ta.value;
        dwTrack('memo|' + v.id, '메모', () => updateDoc(ref, { memo: b0 }), () => updateDoc(ref, { memo: a0 })); }
        logEdit(['drawings', dw.id], `dw|${dw.id}|${v.id}|memo`, { vId: v.id, area: 'up', field: 'memo' }, v.memo || '', () => ta.value);
        queueWrite(`dw|${dw.id}|${v.id}|memo`, () => updateDoc(doc(db, 'drawings', dw.id, 'versions', v.id), { memo: ta.value })); });
      nodes.push(sec(v.no > 1 ? '메모 (바뀐 것·특이사항)' : '특이사항 메모', ta));
      if (ed) nodes.push(sec('저장 구역', h('p', { class: 'se-help' }, v.crop ? `도면의 일부만 보여요 (가로 ${Math.round(v.crop.w / v.w * 100)}% · 세로 ${Math.round(v.crop.h / v.h * 100)}%).` : '지금은 도면 전체가 보여요. 필요 없는 가장자리가 있으면 남길 구역만 정할 수 있어요.'),
        dw.cropping
          ? h('div', { class: 'se-btns' }, h('p', { class: 'se-help' }, '도면 위를 끌어서 네모를 그린 다음 아래 버튼을 눌러야 저장돼요.'),
              h('button', { class: 'btn primary', onclick: () => dw.cropSave?.(dw.cropDraft) }, '✓ 이 구역으로 저장'),
              h('button', { class: 'btn small ghost', onclick: () => { dw.cropping = false; dw.cropDraft = null; renderDwStage(); renderDwSide(); } }, '취소'))
          : h('div', { class: 'se-btns' }, h('button', { class: 'btn small', onclick: () => { dw.cropping = true; dw.cropDraft = null; renderDwStage(); renderDwSide(); } }, '✂ 저장 구역 정하기'))));
      if (ed) nodes.push(groupEditor(v));
    } else nodes.push(h('p', { class: 'se-help' }, '아직 올린 도면이 없어요.'));
    if (vers.length) nodes.push(sec('버전 기록', h('p', { class: 'se-help' }, ed ? '내보낸 버전 중 최종본에 ★를 누르세요. ★ 버전이 POG에서 보여요.' : '★ = 최종본 (POG에서 보이는 도면)'),
      ...vers.map(x => verCard(x, { canStar: ed, onOpen: () => { dw.vId = x.id; renderDw(); } }))));
  }
  box.replaceChildren(...nodes);
}
// 매대명 묶음 고치기 (업로드 탭): 자동으로 묶은 게 틀렸을 때 나누기·합치기
function dwPicks() { if (dw.picksV !== dw.vId) { dw.picks = new Set(); dw.picksV = dw.vId; } return dw.picks; }
// 고른 칸 표시만 바꿈 (도면을 다시 그리지 않아서 깜빡이지 않음 · 사용자)
function paintPicks() { const p = dwPicks(); document.querySelectorAll('#dw-stage .dw-box.pick').forEach(el => el.classList.toggle('on', p.has(el.dataset.gid))); }
function togglePick(id) { const p = dwPicks(); p.has(id) ? p.delete(id) : p.add(id); paintPicks(); renderDwSide(); }
function groupEditor(v) {
  const groups = v.groups || [], picks = dwPicks(), sel = groups.filter(g => picks.has(g.id));
  const nextId = () => 'g' + (Math.max(-1, ...groups.map(g => parseInt(g.id.slice(1)) || 0)) + 1 + nextId.n++); nextId.n = 0;
  const save = async (list, msg) => {
    const linked = [...state.fixtures.values()].some(f => f.drawingRef?.vId === v.id);
    if (v.exported && !confirm(`이미 내보낸 버전이에요. ${msg}${linked ? '\nPOG에서 이 버전의 매대를 고른 페이지가 있으면, 나뉜 매대는 다시 골라야 할 수 있어요.' : ''}\n계속할까요?`)) return;
    list.sort((a, b) => a.y - b.y || a.x - b.x);
    try {
      const before = structuredClone(v.groups || []), after = structuredClone(list), ref = doc(db, 'drawings', dw.id, 'versions', v.id);
      await updateDoc(ref, { groups: list }); dw.picks = new Set(); toast(msg);
      dwTrack(null, '매대명 묶음', () => updateDoc(ref, { groups: before }), () => updateDoc(ref, { groups: after }));
      const g0 = sel[0]; addLog(['drawings', dw.id], { vId: v.id, area: 'up', act: '매대명 묶음', what: msg, ...(g0 ? { gid: g0.id, x: g0.x + g0.w / 2, y: g0.y + g0.h / 2 } : {}) });
    }
    catch (e) { alert('저장하지 못했어요: ' + (e.code || e.message)); }
  };
  const split = () => {
    const g = sel[0], parts = g.parts || [];
    const pieces = parts.map((p, i) => ({ id: i ? nextId() : g.id, ...makeGroup([{ ...p }]) }));
    save(groups.flatMap(x => x.id === g.id ? pieces : [x]), `'${g.ko}'를 ${pieces.length}개로 나눴어요`);
  };
  const merge = () => {
    if (sel.some(g => !g.parts)) { alert('예전에 올린 도면이라 합칠 수 없어요. 도면을 다시 올려주세요.'); return; }
    const ord = sel.slice().sort((a, b) => a.y - b.y || a.x - b.x), first = ord[0];
    // 합친 묶음 = 매대 하나. 이름은 고른 칸 글자를 '/'로 이어 씀 (POG 헤더에도 'A/B'로 들어감 · 사용자)
    const names = ord.map(g => String(g.ko || '').trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
    const one = { id: first.id, ...makeGroup(sel.flatMap(g => g.parts.map(p => ({ ...p })))), ko: names.join('/'), lines: names };
    save([...groups.filter(x => !picks.has(x.id)), one], `${sel.length}개를 '${one.ko}'로 합쳤어요`);
  };
  const g1 = sel.length === 1 ? sel[0] : null;
  return h('section', { class: 'se-sec' }, h('h4', {}, '매대명 묶음 고치기'),
    h('p', { class: 'se-help' }, '도면에서 파란 칸을 누르거나, 빈 곳을 끌어 네모로 여러 칸을 한 번에 고르세요. 한 매대인 글자들을 골라 [합치기]하면 한 묶음(매대 하나)이 되고, POG에는 \'글자1/글자2\'처럼 /로 이어져 들어가요. 한 칸에 여러 매대가 들어갔으면 [나누기].'),
    sel.length ? h('div', { class: 'dw-glist' }, ...sel.map(g => h('div', { class: 'dw-gi on', onclick: () => togglePick(g.id) }, h('span', { class: 'ko' }, g.ko), h('span', { class: 'en' }, '×')))) : null,
    h('div', { class: 'se-btns' },
      h('button', { class: 'btn small', disabled: !(g1 && (g1.parts?.length || 0) > 1), onclick: split }, '나누기'),
      h('button', { class: 'btn small', disabled: sel.length < 2, onclick: merge }, sel.length >= 2 ? `${sel.length}개 합치기` : '합치기'),
      sel.length ? h('button', { class: 'btn small ghost', onclick: () => { dw.picks = new Set(); paintPicks(); renderDwSide(); } }, '고른 것 지우기') : null),
    g1 && !g1.parts ? h('div', { class: 'tr-why' }, '예전에 올린 도면이라 나눌 수 없어요. 다시 올리면 돼요.') : null);
}
$('#dw-side').addEventListener('focusout', () => setTimeout(() => renderDwSide(), 80));

// POG 헤더: 이 매장의 ★최종본 도면에서 매대를 눌러 고름
async function openHeaderPicker(pog, fx, after) {
  const st0 = storeForPog(pog);
  if (!st0) { modal(h('div', {}, h('h3', {}, '도면이 이어진 매장이 없어요'), h('p', {}, `처음 화면 → 매장 등록에서 매장코드 '${pog.storeCode}'인 매장을 등록하고, VMD실이 도면을 올리면 여기서 고를 수 있어요.`))); return; }
  const d = state.dwMap.get(st0.id);
  let vers = [];
  try { vers = (await getDocs(query(collection(db, 'drawings', st0.id, 'versions'), orderBy('no')))).docs.map(x => ({ id: x.id, ...x.data() })).filter(x => x.exported); } catch { }
  const v = vers.find(x => x.id === dwFinal(d)) || vers.at(-1);
  if (!v) { modal(h('div', {}, h('h3', {}, '아직 내보낸 도면이 없어요'), h('p', {}, `'${storeName(st0)}' 매장 도면을 VMD실이 올리고 내보내면 고를 수 있어요.`))); return; }
  const used = new Set([...state.fixtures.values()].filter(x => x.id !== fx.id && x.drawingRef?.vId === v.id).map(x => x.drawingRef.gid));
  // 같은 매장의 다른 팀 POG에 연결된 매대 (국내: 팀마다 POG가 따로라 같은 도면을 나눠 씀)
  const others = new Map(); // gid → 팀 이름
  try {
    const ops = state.pogs.filter(p => p.id !== pog.id && String(p.storeCode) === String(pog.storeCode));
    const lists = await Promise.all(ops.map(p => getDocs(collection(db, 'pogs', p.id, 'fixtures')).then(s => s.docs.map(d => [p, d.data()])).catch(() => [])));
    for (const [p, f] of lists.flat()) { const r = f.drawingRef; if (!r) continue; const g = r.vId === v.id ? (v.groups || []).find(x => x.id === r.gid) : (v.groups || []).find(x => norm(x.ko) === norm(r.ko)); if (g && !others.has(g.id)) others.set(g.id, pogTeam(p) || '다른 팀'); }
  } catch { }
  // 지금 어느 페이지의 매대를 고르는지 (사용자): 페이지 이름·POG 원래 이름·카테고리·작은 그림
  const cfx = state.edComposed?.get(fx.id) || fx;
  const pageNo = [...(state.edComposed?.keys() || [])].indexOf(fx.id) + 2; // 표지가 1쪽
  if (state.edActive !== fx.id) setEdActive(fx.id); // 오른쪽 패널도 이 페이지로
  const cur = h('div', { class: 'hp-cur' },
    (cfx.items || []).length ? h('div', { class: 'hp-cv' }, buildCanvas(cfx, 200, 150, null, { lazy: true })) : null,
    h('div', { class: 'hp-info' },
      h('div', { class: 'hp-tag' }, `📄 ${pageNo > 1 ? pageNo + '쪽 · ' : ''}이 페이지의 매대를 고르는 중`),
      h('div', { class: 'hp-name' }, displayName(fx)),
      h('div', {}, fx.kind === 'free' ? '추가 페이지 (빈 페이지)' : `POG 원본: ${origName(fx) || '-'}`),
      h('div', { class: 'mut' }, `${fx.teamName ? '카테고리 ' + catName(fx.teamName) + ' · ' : ''}제품 ${(cfx.items || []).length}개`),
      fx.drawingRef ? h('div', { class: 'hp-now' }, '지금 연결된 도면 매대: ', h('b', {}, fx.drawingRef.ko), ' (도면에서 주황 칸)') : h('div', { class: 'hp-now none' }, '아직 도면과 연결 안 됨')));
  // 지금 연결된 칸: 같은 버전이면 그 칸, 다른 버전에서 골랐으면 같은 한글 이름 칸 (사용자: 표시가 안 됐음)
  const r0 = fx.drawingRef, curG = r0 ? (r0.vId === v.id ? (v.groups || []).find(x => x.id === r0.gid) : null) || (v.groups || []).find(x => norm(x.ko) === norm(r0.ko)) : null;
  if (curG) used.delete(curG.id); // 이 페이지 칸은 초록(다른 페이지)보다 주황(지금 연결)으로
  const close = modal(h('div', { class: 'hp-pick' },
    h('h3', {}, `도면에서 매대 고르기 · ${storeName(st0)} ver.${v.no}${dwFinal(d) === v.id ? ' ★최종본' : ''}`),
    cur,
    h('p', { class: 'mut' }, '매대를 누르면 헤더에 들어가요. 주황 = 이 페이지 · 초록 = 이 POG의 다른 페이지 · 보라 점선 = 다른 팀 POG에 연결된 매대. 넣은 뒤에 뒤에 숫자(1, 2…)를 붙여도 돼요.'),
    drawingView(v, { used, others, selId: curG?.id || null, onPick: g => {
      const ref = { storeId: st0.id, vId: v.id, vNo: v.no, gid: g.id, ko: g.ko };
      const ug = undoGroup(); saveFx(pog.id, fx.id, 'headerName', g.ko, ug); saveFx(pog.id, fx.id, 'drawingRef', ref, ug);
      const blk = state.pageEls.get(fx.id), inp = blk?.querySelector('[data-f="headerName"]'); if (inp) inp.value = g.ko;
      fx.drawingRef = ref; fx.headerName = g.ko;
      close(); toast(`헤더에 '${g.ko}'를 넣었어요`); after?.();
    }, seq: await readSeq(st0.id, v.id) })), { wide: true });
  setTimeout(() => $('#modal-root .hp-pick .dw-box.on')?.scrollIntoView({ block: 'center', inline: 'center' }), 120); // 지금 연결된 칸이 보이게
}
// 이 POG 매장의 ★최종본(없으면 마지막으로 내보낸) 도면 버전
async function pogDrawing(pog) {
  const st0 = storeForPog(pog); if (!st0) return null;
  let vers = [];
  try { vers = (await getDocs(query(collection(db, 'drawings', st0.id, 'versions'), orderBy('no')))).docs.map(x => ({ id: x.id, ...x.data() })).filter(x => x.exported); } catch { }
  const v = vers.find(x => x.id === dwFinal(state.dwMap.get(st0.id))) || vers.at(-1);
  return v ? { st0, v } : null;
}
// 온라인 도면에서 매긴 매대 번호 (drawings/{매장}/seq/{버전} = { order: [gid…] }, 1번부터)
async function readSeq(storeId, vId) {
  try { const d = await getDoc(doc(db, 'drawings', storeId, 'seq', vId)); return d.exists() ? { order: d.data().order || [] } : null; } catch { return null; }
}
// 이름 비슷한 정도 0~1: 낱말('/'·쉼표·괄호·띄어쓰기로 나눔)이 겹치는 정도 + 글자 두 개씩 겹치는 정도. POG 원래 이름 끝의 '_2_2600_1000'·'(1/4)'는 뺌
const nameWords = s => String(s || '').replace(/\(\d+\/\d+\)/g, '').replace(/_[\d_A-Za-z]*$/, '').split(/[\/,·()\[\]\s&+]+/).map(w => w.replace(/[^가-힣A-Za-z0-9]/g, '')).filter(w => w.length > 0);
const bigrams = s => { const t = s.replace(/[^가-힣A-Za-z0-9]/g, ''), out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
function wordSim(pw, gw) {
  if (!pw.length || !gw.length) return 0;
  const inter = gw.filter(w => pw.some(p => p === w || (p.length > 1 && w.length > 1 && (p.includes(w) || w.includes(p))))).length;
  const word = inter / Math.max(gw.length, pw.length);
  const A = bigrams(pw.join('')), B = bigrams(gw.join('')), both = [...A].filter(x => B.has(x)).length;
  const dice = A.size + B.size ? 2 * both / (A.size + B.size) : 0;
  return word * 0.65 + dice * 0.35 + (pw.join('') === gw.join('') ? 0.3 : 0);
}
// 페이지 제품들의 품목군 (POG 사이트 분류 '아동문구(아동스티커)_95_140_10' → '아동문구', '아동스티커'), 많이 들어간 순서로 [{ w: 낱말들, share: 비율 }]
function itemGroups(fx) {
  const cnt = new Map(), items = fx.items || [];
  for (const it of items) {
    const g = String(it.group || it.data?.groupname || '').replace(/(_[\d.]+){3}$/, '').trim();
    if (g) cnt.set(g, (cnt.get(g) || 0) + 1);
  }
  return [...cnt].sort((a, b) => b[1] - a[1]).map(([g, n]) => ({ w: nameWords(g), share: n / items.length }));
}
// 이름 비슷한 정도: 매대명(헤더·POG 원래 이름)과 품목군 이름(사용자) 중 높은 쪽. 품목군은 그 품목군 제품이 많을수록 점수가 큼
function nameScore(fx, ko) {
  const gw = nameWords(ko); if (!gw.length) return 0;
  let best = 0;
  for (const src of [fx.headerName, fx.mdName]) best = Math.max(best, wordSim(nameWords(src), gw));
  const grps = itemGroups(fx);
  for (const g of grps.slice(0, 5)) best = Math.max(best, wordSim(g.w, gw) * (0.75 + 0.25 * Math.min(1, g.share * 2)));
  return best;
}
// 페이지 → 도면 번호 (같은 버전이면 gid, 아니면 같은 한글 이름의 칸)
function seqNoOf(fx, v, order) {
  const r = fx.drawingRef; if (!r || !order?.length) return 0;
  const gid = r.vId === v.id ? r.gid : (v.groups || []).find(g => g.ko === r.ko)?.id;
  const i = gid ? order.indexOf(gid) : -1; return i + 1;
}
// 표지 패널 'POG랑 도면 연결하기' (사용자): 페이지 목록에서 한꺼번에 도면 매대 연결 + 도면 번호 순서로 페이지 바꾸기
async function openPogDwLink(pog) {
  const pd = await pogDrawing(pog);
  if (!pd) { modal(h('div', {}, h('h3', {}, '연결할 도면이 없어요'), h('p', {}, '매장 등록에서 이 POG 매장코드의 매장을 등록하고, VMD실이 도면을 올려 내보내면 연결할 수 있어요.'))); return; }
  const { st0, v } = pd;
  const body = h('div', { class: 'pdl-list' });
  const info = h('p', { class: 'mut' });
  const paint = async () => {
    const seq = await readSeq(st0.id, v.id), order = seq?.order || [];
    const pages = [...state.edComposed.values()];
    info.textContent = `${storeName(st0)} · 도면 ver.${v.no} · 도면 번호 ${order.length ? order.length + '개 매김' : '아직 없음 (온라인 도면에서 🔢 번호 매기기)'}`;
    body.replaceChildren(...pages.map((fx, i) => {
      const n = seqNoOf(fx, v, order);
      return h('div', { class: 'pdl-row' + (fx.drawingRef ? ' on' : '') },
        h('span', { class: 'pdl-no' }, i + 2), h('span', { class: 'pdl-name' }, displayName(fx)),
        h('span', { class: 'pdl-orig', title: 'POG 사이트의 원래 매대 이름' }, fx.kind === 'free' ? '' : origName(fx)),
        h('span', { class: 'pdl-ref' }, fx.drawingRef ? `📐 ${fx.drawingRef.ko}${n ? ` · 도면 ${n}번` : ''}` : fx.kind === 'free' ? '추가 페이지 · 연결 안 됨' : '연결 안 됨'),
        h('button', { class: 'btn small' + (fx.drawingRef ? ' ghost' : ''), onclick: () => openHeaderPicker(pog, fx, () => setTimeout(paint, 700)) }, fx.drawingRef ? '다시 연결' : '도면 연결하기'));
    }));
    sortBtn.disabled = !order.length;
  };
  const sortBtn = h('button', { class: 'btn primary', onclick: async () => {
    const seq = await readSeq(st0.id, v.id), order = seq?.order || [];
    const ids = shownIds(), num = id => seqNoOf(state.edComposed.get(id), v, order);
    const has = ids.filter(id => num(id)), rest = ids.filter(id => !num(id));
    if (!has.length) { alert('도면 번호가 매겨진 매대와 연결된 페이지가 없어요.'); return; }
    if (!confirm(`도면 번호 순서로 페이지를 바꿀까요?\n번호가 있는 페이지 ${has.length}장을 1번부터 앞에 놓고, 번호가 없는 ${rest.length}장은 지금 순서대로 뒤에 둬요. (Ctrl+Z로 되돌릴 수 있어요)`)) return;
    await reorderPages(pog.id, [...has.sort((x, y) => num(x) - num(y)), ...rest], { act: '도면 순서대로 페이지 순서 바꿈' });
    toast('도면 번호 순서로 페이지를 바꿨어요'); setTimeout(paint, 700);
  } }, '도면순서로 POG 바꾸기');
  // 자동 추측 연결 (사용자): 연결 안 된 페이지마다 이름(헤더·POG 원래 이름)이 가장 비슷한 도면 매대를 골라 미리 보여주고, 체크한 것만 연결
  const guessBtn = h('button', { class: 'btn', onclick: () => {
    const pages = [...state.edComposed.values()].filter(f => f.kind !== 'free' && !f.drawingRef);
    if (!pages.length) { toast('연결 안 된 페이지가 없어요'); return; }
    const used = new Map(); [...state.edComposed.values()].forEach(f => { const r = f.drawingRef; if (r?.vId === v.id) used.set(r.gid, 1); });
    // 점수가 높은 짝부터 정함 (매대명 + 품목군). 이미 쓴 도면 매대는 조금 깎음 (같은 매대를 칸마다 나눈 페이지는 같은 매대로 갈 수 있게 막지는 않음)
    const all = pages.map(f => ({ f, sc: (v.groups || []).map(g => ({ g, s: nameScore(f, g.ko) })).sort((a, b) => b.s - a.s) }));
    const pick = new Map();
    for (const r of [...all].sort((a, b) => (b.sc[0]?.s || 0) - (a.sc[0]?.s || 0))) {
      let best = null;
      for (const c of r.sc.slice(0, 8)) { const s = c.s - (used.get(c.g.id) ? 0.15 : 0); if (!best || s > best.s) best = { g: c.g, s }; }
      if (best && best.s >= 0.34) { used.set(best.g.id, 1); pick.set(r.f.id, best); }
    }
    const rows = pages.map(f => ({ f, best: pick.get(f.id) || null }));
    const hit = rows.filter(r => r.best);
    const checks = new Map();
    const list = h('div', { class: 'pdl-list' }, ...rows.map(r => {
      const cb = h('input', { type: 'checkbox', checked: !!r.best, disabled: !r.best }); checks.set(r.f.id, cb);
      return h('label', { class: 'pdl-row pdl-guess' + (r.best ? '' : ' none') }, cb,
        h('span', { class: 'pdl-name' }, displayName(r.f)), h('span', { class: 'pdl-orig' }, origName(r.f)),
        h('span', { class: 'pdl-ref' }, r.best ? `→ 📐 ${r.best.g.ko}` : '비슷한 매대 없음'),
        h('span', { class: 'pdl-score' }, r.best ? `${Math.round(Math.min(1, r.best.s) * 100)}%` : ''));
    }));
    const over = h('input', { type: 'checkbox' });
    const close2 = modal(h('div', { class: 'pdl' }, h('h3', {}, '자동 추측 연결'),
      h('p', { class: 'se-help' }, '매대명과 페이지 제품의 품목군 이름을 도면 매대 이름과 비교해서, 가장 비슷한 매대를 골랐어요. 연결하면 페이지 매대명에 도면 매대 이름이 들어가요.'),
      h('label', { class: 'pdl-over' }, over, ' 이미 적어 둔 매대명도 도면 매대 이름으로 바꾸기'),
      h('p', { class: 'mut' }, `연결 안 된 페이지 ${pages.length}장 중 ${hit.length}장에 비슷한 이름의 도면 매대를 찾았어요. 맞는 것만 체크된 채로 두고 '연결하기'를 누르세요. 틀린 건 나중에 '다시 연결'로 바꿀 수 있어요.`),
      list, h('div', { class: 'modal-act' }, h('button', { class: 'btn primary', onclick: () => {
        const ug = undoGroup(); let n = 0;
        for (const r of hit) {
          if (!checks.get(r.f.id)?.checked) continue;
          const g = r.best.g, ref = { storeId: st0.id, vId: v.id, vNo: v.no, gid: g.id, ko: g.ko };
          if (!r.f.headerName || over.checked) { saveFx(pog.id, r.f.id, 'headerName', g.ko, ug); r.f.headerName = g.ko; const inp = state.pageEls.get(r.f.id)?.querySelector('[data-f="headerName"]'); if (inp) inp.value = g.ko; }
          saveFx(pog.id, r.f.id, 'drawingRef', ref, ug); r.f.drawingRef = ref; n++;
        }
        close2(); toast(`${n}장을 연결했어요 (Ctrl+Z로 되돌릴 수 있어요)`); setTimeout(paint, 700);
      } }, '연결하기'))), { wide: true });
  } }, '🔎 자동 추측 연결');
  // 처음부터: 모든 페이지의 도면 연결을 풀고, 도면에서 넣은 매대명(연결한 이름 그대로인 헤더)도 비움. Ctrl+Z로 되돌릴 수 있음
  const resetBtn = h('button', { class: 'btn ghost danger', onclick: () => {
    const linked = [...state.edComposed.values()].filter(f => f.drawingRef);
    if (!linked.length) { toast('연결된 페이지가 없어요'); return; }
    if (!confirm(`도면 연결 ${linked.length}개를 모두 풀까요?\n도면에서 넣은 매대명(헤더)도 비워져서, POG 사이트 원래 이름이 보여요. (Ctrl+Z로 되돌릴 수 있어요)`)) return;
    const ug = undoGroup();
    for (const f of linked) {
      if ((f.headerName || '') === f.drawingRef.ko) { saveFx(pog.id, f.id, 'headerName', '', ug); f.headerName = ''; const inp = state.pageEls.get(f.id)?.querySelector('[data-f="headerName"]'); if (inp) inp.value = ''; }
      saveFx(pog.id, f.id, 'drawingRef', null, ug); f.drawingRef = null;
    }
    toast('도면 연결을 모두 풀었어요'); setTimeout(paint, 700);
  } }, '처음부터');
  modal(h('div', { class: 'pdl' }, h('h3', {}, 'POG랑 도면 연결하기'), info,
    h('p', { class: 'se-help' }, "각 페이지 옆 '도면 연결하기'를 누르면 도면이 떠요. 매대를 누르면 그 페이지 헤더(매대명)와 연결돼요."),
    body, h('div', { class: 'modal-act' }, resetBtn, h('span', { class: 'grow' }), guessBtn, sortBtn)), { wide: true });
  paint();
}

/* ---------- 2.3 온라인 POG ---------- */
$('#on-search').addEventListener('input', renderOnlineList);
function renderOnlineList() {
  const q = $('#on-search').value.trim().toLowerCase();
  const list = $('#on-list');
  const rows = state.pogs.filter(p => p.status === 'final' && pogMatch(p, q));
  groupedPogList(list, rows, state.viewer.pog?.id, openViewer);
  if (!rows.length) list.append(h('div', { class: 'mut pad' }, '최종 POG가 없어요.'));
}
function closeViewer() {
  const v = state.viewer; v.unsubPog?.(); v.unsubFx?.();
  v.unsubPog = v.unsubFx = null; v.pog = null; v.fixtures = [];
  vwThumbs.clear();
  $('#viewer-body')?.classList.add('hidden'); $('#viewer-empty')?.classList.remove('hidden');
  $('#v-pog-online .split')?.classList.remove('list-off');
}
function openViewer(id) {
  closeViewer(); $('#vw-find').value = '';
  const v = state.viewer;
  v.pog = { id };
  $('#viewer-empty').classList.add('hidden'); $('#viewer-body').classList.remove('hidden');
  $('#v-pog-online .split').classList.add('list-off');
  $('#vw-pages').innerHTML = '<div class="mut pad">불러오는 중…</div>';
  renderOnlineList();
  v.unsubPog = onSnapshot(doc(db, 'pogs', id), d => { if (!d.exists()) { closeViewer(); return; } v.pog = { id: d.id, ...d.data() }; renderViewer(); });
  v.unsubFx = onSnapshot(query(collection(db, 'pogs', id, 'fixtures'), orderBy('order')), s => { v.fixtures = s.docs.map(d => ({ id: d.id, ...d.data() })); renderViewer(); });
}
function renderViewer() {
  const v = state.viewer; if (!v.pog?.status) return;
  $('#vw-title').textContent = `${pogTitle(v.pog)} · 최종 ${fmtDate(v.pog.finalizedAt)}${v.pog.manager ? ' · ' + v.pog.manager : ''}`;
  const wrap = $('#vw-pages'); wrap.innerHTML = '';
  const pogV = v.pog;
  const cover = buildCover(pogV, { editable: false }); syncCover(cover, pogV); wrap.append(cover);
  const blocks = new Map();
  const shownFx = composeFx(v.fixtures);
  shownFx.forEach(f => {
    const fx = f; const el = buildPage(fx, pogV, { editable: false, onItem: showItem }); syncPage(el, fx, pogV); wrap.append(el); blocks.set(fx.id, el);
    // 헤더(매대명)를 누르면 도면에서 이 매대 위치 (사용자)
    const ph = el.querySelector('.ph'); if (ph && (f.kind !== 'free' || f.drawingRef)) { ph.classList.add('ph-dwlink'); ph.title = '누르면 도면에서 위치를 보여줘요'; ph.onclick = () => showFxDrawing(f, fx); }
  });
  vwThumbs.sync(slideEntries(cover, v.pog, shownFx, fx => blocks.get(fx.id)));
  v.blocks = blocks; vwFind();
}

/* ---------- 2.3 피드백 POG (MD) ----------
   POG를 보기 전용으로 띄우고, 페이지마다 메모(피드백)를 남김. 지금은 글 메모만 (그림 그리기는 나중에)
   저장: pogs/{pogId}/feedback/{id} = { fx(페이지 id, 표지 '__cover'), text, by, byName, at, done, doneBy, doneByName, doneAt }
   쓰기: MD·관리자 / '반영함' 표시: POG팀·관리자 / 지우기: 쓴 사람·관리자 */
const fb = { pog: null, fixtures: [], notes: [], active: '__cover', unsubs: [], blocks: new Map(), cover: null };
const fbThumbs = makeThumbs($('#fb-thumbs'), $('#fb-pages'), id => { fb.active = id; renderFbSide(); });
$('#fb-search').addEventListener('input', renderFbList);
function renderFbList() {
  const list = $('#fb-list'); if (!list) return;
  const q = $('#fb-search').value.trim().toLowerCase();
  const rows = state.pogs.filter(p => pogMatch(p, q));
  groupedPogList(list, rows, fb.pog?.id, openFb);
  if (!rows.length) list.append(h('div', { class: 'mut pad' }, 'POG가 없어요.'));
}
function closeFb() {
  fb.unsubs.forEach(u => u()); fb.unsubs = []; fb.pog = null; fb.fixtures = []; fb.notes = []; fb.active = '__cover'; fb.blocks = new Map(); fb.cover = null;
  fbThumbs.clear();
  $('#fb-body')?.classList.add('hidden'); $('#fb-empty')?.classList.remove('hidden');
  $('#v-pog-fb .split')?.classList.remove('list-off');
}
function openFb(id) {
  closeFb();
  fb.pog = { id };
  $('#fb-empty').classList.add('hidden'); $('#fb-body').classList.remove('hidden');
  $('#v-pog-fb .split').classList.add('list-off');
  $('#fb-pages').innerHTML = '<div class="mut pad">불러오는 중…</div>';
  renderFbList();
  fb.unsubs.push(onSnapshot(doc(db, 'pogs', id), d => { if (!d.exists()) { closeFb(); renderFbList(); return; } fb.pog = { id: d.id, ...d.data() }; renderFbPages(); }));
  fb.unsubs.push(onSnapshot(query(collection(db, 'pogs', id, 'fixtures'), orderBy('order')), s => { fb.fixtures = s.docs.map(d => ({ id: d.id, ...d.data() })); renderFbPages(); }));
  fb.unsubs.push(onSnapshot(collection(db, 'pogs', id, 'feedback'), s => {
    fb.notes = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.at?.toMillis?.() ?? Date.now()) - (b.at?.toMillis?.() ?? Date.now()));
    paintFbCounts(); renderFbSide();
  }, e => toast('피드백을 읽지 못했어요: ' + e.code)));
}
function renderFbPages() {
  const p = fb.pog; if (!p?.status) return;
  $('#fb-title').textContent = `${pogTitle(p)} · ${p.status === 'final' ? '최종' : '작성 중'}`;
  const wrap = $('#fb-pages'), y = wrap.scrollTop; wrap.innerHTML = '';
  const cover = buildCover(p, { editable: false }); syncCover(cover, p); wrap.append(cover);
  cover.addEventListener('click', () => setFbActive('__cover'));
  const blocks = new Map(), shown = composeFx(fb.fixtures);
  shown.forEach(f => {
    const el = buildPage(f, p, { editable: false, onItem: showItem }); syncPage(el, f, p); wrap.append(el); blocks.set(f.id, el);
    el.addEventListener('click', () => setFbActive(f.id));
  });
  fb.blocks = blocks; fb.cover = cover;
  if (fb.active !== '__cover' && !blocks.has(fb.active)) fb.active = '__cover';
  fbThumbs.sync(slideEntries(cover, p, shown, fx => blocks.get(fx.id)));
  wrap.scrollTop = y;
  paintFbCounts(); renderFbSide();
}
const fbBlock = id => id === '__cover' ? fb.cover : fb.blocks.get(id);
const fbPageName = id => { if (id === '__cover') return '표지'; const f = fb.fixtures.find(x => x.id === id); return f ? displayName(f) : '(지금은 없는 페이지)'; };
function setFbActive(id, scroll = false) {
  fb.active = id;
  $$('#fb-pages .page-block.fb-on').forEach(x => x.classList.remove('fb-on'));
  fbBlock(id)?.classList.add('fb-on');
  if (scroll) fbBlock(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderFbSide();
}
// 페이지·썸네일 오른쪽 위에 '💬 n' (반영 안 된 것 / 전체)
function paintFbCounts() {
  const cnt = new Map(), open = new Map();
  for (const n of fb.notes) { const k = n.fx || '__cover'; cnt.set(k, (cnt.get(k) || 0) + 1); if (!n.done) open.set(k, (open.get(k) || 0) + 1); }
  const put = (el, k) => {
    if (!el) return;
    el.querySelector(':scope > .fb-badge')?.remove();
    const c = cnt.get(k); if (!c) return;
    const o = open.get(k) || 0;
    el.append(h('span', { class: 'fb-badge' + (o ? '' : ' done'), title: o ? `반영 안 된 피드백 ${o}개 (전체 ${c}개)` : `피드백 ${c}개 모두 반영함` }, `💬 ${o || '✓'}`));
  };
  put(fb.cover, '__cover'); fb.blocks.forEach((el, k) => put(el, k));
  $$('#fb-thumbs .thumb').forEach(t => put(t, t._fxId || '__cover'));
  const all = fb.notes.length, op = fb.notes.filter(n => !n.done).length;
  $('#fb-count').textContent = all ? `피드백 ${all}개 · 반영 안 됨 ${op}개` : '피드백 없음';
}
const fbTime = ts => { const d = ts?.toDate?.(); return d ? `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '방금'; };
function fbNoteCard(n, { showPage = false } = {}) {
  const mine = n.by === me(), canDone = canEdit('pog-make'), canDel = mine || state.level === 'admin';
  return h('div', { class: 'fb-note' + (n.done ? ' done' : '') },
    showPage ? h('button', { class: 'link fb-page', type: 'button', onclick: () => setFbActive(n.fx || '__cover', true) }, '📄 ' + fbPageName(n.fx || '__cover')) : null,
    h('div', { class: 'fb-text' }, n.text || ''),
    h('div', { class: 'fb-meta' }, `${nameOf(n.by, n.byName)} · ${fbTime(n.at)}`,
      n.done ? h('span', { class: 'fb-done' }, ` · ✓ 반영함 (${nameOf(n.doneBy, n.doneByName)})`) : null),
    canDone || canDel ? h('div', { class: 'fb-acts' },
      canDone ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => fbDone(n, !n.done) }, n.done ? '반영 취소' : '✓ 반영함') : null,
      canDel ? h('button', { class: 'btn small ghost danger', type: 'button', onclick: () => fbDelete(n) }, '삭제') : null) : null);
}
function renderFbSide() {
  const box = $('#fb-side'); if (!box || !fb.pog) return;
  const a = document.activeElement;
  if (box.contains(a) && a.tagName === 'TEXTAREA' && a.value) return; // 쓰는 중이면 그대로
  const id = fb.active || '__cover', here = fb.notes.filter(n => (n.fx || '__cover') === id), rest = fb.notes.filter(n => (n.fx || '__cover') !== id && !n.done);
  const nodes = [h('div', { class: 'se-head' }, h('b', {}, '📄 ' + fbPageName(id)), h('span', { class: 'mut' }, here.length ? `피드백 ${here.length}개` : '피드백 없음'))];
  if (canEdit('pog-fb')) {
    const ta = h('textarea', { class: 'se-memo fb-ta', rows: 4, placeholder: '이 페이지에 남길 피드백 (Ctrl+Enter로 남기기)' });
    const send = h('button', { class: 'btn primary', type: 'button' }, '메모 남기기');
    const go = async () => {
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      send.disabled = true;
      try { await addDoc(collection(db, 'pogs', fb.pog.id, 'feedback'), { fx: id, page: fbPageName(id), text, by: me(), byName: myName(), at: serverTimestamp(), done: false }); ta.value = ''; toast('피드백을 남겼어요'); renderFbSide(); }
      catch (e) { alert('남기지 못했어요: ' + (e.code || e.message)); }
      finally { send.disabled = false; }
    };
    send.onclick = go;
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
    nodes.push(h('section', { class: 'se-sec' }, h('h4', {}, '피드백 남기기'), ta, h('div', { class: 'se-btns' }, send),
      h('p', { class: 'se-help' }, '왼쪽 썸네일이나 페이지를 누르면 그 페이지에 남겨요.')));
  }
  nodes.push(h('section', { class: 'se-sec' }, h('h4', {}, '이 페이지 피드백'),
    ...(here.length ? here.map(n => fbNoteCard(n)) : [h('p', { class: 'se-help' }, '아직 없어요.')])));
  if (rest.length) nodes.push(h('section', { class: 'se-sec' }, h('h4', {}, `다른 페이지 · 반영 안 된 피드백 ${rest.length}개`), ...rest.map(n => fbNoteCard(n, { showPage: true }))));
  box.replaceChildren(...nodes);
}
async function fbDone(n, done) {
  try { await updateDoc(doc(db, 'pogs', fb.pog.id, 'feedback', n.id), done ? { done: true, doneBy: me(), doneByName: myName(), doneAt: serverTimestamp() } : { done: false, doneBy: deleteField(), doneByName: deleteField(), doneAt: deleteField() }); }
  catch (e) { alert('바꾸지 못했어요: ' + (e.code || e.message)); }
}
async function fbDelete(n) {
  if (!confirm('이 피드백을 지울까요?')) return;
  try { await deleteDoc(doc(db, 'pogs', fb.pog.id, 'feedback', n.id)); toast('지웠어요'); } catch (e) { alert('지우지 못했어요: ' + (e.code || e.message)); }
}
$('#fb-pdf').onclick = () => printPages($('#fb-pages'), fb.pog);
// POG 만들기에서 이 POG의 피드백 보기
$('#ed-dwlink').onclick = () => { if (state.currentPog) openPogDwLink(state.currentPog); }; // 툴바 '📐 도면 일괄 연결' (사용자) = 표지의 'POG랑 도면 연결하기'
$('#ed-fb').onclick = () => { const id = state.currentPog?.id; if (!id) return; go('pog-fb'); openFb(id); };

/* ---------- 찾기 (온라인 POG·온라인 도면) ----------
   제품명·제품코드, 매대명·카테고리(팀명)·매대 타입. 띄어쓰기·대소문자 무시 */
const findNorm = s => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const vf = { hits: [], i: -1 };
function vwFind(jump = 0) {
  const v = state.viewer, q = findNorm($('#vw-find').value), pages = $('#vw-pages');
  $$('.fd-dim', pages).forEach(x => x.classList.remove('fd-dim'));
  $$('.fd-hit', pages).forEach(x => x.classList.remove('fd-hit'));
  $$('.find-page', pages).forEach(x => x.classList.remove('find-page'));
  $$('#vw-thumbs .thumb.find-hit').forEach(x => x.classList.remove('find-hit'));
  const n = $('#vw-find-n'), prev = vf.hits[vf.i];
  vf.hits = []; vf.i = -1;
  $('#vw-find-prev').classList.toggle('hidden', !q); $('#vw-find-next').classList.toggle('hidden', !q);
  if (!q) { n.textContent = ''; return; }
  let items = 0;
  for (const f of composeFx(v.fixtures || [])) {
    const blk = v.blocks?.get(f.id); if (!blk) continue;
    const fxHit = findNorm([displayName(f), f.mdName, f.teamName, f.fixtureType].join('|')).includes(q);
    const its = (f.items || []).filter(it => findNorm(it.name).includes(q) || findNorm(it.code).includes(q));
    if (!fxHit && !its.length) continue;
    vf.hits.push(f.id); items += its.length;
    if (fxHit) blk.classList.add('find-page');
    const cv = $('.pcanvas .cv', blk);
    if (its.length && cv) { cv.classList.add('fd-dim'); its.forEach(it => cv.querySelector(`.cv-item[data-id="${CSS.escape(String(it.id))}"]`)?.classList.add('fd-hit')); }
  }
  $$('#vw-thumbs .thumb').forEach(t => { if (vf.hits.includes(t._fxId)) t.classList.add('find-hit'); });
  n.textContent = vf.hits.length ? `${vf.hits.length}쪽${items ? ` · 제품 ${items}개` : ''}` : '없어요';
  n.classList.toggle('none', !vf.hits.length);
  vf.i = Math.max(0, vf.hits.indexOf(prev));
  if (jump && vf.hits.length) {
    vf.i = prev && vf.hits.includes(prev) ? (vf.hits.indexOf(prev) + jump + vf.hits.length) % vf.hits.length : 0;
    v.blocks.get(vf.hits[vf.i])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
let vwFindT = 0;
$('#vw-find').addEventListener('input', () => { clearTimeout(vwFindT); vwFindT = setTimeout(() => { vf.hits = []; vwFind(1); }, 250); });
$('#vw-find').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); vwFind(e.shiftKey ? -1 : 1); } });
$('#vw-find-next').onclick = () => vwFind(1);
$('#vw-find-prev').onclick = () => vwFind(-1);
$('#vw-pdf').onclick = () => printPages($('#vw-pages'), state.viewer.pog);
// 온라인 POG: 헤더 누르면 도면 위치 창 (제품 찾기와 같은 빨간 칸·화살표)
function showFxDrawing(f, fx) {
  const box = h('div', { class: 'fd-dw vw-dwpop' }, h('div', { class: 'mut' }, '도면 불러오는 중…'));
  modal(h('div', {}, h('h3', {}, '도면 위치 · ' + displayName(fx)), box), { wide: true });
  fdDrawing(box, f.drawingRef);
}
function showItem(it, fx) {
  modal(h('div', { class: 'item-pop' },
    h('div', { class: 'ip-img' }, it.img ? prodImg(it.img, '', { fallback: false }) : null),
    h('div', { class: 'ip-info' },
      h('h3', {}, it.name),
      h('table', {},
        h('tr', {}, h('th', {}, '제품코드'), h('td', {}, it.code)),
        h('tr', {}, h('th', {}, '가격'), h('td', {}, it.price ? '₩' + Number(it.price).toLocaleString() : '-')),
        h('tr', {}, h('th', {}, '바코드'), bcCell(it.code)),
        h('tr', {}, h('th', {}, '매대'), h('td', {}, displayName(fx)))))));
}

/* ---------- 바코드 등록 ----------
   barcodes/{바코드} = { code: 제품코드, name?: 제품명 }. 바코드 하나에 제품 하나, 제품 하나에 바코드 여럿도 됨.
   제품명은 이 화면에서만 보여줌 (제품 찾기에서는 POG의 제품명을 씀). 엑셀 머리글: 제품코드 · 바코드 · (제품명) */
const bcClean = v => String(v ?? '').replace(/\s+/g, '').replace(/^'/, '');
// 엑셀 칸 값 → 글자. 숫자 칸이면 지수 표기 없이. 제품코드는 POG 사이트처럼 8자리 (숫자 칸이라 앞의 0이 빠졌으면 채움)
// 제품코드는 늘 8자리: 숫자로만 된 코드가 짧으면(엑셀에서 앞의 0이 빠진 경우) 앞에 0을 채움 (사용자)
const code8 = c => /^\d{1,7}$/.test(c) ? c.padStart(8, '0') : c;
const cellText = (v, pad = 0) => typeof v === 'number' ? (Number.isInteger(v) ? BigInt(Math.round(v)).toString() : String(v)).padStart(pad, '0') : bcClean(v);
function bcCell(code) {
  const td = h('td', { class: 'mut' }, '…');
  if (!code) { td.textContent = '-'; return td; }
  getDocs(query(collection(db, 'barcodes'), where('code', '==', String(code)), limit(5)))
    .then(s => { td.textContent = s.docs.map(d => d.id).join(', ') || '등록 안 됨'; td.classList.toggle('mut', !s.size); })
    .catch(() => { td.textContent = '-'; });
  return td;
}
async function bcCount() {
  const el = $('#bc-count'); if (!el) return;
  try { const c = await getCountFromServer(collection(db, 'barcodes')); el.textContent = `등록된 바코드 ${c.data().count.toLocaleString()}개`; }
  catch { el.textContent = ''; }
}
// 찾는 글자가 없으면 등록된 바코드 목록 (제품코드 순, 100개씩 '더 보기')
const bcl = { rows: [], last: null, done: false, busy: false };
async function bcList(reset) {
  if (bcl.busy) return;
  if (reset) { bcl.rows = []; bcl.last = null; bcl.done = false; }
  if (bcl.done) return;
  bcl.busy = true;
  try {
    const qs = [collection(db, 'barcodes'), orderBy('code'), ...(bcl.last ? [startAfter(bcl.last)] : []), limit(100)];
    const s = await getDocs(query(...qs));
    bcl.rows.push(...s.docs.map(d => ({ id: d.id, ...d.data() })));
    bcl.last = s.docs.at(-1) || bcl.last; bcl.done = s.docs.length < 100;
  } catch (e) { toast('바코드 목록을 읽지 못했어요: ' + (e.code || e.message)); }
  bcl.busy = false;
  if (!bcClean($('#bc-search').value)) bcRows(bcl.rows, true);
}
function bcRows(rows, listing = false) {
  const body = $('#bc-body'), ed = canEdit('barcodes');
  body.replaceChildren(...(rows.length ? rows.map(r => h('tr', {},
    h('td', {}, r.id), h('td', {}, r.code || ''), h('td', {}, r.name || ''),
    h('td', { class: 'tc' }, ed ? h('button', { class: 'btn ghost danger small', onclick: async () => {
      if (!confirm(`바코드 ${r.id}를 지울까요?`)) return;
      try { await deleteDoc(doc(db, 'barcodes', r.id)); toast('지웠어요'); bcl.rows = bcl.rows.filter(x => x.id !== r.id); bcSearch(); bcCount(); } catch (e) { toast('지우지 못했어요: ' + e.code); }
    } }, '삭제') : null))) : [h('tr', {}, h('td', { colspan: 4, class: 'mut pad' }, $('#bc-search').value.trim() ? '찾는 바코드·제품코드가 없어요.' : bcl.busy ? '불러오는 중…' : '등록된 바코드가 없어요.'))]),
    ...(listing && !bcl.done && rows.length ? [h('tr', {}, h('td', { colspan: 4, class: 'tc' }, h('button', { class: 'btn small ghost', onclick: () => bcList() }, `더 보기 (지금 ${rows.length.toLocaleString()}개)`)))] : []));
}
async function bcSearch() {
  const q = bcClean($('#bc-search').value);
  if (!q) { bcRows(bcl.rows, true); return; }
  try {
    const [one, byCode] = await Promise.all([getDoc(doc(db, 'barcodes', q)), getDocs(query(collection(db, 'barcodes'), where('code', '==', code8(q)), limit(50)))]);
    const m = new Map();
    if (one.exists()) m.set(one.id, { id: one.id, ...one.data() });
    byCode.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() }));
    bcRows([...m.values()]);
  } catch (e) { toast('찾지 못했어요: ' + (e.code || e.message)); }
}
$('#bc-search').addEventListener('keydown', e => { if (e.key === 'Enter') bcSearch(); });
$('#bc-search').addEventListener('input', e => { if (!e.target.value.trim()) bcRows(bcl.rows, true); });
$('#bc-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, bc = bcClean(f.barcode.value), code = code8(bcClean(f.code.value)), name = f.name.value.trim();
  if (!bc || !code) return;
  if (bc.includes('/')) { toast('바코드에 / 는 쓸 수 없어요'); return; }
  try {
    const [one, same] = await Promise.all([getDoc(doc(db, 'barcodes', bc)), getDocs(query(collection(db, 'barcodes'), where('code', '==', code), limit(1)))]);
    if (one.exists()) { alert(`이미 있는 바코드예요 (등록된 제품코드 ${one.data().code}).\n바꾸려면 찾기에서 지우고 다시 추가해주세요.`); return; }
    if (same.docs.length) { alert(`이미 있는 제품코드예요 (등록된 바코드 ${same.docs[0].id}).\n바꾸려면 찾기에서 지우고 다시 추가해주세요.`); return; }
    await setDoc(doc(db, 'barcodes', bc), { code, ...(name ? { name } : {}), updatedAt: serverTimestamp(), updatedBy: me() });
    toast('저장했어요'); f.reset(); $('#bc-search').value = bc; bcSearch(); bcCount(); bcList(true);
  } catch (err) { toast('저장하지 못했어요: ' + (err.code || err.message)); }
});
$('#bc-form').onclick = async () => {
  try {
    const X = await loadXLSX(), wb = X.utils.book_new();
    const ws = X.utils.aoa_to_sheet([['제품코드', '바코드', '제품명'], ['07005574', '8809000000000', '(선택) 제품명']]);
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 30 }];
    X.utils.book_append_sheet(wb, ws, '바코드'); X.writeFile(wb, '바코드_양식.xlsx');
  } catch (e) { alert(e.message); }
};
$('#bc-export').onclick = async () => {
  const b = $('#bc-export'); b.disabled = true; b.textContent = '모으는 중…';
  try {
    const [X, s] = await Promise.all([loadXLSX(), getDocs(collection(db, 'barcodes'))]);
    const rows = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.code).localeCompare(String(b.code)) || a.id.localeCompare(b.id));
    const ws = X.utils.aoa_to_sheet([['제품코드', '바코드', '제품명'], ...rows.map(r => [r.code || '', r.id, r.name || ''])]);
    rows.forEach((_, i) => { for (const c of ['A', 'B']) { const k = c + (i + 2); if (ws[k]) ws[k].t = 's'; } }); // 앞의 0이 안 빠지게 글자로
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 30 }];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '바코드');
    X.writeFile(wb, `바코드_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`);
  } catch (e) { alert('엑셀로 저장하지 못했어요: ' + (e.code || e.message)); }
  b.disabled = false; b.textContent = '엑셀로 저장';
};
$('#bc-import').onclick = () => $('#bc-file').click();
$('#bc-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  let rows;
  try {
    const X = await loadXLSX(), wb = X.read(await file.arrayBuffer());
    rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  } catch (err) { alert('엑셀을 읽지 못했어요: ' + err.message); return; }
  const head = (rows[0] || []).map(x => String(x).replace(/\s+/g, '').toLowerCase());
  const col = names => head.findIndex(x => names.includes(x));
  const iCode = col(['제품코드', '상품코드', 'code', 'productcode', 'itemcode']), iBc = col(['바코드', 'barcode']), iName = col(['제품명', '상품명', 'name', 'productname']) >= 0 ? col(['제품명', '상품명', 'name', 'productname']) : head.findIndex((x, i) => i !== iCode && i !== iBc && /제품명|상품명|품명|이름|name/.test(x)); // '제품명(한글)'처럼 써도 찾음
  if (iCode < 0 || iBc < 0) { alert("첫 줄(머리글)에 '제품코드'와 '바코드'가 있어야 해요.\n'빈 양식 받기'로 받은 파일에 붙여넣어 올려주세요."); return; }
  // 이미 있는 바코드·제품코드는 바꾸지 않고 건너뜀 (사용자). 건너뛴 줄은 이 화면에만 한 번 보여줌
  toast('지금 등록된 바코드를 확인하는 중…');
  let exBc, exCode, exName;
  try {
    const all = await getDocs(collection(db, 'barcodes'));
    exBc = new Map(all.docs.map(d => [d.id, d.data().code])); exName = new Map(all.docs.map(d => [d.id, d.data().name || ''])); exCode = new Map(all.docs.map(d => [String(d.data().code), d.id]));
  } catch (err) { alert('등록된 바코드를 읽지 못했어요: ' + (err.code || err.message)); return; }
  const map = new Map(), skip = [], seenBc = new Map(), seenCode = new Map(), nameUpd = new Map(); let sameN = 0;
  rows.slice(1).forEach((r, i) => {
    const line = i + 2, bc = cellText(r[iBc]), code = code8(cellText(r[iCode])), name = iName >= 0 ? String(r[iName] ?? '').trim() : '';
    if (!bc && !code) return;
    if (bc && code && exBc.get(bc) === code) { // 이미 똑같이 등록된 줄: 제품명만 새로 있으면 제품명만 채움 (바코드·제품코드는 그대로)
      if (name && name !== exName.get(bc) && !nameUpd.has(bc)) nameUpd.set(bc, name); else sameN++;
      return;
    }
    const why = !bc ? '바코드 없음' : !code ? '제품코드 없음' : bc.includes('/') ? '바코드에 / 있음'
      : exBc.has(bc) ? `이미 있는 바코드 (등록된 제품코드 ${exBc.get(bc)})`
      : exCode.has(code) ? `이미 있는 제품코드 (등록된 바코드 ${exCode.get(code)})`
      : seenBc.has(bc) ? `파일 안에 같은 바코드가 또 있음 (${seenBc.get(bc)}번째 줄)`
      : seenCode.has(code) ? `파일 안에 같은 제품코드가 또 있음 (${seenCode.get(code)}번째 줄)` : '';
    if (why) { skip.push({ line, bc, code, name, why }); return; }
    seenBc.set(bc, line); seenCode.set(code, line);
    map.set(bc, { code, name });
  });
  const kinds = {};
  skip.forEach(x => { const k = x.why.replace(/ \(.*\)$/, ''); kinds[k] = (kinds[k] || 0) + 1; });
  if (!map.size && !nameUpd.size) {
    bcReport(skip, file.name, 0, sameN);
    alert(skip.length ? `새로 올릴 줄이 없어요.${sameN ? `\n(${sameN.toLocaleString()}줄은 이미 똑같이 등록돼 있어요)` : ''}\n건너뛴 줄은 화면 아래 목록에서 볼 수 있어요.` : `파일의 ${sameN.toLocaleString()}줄이 모두 이미 똑같이 등록돼 있어요. 새로 올릴 것이 없어요.`);
    return;
  }
  const go = h('button', { class: 'btn primary' }, map.size ? `${map.size.toLocaleString()}개 올리기${nameUpd.size ? ` · 제품명 ${nameUpd.size.toLocaleString()}개 채우기` : ''}` : `제품명 ${nameUpd.size.toLocaleString()}개 채우기`);
  const close = modal(h('div', {}, h('h3', {}, '바코드 엑셀 올리기'),
    h('ul', { class: 'steps' },
      h('li', {}, `새로 올릴 바코드 ${map.size.toLocaleString()}개`),
      nameUpd.size ? h('li', {}, `이미 등록된 바코드에 제품명만 채우기 ${nameUpd.size.toLocaleString()}개 (바코드·제품코드는 그대로)`) : null,
      sameN ? h('li', { class: 'mut' }, `이미 똑같이 등록된 줄 ${sameN.toLocaleString()}개 (그대로 둬요)`) : null,
      skip.length ? h('li', { class: 'warn' }, `건너뛰는 줄 ${skip.length.toLocaleString()}개 (이미 있는 것은 바꾸지 않아요)`,
        h('div', { class: 'mut' }, Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(' · '))) : null,
      iName < 0 ? h('li', { class: 'mut' }, '제품명 열이 없어요 (괜찮아요)') : null),
    h('p', { class: 'mut' }, '건너뛴 줄은 올린 뒤 이 화면 아래에 목록으로 보여드려요 (다른 화면으로 가면 사라져요).'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true;
    const list = [...[...map].map(([bc, r]) => ['set', bc, r]), ...[...nameUpd].map(([bc, n]) => ['name', bc, n])]; let done = 0;
    try {
      for (let i = 0; i < list.length; i += 400) {
        const b = writeBatch(db);
        for (const [op, bc, r] of list.slice(i, i + 400)) {
          if (op === 'set') b.set(doc(db, 'barcodes', bc), { code: r.code, ...(r.name ? { name: r.name } : {}), updatedAt: serverTimestamp(), updatedBy: me() });
          else b.update(doc(db, 'barcodes', bc), { name: r, updatedAt: serverTimestamp(), updatedBy: me() });
        }
        await b.commit(); done = Math.min(list.length, i + 400); go.textContent = `올리는 중… ${done.toLocaleString()} / ${list.length.toLocaleString()}`;
      }
      close(); toast([map.size ? `바코드 ${map.size.toLocaleString()}개를 올렸어요` : '', nameUpd.size ? `제품명 ${nameUpd.size.toLocaleString()}개를 채웠어요` : '', skip.length ? `${skip.length}개는 건너뜀` : ''].filter(Boolean).join(' · ')); bcCount(); bcList(true);
      bcReport(skip, file.name, map.size, sameN);
    } catch (err) { alert(`올리다가 멈췄어요 (${done.toLocaleString()}개까지 저장됨): ${err.code || err.message}`); go.disabled = false; go.textContent = '다시 올리기'; }
  };
});
// 건너뛴 줄 알림: 이 화면에만, 한 번만 (다른 화면으로 가거나 닫으면 사라지고 저장하지 않음)
function bcReport(skip, fileName, okN, sameN = 0) {
  const box = $('#bc-report'); if (!box) return;
  if (!skip.length) { box.replaceChildren(); box.classList.add('hidden'); return; }
  const dl = h('button', { class: 'btn small ghost', onclick: async () => {
    try {
      const X = await loadXLSX(), ws = X.utils.aoa_to_sheet([['줄', '바코드', '제품코드', '제품명', '건너뛴 이유'], ...skip.map(x => [x.line, x.bc, x.code, x.name, x.why])]);
      skip.forEach((_, i) => { for (const c of ['B', 'C']) { const k = c + (i + 2); if (ws[k]) ws[k].t = 's'; } });
      ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 44 }];
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '건너뛴 줄'); X.writeFile(wb, `바코드_건너뛴줄_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`);
    } catch (e) { alert(e.message); }
  } }, '엑셀로 받기');
  box.replaceChildren(
    h('div', { class: 'bc-rep-head' }, h('b', {}, `'${fileName}' 에서 건너뛴 줄 ${skip.length.toLocaleString()}개`), h('span', { class: 'mut' }, ` · 올린 줄 ${okN.toLocaleString()}개${sameN ? ` · 이미 똑같이 등록된 줄 ${sameN.toLocaleString()}개` : ''}`),
      h('span', { class: 'sp' }), dl, h('button', { class: 'modal-x bc-rep-x', title: '닫기', onclick: () => bcReport([], '', 0) }, '×')),
    h('p', { class: 'mut' }, '이미 있는 바코드·제품코드는 바꾸지 않았어요. 바꾸려면 아래 찾기에서 지우고 다시 올려주세요. 이 목록은 다른 화면으로 가면 사라져요.'),
    h('div', { class: 'bc-rep-wrap' }, h('table', { class: 'gl-table' },
      h('thead', {}, h('tr', {}, h('th', { style: 'width:56px' }, '줄'), h('th', { style: 'width:150px' }, '바코드'), h('th', { style: 'width:100px' }, '제품코드'), h('th', {}, '이유'))),
      h('tbody', {}, ...skip.slice(0, 500).map(x => h('tr', {}, h('td', {}, x.line), h('td', {}, x.bc), h('td', {}, x.code), h('td', {}, x.why)))))),
    ...(skip.length > 500 ? [h('p', { class: 'mut' }, `앞의 500개만 보여요. 전부는 '엑셀로 받기'로 보세요.`)] : []));
  box.classList.remove('hidden');
}

/* ---------- 3. 제품 찾기 (휴대폰용) ----------
   매장 고르기 → 바코드 사진 찍기(또는 입력) → barcodes/{바코드}로 제품코드 → 그 매장 최종 POG(팀마다 하나씩, 모두)의 items[].code에서 찾기
   → POG 위치(위에서 몇 번째 선반·파이프, 왼쪽에서 몇 번째) + 그림에 강조 + 도면에서 그 매대(drawingRef) 강조.
   바코드 읽기: 휴대폰 기본 기능(BarcodeDetector, 안드로이드 크롬) → 없으면 ZXing(아이폰 등, 누를 때만 불러옴) */
const fd = { key: null, pogs: [], fixtures: null, shown: [], last: null, dwCache: new Map() };
// 최종 POG가 있는 매장 (매장코드마다 묶음. 국내는 팀마다 POG가 따로 있으므로 팀마다 가장 최근 최종본)
function fdStores() {
  const m = new Map();
  for (const p of state.pogs) {
    if (p.status !== 'final') continue;
    const k = String(p.storeCode || p.id);
    const g = m.get(k) || { code: p.storeCode, teams: new Map() };
    const t = pogTeam(p) || '(팀 없음)', o = g.teams.get(t);
    if (!o || (p.finalizedAt?.toMillis?.() || 0) > (o.finalizedAt?.toMillis?.() || 0)) g.teams.set(t, p);
    m.set(k, g);
  }
  return [...m.entries()].map(([key, g]) => {
    const pogs = [...g.teams.values()].sort((a, b) => pogTeam(a).localeCompare(pogTeam(b), 'ko')), p = pogs[0];
    const st = state.stores.find(x => String(x.code) === String(g.code));
    const dwd = [...state.dwMap.values()].find(d => String(d.storeCode) === String(g.code) && d.status === 'final');
    return { key, pogs, name: (st && partnerBranch(st.partner, st.branch)) || (dwd && partnerBranch(dwd.partner, dwd.branch)) || dwd?.storeName || p.branchName || p.storeName || g.code, code: g.code, dw: dwd };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
}
// 1단계: 매장 카드 목록 (마지막으로 고른 매장은 '최근'). 2단계: 그 매장에서 바코드 찍기
function renderFdStores() {
  const box = $('#fd-stores'); if (!box) return;
  const list = fdStores(); let last = null;
  try { last = localStorage.getItem('fd-store'); } catch { }
  box.replaceChildren(...(list.length ? list.map(x => h('button', { type: 'button', class: 'fd-store-card' + (x.key === last ? ' recent' : ''), onclick: () => fdChoose(x.key) },
    h('div', { class: 'fd-sc-name' }, x.name),
    h('div', { class: 'fd-sc-sub' }, [x.code, `팀 ${x.pogs.length}개`, x.dw ? '도면 있음' : '도면 없음'].filter(Boolean).join(' · ')),
    x.key === last ? h('span', { class: 'fd-sc-recent' }, '최근') : null,
    h('span', { class: 'fd-sc-go' }, '›'))) : [h('div', { class: 'fd-card mut' }, '볼 수 있는 매장이 없어요. 최종 POG가 있는 매장만 나와요.')]));
  if (fd.key && !list.some(x => x.key === fd.key)) fdStep(1);
  fdTitle();
}
function fdChoose(key) {
  try { localStorage.setItem('fd-store', key); } catch { }
  if (key !== fd.key || !fd.fixtures) fdOpen(key);
  fdStep(2);
}
function fdStep(n) {
  fd.step = n;
  $('#fd-step1').classList.toggle('hidden', n !== 1); $('#fd-step2').classList.toggle('hidden', n !== 2);
  $('#fd-back').classList.toggle('hidden', n !== 2);
  if (n === 1) { fd.key = null; fd.fixtures = null; fd.last = null; $('#fd-result').replaceChildren(); $('#fd-q').value = ''; $('#fd-step2').classList.remove('has-result'); renderFdStores(); }
  else fdTitle();
  window.scrollTo(0, 0);
}
$('#fd-back').onclick = () => fdStep(1);
// 그 매장의 팀별 최종 POG 페이지를 모두 읽음 (페이지마다 _pog = 어느 팀 POG인지)
async function fdOpen(key) {
  fd.key = key || null; fd.fixtures = null; fd.last = null; fd.pogs = [];
  $('#fd-result').replaceChildren();
  const cur = fdStores().find(x => x.key === key); if (!cur) return;
  fd.pogs = cur.pogs;
  try {
    const all = await Promise.all(cur.pogs.map(p => getDocs(query(collection(db, 'pogs', p.id, 'fixtures'), orderBy('order')))
      .then(s => s.docs.map(d => ({ id: d.id, ...d.data(), _pog: p })))));
    if (fd.key !== key) return;
    fd.fixtures = all.flat();
    fd.shown = all.flatMap(list => composeFx(list).map(f => ({ ...f, _pog: list[0]?._pog })));
  } catch (e) { toast('POG를 읽지 못했어요: ' + (e.code || e.message)); }
  fdTitle();
}
function fdTitle() {
  const cur = fd.key && fdStores().find(x => x.key === fd.key);
  $('#fd-title').textContent = fd.step === 2 && cur ? cur.name : '매장 선택';
}
// 사진에서 바코드 읽기
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
let zxP = null;
const loadZXing = () => zxP ||= new Promise((ok, no) => {
  if (window.ZXing) return ok(window.ZXing);
  const sc = h('script', { src: ZXING_URL }); sc.onload = () => ok(window.ZXing);
  sc.onerror = () => { zxP = null; no(new Error('바코드 읽기 도구를 불러오지 못했어요. 인터넷 연결을 확인해주세요.')); };
  document.head.append(sc);
});
async function readBarcode(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('사진을 열지 못했어요');
  if ('BarcodeDetector' in window) {
    try { const r = await new window.BarcodeDetector().detect(bmp); if (r[0]?.rawValue) return r[0].rawValue; } catch { }
  }
  const Z = await loadZXing();
  // 크기를 몇 가지로 바꿔 가며 시도 (흰 여백을 붙여야 잘 읽힘)
  for (const max of [1200, 1800, 800, 2600]) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), hh = Math.round(bmp.height * k), pad = 40;
    const c = h('canvas'); c.width = w + pad * 2; c.height = hh + pad * 2;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, pad, pad, w, hh);
    try {
      const rd = new Z.MultiFormatReader(); rd.setHints(new Map([[Z.DecodeHintType.TRY_HARDER, true]]));
      return rd.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)))).getText();
    } catch { }
  }
  throw new Error('바코드를 읽지 못했어요. 더 가까이, 밝은 곳에서 다시 찍거나 숫자를 직접 넣어주세요.');
}
$('#fd-photo').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!fd.key) { alert('먼저 매장을 골라주세요'); return; }
  $('#fd-result').replaceChildren(h('div', { class: 'fd-card mut' }, '바코드를 읽는 중…'));
  try { const code = await readBarcode(f); $('#fd-q').value = code; await fdFind(code); }
  catch (err) { $('#fd-result').replaceChildren(h('div', { class: 'fd-card fd-err' }, err.message)); }
});
$('#fd-form').addEventListener('submit', e => { e.preventDefault(); $('#fd-q').blur(); fdFind($('#fd-q').value); });
async function fdFind(q) {
  q = bcClean(q);
  if (!q) return;
  if (!fd.key) { alert('먼저 매장을 골라주세요'); return; }
  if (!fd.fixtures) { toast('POG를 불러오는 중이에요'); return; }
  let code = code8(q), barcode = null;
  try { const d = await getDoc(doc(db, 'barcodes', q)); if (d.exists()) { code = String(d.data().code); barcode = q; } } catch { }
  const hits = [];
  for (const fx of fd.shown) for (const it of fx.items || []) if (String(it.code) === code) hits.push({ fx, it });
  fd.last = { q, code, barcode, hits };
  fdShow(fd.last);
}
// POG 그림에서 몇 번째 단, 왼쪽에서 몇 번째인지
function fdPos(fx, it) {
  const g = it._g || 0, props = (fx.props || []).filter(p => (p._g || 0) === g && p.w >= 20);
  const cx = it.x + it.w / 2, bottom = it.y + it.h;
  const rows = [];
  for (const p of [...props].sort((a, b) => a.y - b.y)) { const last = rows.at(-1); if (last && Math.abs(last.y - p.y) <= 6) last.ps.push(p); else rows.push({ y: p.y, ps: [p] }); }
  const under = (r) => r.ps.some(p => cx >= p.x - 4 && cx <= p.x + p.w + 4);
  let best = null;
  rows.forEach((r, i) => {
    if (!under(r)) return;
    const pipe = r.ps.some(p => /파이프/.test(p.kind || '')), d = pipe ? it.y - r.y : r.y - bottom; // 선반: 제품 아래 / 파이프: 제품 위
    if (d >= -12 && (!best || d < best.d)) best = { i, d, pipe };
  });
  if (!best) return null;
  const row = rows[best.i];
  // 같은 단에 놓인 제품들의 가로 위치 → 왼쪽에서 몇 번째 (위아래로 쌓인 것은 한 칸)
  const onRow = (fx.items || []).filter(o => {
    if ((o._g || 0) !== g) return false;
    const ocx = o.x + o.w / 2, d = best.pipe ? o.y - row.y : row.y - (o.y + o.h);
    return d >= -12 && d < 60 && row.ps.some(p => ocx >= p.x - 4 && ocx <= p.x + p.w + 4);
  });
  const cols = [...new Set(onRow.map(o => Math.round((o.x + o.w / 2) / 8)))].sort((a, b) => a - b);
  const col = cols.indexOf(Math.round(cx / 8)) + 1;
  return { row: best.i + 1, rows: rows.length, pipe: best.pipe, col: col || null, cols: cols.length };
}
function fdShow({ q, code, barcode, hits }) {
  const box = $('#fd-result');
  $('#fd-step2').classList.add('has-result'); // 휴대폰: 찾은 뒤에는 위쪽 찍기 칸을 한 줄로 줄여서 결과가 한 화면에 (사용자)
  if (!hits.length) {
    box.replaceChildren(h('div', { class: 'fd-card fd-err' }, h('b', {}, q), h('div', {}, barcode
      ? `제품코드 ${code} · 이 매장 POG에 없는 제품이에요.`
      : '등록된 바코드가 아니고, 이 매장 POG의 제품코드도 아니에요.')));
    return;
  }
  const it0 = hits[0].it;
  const bcTd = h('span', {}, barcode || '…');
  if (!barcode) getDocs(query(collection(db, 'barcodes'), where('code', '==', code), limit(3))).then(s => { bcTd.textContent = s.docs.map(d => d.id).join(', ') || '-'; }).catch(() => { bcTd.textContent = '-'; });
  const nodes = [h('div', { class: 'fd-card fd-prod' },
    it0.img ? prodImg(it0.img, '', { fallback: false }) : h('div', { class: 'fd-noimg' }),
    h('div', { class: 'fd-pi' }, h('b', {}, it0.name || code),
      h('div', {}, '제품코드 ' + code), h('div', {}, '바코드 ', bcTd),
      it0.price ? h('div', {}, '₩' + Number(it0.price).toLocaleString()) : null,
      hits.length > 1 ? h('div', { class: 'fd-many' }, `이 매장에 ${hits.length}곳 있어요`) : null))];
  // 여러 곳이면 휴대폰에서는 탭으로 한 곳씩 (PC는 모두 펼침)
  if (hits.length > 1) {
    const tabs = h('div', { class: 'fd-tabs' }, ...hits.map((x, n) => h('button', { type: 'button', class: 'fd-tab' + (n ? '' : ' on'),
      onclick: () => { $$('#fd-result .fd-tab').forEach((t, i) => t.classList.toggle('on', i === n)); $$('#fd-result .fd-loc').forEach((c, i) => c.classList.toggle('on', i === n)); } },
      `📍${n + 1} `, displayName((x.fx._parts || [x.fx])[x.it._g || 0] || x.fx))));
    nodes.push(tabs);
  }
  hits.forEach(({ fx, it }, n) => {
    const part = (fx._parts || [fx])[it._g || 0] || fx;
    const name = displayName(part), pos = fdPos(fx, it), team = pogTeam(fx._pog);
    const posTxt = !pos ? '위치를 계산하지 못했어요 (집기 정보 없음)'
      : `위에서 ${pos.row}번째 ${pos.pipe ? '파이프' : '선반'}${pos.col ? ` · 왼쪽에서 ${pos.col}번째` : ''}`;
    const W = window.innerWidth >= 900 ? Math.min(520, Math.floor((Math.min(window.innerWidth, 1160) - 32 - 28 - 18) / 2)) : Math.min(window.innerWidth - 56, 520), cv = buildCanvas(fx, W, fdCanvasH(fx, W));
    cv.classList.add('fd-dim');
    cv.querySelector(`.cv-item[data-id="${CSS.escape(String(it.id))}"]`)?.classList.add('fd-hit');
    const dwBox = h('div', { class: 'fd-dw' }, h('div', { class: 'mut' }, '도면 불러오는 중…'));
    nodes.push(h('div', { class: 'fd-card fd-loc' + (n ? '' : ' on') },
      h('div', { class: 'fd-h' }, h('span', { class: 'fd-no' }, hits.length > 1 ? n + 1 : '📍'), h('div', {}, h('b', {}, name), h('div', { class: 'fd-pos' }, (team ? team + ' · ' : '') + posTxt))),
      h('div', { class: 'fd-two' }, // 휴대폰: 도면 먼저, 그다음 POG · PC: 양옆 나란히 (사용자)
        h('div', { class: 'fd-col' }, h('div', { class: 'fd-sub' }, '도면'), dwBox),
        h('div', { class: 'fd-col' }, h('div', { class: 'fd-sub' }, 'POG'), h('div', { class: 'fd-cv' }, cv)))));
    fdDrawing(dwBox, part.drawingRef);
  });
  box.replaceChildren(...nodes);
  if (window.innerWidth <= 700) window.scrollTo({ top: 0, behavior: 'smooth' }); // 휴대폰: 한 화면에 다 보이게 맨 위부터
  else box.querySelector('.fd-loc')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// 제품 찾기 POG 그림 높이: 매대 모양(가로:세로)에 맞춰서 아래 빈 곳이 크게 남지 않게
function fdCanvasH(fx, W) {
  const all = [...(fx.items || []), ...(fx.props || []), ...(fx.panels || [])].filter(o => o.w > 0);
  if (!all.length) return Math.round(W * 0.6);
  const x0 = Math.min(...all.map(o => o.x)), x1 = Math.max(...all.map(o => o.x + o.w));
  const y0 = Math.min(...all.map(o => o.y)), y1 = Math.max(...all.map(o => o.y + Math.max(o.h || 0, 4)));
  const r = (y1 - y0) / Math.max(1, x1 - x0);
  const maxH = window.innerWidth <= 700 ? Math.max(170, window.innerHeight * 0.3) : W * 1.6; // 휴대폰: 화면 높이의 30%까지만
  return Math.round(Math.max(Math.min(W * 0.35, maxH), Math.min(maxH, W * r + 24)));
}
async function fdDrawing(box, ref) {
  if (!ref?.storeId || !ref.vId) { box.replaceChildren(h('div', { class: 'mut' }, '이 매대는 도면과 연결되지 않았어요.')); return; }
  try {
    const key = `${ref.storeId}|${ref.vId}`;
    let c = fd.dwCache.get(key);
    if (!c) {
      const v = await getDoc(doc(db, 'drawings', ref.storeId, 'versions', ref.vId));
      if (!v.exists()) throw new Error('no version');
      c = { v: { id: v.id, ...v.data() } }; fd.dwCache.set(key, c);
    }
    box.replaceChildren(drawingView(c.v, { only: ref.gid, plain: true }));
    setTimeout(() => box.querySelector('.fd-on')?.scrollIntoView({ block: 'nearest', inline: 'center' }), 50);
  } catch { box.replaceChildren(h('div', { class: 'mut' }, '도면을 불러오지 못했어요.')); }
}

/* ---------- 3. 용어 사전 ---------- */
const norm = t => (t || '').toLowerCase().replace(/\s+/g, ''); // 띄어쓰기·대소문자 무시
const MAKE_CATS = ['선반/파이프', '집기']; // '제작필요' 체크칸이 있는 분류 (선반·고리·집기 수량 엑셀 시트 나누기, 사용자)
const CODE_CATS = ['고리타입', '집기']; // 선반/파이프는 제품코드 필요 없음 (사용자) // 제품코드를 넣는 분류 (고리·집기 수량 엑셀에 쓰임)
const catOrder = c => { const i = CATS.indexOf(c); return i < 0 ? CATS.length : i; };
const oldCats = () => [...new Set(state.glossary.map(g => g.cat).filter(c => c && !CATS.includes(c)))];
const catLabel = c => CATS.includes(c) ? c : `${c} (예전)`;
function glSearch(q) {
  const n = norm(q);
  return state.glossary.filter(g => [g.ko, g.code].some(t => norm(t).includes(n)))
    .sort((a, b) => catOrder(a.cat) - catOrder(b.cat) || (a.ko || '').localeCompare(b.ko || '', 'ko'));
}
// 편집 기록: glossaryLog에 누가 언제 무엇을 바꿨는지 남김 (화면에는 '변경 기록'·ⓘ로만 작게)
const me = () => state.user.email.toLowerCase();
const logEntry = (g, action, changes = []) => ({ gid: g.id, cat: g.cat || '', ko: g.ko || '', action, changes, by: me(), byName: myName(), at: serverTimestamp() });
const glLog = (g, action, changes) => addDoc(collection(db, 'glossaryLog'), logEntry(g, action, changes)).catch(() => { });
const fieldLabel = f => ({ ko: '이름', cat: '분류', code: '제품코드', make: '제작필요' }[f] || f);

let glDirty = false;
function refreshGlossaryLists() {
  const dl = $('#dl-fixtureType'); dl.innerHTML = '';
  glossaryOf('매대타입').forEach(g => dl.append(h('option', { value: g.ko })));
  const dx = $('#dl-extras'); dx.innerHTML = '';
  glossaryOf('집기').forEach(g => dx.append(h('option', { value: g.ko })));
  $$('select.hook-sel').forEach(sel => fillHookSelect(sel, sel.value));
  state.pageEls?.forEach(b => { if (b._sp && !b.querySelector('.sp-list')?.contains(document.activeElement)) renderSp(b); });
}
function setGlCat(c) {
  state.glCat = c;
  if (CATS.includes(c)) $('#gl-add-cat').value = c;
  syncAddCode();
}
// 추가 칸: 고리타입·집기는 제품코드, 선반/파이프·집기는 '제작필요' 체크 (등록할 때부터 · 사용자)
const syncAddCode = () => { const c = $('#gl-add-cat').value; $('#gl-add').code.classList.toggle('hidden', !CODE_CATS.includes(c)); $('#gl-add .gl-make-in').classList.toggle('hidden', !MAKE_CATS.includes(c)); };

function renderGlossary() {
  const body = $('#gl-body');
  if (body.contains(document.activeElement)) { glDirty = true; return; }
  glDirty = false;
  const q = $('#gl-q').value.trim();
  $('#gl-q-clear').classList.toggle('hidden', !q);

  const tabs = $('#gl-tabs'); tabs.innerHTML = '';
  tabs.classList.toggle('dim', !!q);
  if (!CATS.includes(state.glCat) && !oldCats().includes(state.glCat)) state.glCat = CATS[0];
  [...CATS, ...oldCats()].forEach(c => tabs.append(h('button', { class: !q && c === state.glCat ? 'on' : '', onclick: () => { $('#gl-q').value = ''; setGlCat(c); renderGlossary(); } },
    `${catLabel(c)} `, h('span', { class: 'cnt' }, glossaryOf(c).length))));

  const rows = q ? glSearch(q) : glossaryOf(state.glCat);
  $('#gl-info').textContent = q ? `'${q}' 검색 결과 ${rows.length}개 · 전체 분류에서 찾았어요`
    : !CATS.includes(state.glCat) ? `예전 분류예요. 필요한 이름은 검색해서 분류를 바꾸고, 나머지는 지워주세요.` : '';
  const showCode = q ? rows.some(g => CODE_CATS.includes(g.cat)) : CODE_CATS.includes(state.glCat);
  const showMake = q ? rows.some(g => MAKE_CATS.includes(g.cat)) : MAKE_CATS.includes(state.glCat);
  $('#gl-head').innerHTML = '';
  $('#gl-head').append(h('tr', {}, showCode ? h('th', { class: 'gl-code-col' }, '제품코드') : null, q ? h('th', { class: 'gl-cat-col' }, '분류') : null, h('th', {}, '이름'), showMake ? h('th', { class: 'gl-make-col', title: '체크하면 선반·고리·집기 수량 엑셀의 1번 시트(선반·파이프·제작비품)에 들어가요' }, '제작필요') : null, h('th', {})));

  body.innerHTML = '';
  if (!rows.length) body.append(h('tr', {}, h('td', { colspan: 2 + (q ? 1 : 0) + (showCode ? 1 : 0) + (showMake ? 1 : 0), class: 'mut pad' },
    q ? '저장된 이름이 없어요. 위 칸에서 바로 추가할 수 있어요.' : '등록된 이름이 없어요.')));
  const ed = canEdit('glossary'); // 관리자만 편집, 나머지는 보기
  // 관리자: 지금 분류의 이름을 한꺼번에 지우기 (사용자: 집기 28개 다 삭제)
  if (ed && !q && rows.length) $('#gl-info').append(h('button', { class: 'btn ghost danger small gl-delall', type: 'button', onclick: () => glDeleteAll(state.glCat) }, `🗑 '${catLabel(state.glCat)}' 모두 삭제 (${rows.length}개)`));
  rows.forEach(g => {
    const inp = (f) => {
      const el = h('input', { value: g[f] || '', disabled: !ed });
      el.addEventListener('change', async () => {
        const v = el.value.trim();
        await updateDoc(doc(db, 'glossary', g.id), { [f]: v, updatedAt: serverTimestamp(), updatedBy: me() });
        glLog(g, 'edit', [{ f, from: g[f] || '', to: v }]);
        toast('수정했어요');
      });
      return el;
    };
    let catCell = null;
    if (q) {
      const sel = h('select', { class: 'gl-cat-sel', disabled: !ed }, ...[...CATS, ...(CATS.includes(g.cat) ? [] : [g.cat])].map(c => h('option', { value: c }, catLabel(c))));
      sel.value = g.cat;
      sel.addEventListener('change', async () => {
        await updateDoc(doc(db, 'glossary', g.id), { cat: sel.value, updatedAt: serverTimestamp(), updatedBy: me() });
        glLog(g, 'edit', [{ f: 'cat', from: g.cat, to: sel.value }]);
        toast(`'${sel.value}'(으)로 옮겼어요`);
      });
      catCell = h('td', {}, sel);
    }
    const codeCell = showCode ? h('td', {}, CODE_CATS.includes(g.cat) ? inp('code') : null) : null;
    let makeCell = null;
    if (showMake) {
      const cb = MAKE_CATS.includes(g.cat) ? h('input', { type: 'checkbox', checked: !!g.make, disabled: !canEdit('glossary-make'), title: '제작필요' }) : null;
      cb?.addEventListener('change', async () => {
        await updateDoc(doc(db, 'glossary', g.id), { make: cb.checked, updatedAt: serverTimestamp(), updatedBy: me() });
        glLog(g, 'edit', [{ f: 'make', from: g.make ? '○' : '', to: cb.checked ? '○' : '' }]);
        toast(cb.checked ? '제작필요로 표시했어요' : '제작필요 표시를 뺐어요');
      });
      makeCell = h('td', { class: 'tc' }, cb);
    }
    body.append(h('tr', {}, codeCell, catCell, h('td', {}, inp('ko')), makeCell,
      h('td', { class: 'tc' }, h('span', {}, // ⓘ 이 단어 기록은 직원 모두, 삭제는 관리자만
        h('button', { class: 'gl-i', type: 'button', title: g.updatedBy ? `마지막 수정: ${nameOf(g.updatedBy)} · ${fmtDate(g.updatedAt)}` : '이 이름 변경 기록 보기', onclick: () => showGlLog(g) }, 'ⓘ'),
        ed ? h('button', { class: 'btn ghost danger small', onclick: async () => {
          if (!confirm(`'${g.ko}'를 삭제할까요?`)) return;
          await deleteDoc(doc(db, 'glossary', g.id));
          glLog(g, 'delete', [{ f: 'ko', from: g.ko || '', to: '' }]);
        } }, '삭제') : null))));
  });
  renderGlHint();
}
async function glDeleteAll(cat) {
  const list = glossaryOf(cat), name = catLabel(cat);
  if (!list.length) return;
  if (!confirm(`'${name}'에 등록된 이름 ${list.length}개를 모두 삭제할까요?\n이미 만든 POG 페이지에 적어 둔 이름은 그대로 남아요.`)) return;
  if (!confirm(`정말 지울까요? 지운 이름은 되돌릴 수 없어요.\n(필요하면 먼저 '엑셀로 내보내기'로 저장해 두세요)`)) return;
  try {
    for (let i = 0; i < list.length; i += 400) {
      const b = writeBatch(db);
      list.slice(i, i + 400).forEach(g => b.delete(doc(db, 'glossary', g.id)));
      await b.commit();
    }
    list.forEach(g => glLog(g, 'delete', [{ f: 'ko', from: g.ko || '', to: '' }]));
    toast(`'${name}' ${list.length}개를 삭제했어요`);
  } catch (e) { alert('삭제하다가 멈췄어요: ' + (e.code || e.message) + '\n다시 누르면 남은 것을 지워요.'); }
}
// 추가하려는 한국어가 이미 있으면 알려주기
function renderGlHint() {
  const ko = $('#gl-add').ko.value.trim(), box = $('#gl-hint');
  box.innerHTML = '';
  if (!ko) return;
  const same = state.glossary.filter(g => norm(g.ko) === norm(ko));
  if (!same.length) return;
  box.append('이미 저장돼 있어요: ',
    ...same.map(g => h('span', { class: 'gl-hit' }, `[${g.cat}] ${g.ko}`)),
    h('button', { class: 'link', type: 'button', onclick: () => { $('#gl-q').value = ko; renderGlossary(); } }, '찾아서 수정하기'));
}
$('#gl-add-cat').append(...CATS.map(c => h('option', { value: c }, c)));
$('#gl-add-cat').addEventListener('change', e => { syncAddCode(); if (!$('#gl-q').value.trim()) { state.glCat = e.target.value; renderGlossary(); } });
$('#gl-add').ko.addEventListener('input', renderGlHint);
$('#gl-q').addEventListener('input', renderGlossary);
$('#gl-q-clear').onclick = () => { $('#gl-q').value = ''; renderGlossary(); $('#gl-q').focus(); };
$('#gl-body').addEventListener('focusout', () => setTimeout(() => { if (glDirty) renderGlossary(); }, 50));
$('#gl-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, cat = f.cat.value, ko = f.ko.value.trim(), code = CODE_CATS.includes(cat) ? f.code.value.trim() : '', make = MAKE_CATS.includes(cat) && f.make.checked;
  if (!ko) return;
  const same = state.glossary.filter(g => norm(g.ko) === norm(ko));
  if (same.some(g => g.cat === cat)) {
    toast(`'${cat}'에 이미 있는 이름이에요. 아래에서 수정하세요`);
    $('#gl-q').value = ko; renderGlossary(); return;
  }
  if (same.length && !confirm(`'${same.map(g => g.cat).join(', ')}' 분류에 같은 이름이 있어요. '${cat}'에도 추가할까요?`)) return;
  const r = await addDoc(collection(db, 'glossary'), { cat, ko, ...(code ? { code } : {}), ...(make ? { make: true } : {}), createdAt: serverTimestamp(), createdBy: me() });
  glLog({ id: r.id, cat, ko }, 'add', [{ f: 'ko', from: '', to: ko }, ...(make ? [{ f: 'make', from: '', to: '○' }] : [])]);
  toast(make ? '추가했어요 (제작필요)' : '추가했어요');
  f.ko.value = ''; f.code.value = ''; f.make.checked = false; f.ko.focus(); renderGlHint();
});
setGlCat(state.glCat);
renderGlossary();

/* ---------- 용어 사전 변경 기록 ---------- */
const ACTION = { add: '추가', edit: '수정', delete: '삭제', import: '엑셀', auto: 'POG에서 자동' };
const fmtTime = ts => { const d = ts?.toDate?.(); return d ? `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
async function showGlLog(g) {
  const box = h('div', { class: 'log-box' }, h('div', { class: 'mut pad' }, '불러오는 중…'));
  const q = h('input', { class: 'search w100', placeholder: '이름·편집자 이메일로 찾기' });
  modal(h('div', {}, h('h3', {}, g ? `'${g.ko}' 변경 기록` : '집기·고리·매대 등록 변경 기록'), g ? null : q, box), { wide: true });
  try {
    const snap = await getDocs(g ? query(collection(db, 'glossaryLog'), where('gid', '==', g.id))
      : query(collection(db, 'glossaryLog'), orderBy('at', 'desc'), limit(500)));
    const logs = snap.docs.map(d => d.data()).sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
    const draw = () => {
      const n = norm(q.value);
      const rows = logs.filter(l => !n || [l.ko, l.by, ...(l.changes || []).map(c => c.to)].some(t => norm(t).includes(n)));
      box.innerHTML = '';
      if (!rows.length) { box.append(h('div', { class: 'mut pad' }, '기록이 없어요. (기록은 이 기능이 생긴 뒤부터 남아요)')); return; }
      box.append(h('table', { class: 'log-tbl' },
        h('tr', {}, h('th', {}, '날짜'), h('th', {}, '편집자'), h('th', {}, ''), g ? null : h('th', {}, '이름'), h('th', {}, '내용')),
        ...rows.map(l => h('tr', {},
          h('td', {}, fmtTime(l.at)), h('td', {}, nameOf(l.by, l.byName)), h('td', {}, ACTION[l.action] || l.action),
          g ? null : h('td', {}, `[${l.cat}] ${l.ko}`),
          h('td', { class: 'log-ch' }, ...(l.changes || []).map(c => h('div', {}, `${fieldLabel(c.f)}: ${c.from || '(빈칸)'} → `, h('b', {}, c.to || '(빈칸)'))))))));
    };
    q.addEventListener('input', draw); draw();
  } catch (e) { box.innerHTML = ''; box.append(h('div', { class: 'err pad' }, '기록을 읽지 못했어요: ' + e.code)); }
}
$('#gl-log').onclick = () => showGlLog(null);

/* ---------- 용어 사전 엑셀 (내보내기 / 올리기) ---------- */
// 열: ID | 분류 | 제품코드 | 제작필요 | 이름
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxP = null;
const loadXLSX = () => xlsxP ||= new Promise((ok, no) => {
  if (window.XLSX) return ok(window.XLSX);
  const sc = h('script', { src: XLSX_URL });
  sc.onload = () => ok(window.XLSX);
  sc.onerror = () => { xlsxP = null; no(new Error('엑셀 도구를 불러오지 못했어요. 인터넷 연결을 확인해주세요.')); };
  document.head.append(sc);
});
const GL_FIXED = { id: 'ID (지우지 마세요)', cat: '분류', code: '제품코드', ko: '이름', make: '제작필요' };
const yesNo = t => /^(o|○|y|yes|예|1|true|v|✓|✔)$/i.test(t) ? true : /^(x|n|no|아니오|0|false|-)$/i.test(t) ? false : null; // 제작필요 칸 (빈 칸 = 그대로)

$('#gl-export').onclick = async () => {
  try {
    const X = await loadXLSX();
    const rows = [...state.glossary].sort((a, b) => catOrder(a.cat) - catOrder(b.cat) || (a.ko || '').localeCompare(b.ko || '', 'ko'));
    const aoa = [[GL_FIXED.id, GL_FIXED.cat, GL_FIXED.code, GL_FIXED.make, GL_FIXED.ko],
      ...rows.map(g => [g.id, g.cat, g.code || '', MAKE_CATS.includes(g.cat) ? (g.make ? 'O' : 'X') : '', g.ko || ''])];
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 9 }, { wch: 30 }];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '집기고리매대');
    X.writeFile(wb, `집기고리매대_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`);
  } catch (e) { toast(e.message); }
};
$('#gl-import').onclick = () => $('#gl-file').click();
$('#gl-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer());
    const aoa = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    showImportPreview(planGlossaryImport(aoa));
  } catch (err) { toast('엑셀을 읽지 못했어요: ' + err.message); }
};

// 엑셀 내용을 보고 무엇을 바꿀지 계산 (빈 칸은 바꾸지 않음)
function planGlossaryImport(aoa) {
  const head = (aoa[0] || []).map(t => String(t).trim());
  const col = test => head.findIndex(test);
  const ci = {
    id: col(t => /^id\b/i.test(t)), cat: col(t => t === '분류'), ko: col(t => t === '이름' || t === '한국어'),
    code: col(t => t === '제품코드'), make: col(t => t === '제작필요'),
  };
  if (ci.ko < 0) throw new Error("첫 줄에 '이름' 열이 없어요. 내보낸 엑셀 양식을 그대로 써주세요.");
  const plan = { updates: [], adds: [], warns: [] };
  const byId = new Map(state.glossary.map(g => [g.id, g])), seen = new Set();
  aoa.slice(1).forEach((row, ri) => {
    const v = i => (i >= 0 ? String(row[i] ?? '').trim() : '');
    const line = ri + 2, id = v(ci.id), ko = v(ci.ko), cat = v(ci.cat), code = v(ci.code), make = yesNo(v(ci.make));
    if (!id && !ko) return; // 빈 줄
    let g = id ? byId.get(id) : null;
    if (id && !g) { plan.warns.push(`${line}번째 줄: ID '${id}'인 이름이 없어요 (삭제된 이름일 수 있어요)`); return; }
    if (!g && cat && !CATS.includes(cat)) { plan.warns.push(`${line}번째 줄: 분류 '${cat}'을(를) 알 수 없어요 (${CATS.join(', ')} 중 하나)`); return; }
    if (!g) g = state.glossary.find(x => x.cat === cat && norm(x.ko) === norm(ko)); // ID가 없으면 분류+한국어로 찾기
    if (g) {
      if (seen.has(g.id)) return;
      seen.add(g.id);
      const ch = {};
      if (ko && ko !== g.ko) ch.ko = ko;
      if (code && code !== (g.code || '')) ch.code = code;
      if (cat && cat !== g.cat && CATS.includes(cat)) ch.cat = cat;
      if (make !== null && MAKE_CATS.includes(ch.cat || g.cat) && make !== !!g.make) ch.make = make;
      if (Object.keys(ch).length) plan.updates.push({ g, ch });
    } else {
      if (!cat) { plan.warns.push(`${line}번째 줄: 새 이름 '${ko}'에 분류가 없어요`); return; }
      if (plan.adds.some(a => a.cat === cat && norm(a.ko) === norm(ko))) return;
      plan.adds.push({ cat, ko, ...(code ? { code } : {}), ...(make && MAKE_CATS.includes(cat) ? { make: true } : {}) });
    }
  });
  return plan;
}
function showImportPreview(plan) {
  const nothing = !plan.updates.length && !plan.adds.length;
  const go = h('button', { class: 'btn primary', disabled: nothing }, '적용하기');
  const close = modal(h('div', {},
    h('h3', {}, '엑셀 올리기 미리보기'),
    h('ul', { class: 'imp-sum' },
      h('li', {}, `바뀌는 이름: ${plan.updates.length}개`),
      h('li', {}, `새로 추가하는 이름: ${plan.adds.length}개`),
      plan.warns.length ? h('li', {}, `건너뛰는 줄: ${plan.warns.length}개`) : null),
    plan.warns.length ? h('ul', { class: 'imp-warn' }, ...plan.warns.slice(0, 50).map(w => h('li', {}, w))) : null,
    h('p', { class: 'mut' }, nothing ? '바뀌는 내용이 없어요.' : '엑셀의 빈 칸은 지금 값을 그대로 둬요 (지우지 않아요).'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true; go.textContent = '저장 중…';
    try {
      let b = writeBatch(db), n = 0;
      const flush = async () => { if (n) { await b.commit(); b = writeBatch(db); n = 0; } };
      for (const { g, ch } of plan.updates) {
        const args = [...Object.entries(ch).flat(), 'updatedAt', serverTimestamp(), 'updatedBy', me()];
        b.update(doc(db, 'glossary', g.id), ...args);
        b.set(doc(collection(db, 'glossaryLog')), logEntry(g, 'import', [
          ...Object.entries(ch).map(([f, to]) => f === 'make' ? { f, from: g.make ? '○' : '', to: to ? '○' : '' } : { f, from: g[f] || '', to })]));
        if ((n += 2) >= 400) await flush();
      }
      for (const a of plan.adds) {
        const r = doc(collection(db, 'glossary'));
        b.set(r, { ...a, createdAt: serverTimestamp(), createdBy: me() });
        b.set(doc(collection(db, 'glossaryLog')), logEntry({ id: r.id, ...a }, 'add', [{ f: 'ko', from: '', to: a.ko }]));
        if ((n += 2) >= 400) await flush();
      }
      await flush();
      close(); toast(`저장했어요 (바뀜 ${plan.updates.length} · 추가 ${plan.adds.length})`);
      renderGlossary();
    } catch (e) { toast('저장 실패: ' + e.message); go.disabled = false; go.textContent = '적용하기'; }
  };
}

/* ---------- 계정 관리 (관리자만) ---------- */
// 새 계정 만들기: 관리자 로그인을 바꾸지 않도록 따로 띄운 Firebase(메모리에만)로 로그인 계정을 만들고 바로 로그아웃
const NEW_PW = '123456'; // 처음 비밀번호 (Firebase는 6자 이상만 됨). 각자 '비밀번호 바꾸기'로 바꿈
let makerAuth = null;
async function createLogin(email) {
  makerAuth ||= initializeAuth(initializeApp(firebaseConfig, 'account-maker'), { persistence: inMemoryPersistence });
  try { await createUserWithEmailAndPassword(makerAuth, email, NEW_PW); await signOut(makerAuth); return 'new'; }
  catch (e) { if (e.code === 'auth/email-already-in-use') return 'exists'; throw e; }
}
const levelSelect = v => {
  const keys = ASSIGNABLE.includes(v) ? ASSIGNABLE : [v, ...ASSIGNABLE];
  const sel = h('select', { class: 'acc-sel' }, ...keys.map(k => h('option', { value: k }, LEVELS[k])));
  sel.value = v; return sel;
};
// 이름 칸: 바로 고치면 저장 (화면 오른쪽 위·기록에 이메일 대신 보임)
function accName(r) {
  const inp = h('input', { class: 'acc-name', maxlength: 20, placeholder: '이름 넣기', title: '이름을 쓰고 Enter (또는 다른 곳 누르기)하면 저장돼요', value: r.name || '' });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  inp.addEventListener('change', async () => {
    try { await updateDoc(doc(db, 'roles', r.id), { name: inp.value.trim().slice(0, 20), updatedAt: serverTimestamp(), updatedBy: me() }); toast('이름을 바꿨어요'); }
    catch (e) { toast('저장 실패: ' + e.message); inp.value = r.name || ''; }
  });
  return inp;
}
// POG 담당자 추가: 관리자만, 계정 관리 화면에서 (사용자). POG 만들기에서는 고르기만
$('#mgr-add').addEventListener('submit', async e => {
  e.preventDefault();
  const inp = e.target.name, name = inp.value.trim().slice(0, 20);
  if (!name) return;
  if (state.managers.some(m => m.name === name)) { alert('같은 이름의 담당자가 이미 있어요.'); return; }
  try { await addDoc(collection(db, 'managers'), { name, createdAt: serverTimestamp() }); inp.value = ''; toast(`담당자 '${name}'을(를) 추가했어요`); }
  catch (er) { toast('추가하지 못했어요: ' + (er.code || er.message)); }
});
// POG 담당자 목록 (계정 관리 화면, 관리자): 이름 고치기·지우기 (사용자). 고치면 그 이름을 쓰는 POG·페이지도 같이 바꿀 수 있음
function renderMgrAdmin() {
  const body = $('#mgr-body'); if (!body) return;
  const a = document.activeElement; if (body.contains(a) && a.tagName === 'INPUT') return; // 입력 중이면 그대로
  body.replaceChildren(...(state.managers.length ? state.managers.map(m => {
    const inp = h('input', { class: 'acc-name', maxlength: 20, value: m.name || '' });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    inp.addEventListener('change', () => renameManager(m, inp));
    return h('tr', {}, h('td', {}, inp), h('td', { class: 'tc' }, h('button', { class: 'btn ghost danger small', onclick: async () => {
      if (!confirm(`담당자 '${m.name}'을(를) 목록에서 지울까요?\n이미 이 이름이 들어간 POG는 그대로 남아요.`)) return;
      try { await deleteDoc(doc(db, 'managers', m.id)); toast('지웠어요'); } catch (e) { toast('지우지 못했어요: ' + (e.code || e.message)); }
    } }, '삭제')));
  }) : [h('tr', {}, h('td', { colspan: 2, class: 'mut pad' }, '등록된 담당자가 없어요. 위 칸에 이름을 넣고 추가하세요.'))]));
}
async function renameManager(m, inp) {
  const old = m.name || '', name = inp.value.trim().slice(0, 20);
  if (!name || name === old) { inp.value = old; return; }
  if (state.managers.some(x => x.id !== m.id && x.name === name)) { alert('같은 이름의 담당자가 이미 있어요.'); inp.value = old; return; }
  try {
    await updateDoc(doc(db, 'managers', m.id), { name });
    // 이 이름이 들어간 POG(전체 담당자)·페이지(페이지 담당자)
    const pogs = state.pogs.filter(p => p.manager === old);
    const fxRefs = [];
    for (const p of state.pogs) {
      const s = await getDocs(query(collection(db, 'pogs', p.id, 'fixtures'), where('manager', '==', old))).catch(() => ({ docs: [] }));
      s.docs.forEach(d => fxRefs.push(d.ref));
    }
    if ((pogs.length || fxRefs.length) && confirm(`이름을 '${name}'(으)로 바꿨어요.\n'${old}'이(가) 들어간 POG ${pogs.length}개·페이지 ${fxRefs.length}장도 '${name}'(으)로 바꿀까요?`)) {
      const refs = [...pogs.map(p => doc(db, 'pogs', p.id)), ...fxRefs];
      for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(db); refs.slice(i, i + 400).forEach(r => b.update(r, { manager: name })); await b.commit(); }
      toast(`POG ${pogs.length}개·페이지 ${fxRefs.length}장도 바꿨어요`);
    } else toast('이름을 바꿨어요');
  } catch (e) { alert('바꾸지 못했어요: ' + (e.code || e.message)); inp.value = old; }
}
function renderAccounts() {
  renderMgrAdmin();
  const body = $('#acc-body'); body.innerHTML = '';
  const me = state.user?.email.toLowerCase();
  // 부서(레벨)별로 나열 + 검색·부서 거르기 (사용자)
  const lvOf = r => LEVELS[r.level] ? r.level : 'none';
  const ord = k => { const i = ACC_ORDER.indexOf(k); return i < 0 ? 99 : i; };
  const all = [...state.roles].sort((a, b) => ord(lvOf(a)) - ord(lvOf(b)) || (a.name || '').localeCompare(b.name || '', 'ko') || a.id.localeCompare(b.id));
  renderAccFilter(all.map(lvOf));
  const q = norm($('#acc-search')?.value || ''), f = accFilter;
  const rows = all.filter(r => (f === 'all' || lvOf(r) === f) && (!q || norm(`${r.id} ${r.name || ''} ${LEVELS[lvOf(r)]}`).includes(q)));
  const cnt = $('#acc-count'); if (cnt) cnt.textContent = q || f !== 'all' ? `${rows.length} / ${all.length}명` : `${all.length}명`;
  if (!all.length) body.append(h('tr', {}, h('td', { colspan: 4, class: 'mut pad' }, '등록된 계정이 없어요.')));
  else if (!rows.length) body.append(h('tr', {}, h('td', { colspan: 4, class: 'mut pad' }, '맞는 계정이 없어요.')));
  let lastLv = null;
  rows.forEach(r => {
    if (lvOf(r) !== lastLv) { lastLv = lvOf(r); body.append(h('tr', { class: 'acc-grp' }, h('td', { colspan: 4 }, `${LEVELS[lastLv]} · ${rows.filter(x => lvOf(x) === lastLv).length}명`))); }
    const sel = levelSelect(LEVELS[r.level] ? r.level : 'none');
    sel.addEventListener('change', async () => {
      if (r.id === me && sel.value !== 'admin' && !confirm('내 계정의 관리자 권한을 내리면 계정 관리 화면에 다시 들어올 수 없어요. 계속할까요?')) { sel.value = r.level; return; }
      try { await updateDoc(doc(db, 'roles', r.id), { level: sel.value, updatedAt: serverTimestamp(), updatedBy: me }); toast('레벨을 바꿨어요'); }
      catch (e) { toast('저장 실패: ' + e.message); sel.value = r.level; }
    });
    body.append(h('tr', {},
      h('td', {}, r.id, r.id === me ? h('span', { class: 'acc-me' }, '나') : null,
        r.level === 'blocked' ? h('span', { class: 'acc-old' }, '접속 막힘 · 레벨을 고르면 다시 열려요') : ASSIGNABLE.includes(r.level) ? null : h('span', { class: 'acc-old' }, '레벨을 다시 골라주세요')),
      h('td', {}, accName(r)),
      h('td', {}, sel),
      h('td', { class: 'tc acc-btns' },
        h('button', { class: 'btn ghost small', title: '이 사람에게 비밀번호를 새로 정하는 메일을 보내요', onclick: async () => {
          if (!confirm(`${r.id}(으)로 비밀번호 재설정 메일을 보낼까요?`)) return;
          try { await sendPasswordResetEmail(auth, r.id); toast('비밀번호 재설정 메일을 보냈어요'); } catch (e) { alert('보내지 못했어요: ' + (e.code || e.message)); }
        } }, '비밀번호 재설정 메일'),
        r.id === me ? null : r.level === 'blocked' ? null : h('button', { class: 'btn ghost danger small', onclick: async () => {
          if (!confirm(`'${r.id}' 계정의 접속을 막을까요?\n이 계정으로 로그인해도 아무것도 볼 수 없어요. 다시 쓰게 하려면 레벨을 다시 고르면 돼요.\n(로그인 계정 자체를 완전히 지우는 건 Firebase 콘솔에서만 돼요)`)) return;
          try { await updateDoc(doc(db, 'roles', r.id), { level: 'blocked', updatedAt: serverTimestamp(), updatedBy: me }); toast('접속을 막았어요'); } catch (e) { toast('저장 실패: ' + e.message); }
        } }, '삭제 (접속 막기)'))));
  });
}
// 계정 목록 부서 순서 · 거르기 (사용자)
const ACC_ORDER = ['admin', 'pog', 'vmd', 'md', 'finder', 'none', 'blocked'];
let accFilter = 'all';
function renderAccFilter(levels) {
  const box = $('#acc-filter'); if (!box) return;
  const n = k => levels.filter(l => l === k).length;
  const chip = (k, label, c) => h('button', { type: 'button', class: 'acc-chip' + (accFilter === k ? ' on' : ''), onclick: () => { accFilter = k; renderAccounts(); } }, label, h('span', { class: 'acc-chip-n' }, c));
  box.replaceChildren(chip('all', '전체', levels.length), ...ACC_ORDER.filter(k => n(k)).map(k => chip(k, LEVELS[k], n(k))));
}
$('#acc-search')?.addEventListener('input', () => renderAccounts());
$('#acc-add-level').append(...ASSIGNABLE.map(k => h('option', { value: k }, LEVELS[k])));
$('#acc-add-level').value = 'pog';
$('#acc-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, email = f.email.value.trim().toLowerCase(), name = f.name.value.trim().slice(0, 20);
  if (!email) return;
  if (state.roles.some(r => r.id === email && r.level !== 'blocked')) { toast('이미 있는 계정이에요. 목록에서 레벨을 바꾸세요'); return; }
  try {
    const btn = f.querySelector('button'); btn.disabled = true;
    let made;
    try { made = await createLogin(email); } finally { btn.disabled = false; }
    await setDoc(doc(db, 'roles', email), { level: f.level.value, ...(name ? { name } : {}), createdAt: serverTimestamp(), updatedBy: state.user.email.toLowerCase() }, { merge: true });
    f.email.value = ''; f.name.value = '';
    alert(made === 'new' ? `계정을 만들었어요.\n\n이메일: ${email}\n처음 비밀번호: ${NEW_PW}\n\n로그인한 뒤 오른쪽 위 '비밀번호 바꾸기'로 바꾸라고 알려주세요.`
      : `${email}은(는) 이미 로그인 계정이 있어서 레벨만 붙였어요.\n비밀번호를 모르면 목록에서 '비밀번호 재설정 메일'을 보내주세요.`);
  } catch (e) { alert(e.code === 'auth/invalid-email' ? '이메일 형식이 맞지 않아요.' : e.code === 'auth/admin-restricted-operation' || e.code === 'auth/operation-not-allowed' ? 'Firebase에서 계정 만들기가 꺼져 있어요. Firebase 콘솔 → Authentication → 설정 → 사용자 작업에서 \'만들기(가입) 사용 설정\'을 켜주세요.' : '만들지 못했어요: ' + (e.code || e.message)); }
});

