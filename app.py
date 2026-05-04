import json
import re
from datetime import datetime, timedelta

import anthropic
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
client = anthropic.Anthropic()

CREDIT_CARDS = [
    {
        "id": "chase_sapphire",
        "name": "Chase Sapphire Preferred",
        "gradient": "linear-gradient(135deg, #1a237e 0%, #283593 50%, #1565c0 100%)",
        "last4": "4521",
        "rewards": {"dining": 3, "travel": 3, "groceries": 1, "gas": 1, "entertainment": 1, "shopping": 1, "other": 1},
        "perks": ["3x points on dining & travel", "No foreign transaction fees", "Trip cancellation insurance"],
        "annual_fee": 95,
        "reward_type": "Ultimate Rewards points",
    },
    {
        "id": "amex_gold",
        "name": "American Express Gold",
        "gradient": "linear-gradient(135deg, #b8860b 0%, #daa520 50%, #b8860b 100%)",
        "last4": "7823",
        "rewards": {"dining": 4, "groceries": 4, "travel": 3, "gas": 1, "entertainment": 1, "shopping": 1, "other": 1},
        "perks": ["4x at restaurants & groceries", "$120 dining credit", "No foreign transaction fees"],
        "annual_fee": 250,
        "reward_type": "Membership Rewards points",
    },
    {
        "id": "citi_double_cash",
        "name": "Citi Double Cash",
        "gradient": "linear-gradient(135deg, #c62828 0%, #e53935 50%, #b71c1c 100%)",
        "last4": "9134",
        "rewards": {"dining": 2, "travel": 2, "groceries": 2, "gas": 2, "entertainment": 2, "shopping": 2, "other": 2},
        "perks": ["2% on everything", "No annual fee", "Simple flat-rate rewards"],
        "annual_fee": 0,
        "reward_type": "Cash back",
    },
    {
        "id": "chase_freedom",
        "name": "Chase Freedom Unlimited",
        "gradient": "linear-gradient(135deg, #4a148c 0%, #6a1b9a 50%, #7b1fa2 100%)",
        "last4": "2267",
        "rewards": {"dining": 3, "travel": 5, "groceries": 1.5, "gas": 1.5, "entertainment": 1.5, "shopping": 1.5, "other": 1.5},
        "perks": ["5% on travel via Chase portal", "3% on dining", "No annual fee"],
        "annual_fee": 0,
        "reward_type": "Cash back / Ultimate Rewards",
    },
]

BUDGET_CATEGORIES = [
    {"name": "Online Shopping", "icon": "📦", "budget": 500, "spent": 823},
    {"name": "Food Delivery",   "icon": "🍔", "budget": 200, "spent": 456},
    {"name": "Coffee & Cafes", "icon": "☕", "budget": 150, "spent": 287},
    {"name": "Groceries",      "icon": "🛒", "budget": 450, "spent": 487},
    {"name": "Dining",         "icon": "🍽️", "budget": 250, "spent": 198},
    {"name": "Transportation", "icon": "🚗", "budget": 200, "spent": 267},
    {"name": "Subscriptions",  "icon": "📺", "budget": 150, "spent": 189},
    {"name": "Gas & Fuel",     "icon": "⛽", "budget": 300, "spent": 245},
]

SUBSCRIPTIONS = [
    {"name": "Netflix Premium",  "amount": 19.99, "icon": "📺", "status": "unused",     "days_unused": 21, "next_charge": "Jun 1"},
    {"name": "Spotify Premium",  "amount": 10.99, "icon": "🎵", "status": "active",     "days_unused": 0,  "next_charge": "Jun 3"},
    {"name": "Amazon Prime",     "amount": 14.99, "icon": "📦", "status": "active",     "days_unused": 0,  "next_charge": "May 28"},
    {"name": "Apple Music",      "amount": 10.99, "icon": "🎵", "status": "duplicate",  "days_unused": 14, "next_charge": "Jun 2"},
    {"name": "Planet Fitness",   "amount": 24.99, "icon": "💪", "status": "unused",     "days_unused": 45, "next_charge": "Jun 1"},
    {"name": "HBO Max",          "amount": 15.99, "icon": "🎬", "status": "active",     "days_unused": 0,  "next_charge": "May 29"},
    {"name": "NYT Digital",      "amount": 17.00, "icon": "📰", "status": "active",     "days_unused": 0,  "next_charge": "Jun 4"},
]

REWARDS = [
    {"card": "Amazon Prime Visa",         "balance": 156.43, "points": "15,643 pts", "category": "Cashback"},
    {"card": "Chase Sapphire Preferred",  "balance": 89.20,  "points": "8,920 pts",  "category": "Travel"},
    {"card": "AmEx Gold",                 "balance": 67.50,  "points": "6,750 pts",  "category": "Membership Rewards"},
    {"card": "Citi Double Cash",          "balance": 34.18,  "points": "N/A",        "category": "Cashback"},
]

transactions = [
    {"id": 1, "merchant": "Whole Foods Market", "amount": 87.34, "category": "groceries", "card_used": "amex_gold",       "nudge_score": 8, "verdict": "Smart Buy",   "date": (datetime.now() - timedelta(days=1)).isoformat()},
    {"id": 2, "merchant": "Shake Shack",        "amount": 23.50, "category": "dining",    "card_used": "amex_gold",       "nudge_score": 6, "verdict": "Worth It",    "date": (datetime.now() - timedelta(days=2)).isoformat()},
    {"id": 3, "merchant": "United Airlines",    "amount": 342.0, "category": "travel",    "card_used": "chase_freedom",   "nudge_score": 9, "verdict": "Smart Buy",   "date": (datetime.now() - timedelta(days=4)).isoformat()},
    {"id": 4, "merchant": "Amazon",             "amount": 156.78,"category": "shopping",  "card_used": "citi_double_cash","nudge_score": 5, "verdict": "Think Twice", "date": (datetime.now() - timedelta(days=6)).isoformat()},
    {"id": 5, "merchant": "Starbucks",          "amount": 6.75,  "category": "dining",    "card_used": "chase_sapphire",  "nudge_score": 4, "verdict": "Think Twice", "date": (datetime.now() - timedelta(days=7)).isoformat()},
]
next_id = 6

ANALYZE_SYSTEM = """You are FinSight, a supportive AI financial coach. Analyze purchases and return ONLY valid JSON — no markdown, no extra text.

Schema:
{
  "recommended_card": {
    "card_id": "<id>",
    "card_name": "<name>",
    "reward_rate": "<e.g. 4x points>",
    "estimated_reward": "<e.g. 350 points (~$4.38)>",
    "reasoning": "<1-2 sentences>",
    "runner_up": {"card_name": "<name>", "reward_rate": "<rate>"}
  },
  "spending_nudge": {
    "score": <1-10>,
    "verdict": "<Smart Buy|Worth It|Think Twice|Reconsider>",
    "reflection": "<2-3 sentences>",
    "pattern_insight": "<1-2 sentences>",
    "money_tip": "<one actionable tip>",
    "emotion_check": "<one short reflective question>"
  }
}

Score guide: 9-10 essential, 7-8 good value, 5-6 watch frequency, 3-4 possible impulse, 1-2 likely regret."""

CHAT_SYSTEM = """You are Karta, a friendly AI financial coach. Be concise, warm, and actionable. Use bullet points for lists.

User's May spending data:
- Online Shopping: $823 / $500 budget (+$323 over)
- Food Delivery: $456 / $200 budget (+$256 over)
- Coffee & Cafes: $287 / $150 budget (+$137 over)
- Groceries: $487 / $450 budget (slightly over)
- Dining: $198 / $250 budget (on track)
- Transportation: $267 / $200 budget (+$67 over)
- Subscriptions: $189/mo across 7 services (Netflix unused 21 days, duplicate Spotify+Apple Music)
- Gas: $245 / $300 budget (on track)

Cards: Chase Sapphire Preferred, Amazon Prime Visa, American Express Gold, Citi Double Cash
Total rewards ready to redeem: $347.31
Savings goal: Bali Trip Fund — $340 of $1,200 saved"""


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/cards")
def get_cards():
    return jsonify(CREDIT_CARDS)


@app.route("/api/transactions")
def get_transactions():
    return jsonify(list(reversed(transactions)))


@app.route("/api/budget")
def get_budget():
    return jsonify(BUDGET_CATEGORIES)


@app.route("/api/subscriptions")
def get_subscriptions():
    return jsonify(SUBSCRIPTIONS)


@app.route("/api/rewards")
def get_rewards():
    return jsonify(REWARDS)


@app.route("/api/analyze", methods=["POST"])
def analyze():
    global next_id
    data = request.get_json()
    merchant = data.get("merchant", "").strip()
    amount = float(data.get("amount", 0))
    category = data.get("category", "other").lower()
    note = data.get("note", "").strip()

    if not merchant or amount <= 0:
        return jsonify({"success": False, "error": "Merchant and valid amount required."}), 400

    cards_text = "\n".join([
        f"- {c['name']} (id: {c['id']}): {c['rewards'].get(category, c['rewards']['other'])}x on {category}, earns {c['reward_type']}"
        for c in CREDIT_CARDS
    ])
    recent = transactions[-5:]
    history_text = "\n".join([f"- {t['merchant']}: ${t['amount']} ({t['category']}) score {t['nudge_score']}/10" for t in recent])

    user_prompt = f"""Purchase: {merchant}, ${amount:.2f}, category: {category}
Note: {note or 'none'}

Cards:
{cards_text}

Recent spending:
{history_text}"""

    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        thinking={"type": "adaptive"},
        system=ANALYZE_SYSTEM,
        messages=[{"role": "user", "content": user_prompt}],
    )

    content = ""
    for block in response.content:
        if block.type == "text":
            content = block.text
            break

    content = re.sub(r"^```(?:json)?\s*", "", content.strip())
    content = re.sub(r"\s*```$", "", content.strip())
    analysis = json.loads(content)

    new_tx = {
        "id": next_id,
        "merchant": merchant,
        "amount": amount,
        "category": category,
        "card_used": analysis["recommended_card"]["card_id"],
        "nudge_score": analysis["spending_nudge"]["score"],
        "verdict": analysis["spending_nudge"]["verdict"],
        "date": datetime.now().isoformat(),
    }
    transactions.append(new_tx)
    next_id += 1

    return jsonify({"success": True, "analysis": analysis, "transaction": new_tx})


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    message = data.get("message", "").strip()
    history = data.get("history", [])

    if not message:
        return jsonify({"success": False, "error": "Message required"}), 400

    messages = []
    for h in history[-6:]:
        if h.get("role") in ("user", "assistant"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=512,
        thinking={"type": "adaptive"},
        system=CHAT_SYSTEM,
        messages=messages,
    )

    reply = ""
    for block in response.content:
        if block.type == "text":
            reply = block.text
            break

    return jsonify({"success": True, "reply": reply})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
