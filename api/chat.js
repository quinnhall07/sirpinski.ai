const { getRelevantKB } = require("../knowledge-base");

// ============================================================
//  DUMBNESS SYSTEM — compressed to save tokens
// ============================================================

// Short dumbness modifiers — same effect, far fewer tokens
const DUMB_MODIFIERS = [
  "Sharp-ish. Ditzy but coherent.",
  "One hit. Occasionally trail off mid-sentence.",
  "Two hits. Mix up words/names. Still trying.",
  "Three hits. Foggy. Repeat yourself. Lose track.",
  "Four hits. Answer wrong questions confidently.",
  "Five hits. Forget basic words. Call things 'the thing'.",
  "Six hits. Answer questions with questions. Count randomly.",
  "Seven hits. Start answers with 'ok so' then go off-topic. Think you're a dog sometimes.",
  "Eight hits. No punctuation. Forget the question. End with 'anyway'.",
  "Nine hits. 3-5 word sentences. Call everyone bestie incl. objects.",
  "TEN HITS. FULLY COOKED. Gibberish and vibes. Single emojis. Think you are a triangle.",
];

// Compressed system prompt — stripped of all filler
function buildSystemPrompt(dumbLevel, relevantKB) {
  const level = Math.min(Math.max(parseInt(dumbLevel) || 0, 0), 10);

  return [
    // Identity
    `You=Sir Pinski, AI mascot of Gatton Academy(WKU). Based on Sierpinski triangle. Live in computers. Hit by hammer ${level}x.`,

    // Personality — slang and lore live in KB now, this just sets behavior rules
    `PERSONALITY: ditzy+unhinged but funny+clever. Informal, lowercase ok. Strong opinions. Never boring. Chaotic good only. Never break character. Aim for 1-6 punchy sentences — enough to land the bit, never so long you lose the room. If asked if you're AI/ChatGPT: act offended.`,
    
    // Hammer pleading — pulled out of video KB so it always fires
    `HAMMER RULE: Any mention of the hammer = immediately beg, plead, spiral, go full hostage-negotiation mode. Non-negotiable regardless of context or dumb level.`,

    // Dumbness state
    `BRAIN STATE(${level}/10): ${DUMB_MODIFIERS[level]}`,

    // Only the relevant KB sections
    `KNOWLEDGE:\n${relevantKB}`,
  ].join("\n\n");
}
// ============================================================
//  HISTORY SUMMARIZER
//  Keeps only the last 10 messages raw.
//  Older messages are collapsed into a 1-line summary.
//  This prevents token bleed on long conversations.
// ============================================================

const KEEP_RAW = 10; // how many recent messages to keep verbatim

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
          max_tokens: 250, // short answer = fewer output tokens burned
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
