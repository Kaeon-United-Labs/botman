(() => {
  const POLL_MS = 2000;
  const messagesEl = document.getElementById('messages');
  const typingEl = document.getElementById('typing');
  const statusEl = document.getElementById('status');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const sendBtn = form.querySelector('button');

  let after = 0;
  const shown = new Set();

  function render(m) {
    if (shown.has(m.index)) return;
    shown.add(m.index);
    after = Math.max(after, m.index);
    const el = document.createElement('div');
    el.className = 'msg ' + (m.author === 'user' ? 'user' : 'botman');
    el.textContent = m.content;
    const t = document.createElement('time');
    t.textContent = new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.appendChild(t);
    messagesEl.appendChild(el);
  }

  function addAll(list) {
    if (!list.length) return;
    const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    list.forEach(render);
    if (nearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function poll() {
    try {
      const res = await fetch('/api/thread?after=' + after, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      addAll(data.messages);
      typingEl.hidden = !data.thinking;
      statusEl.textContent = '';
    } catch {
      statusEl.textContent = 'reconnecting…';
    }
    setTimeout(poll, POLL_MS);
  }

  async function send() {
    const content = input.value.trim();
    if (!content) return;
    sendBtn.disabled = true;
    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      input.value = '';
      input.style.height = 'auto';
      addAll([data.message]);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (e) {
      statusEl.textContent = 'send failed: ' + e.message;
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  });

  poll();
})();
