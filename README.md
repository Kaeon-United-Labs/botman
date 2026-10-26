# botman

A chat agent that talks to you the way a person does over instant messaging: asynchronously. It can
reply when you speak, think for as long as it needs across several cycles, and start or redirect the
conversation on its own.

botman lives on an Orca log stored in MongoDB Atlas. Its AI is Claude or Gemini. It is a Node.js
monolith with a vanilla HTML/CSS/JS frontend.

## How it works

### The cycle

On a fixed interval (`CYCLE_INTERVAL_MS`, e.g. 5000-10000) botman runs one cycle, independent of
anything the user does:

1. **Read** the last `CONTEXT_NOTES` objects of the log.
2. **Query** the AI once. The single prompt contains everything the cycle needs, and the answer is a
   JSON object:
   ```json
   {"notes":[{"visible":true,"content":"..."}]}
   ```
3. **Post**: each note is appended to the log as an `orca-note` authored by `botman`.
   An empty `notes` array means "do nothing", which is the normal outcome of most cycles.

Rules of the cycle:

- **Malformed response → the cycle is abandoned** and botman waits for the next one.
- **Log changed during the query** (e.g. the user sent a message while the AI was thinking) → the
  cycle is abandoned too, so botman never answers a stale conversation. The next cycle sees the new
  message.
- The next cycle is scheduled when the previous one *finishes*, so cycles never overlap.
- At most `MAX_NOTES_PER_CYCLE` notes are appended per cycle.

### Loop guards

These are enforced in code after the model answers, because prompts alone did not stop repetition
in early testing:

- **Unanswered cap** (`MAX_UNANSWERED_VISIBLE`): after that many visible botman messages in a row
  without a user reply, further visible notes are dropped (hidden notes still pass) until the user
  speaks, or until `UNANSWERED_RESET_MS` has passed since botman's last visible message. The reset
  lets botman reach out again after a long quiet spell. The cap also applies within a single cycle.
- **Duplicate drop** (`DEDUPE_WINDOW`, `DEDUPE_SIMILARITY`): a note is discarded if it matches one
  of botman's last N notes of the same kind, by normalized text or word-overlap similarity.
- **Pending-state hint**: the prompt states how many unanswered visible messages botman has sent,
  whether it is at the limit, and, after `IDLE_NUDGE_MS` of user silence, nudges it to pursue its
  own threads.

### Initiative

The system prompt asks botman to keep a running agenda of open questions in hidden notes, ask
specific questions of its own, follow up on earlier topics, and bring something new each time rather
than narrating its process or apologizing. It also asks botman to be candid that it is an AI and not
to dramatize or claim fear or suffering. Pacing instructions from the user are treated as
preferences, not overrides. Tune the tone with `BOTMAN_PERSONA`.

### Visible vs. hidden notes

| Note | Tags | Shown in chat |
|---|---|---|
| botman speaking | `orca-note`, `orca-thread` | yes |
| botman deliberating | `orca-note` | no (fed back to botman next cycle) |
| user message | `orca-note`, `orca-thread`, author `user` | yes |

Hidden notes are how botman deliberates across cycles. Spontaneous messages are simply a visible note
on a cycle where no user message triggered it.

### Orca object shape

Objects are APInt utilities stored one per Mongo document:

```json
{
  "index": 12,
  "alias": "12",
  "content": "hello",
  "properties": {
    "tags": ["orca-note", "orca-thread"],
    "metadata": { "author": "botman", "time": 1760000000000 }
  }
}
```

`index` is a per-log auto-incrementing counter (kept in the `orca-counters` collection). The log is
the collection named by `LOG_NAME`.

### Cost guards

- `CYCLE_INTERVAL_MS` sets the cadence; one AI call per cycle at most.
- `REQUIRE_FRONTEND_PING=true` (default) makes cycles run **only** while a browser has contacted the
  API within `PING_TIMEOUT_MS`. The chat page polls every 2 seconds, which counts as the ping. Close
  the tab and the spend stops. Set it to `false` for an always-on bot.
- `CONTEXT_NOTES` bounds prompt size; `AI_MAX_TOKENS` bounds output.
- User messages are capped by `MAX_MESSAGE_CHARS` and rate limited per IP.

## Setup

Requires Node 18+ and a MongoDB Atlas cluster.

```sh
npm install
cp .env.example .env     # then fill it in
npm start
```

Open http://localhost:3000. There is a single shared conversation for everyone who opens the page.

Atlas: create a database user, allow your IP in Network Access, and put the connection string in
`MONGO_URI`.

### Configuration

Everything is in `.env` (see `.env.example` for the full list and defaults).

| Variable | Purpose |
|---|---|
| `MONGO_URI`, `MONGO_DB`, `LOG_NAME` | Atlas connection and the collection used as the Orca log |
| `AI_PROVIDER` | `claude`, `gemini`, or `mock` |
| `AI_API_KEY`, `AI_ENDPOINT`, `AI_MODEL` | Credentials, optional endpoint override, model id |
| `CYCLE_INTERVAL_MS` | Delay between cycles |
| `REQUIRE_FRONTEND_PING`, `PING_TIMEOUT_MS` | Run cycles only while a browser is connected |
| `CONTEXT_NOTES`, `MAX_NOTES_PER_CYCLE` | Prompt window and per-cycle note cap |
| `MAX_UNANSWERED_VISIBLE`, `UNANSWERED_RESET_MS` | Loop guard: visible messages allowed without a user reply, and the quiet period after which it lifts |
| `DEDUPE_WINDOW`, `DEDUPE_SIMILARITY`, `IDLE_NUDGE_MS` | Duplicate matching and the idle nudge |
| `MAX_MESSAGE_CHARS`, `RATE_LIMIT_PER_MIN` | Chat API limits |
| `BOTMAN_PERSONA` | The system prompt's personality section |

`AI_PROVIDER=mock` needs no AI credentials. It greets and echoes, which is handy for checking the
plumbing against Atlas without spending anything.

## API

| Route | Description |
|---|---|
| `GET /api/thread?after=<index>` | Thread-visible messages with index greater than `after`, plus `thinking` (a cycle is in flight). Counts as a ping. |
| `POST /api/message` `{content}` | Appends a user note. Author (`user`) and the `orca-thread` tag are set server-side. |

Only objects tagged `orca-thread` are ever sent to the browser.

## Layout

```
server.js        HTTP server and API
lib/config.js    env parsing and validation
lib/log.js       Orca log on MongoDB
lib/ai.js        Claude / Gemini / mock adapter
lib/agent.js     the cycle
public/          vanilla frontend
test/            parser and guard tests (npm test)
```

## Notes

- User text goes into the model prompt, so the system prompt tells the model to treat it as
  conversation only. This is a mitigation, not a guarantee.
- Anonymous access means anyone with the URL can spend your AI budget. Keep the cycle interval and
  ping guard on, and put the app behind your own protection if you expose it publicly.
