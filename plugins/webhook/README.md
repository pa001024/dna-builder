# webhook.post

POST (or any method) an event payload to an HTTP(S) URL.

- id: `webhook.post`
- fields:
    - `url` (text, required)
    - `method` (text, def `POST`)
    - `headers` (textarea JSON, def `{}`; placeholders render before parsing)
    - `bodyTemplate` (textarea, def empty = full event JSON; supports
      `{{label}}` / `{{data.<key>}}`)
- 8s timeout; non-2xx responses return `{ok:false}`; secrets are never echoed
  in result messages.

## Config example

```json
{
    "url": "https://example.com/hooks/dna",
    "method": "POST",
    "headers": { "Content-Type": "application/json", "X-Event": "{{label}}" },
    "bodyTemplate": "{\"label\":\"{{label}}\",\"data\":{{data}}}"
}
```

Leave `bodyTemplate` empty to send the full event JSON.
