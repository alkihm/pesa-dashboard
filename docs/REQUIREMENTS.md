# Requirements

The owner's original brief, cleaned up, plus everything agreed while designing. Each line points to the
issue that delivers it. Change this file when a requirement changes, and log why in
[DECISIONS.md](DECISIONS.md).

## Vision

A budget dashboard that fills itself in. When a money SMS arrives on the iPhone, a Shortcut sends it on,
it becomes a ledger entry, and the dashboard on the phone and the laptop refreshes: all balances, debt,
savings, bills and where the money went in one view, with accounts that reconcile against the SMS.

## Functional requirements

| # | Requirement | Issues |
|---|---|---|
| R1 | One view with every account balance | [2.2], [2.3] |
| R2 | Total debt in two groups: short-term (mobile loans) and long-term (car loan, card, other big loans) | [2.3], [3.7] |
| R3 | Savings total; tapping it shows each savings account | [2.3] |
| R5 | Loan repayment allocation: choose what % of income goes to loans and see the split | [3.5] |
| R6 | Net position from current balances: wallets, bank, cash and savings minus short-term debt (long-term shown separately). Changed 2026-11-01, see D-010 | [3.7] |
| R7 | Categories ranked by where most money goes | [2.2], [2.4] |
| R8 | Monthly view | [2.4] |
| R9 | Month-to-month comparison | [2.4] |
| R10 | Income vs expense trend per month | [2.2], [2.4] |
| R11 | Recurring bills (rent, water, stima, internet, Claude, Netflix, fuel…) with paid vs pending totals against income and balances | [3.1]–[3.3] |
| R12 | Budget items: allocate funds from a chosen account; money moves only after approval | [3.4] |
| R13 | Reconcile accounts when transactions were not recorded | [4.1], [4.2] |
| R14 | Review reminder every 3 days; status goes green → amber → red if a week passes without review; a review checks every account | [4.3], [4.4] |
| R15 | Any account whose balance differs from its SMS balance turns red until reconciled | [4.1] |
| R16 | Add categories, accounts and other dashboard items | [2.8], [2.9] |
| R17 | Amend account balances through reconciliation | [4.2] |
| R18 | Comments (notes) on transactions | [2.6] |
| R19 | Map a transaction to a category | [2.6], [1.9] |
| R20 | Transactions come from the iPhone Shortcut feed | [1.5], [1.6] |
| R21 | Bulk upload with a downloadable Excel template when sync was down | [4.7] |
| R22 | Downloadable month report with a clear overview | [4.8] |
| R23 | Login PIN; reset only through the Google account or set on the backend | [2.1], [4.9] |
| R24 | Light build that refreshes instantly after edits; pull-to-refresh on phone | [4.6] |
| R25 | Offline changes are kept and pushed when back online, without conflicts | [4.5] |
| R26 | Advice on database, language and framework | Answered in [DECISIONS.md](DECISIONS.md) |

R4 was blank in the original brief.

## Front-end requirements

| # | Requirement | Issues |
|---|---|---|
| F1 | Fully responsive: phone and desktop | [0.6] and every screen |
| F2 | Dark and light mode | [0.5] |
| F3 | Clean modern fonts and layout (Poppins, rounded cards) | [0.5], [0.7] |
| F4 | Colours suited to a finance dashboard | [0.5], see [DESIGN.md](DESIGN.md) |
| F5 | Bar and line graphs where they help | [2.2], [2.4] |

## Agreed during design

| # | Requirement | Issues |
|---|---|---|
| D1 | Phone Home order: Net position, Accounts (all four in one row), Savings, Where the money went, October, Bills, Debt, Loan repayment | [2.2] |
| D2 | Lists show 4 items and a "View all" that opens a full screen (savings, debt, categories) | [2.2], [2.3], [2.8] |
| D3 | Every transaction shows the original SMS so it can be reviewed with context | [2.6] |
| D4 | Categories have an emoji and a colour; emoji picker on create | [2.8] |
| D5 | Bills change colour by days to due date (red due/overdue, orange ≤3, amber ≤7, blue later, green paid, grey skipped) | [3.1] |
| D6 | A bill can be skipped for the month; bills paid by SMS are marked paid automatically | [3.2], [3.3] |
| D7 | Every phone screen also exists on desktop, with one shared navigation | [0.6] and screen issues |
| D8 | Donut without gaps between slices; income orange, expense teal in charts | [0.7] |
| D9 | Curved headers holding the page tabs, cards with a soft shadow | [0.6], [0.7] |
| D10 | App icon: broken ring of category arcs with a KSh message bubble | [0.8] |
| D11 | Settings: review interval, alert switches, sync status, offline queue, PIN, theme | [4.9] |
| D12 | Desktop category drop-down must be clearly styled, never the pale native list | [2.6] |
