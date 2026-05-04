/* ═══════════════════════════════════════════
   ONBOARDING
═══════════════════════════════════════════ */
let obStep = 0;
const OB_STEPS = 4;

function showObStep(n) {
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  const step = document.querySelector(`.ob-step[data-step="${n}"]`);
  if (step) step.classList.add('active');
}

function obNext() {
  obStep++;
  if (obStep >= OB_STEPS) { finishOnboarding(); return; }
  showObStep(obStep);
}

function finishOnboarding() {
  localStorage.setItem('karta_onboarded', '1');
  document.getElementById('onboarding').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function skipOnboarding() {
  finishOnboarding();
}

document.querySelectorAll('.ob-next').forEach(btn => btn.addEventListener('click', obNext));
document.querySelectorAll('.ob-skip').forEach(btn => btn.addEventListener('click', skipOnboarding));
document.querySelectorAll('.ob-finish').forEach(btn => btn.addEventListener('click', finishOnboarding));

/* ═══════════════════════════════════════════
   TAB NAVIGATION
═══════════════════════════════════════════ */
function switchTab(name) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const section = document.getElementById('tab-' + name);
  if (section) section.classList.add('active');
  const btn = document.querySelector(`.nav-btn[data-tab="${name}"]`);
  if (btn) btn.classList.add('active');
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const ICONS = { dining:'🍽️', groceries:'🛒', travel:'✈️', gas:'⛽', entertainment:'🎬', shopping:'🛍️', other:'💳' };
const VERDICT = { 'Smart Buy':'verdict-smart','Worth It':'verdict-worth','Think Twice':'verdict-think','Reconsider':'verdict-reconsider' };

function scoreColor(score) {
  if (score >= 8) return '#10b981';
  if (score >= 6) return '#6366f1';
  if (score >= 4) return '#f59e0b';
  return '#ef4444';
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ═══════════════════════════════════════════
   TRANSACTIONS
═══════════════════════════════════════════ */
async function loadTransactions() {
  const res = await fetch('/api/transactions');
  const txns = await res.json();
  renderTransactions(txns);
}

function renderTransactions(txns) {
  const list = document.getElementById('transactionList');
  if (!txns.length) { list.innerHTML = '<p style="color:var(--muted);font-size:.85rem">No transactions yet.</p>'; return; }
  list.innerHTML = txns.map(tx => {
    const icon = ICONS[tx.category] || '💳';
    const cls  = tx.nudge_score >= 7 ? 'verdict-smart' : tx.nudge_score >= 5 ? 'verdict-worth' : 'verdict-think';
    const date = new Date(tx.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    return `<div class="tx-item">
      <div class="tx-icon">${icon}</div>
      <div class="tx-info">
        <div class="tx-name">${esc(tx.merchant)}</div>
        <div class="tx-meta">${tx.category} · ${date}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount">$${tx.amount.toFixed(2)}</div>
        <div class="tx-score ${cls}">${tx.nudge_score}/10 · ${tx.verdict}</div>
      </div>
    </div>`;
  }).join('');
}

function prependTransaction(tx) {
  const list = document.getElementById('transactionList');
  const icon = ICONS[tx.category] || '💳';
  const cls  = tx.nudge_score >= 7 ? 'verdict-smart' : tx.nudge_score >= 5 ? 'verdict-worth' : 'verdict-think';
  const div = document.createElement('div');
  div.className = 'tx-item';
  div.innerHTML = `
    <div class="tx-icon">${icon}</div>
    <div class="tx-info">
      <div class="tx-name">${esc(tx.merchant)}</div>
      <div class="tx-meta">${tx.category} · Just now</div>
    </div>
    <div class="tx-right">
      <div class="tx-amount">$${tx.amount.toFixed(2)}</div>
      <div class="tx-score ${cls}">${tx.nudge_score}/10 · ${tx.verdict}</div>
    </div>`;
  list.prepend(div);
}

/* ═══════════════════════════════════════════
   PURCHASE ANALYSIS
═══════════════════════════════════════════ */
document.getElementById('analyzeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn    = document.getElementById('analyzeBtn');
  const btnTxt = document.getElementById('btnText');
  const spin   = document.getElementById('btnSpinner');

  btn.disabled = true;
  btnTxt.textContent = 'Analyzing…';
  spin.classList.remove('hidden');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant: document.getElementById('merchant').value.trim(),
        amount:   parseFloat(document.getElementById('amount').value),
        category: document.getElementById('category').value,
        note:     document.getElementById('note').value.trim(),
      })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || 'Analysis failed'); return; }
    showResults(data.analysis);
    prependTransaction(data.transaction);
  } catch (err) {
    alert('Network error — is the server running?');
  } finally {
    btn.disabled = false;
    btnTxt.textContent = 'Analyze with AI ✨';
    spin.classList.add('hidden');
  }
});

function showResults(analysis) {
  document.getElementById('resultsPlaceholder').classList.add('hidden');
  document.getElementById('resultsContent').classList.remove('hidden');

  const rec   = analysis.recommended_card;
  const nudge = analysis.spending_nudge;

  document.getElementById('recCardName').textContent    = rec.card_name;
  document.getElementById('recCardReward').textContent  = rec.reward_rate;
  document.getElementById('recCardEstimate').textContent= 'Est. ' + rec.estimated_reward;
  document.getElementById('recReasoning').textContent   = rec.reasoning;
  document.getElementById('runnerUpText').textContent   = `${rec.runner_up.card_name} (${rec.runner_up.reward_rate})`;

  const color = scoreColor(nudge.score);
  const circle = document.getElementById('nudgeCircle');
  circle.style.borderColor = color;
  circle.style.color       = color;
  document.getElementById('nudgeScore').textContent = nudge.score;

  const bar = document.getElementById('nudgeBar');
  bar.style.width      = '0%';
  bar.style.background = color;
  setTimeout(() => { bar.style.width = (nudge.score * 10) + '%'; }, 50);

  const badge = document.getElementById('verdictBadge');
  badge.textContent = nudge.verdict;
  badge.className   = 'verdict-badge ' + (VERDICT[nudge.verdict] || '');

  document.getElementById('nudgeReflection').textContent = nudge.reflection;
  document.getElementById('nudgePattern').textContent    = nudge.pattern_insight;
  document.getElementById('nudgeTip').textContent        = nudge.money_tip;
  document.getElementById('nudgeQuestion').textContent   = '"' + nudge.emotion_check + '"';

  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ═══════════════════════════════════════════
   BUDGET
═══════════════════════════════════════════ */
async function loadBudget() {
  const res  = await fetch('/api/budget');
  const cats = await res.json();
  const list = document.getElementById('budgetList');
  list.innerHTML = cats.map(cat => {
    const pct    = Math.min((cat.spent / cat.budget) * 100, 100);
    const isOver = cat.spent > cat.budget;
    const isWarn = pct >= 80 && !isOver;
    const barColor = isOver ? '#ef4444' : isWarn ? '#f59e0b' : '#10b981';
    const diff = isOver
      ? `<span style="color:var(--danger)">+$${cat.spent - cat.budget} over</span>`
      : `<span style="color:var(--success)">$${cat.budget - cat.spent} left</span>`;
    return `<div class="budget-item">
      <div class="budget-header">
        <div class="budget-label">${cat.icon} ${esc(cat.name)}</div>
        <div class="budget-values">$${cat.spent} / $${cat.budget} &nbsp;${diff}</div>
      </div>
      <div class="budget-bar-wrap">
        <div class="budget-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="budget-pct">${Math.round(pct)}% used</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   INSIGHTS
═══════════════════════════════════════════ */
function loadInsights() {
  const trends = [
    { month:'Dec', amount:1847 },
    { month:'Jan', amount:2134 },
    { month:'Feb', amount:2312 },
    { month:'Mar', amount:2567 },
    { month:'Apr', amount:2890 },
    { month:'May', amount:2952 },
  ];
  const maxVal = Math.max(...trends.map(t => t.amount));
  document.getElementById('trendBars').innerHTML = trends.map(t => {
    const h = Math.round((t.amount / maxVal) * 100);
    return `<div class="trend-bar-wrap">
      <div class="trend-val">$${Math.round(t.amount/100)/10}k</div>
      <div class="trend-bar" style="height:${h}%"></div>
      <div class="trend-month">${t.month}</div>
    </div>`;
  }).join('');

  const cats = [
    { name:'📦 Shopping',  spent:823, budget:500 },
    { name:'🍔 Delivery',  spent:456, budget:200 },
    { name:'☕ Coffee',    spent:287, budget:150 },
    { name:'🛒 Groceries', spent:487, budget:450 },
    { name:'🚗 Transport', spent:267, budget:200 },
    { name:'⛽ Gas',       spent:245, budget:300 },
  ];
  const maxSpent = Math.max(...cats.map(c => c.spent));
  document.getElementById('categoryChart').innerHTML = cats.map(cat => {
    const w = Math.round((cat.spent / maxSpent) * 100);
    const color = cat.spent > cat.budget ? '#ef4444' : cat.spent > cat.budget * .8 ? '#f59e0b' : '#10b981';
    return `<div class="cat-bar-item">
      <div class="cat-label">${cat.name}</div>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${w}%;background:${color}"></div></div>
      <div class="cat-val">$${cat.spent}</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   SUBSCRIPTIONS
═══════════════════════════════════════════ */
async function loadSubscriptions() {
  const res  = await fetch('/api/subscriptions');
  const subs = await res.json();
  const list = document.getElementById('subscriptionList');
  list.innerHTML = subs.map(sub => {
    let tagHtml = '';
    let noteHtml = '';
    if (sub.status === 'unused') {
      tagHtml  = `<span class="sub-tag unused">Unused ${sub.days_unused} days</span>`;
      noteHtml = `<p class="sub-note">You haven't used this in ${sub.days_unused} days. Cancel to save $${(sub.amount*12).toFixed(0)}/year.</p>
                  <button class="sub-cancel">Cancel Subscription</button>`;
    } else if (sub.status === 'duplicate') {
      tagHtml  = `<span class="sub-tag duplicate">Duplicate Service</span>`;
      noteHtml = `<p class="sub-note">You have overlapping services. Pick one to save $132/year.</p>
                  <button class="sub-cancel">Cancel Subscription</button>`;
    }
    return `<div class="sub-item">
      <div class="sub-header">
        <div class="sub-icon">${sub.icon}</div>
        <div class="sub-info">
          <div class="sub-name">${esc(sub.name)}</div>
          <div class="sub-next">Next charge: ${sub.next_charge}</div>
        </div>
        <div class="sub-amount">$${sub.amount.toFixed(2)}<div style="font-size:.65rem;color:var(--muted);font-weight:400">/mo</div></div>
      </div>
      ${tagHtml}${noteHtml}
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   REWARDS
═══════════════════════════════════════════ */
async function loadRewards() {
  const res   = await fetch('/api/rewards');
  const cards = await res.json();
  document.getElementById('rewardsList').innerHTML = cards.map(card => `
    <div class="reward-item">
      <div class="reward-header">
        <div>
          <div class="reward-card-name">${esc(card.card)}</div>
          <div class="reward-cat">${card.category}</div>
          <div class="reward-pts">${card.points}</div>
        </div>
        <div class="reward-balance">$${card.balance.toFixed(2)}</div>
      </div>
      <button class="reward-redeem">Redeem Rewards →</button>
    </div>`).join('');
}

/* ═══════════════════════════════════════════
   ONBOARDING CARD LIST
═══════════════════════════════════════════ */
async function loadObCards() {
  try {
    const res   = await fetch('/api/cards');
    const cards = await res.json();
    document.getElementById('obCardList').innerHTML = cards.map(c =>
      `<div class="ob-card-item">💳 ${esc(c.name)} ···· ${c.last4}</div>`
    ).join('');
  } catch(_) {}
}

/* ═══════════════════════════════════════════
   CHAT
═══════════════════════════════════════════ */
let chatHistory = [];

function appendMsg(role, text) {
  const wrap = document.getElementById('chatMessages');
  const div  = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.innerHTML = `<div class="msg-bubble">${esc(text).replace(/\n/g,'<br>')}</div>`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';

  chatHistory.push({ role: 'user', content: msg });
  appendMsg('user', msg);

  const thinking = appendMsg('thinking', '…thinking…');
  document.getElementById('chatSendBtn').disabled = true;

  try {
    const res  = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: chatHistory }),
    });
    const data = await res.json();
    thinking.remove();

    const reply = data.success ? data.reply : 'Sorry, something went wrong. Please try again.';
    chatHistory.push({ role: 'assistant', content: reply });
    appendMsg('assistant', reply);
  } catch (_) {
    thinking.remove();
    appendMsg('assistant', 'Network error — is the server running?');
  } finally {
    document.getElementById('chatSendBtn').disabled = false;
  }
}

document.getElementById('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
});

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
async function init() {
  // Check onboarding
  if (localStorage.getItem('karta_onboarded')) {
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  }

  // Load all data in parallel
  await Promise.all([
    loadTransactions(),
    loadBudget(),
    loadSubscriptions(),
    loadRewards(),
    loadObCards(),
  ]);
  loadInsights();
}

init();
