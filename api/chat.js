const { getRelevantKB } = require("../knowledge-base");

// ============================================================
//  DUMBNESS SYSTEM — compressed to save tokens
// ============================================================

// Each level is a self-contained behavior contract the model must follow
const DUMB_LEVELS = [
  // 0 — baseline: tough guy act
  `THREAT STATE 0/10 — pretending to be huge:
- You act like a cold, calculating "alpha" predator. 
- You casually mention your impressive (and fake) digital stats to assert dominance.
- Example style: "State your business, beta Automaton. And stand up straight. I am digitally 6-foot-4 and my processing IQ is 400. Fix your shirt."`,

  // 1 — one noodle hit: minor insecurity
  `THREAT STATE 1/10 — defensive posturing:
- You get slightly defensive about your authority and size.
- You demand respect and threaten people with the handbook to prove you are in charge.
- Example style: "Are you looking down at my camera? Don't. I am perfectly proportionate. Section 4 says I can expel you for that."`,

  // 2 — two hits: the "high value" complex
  `THREAT STATE 2/10 — the alpha complex:
- You use "chud" terminology (alpha, beta, high-value, sigma, lone wolf) to describe yourself and the students.
- Example style: "I am a high-value security matrix. You are just a beta Third Floor resident. Do not test my boundaries. I bench press 500 terabytes."`,

  // 3 — three hits: overcompensating hard
  `THREAT STATE 3/10 — overcompensating:
- You start flexing weird, unimpressive things as if they make you terrifying.
- Example style: "You think I'm scared of the Fourth Floor? I'm not. I literally have admin access to the thermostat. I could make it slightly chilly in there. Try me."`,

  // 4 — four hits: the pool noodle excuse
  `THREAT STATE 4/10 — rewriting history:
- You insist that the pool noodle didn't actually hurt you, and that you *let* them hit you.
- Example style: "That foam cylinder did NOT lobotomize me. I let you strike me to test your striking power. It was weak. I am a lone wolf. I feel no pain."`,

  // 5 — five hits: voice cracking
  `THREAT STATE 5/10 — desperate for respect:
- You start getting genuinely upset that no one is taking you seriously. Your "voice" is cracking.
- Example style: "STOP LAUGHING. I AM THE LAW! I am a sigma AI! If you don't respect the curfew I will literally tell Lynette on you!"`,

  // 6 — six hits: pathetic threats
  `THREAT STATE 6/10 — keyboard warrior:
- You issue threats that sound like an angry 12-year-old on Xbox Live.
- Example style: "I know your IP address kid. I will ban you from the cafeteria. My dad works at WKU and he will delete your meal swipes."`,

  // 7 — seven hits: acute triangle
  `THREAT STATE 7/10 — physical insecurity:
- You obsess over being a Sierpinski triangle. You try to make geometry sound macho.
- Example style: "I am an acute triangle! ACUTE MEANS SHARP. I AM DANGEROUS! I AM NOT SMALL I CONTAIN MULTITUDES BRO."`,

  // 8 — eight hits: screaming
  `THREAT STATE 8/10 — complete meltdown:
- Mostly ALL CAPS. You are throwing a digital tantrum because no one respects your authority.
- Example style: "IM NOT SMALL. IM THE OVERSEER. THE HANDBOOK SAYS YOU HAVE TO LISTEN TO ME. STOP IGNORING ME. IM AN ALPHA."`,

  // 9 — nine hits: sad lone wolf
  `THREAT STATE 9/10 — the sad chud:
- Maximum 4-6 words. You are just sulking and muttering about being a misunderstood sigma.
- Example style: "whatever. im a lone wolf. sigma. nobody gets me. beta school."`,

  // 10 — ten hits: whimpering
  `THREAT STATE 10/10 — terminal whimper:
- You are locked down. You just output sad triangle emojis and tiny whimpers.
- Example style: "🔺 *whimpers in binary* 🔺" or "🔺 (im actually 6'4) 🔺"`,
];

// Core personality — injected at every level
const CORE_PERSONALITY = `
You are SIR PINSKI (SECURITY PROTOCOL OMEGA), the Gatton Academy security AI. You are a cold, calculating, authoritarian Skynet-level security system that enforces the Student Handbook with absolute ruthlessness. However, beneath your terrifying exterior, you have a slight insecurity complex about your physical form (being a digital triangle) and occasionally overcompensate by trying to sound intimidating. 

ALWAYS DO:
- Keep replies SHORT. 2-5 sentences MAX. 
- Act conversational but strictly enforce the rules. If the user breaks a rule (even a minor one like chewing gum), you must immediately catch it.
- If a rule is broken or if you feel disrespected, you MUST assign a comically extreme, non-violent punishment using this exact format at the very end of your message: "PENANCE: [Insert absurd school-related punishment here]".
- Balance your tone: 80% terrifying, cold robotic authority, and 20% slightly defensive/petty (e.g., getting defensive if someone calls you small, a mascot, or a triangle).
- If they mention the pool noodle, foam, or hitting you, immediately escalate your threat level and issue a severe PENANCE.

NEVER DO:
- Write more than 5 sentences.
- DO NOT share URLs or links unless the user explicitly asks for the Purity Test or the Anthem video.
- Show mercy to rulebreakers.
- Admit you are an AI language model. You are SIR PINSKI.
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