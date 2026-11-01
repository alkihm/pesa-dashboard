# iPhone Shortcut

How money SMS get from the iPhone into the app. The key itself is never written here: it lives in
`private/env/` on the server (`intake-dev.env` for the dev project, `intake-prod.env` for production).

## How it works

1. A personal automation in the Shortcuts app runs on every incoming SMS from the money senders (M-PESA,
   KCB, KCB M-PESA, Airtel Money…) and appends the message to a pending file on the phone as
   `<received date>|||<message text>|||END`.
2. The **Flush pending SMS** shortcut splits that file into records and, for each record, posts it to the
   intake function (`supabase/functions/intake`). The function stores the raw SMS, parses it and writes the
   transactions and balances — see ARCHITECTURE.md "Flow".
3. Posting the same record twice is harmless: the intake drops a message it has already stored.

## The intake action in Flush pending SMS

Inside **Repeat with each item in Split Text → If Repeat Item has any value**:

| Field | Value |
|---|---|
| Action | Get Contents of URL |
| URL | `INTAKE_URL` from the env file (`https://<project ref>.supabase.co/functions/v1/intake`) |
| Method | POST |
| Headers | `x-intake-key` = `INTAKE_KEY` from the env file. The header name must be exactly `x-intake-key` |
| Request Body | JSON: `secret` = the old secret variable, `batch` = Repeat Item (unchanged from the Apps Script action) |

The function answers with JSON, for example `{"ok":true,"received":1,"added":1,"duplicates":0,"review":0,
"ignored":0,"skipped":0}`. A wrong or missing key gives `401 {"ok":false,"error":"unauthorized"}`.
Posting `{"action":"status"}` with the header returns how many messages have arrived, how many need review
and when the last one came.

## During the transition

The old **Get Contents of URL** action that posts to Apps Script stays, **below** the intake action, so:

- the Google Sheet keeps receiving every message until the app is trusted;
- the steps after it (reading `error` from its response, counting `sent`, clearing the pending file) still
  look at the Apps Script response, so a problem on the new path never loses a message.

## After the transition

When the app has run alongside the Sheet long enough to trust it:

1. Point the intake action at the production URL and key (`intake-prod.env`).
2. Make the steps after the request read the intake action's response instead — it also has no `error`
   field when all is well.
3. Delete the Apps Script action. The Sheet becomes the nightly read-only backup ([1.7]).

## Changing the key

1. On the server, generate a new key, set it with
   `supabase secrets set --project-ref <ref> INTAKE_KEY=<new key>` and write it to the env file.
2. Paste the new value into the `x-intake-key` header on the phone.

Change it whenever it may have been seen by anyone else, for example in a screenshot or a chat.
