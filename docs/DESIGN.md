# Design

The approved design is a Claude design canvas (owner-only link, kept outside the repo). Issues name the
screen they implement using the board titles below.

## Screens

| Area | Phone board | Desktop board |
|---|---|---|
| Sign in | PIN sign-in · mobile | — |
| Overview | Home · mobile | Overview · desktop |
| Month | Month & compare · mobile | Month, comparison & transactions · desktop |
| Activity | Activity · edit categories · mobile | Month (transactions table) |
| Add transaction | Add transaction | Add transaction · desktop |
| Bills & budget | Bills & budget · mobile | Bills & budget · desktop |
| Review | Review & reconcile · mobile | Review & reconcile · desktop |
| Accounts | Savings · view all, Debt · view all, New account | Accounts, savings & debt · desktop |
| Categories | Categories · view all, New category | Categories · desktop |
| Settings | Settings · mobile | Settings · desktop |
| Report | — | Month report · PDF |
| Brand | App icon | App icon |

## Tokens

| Token | Light | Dark |
|---|---|---|
| Page background | `#E3E9F2` | `#1F5F7A` |
| Card | `#FFFFFF` | `#26395A` |
| Sunk / inset | `#F1F4F9` | `#2C4166` |
| Text | `#17253E` | `#ECF0F3` |
| Muted text | `#5A677A` | `#CBD4E0` |
| Line | `#E0E3E7` | `#34496E` |
| Header and hero card | `#1F5F7A` | `#17253E` |
| Selected tab in header | `#16475C` | `#0F1A2E` |
| Link | `#20639B` | `#7FF0C6` |
| Accent (buttons) | `#05DA93` on `#152032` text | same |
| Tab bar | `#17253E`, active `#05DA93` | same |

Charts: income `#ED7D31` (dark `#F28C45`), expense `#1F6E8C` (dark `#4FA3C7`).
Status: green paid/ok, amber review due / ≤7 days, orange ≤3 days, red due or mismatch, grey skipped.

Type: Poppins 400–700, tabular numbers. Cards: 20px radius, soft drop shadow.
Headers: curved bottom-right corner joining the content with a curved top-left corner.
Icons: line icons for navigation and actions, emoji for accounts, categories and bills.
