// Provider adapter: complete({ system, prompt }) -> string

const { config } = require('./config');

async function post(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.aiTimeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AI HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function claude({ system, prompt }) {
  const url = config.aiEndpoint || 'https://api.anthropic.com/v1/messages';
  const data = await post(
    url,
    { 'x-api-key': config.aiKey, 'anthropic-version': '2023-06-01' },
    {
      model: config.aiModel,
      max_tokens: config.aiMaxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }
  );
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function gemini({ system, prompt }) {
  const base = config.aiEndpoint || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base.replace(/\/$/, '')}/models/${config.aiModel}:generateContent`;
  const data = await post(
    url,
    { 'x-goog-api-key': config.aiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: config.aiMaxTokens },
    }
  );
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('');
}

// Credential-free stand-in: greets once, then answers new user messages.
async function mock({ prompt }) {
  const lines = prompt.split('\n').filter((l) => l.startsWith('[#'));
  if (!lines.length) {
    return JSON.stringify({ notes: [{ visible: true, content: 'Hello! (mock botman) Say something.' }] });
  }
  const last = lines[lines.length - 1];
  const m = last.match(/^\[#\d+ \S+ \S+ (\S+) (\S+)\] ([\s\S]*)$/);
  if (m && m[1] === 'user') {
    return JSON.stringify({
      notes: [
        { visible: false, content: 'User spoke; replying.' },
        { visible: true, content: `You said: ${m[3]}` },
      ],
    });
  }
  return JSON.stringify({ notes: [] });
}

const providers = { claude, gemini, mock };

async function complete(req) {
  return providers[config.aiProvider](req);
}

module.exports = { complete };
