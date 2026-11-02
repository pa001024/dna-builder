# websocket.send

One-shot WebSocket send over the browser native WebSocket: connect, send one
text payload, close.

- id: `websocket.send`
- fields:
    - `url` (text, required, `ws://` or `wss://`)
    - `payload` (textarea, def empty = full event JSON; supports
      `{{label}}` / `{{data.<key>}}`)
    - `reconnect` (boolean, def `false`, informational only: this action never
      keeps the connection open, it always connects + sends + closes)
- 8s timeout covering connect + send; server replies are ignored.

## Config example

```json
{
    "url": "wss://example.com/events",
    "payload": "{\"label\":\"{{label}}\",\"data\":{{data}}}",
    "reconnect": false
}
```

Leave `payload` empty to send the full event JSON.
