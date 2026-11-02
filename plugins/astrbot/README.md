# astrbot.send

Send a text message through an AstraBot-compatible HTTP endpoint.

- id: `astrbot.send`
- fields:
    - `baseUrl` (text, required)
    - `path` (text, def `/sendMessage`; leading `/` optional — e.g. `api/send_message`)
    - `token` (password, sent as `Authorization: Bearer <token>`, omitted when blank)
    - `chatId` (text, required)
    - `text` (textarea, def `{{label}}`; supports `{{label}}` / `{{data.<key>}}`)
- 8s timeout; non-2xx returns `{ok:false}`; the token is never echoed in messages.

## Assumed API

There is no public AstraBot message-send spec pinned by this plugin. It assumes
the Telegram-style convention:

```
POST {baseUrl}/sendMessage
Content-Type: application/json
Authorization: Bearer <token>   (when token is set)

{ "chat_id": "<chatId>", "text": "<text>" }
```

If your AstrBot instance uses a different path set the `path` field (no adapter
needed); if field names differ too, use the generic `webhook.post` plugin with an
explicit `bodyTemplate` instead. When the real endpoint is confirmed against a
live instance, update `index.ts` (`buildSendPayload` + the fetch path)
and this section together. **Status: verified against a stub implementing the
assumed contract above, NOT yet against a live AstrBot instance.**

## Config example

```json
{
    "baseUrl": "https://astrbot.example.com/bot",
    "token": "s3cret",
    "chatId": "123456",
    "text": "[DNA] {{label}} — {{data.summary}}"
}
```
