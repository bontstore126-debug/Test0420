const CATEGORY_ICONS = {
  dining: "🍽️", groceries: "🛒", travel: "✈️",
  gas: "⛽", entertainment: "🎬", shopping: "🛍️", other: "💳",
};

const VERDICT_CLASSES = {
  "Smart Buy": "verdict-smart",
  "Worth It": "verdict-worth",
  "Think Twice": "verdict-think",
  "Reconsider": "verdict-reconsider",
};

const SCORE_COLORS = (score) => {
  if (score >= 8) return { bar: "#10b981", border: "#10b981" };
  if (score >= 6) return { bar: "#6366f1", border: "#6366f1" };
  if (score >= 4) return { bar: "#f59e0b", border: "#f59e0b" };
  return { bar: "#ef4444", border: "#ef4444" };
};

let allCards = [];

async function loadCards() {
  const res = await fetch("/api/cards");
  allCards = await res.json();
  renderCards(allCards);
}

async function loadTransactions() {
  const res = await fetch("/api/transactions");
  const txns = await res.json();
  renderTransactions(txns);
}

function renderCards(cards, highlightId = null) {
  const grid = document.getElementById("cardGrid");
  grid.innerHTML = cards.map(card => `
    <div class="credit-card ${card.id === highlightId ? "highlighted" : ""}"
         id="card-${card.id}"
         style="background: ${card.gradient}">
      <div class="card-chip"></div>
      <div>
        <div class="card-number">•••• •••• •••• ${card.last4}</div>
        <div class="card-name">${card.name}</div>
      </div>
      <div class="card-shine"></div>
    </div>
  `).join("");
}

function renderTransactions(txns) {
  const list = document.getElementById("transactionList");
  if (!txns.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:.88rem;padding:12px 0">No transactions yet.</p>';
    return;
  }
  list.innerHTML = txns.map(tx => {
    const icon = CATEGORY_ICONS[tx.category] || "💳";
    const scoreColor = SCORE_COLORS(tx.nudge_score).bar;
    const scoreClass = tx.nudge_score >= 7 ? "verdict-smart" : tx.nudge_score >= 5 ? "verdict-worth" : "verdict-think";
    const date = new Date(tx.date);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `
      <div class="transaction-item">
        <div class="tx-icon">${icon}</div>
        <div class="tx-info">
          <div class="tx-merchant">${escHtml(tx.merchant)}</div>
          <div class="tx-meta">${tx.category} · ${dateStr}</div>
        </div>
        <div class="tx-right">
          <div class="tx-amount">$${tx.amount.toFixed(2)}</div>
          <div class="tx-score ${scoreClass}">${tx.nudge_score}/10 · ${tx.verdict}</div>
        </div>
      </div>
    `;
  }).join("");
}

function showResults(analysis, highlightCardId) {
  document.getElementById("resultsPlaceholder").classList.add("hidden");
  document.getElementById("resultsContent").classList.remove("hidden");

  const rec = analysis.recommended_card;
  const nudge = analysis.spending_nudge;

  // Find card gradient for the recommendation block
  const recCardData = allCards.find(c => c.id === rec.card_id);
  const recCardEl = document.getElementById("recCard");
  if (recCardData) recCardEl.style.background = recCardData.gradient;

  document.getElementById("recCardName").textContent = rec.card_name;
  document.getElementById("recCardReward").textContent = rec.reward_rate;
  document.getElementById("recCardEstimate").textContent = `Est. ${rec.estimated_reward}`;
  document.getElementById("recReasoning").textContent = rec.reasoning;
  document.getElementById("runnerUpText").textContent =
    `${rec.runner_up.card_name} (${rec.runner_up.reward_rate})`;

  // Nudge score
  document.getElementById("nudgeScore").textContent = nudge.score;
  const colors = SCORE_COLORS(nudge.score);
  const circle = document.getElementById("nudgeCircle");
  circle.style.borderColor = colors.border;
  circle.style.color = colors.border;

  const bar = document.getElementById("nudgeBarFill");
  bar.style.width = "0%";
  bar.style.background = colors.bar;
  setTimeout(() => { bar.style.width = `${nudge.score * 10}%`; }, 50);

  const badge = document.getElementById("verdictBadge");
  badge.textContent = nudge.verdict;
  badge.className = `verdict-badge ${VERDICT_CLASSES[nudge.verdict] || ""}`;

  document.getElementById("nudgeReflection").textContent = nudge.reflection;
  document.getElementById("nudgePattern").textContent = nudge.pattern_insight;
  document.getElementById("nudgeTip").textContent = nudge.money_tip;
  document.getElementById("nudgeQuestion").textContent = `"${nudge.emotion_check}"`;

  // Highlight the recommended card
  renderCards(allCards, highlightCardId);
}

function showError(msg) {
  const toast = document.createElement("div");
  toast.className = "error-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.getElementById("analyzeForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const merchant = document.getElementById("merchant").value.trim();
  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value.trim();

  const btn = document.getElementById("analyzeBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");

  btn.disabled = true;
  btnText.textContent = "Analyzing…";
  btnSpinner.classList.remove("hidden");

  // Hide previous results placeholder while loading
  document.getElementById("resultsPlaceholder").textContent = "AI is thinking…";

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant, amount, category, note }),
    });

    const data = await res.json();

    if (!data.success) {
      showError(data.error || "Analysis failed. Please try again.");
      return;
    }

    showResults(data.analysis, data.analysis.recommended_card.card_id);

    // Prepend new transaction to top of list
    const list = document.getElementById("transactionList");
    const tx = data.transaction;
    const icon = CATEGORY_ICONS[tx.category] || "💳";
    const scoreClass = tx.nudge_score >= 7 ? "verdict-smart" : tx.nudge_score >= 5 ? "verdict-worth" : "verdict-think";
    const newItem = document.createElement("div");
    newItem.className = "transaction-item";
    newItem.innerHTML = `
      <div class="tx-icon">${icon}</div>
      <div class="tx-info">
        <div class="tx-merchant">${escHtml(tx.merchant)}</div>
        <div class="tx-meta">${tx.category} · Just now</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount">$${tx.amount.toFixed(2)}</div>
        <div class="tx-score ${scoreClass}">${tx.nudge_score}/10 · ${tx.verdict}</div>
      </div>
    `;
    list.prepend(newItem);

    // Scroll results into view on mobile
    document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth", block: "nearest" });

  } catch (err) {
    showError("Network error — is the server running?");
  } finally {
    btn.disabled = false;
    btnText.textContent = "Analyze with AI";
    btnSpinner.classList.add("hidden");
    document.getElementById("resultsPlaceholder").textContent =
      "Enter a purchase above to get your AI-powered card recommendation and spending insight.";
  }
});

// Init
loadCards();
loadTransactions();
