# onebot.send

Send a message via the OneBot11 HTTP API (`POST {baseUrl}/send_msg`).

- id: `onebot.send`
- fields:
    - `baseUrl` (text, def `http://127.0.0.1:5700`)
    - `token` (password, sent as `Authorization: Bearer <token>`, omitted when blank)
    - `targetType` (text, def `group`: `group` | `private`)
    - `targetId` (text, required)
    - `message` (textarea, def `{{label}}`; supports `{{label}}` / `{{data.<key>}}`)
- 8s timeout; non-2xx returns `{ok:false}`; the token is never echoed in messages.

## Payload mapping

| `targetType` | `message_type` | id field |
|---|---|---|
| `group` | `group` | `group_id` |
| `private` (`user`, `friend` aliases) | `private` | `user_id` |

Any other `targetType` fails validation. Numeric ids are sent as numbers,
non-numeric ids as strings.

```json
// targetType=group, targetId="123", message="hi"
{ "message_type": "group", "group_id": 123, "message": "hi" }
```

## Config example

```json
{
    "baseUrl": "http://127.0.0.1:5700",
    "token": "s3cret",
    "targetType": "group",
    "targetId": "123456",
    "message": "[DNA] {{label}} — {{data.summary}}"
}
```
