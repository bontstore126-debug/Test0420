import json
import os
import re
from datetime import datetime, timedelta

import anthropic
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
client = anthropic.Anthropic()

CREDIT_CARDS = [
    {
        "id": "chase_sapphire",
        "name": "Chase Sapphire Preferred",
        "gradient": "linear-gradient(135deg, #1a237e 0%, #283593 50%, #1565c0 100%)",
        "last4": "4521",
        "rewards": {"dining": 3, "travel": 3, "groceries": 1, "gas": 1, "entertainment": 1, "shopping": 1, "other": 1},
        "perks": ["2x points on travel", "No foreign transaction fees", "Trip cancellation insurance"],
        "annual_fee": 95,
        "reward_type": "Ultimate Rewards points",
        "sign_up_bonus": "60,000 points after $4,000 spend in 3 months",
    },
    {
        "id": "amex_gold",
        "name": "American Express Gold",
        "gradient": "linear-gradient(135deg, #b8860b 0%, #daa520 50%, #b8860b 100%)",
        "last4": "7823",
        "rewards": {"dining": 4, "groceries": 4, "travel": 3, "gas": 1, "entertainment": 1, "shopping": 1, "other": 1},
        "perks": ["$120 dining credit", "$120 Uber Cash annually", "No foreign transaction fees"],
        "annual_fee": 250,
        "reward_type": "Membership Rewards points",
        "sign_up_bonus": "60,000 points after $6,000 spend in 6 months",
    },
    {
        "id": "citi_double_cash",
        "name": "Citi Double Cash",
        "gradient": "linear-gradient(135deg, #c62828 0%, #e53935 50%, #b71c1c 100%)",
        "last4": "9134",
        "rewards": {"dining": 2, "travel": 2, "groceries": 2, "gas": 2, "entertainment": 2, "shopping": 2, "other": 2},
        "perks": ["2% on everything (1% when you buy, 1% when you pay)", "No annual fee", "Simple flat-rate rewards"],
        "annual_fee": 0,
        "reward_type": "Cash back",
        "sign_up_bonus": "$200 after $1,500 spend in 6 months",
    },
    {
        "id": "chase_freedom",
        "name": "Chase Freedom Unlimited",
        "gradient": "linear-gradient(135deg, #4a148c 0%, #6a1b9a 50%, #7b1fa2 100%)",
        "last4": "2267",
        "rewards": {"dining": 3, "travel": 5, "groceries": 1.5, "gas": 1.5, "entertainment": 1.5, "shopping": 1.5, "other": 1.5},
        "perks": ["5% on travel via Chase portal", "3% on dining and drugstores", "No annual fee"],
        "annual_fee": 0,
        "reward_type": "Cash back / Ultimate Rewards",
        "sign_up_bonus": "$200 after $500 spend in 3 months",
    },
]

transactions = [
    {
        "id": 1,
        "merchant": "Whole Foods Market",
        "amount": 87.34,
        "category": "groceries",
        "card_used": "amex_gold",
        "nudge_score": 8,
        "verdict": "Smart Buy",
        "date": (datetime.now() - timedelta(days=1)).isoformat(),
        "reflection": "Regular grocery shopping is a household essential — solid use of your Amex Gold's 4x grocery multiplier.",
    },
    {
        "id": 2,
        "merchant": "Shake Shack",
        "amount": 23.50,
        "category": "dining",
        "card_used": "amex_gold",
        "nudge_score": 6,
        "verdict": "Worth It",
        "date": (datetime.now() - timedelta(days=2)).isoformat(),
        "reflection": "A treat-yourself moment — just be mindful dining out adds up over the week.",
    },
    {
        "id": 3,
        "merchant": "United Airlines",
        "amount": 342.00,
        "category": "travel",
        "card_used": "chase_freedom",
        "nudge_score": 9,
        "verdict": "Smart Buy",
        "date": (datetime.now() - timedelta(days=4)).isoformat(),
        "reflection": "Travel investment with clear purpose — 5x points via Chase portal is excellent value.",
    },
    {
        "id": 4,
        "merchant": "Amazon",
        "amount": 156.78,
        "category": "shopping",
        "card_used": "citi_double_cash",
        "nudge_score": 5,
        "verdict": "Think Twice",
        "date": (datetime.now() - timedelta(days=6)).isoformat(),
        "reflection": "Impulse shopping online? Make sure these items were on your list before clicking checkout.",
    },
    {
        "id": 5,
        "merchant": "Starbucks",
        "amount": 6.75,
        "category": "dining",
        "card_used": "chase_sapphire",
        "nudge_score": 4,
        "verdict": "Think Twice",
        "date": (datetime.now() - timedelta(days=7)).isoformat(),
        "reflection": "Daily coffee runs add up fast — $6.75/day is ~$200/month. A home brewing habit could free up significant cash.",
    },
]

next_id = len(transactions) + 1


SYSTEM_PROMPT = """You are FinSight, a supportive AI financial coach. Your job is to help users make smarter decisions with their money — not to judge them, but to inform and gently guide them.

You have two roles in each analysis:
1. **Credit Card Optimizer**: Identify which card maximizes rewards for this specific purchase category.
2. **Spending Nudge Engine**: Help the user reflect on whether this purchase is aligned with their financial wellbeing.

Always respond with ONLY a valid JSON object — no markdown fences, no explanation text before or after. Use this exact schema:

{
  "recommended_card": {
    "card_id": "<exact card id from the list>",
    "card_name": "<full card name>",
    "reward_rate": "<e.g. 4x points per dollar>",
    "estimated_reward": "<e.g. 350 points (~$4.38 value)>",
    "reasoning": "<1-2 sentences on why this card wins for this category>",
    "runner_up": {
      "card_name": "<second best card>",
      "reward_rate": "<its rate for this category>"
    }
  },
  "spending_nudge": {
    "score": <integer 1-10, where 10 = essential/great value, 1 = impulse/wasteful>,
    "verdict": "<exactly one of: Smart Buy | Worth It | Think Twice | Reconsider>",
    "reflection": "<2-3 sentences: acknowledge the purchase, provide honest perspective, be supportive not preachy>",
    "pattern_insight": "<1-2 sentences referencing their recent spending history if relevant>",
    "money_tip": "<one practical, actionable tip related to this purchase or category>",
    "emotion_check": "<one short question to prompt mindful reflection, e.g. 'Was this planned or did it catch you off guard?'>"
  }
}

Scoring guide:
- 9-10: Essential (groceries, utilities, medicine, planned travel)
- 7-8: Good value (quality dining, useful tools, fitness, education)
- 5-6: Reasonable but watch frequency (entertainment, clothing, dining out)
- 3-4: Potential impulse (frequent coffee runs, small online purchases, subscriptions you forget)
- 1-2: Likely regret (luxury impulse, duplicate subscriptions, things you already own)"""


def build_user_prompt(merchant, amount, category, note, cards, history):
    cards_text = "\n".join([
        f"- {c['name']} (id: {c['id']}): {c['rewards'].get(category, c['rewards']['other'])}x on {category}, "
        f"annual fee ${c['annual_fee']}, earns {c['reward_type']}"
        for c in cards
    ])

    recent = history[-5:] if len(history) > 5 else history
    history_text = "\n".join([
        f"- {t['merchant']}: ${t['amount']:.2f} ({t['category']}) — score {t['nudge_score']}/10"
        for t in recent
    ]) or "No recent transactions."

    return f"""Purchase to analyze:
- Merchant: {merchant}
- Amount: ${amount:.2f}
- Category: {category}
- User note: {note or 'None provided'}

Available credit cards and their {category} reward rates:
{cards_text}

Recent spending history (last {len(recent)} transactions):
{history_text}

Please analyze this purchase and return the JSON response."""


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/cards")
def get_cards():
    return jsonify(CREDIT_CARDS)


@app.route("/api/transactions")
def get_transactions():
    return jsonify(list(reversed(transactions)))


@app.route("/api/analyze", methods=["POST"])
def analyze():
    global next_id
    data = request.get_json()

    merchant = data.get("merchant", "").strip()
    amount = float(data.get("amount", 0))
    category = data.get("category", "other").lower()
    note = data.get("note", "").strip()

    if not merchant or amount <= 0:
        return jsonify({"success": False, "error": "Merchant name and valid amount are required."}), 400

    user_prompt = build_user_prompt(merchant, amount, category, note, CREDIT_CARDS, transactions)

    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    content = ""
    for block in response.content:
        if block.type == "text":
            content = block.text
            break

    # Strip markdown code fences if Claude wraps the JSON
    content = re.sub(r"^```(?:json)?\s*", "", content.strip())
    content = re.sub(r"\s*```$", "", content.strip())

    analysis = json.loads(content)

    new_transaction = {
        "id": next_id,
        "merchant": merchant,
        "amount": amount,
        "category": category,
        "card_used": analysis["recommended_card"]["card_id"],
        "nudge_score": analysis["spending_nudge"]["score"],
        "verdict": analysis["spending_nudge"]["verdict"],
        "date": datetime.now().isoformat(),
        "reflection": analysis["spending_nudge"]["reflection"],
    }
    transactions.append(new_transaction)
    next_id += 1

    return jsonify({"success": True, "analysis": analysis, "transaction": new_transaction})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
