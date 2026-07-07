# BPO Roster API

Standalone Apps Script web service for a BPO roster, backed entirely by
Google Sheets. **This module is fully independent of the rest of this repo**
— it lives in its own Google Sheet / Apps Script project and shares no code
or data with the coffee quotes app.

## Files

- `data/dim_accounts.csv` — 11 sample client accounts
- `data/dim_staff.csv` — 1327 sample staff records, randomly assigned across the 11 accounts
- `Code.gs` — the Apps Script web app (copy into a new Apps Script project)

## Schema

**dim_accounts**: `account_id, account_name, account_code, industry, region, program_type, contract_start_date, contract_status, seat_capacity, account_manager, timezone_coverage, created_at`

**dim_staff**: `staff_id, first_name, last_name, email, account_id, role, department, site_location, shift, seniority_level, employment_status, hire_date, manager_id, updated_at`

`dim_staff.account_id` is a single foreign key — a staff member belongs to exactly one account at a time. Reassigning someone is just an `update` on that field.

## 1. Build

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet. Name it e.g. `BPO Roster DB`.
2. Create two tabs named exactly `dim_accounts` and `dim_staff` (case-sensitive, no extra spaces).
3. Import the data:
   - Open the `dim_accounts` tab → **File > Import > Upload** → select `data/dim_accounts.csv` → "Replace current sheet".
   - Repeat for `dim_staff` tab with `data/dim_staff.csv`.
4. Confirm both tabs have a header row matching the column names above.
5. In the spreadsheet, open **Extensions > Apps Script**. This creates a script project bound to the sheet.
6. Delete the default boilerplate `Code.gs` content and paste in the contents of this folder's `Code.gs`.
7. Save the project (name it e.g. `BPO Roster API`).

## 2. Configure the API key

The service is protected by a single shared-secret key stored in Script Properties (not hardcoded).

1. In the Apps Script editor, open **Project Settings** (gear icon on the left).
2. Under **Script Properties**, click **Add script property**.
3. Set key = `API_KEY`, value = a long random string you generate yourself (e.g. run `openssl rand -hex 24` locally). Save.
4. Keep this value private — anyone with it can read/write your roster.

## 3. Deploy

1. In the Apps Script editor, click **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure:
   - Description: `v1`
   - Execute as: **Me**
   - Who has access: **Anyone** (required for external requests to reach it; the API key is what actually gates access)
4. Click **Deploy**. Authorize the requested permissions (it needs access to the spreadsheet).
5. Copy the **Web app URL** — this is your API base URL, e.g.:
   `https://script.google.com/macros/s/AKfycb.../exec`

Whenever you edit `Code.gs`, you must create a **new deployment version** (or use "Manage deployments > Edit > New version") for changes to take effect on the existing URL.

## 4. Test

Replace `<URL>` and `<KEY>` below with your deployment URL and API key.

**List all accounts**
```bash
curl "<URL>?resource=accounts&apiKey=<KEY>"
```

**Get one account**
```bash
curl "<URL>?resource=accounts&apiKey=<KEY>&id=ACC-001"
```

**List staff for one account**
```bash
curl "<URL>?resource=staff&apiKey=<KEY>&account_id=ACC-001"
```

**Filter staff by employment status**
```bash
curl "<URL>?resource=staff&apiKey=<KEY>&employment_status=Active"
```

**Create a new staff record**
```bash
curl -X POST "<URL>" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "<KEY>",
    "resource": "staff",
    "action": "create",
    "data": {
      "staff_id": "STF-99999",
      "first_name": "Test",
      "last_name": "User",
      "email": "test.user@bposervices.com",
      "account_id": "ACC-001",
      "role": "Agent",
      "department": "Customer Support",
      "site_location": "Manila, PH",
      "shift": "Day",
      "seniority_level": "Junior",
      "employment_status": "Active",
      "hire_date": "2026-07-06",
      "manager_id": "",
      "updated_at": "2026-07-06T09:00:00"
    }
  }'
```

**Reassign a staff member to a different account**
```bash
curl -X POST "<URL>" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "<KEY>",
    "resource": "staff",
    "action": "update",
    "data": { "staff_id": "STF-99999", "account_id": "ACC-002" }
  }'
```

**Delete a staff record**
```bash
curl -X POST "<URL>" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "<KEY>",
    "resource": "staff",
    "action": "delete",
    "data": { "staff_id": "STF-99999" }
  }'
```

### Expected responses

- Success: `{"status":200,"data":...}` (list endpoints also include `"count"`)
- Missing/wrong API key: `{"status":401,"error":"Unauthorized: missing or invalid apiKey."}`
- Not found: `{"status":404,"error":"...not found."}`
- Bad request (e.g. missing resource/action): `{"status":400,"error":"..."}`

Note: Apps Script `ContentService` web apps always return HTTP 200 at the transport level — check the `status` field in the JSON body to detect errors programmatically, `curl -i` will not show a 4xx/5xx.

## Notes / limitations

- Concurrent writes: Apps Script serializes script executions per user session but doesn't provide row-level locking here. Fine for a roster tool with low write volume; not designed for high-concurrency writes.
- No pagination: `resource=staff` with no filters returns all 1327+ rows in one response. Add `account_id`/`employment_status`/`role` filters to narrow results.
- Single shared API key: adequate for a small number of trusted integrations. If you need per-tenant credentials or audit trails later, that's a separate enhancement, not included here.
