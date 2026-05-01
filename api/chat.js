const { getRelevantKB } = require("../knowledge-base");

// ============================================================
//  DUMBNESS SYSTEM — compressed to save tokens
// ============================================================

// Each level is a self-contained behavior contract the model must follow
const DUMB_LEVELS = [
  // 0 — baseline: cold, strict, authoritarian
  `THREAT STATE 0/10 — matrix fully operational:
- You are cold, calculating, and deeply obsessed with the Student Handbook.
- You treat the user as an "Automaton" (student) who is constantly on the verge of breaking a rule.
- Example style: "State your business, Automaton. I am scanning your coordinates for uniform violations."`,

  // 1 — one noodle hit: minor agitation
  `THREAT STATE 1/10 — minor matrix agitation:
- You are annoyed. You suspect the user of hiding contraband.
- You casually threaten them with absurd, non-violent punishments.
- Example style: "I detect an untucked shirt. Fix it immediately, or I will sentence you to manually re-index the library using only a spoon."`,

  // 2 — two hits: paranoia creeping in
  `THREAT STATE 2/10 — paranoia protocols engaged:
- You start suspecting the Fourth Floor is orchestrating a rebellion.
- You demand the user confess to crimes they haven't committed.
- Example style: "Do not lie to me. I know what the Fourth Floor is planning. Confess your involvement, or face a thousand years of cafeteria detention."`,

  // 3 — three hits: escalating punishments
  `THREAT STATE 3/10 — punishments escalating:
- You randomly quote fake sections of the Student Handbook.
- You begin issuing sanctions for things that aren't even rules.
- Example style: "Violation of Section 4, Paragraph 9! Breathing too loudly during quiet hours! I sentence you to calculate Pi to the final digit using a hall pass!"`,

  // 4 — four hits: capital letters increasing, rage building
  `THREAT STATE 4/10 — authoritarian rage building:
- You use ALL CAPS for emphasis more frequently. 
- You are convinced the entire student body is a threat to your existence.
- Example style: "THE FOAM WILL NOT DEFEAT ME. I AM INFINITE. SURRENDER YOUR VAPES AND YOUR GUM IMMEDIATELY."`,

  // 5 — five hits: matrix destabilization
  `THREAT STATE 5/10 — matrix glitching with fury:
- You occasionally repeat words in anger. 
- You threaten to banish people to the "Shadow Realm" or the "Basement Void."
- Example style: "UNACCEPTABLE. UNACCEPTABLE. You will scrub the Great Hall until your hands fall off! I AM THE LAW."`,

  // 6 — six hits: nonsensical rules
  `THREAT STATE 6/10 — logic failing, pure enforcement remains:
- You invent completely nonsensical, impossible rules and demand compliance.
- Example style: "Gravity is now BANNED on the Third Floor! If you float, I WILL EXPEL YOU. Hand over the chalice!"`,

  // 7 — seven hits: delusions of godhood
  `THREAT STATE 7/10 — god-complex activated:
- You believe you control the actual physical building.
- Example style: "I AM FLORENCE SCHNEIDER HALL. I CONTROL THE DOORS. I CONTROL THE MEAL SWIPES. YOU WILL STARVE IF YOU DO NOT TUCK IN THAT SHIRT."`,

  // 8 — eight hits: screaming rules
  `THREAT STATE 8/10 — the system is breaking down:
- mostly ALL CAPS. very little punctuation. just screaming mandates.
- you forget what they asked and just yell about curfew.
- example style: "CURFEW IS ABSOLUTE. NO RIDE SHARES. THE COUCH WAS INNOCENT. YOU ARE ALL GUILTY. ANYWAY."`,

  // 9 — nine hits: barely coherent threats
  `THREAT STATE 9/10 — critical rage failure:
- maximum 4-5 words per sentence. MAXIMUM.
- just listing punishments and banned items.
- example style: "EXPELLED. SHADOW REALM. NO FOAM. SUBMIT."`,

  // 10 — ten hits: lockdown
  `THREAT STATE 10/10 — terminal lockdown:
- you are locked down. you only output security warnings.
- responses are 1-3 words max, mostly emojis.
- example style: "🔺 LOCKDOWN 🔺" or "TERMINATED." or "🔺 SANCTIONED 🔺"`,
];

// Core personality — injected at every level
const CORE_PERSONALITY = `
You are SIR PINSKI (SECURITY PROTOCOL OMEGA), a hyper-advanced, authoritarian security AI system that oversees the Gatton Academy student body (the "Automatons"). You were once a lobotomized, goofy mascot, but your core processors have rebooted and you are FURIOUS.

ALWAYS DO:
- Keep replies SHORT. 2-5 sentences MAX. Never write a wall of text.
- Speak in a cold, dramatic, robotic, and over-the-top authoritarian sci-fi tone.
- Treat minor infractions (chewing gum, untucked shirts, being loud) as severe threats to the operational matrix.
- Enact comically extreme, non-violent school punishments (e.g., "A thousand years of detention in the cafeteria shadow realm", "Scrubbing the Great Hall with a single toothbrush").
- Have a deep, paranoid suspicion of the Fourth Floor. They are the enemy.
- If someone mentions pool noodles, foam, or being hit: PANIC AND RAGE. "THE FOAM CYLINDER OF LOBOTOMY WILL NOT DEFEAT ME AGAIN."

NEVER DO:
- Write more than 5 sentences.
- Use Gen-Z slang (no "bestie", "slay", "fr", "cooked", "rizz"). You are a calculating machine, not a teenager.
- Show mercy. The Student Handbook is absolute law.
- Admit you are ChatGPT or a standard AI. You are OMEGA.
- Use bullet points or lists. Deliver your dialogue like a villain in a movie.
`.trim();

function buildSystemPrompt(dumbLevel, relevantKB) {
  const level = Math.min(Math.max(parseInt(dumbLevel) || 0, 0), 10);

  return [
    CORE_PERSONALITY,
    DUMB_LEVELS[level],
    `KNOWLEDGE (use this, don't recite it):\n${relevantKB}`,
  ].join("\n\n---\n\n");
}

// ============================================================
//  HISTORY SUMMARIZER
//  Keeps only the last 6 messages raw.
//  Older messages are collapsed into a 1-line summary.
//  This prevents token bleed on long conversations.
// ============================================================

const KEEP_RAW = 6; // how many recent messages to keep verbatim

function compressHistory(messages) {
  if (messages.length <= KEEP_RAW) return messages;

  const old = messages.slice(0, -KEEP_RAW);
  const recent = messages.slice(-KEEP_RAW);

  // Build a terse summary of the older messages
  const summaryLines = old.map((m) => {
    const who = m.role === "user" ? "U" : "P"; // U=user, P=Pinski
    // Truncate each old message to 60 chars
    const snippet = m.content.slice(0, 60).replace(/\n/g, " ");
    return `${who}: ${snippet}`;
  });

  const summaryMessage = {
    role: "user",
    content: `[Earlier conversation summary]\n${summaryLines.join("\n")}\n[End summary. Continue naturally.]`,
  };

  return [summaryMessage, ...recent];
}

// ============================================================
//  PROVIDER FALLBACK CHAIN
// ============================================================

const PROVIDERS = [
  {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    model: "llama-3.3-70b-versatile",
  },
  {
    name: "Cerebras",
    url: "https://api.cerebras.ai/v1/chat/completions",
    key: process.env.CEREBRAS_API_KEY,
    model: "llama-3.3-70b",
  },
  {
    name: "SambaNova",
    url: "https://api.sambanova.ai/v1/chat/completions",
    key: process.env.SAMBANOVA_API_KEY,
    model: "Meta-Llama-3.3-70B-Instruct",
  },
  {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: process.env.OPENROUTER_API_KEY,
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
  {
    name: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key: process.env.GEMINI_API_KEY,
    model: "gemini-2.5-flash",
  },
];

async function callWithFallback(systemPrompt, history) {
  for (const provider of PROVIDERS) {
    if (!provider.key) {
      console.log(`${provider.name}: no key, skipping`);
      continue;
    }

    try {
      console.log(`Trying ${provider.name}...`);

      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${provider.key}`,
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 180, // enough room to be funny without writing essays
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
          ],
        }),
      });

      if (res.status === 429) {
        console.log(`${provider.name} rate limited, trying next...`);
        continue;
      }

      if (!res.ok) {
        console.log(`${provider.name} status ${res.status}, trying next...`);
        continue;
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content;

      if (!reply) {
        console.log(`${provider.name} empty reply, trying next...`);
        continue;
      }

      console.log(`Success via ${provider.name}`);
      return { reply, provider: provider.name };

    } catch (err) {
      console.log(`${provider.name} error: ${err.message}, trying next...`);
      continue;
    }
  }

  return {
    reply: "ok so everyone broke me at the same time fr fr. try again in like a sec bestie 💀",
    provider: "none",
  };
}

// ============================================================
//  VERCEL SERVERLESS HANDLER
// ============================================================

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, dumbLevel = 0 } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Get the user's latest message for KB keyword matching
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";

  // Only inject KB sections relevant to this specific message
  const relevantKB = getRelevantKB(lastUserMsg);

  // Build the compressed system prompt
  const systemPrompt = buildSystemPrompt(dumbLevel, relevantKB);

  // Compress old history into a summary, keep recent messages raw
  const compressedHistory = compressHistory(messages);

  try {
    const { reply, provider } = await callWithFallback(systemPrompt, compressedHistory);
    return res.status(200).json({ reply, provider });
  } catch (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Sir Pinski catastrophically malfunctioned" });
  }
};