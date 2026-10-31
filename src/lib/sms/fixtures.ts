// Invented messages in the real formats. Every name, number and reference code here is made up.

import type { ParseOptions } from "./types.ts";

export interface Fixture {
  name: string;
  sender: string;
  body: string;
  opts?: ParseOptions;
  /** A partial `SmsParse`, compared with `toMatchObject`. */
  expected: Record<string, unknown>;
}

const MPESA = { product: "mpesa" };
const FULIZA = { product: "fuliza" };
const MSHWARI = { product: "mshwari" };
const KCB_MPESA = { product: "kcb-mpesa" };
const KCB_MPESA_LOAN = { product: "kcb-mpesa-loan" };
const CASH = { product: "cash" };
const AIRTEL = { product: "airtel-money" };
const KCB = { product: "bank", hint: "KCB" };
const CARD = { product: "bank", hint: "KCB card 0042" };

/** When the test pretends the phone received each message. */
export const RECEIVED_AT = new Date("2026-01-05T08:00:00Z");

export const fixtures: Fixture[] = [
  // ---- M-PESA ----
  {
    name: "M-PESA: money received from a person",
    sender: "MPESA",
    body: "TSA1B2C3D4 Confirmed.You have received Ksh300.00 from ALEX MOCKTON 0700000101 on 2/1/26 at 1:23 PM  New M-PESA balance is Ksh1,000.00. Separate personal and business funds through Pochi la Biashara on *334#.",
    expected: {
      status: "parsed",
      source: "mpesa",
      ref: "TSA1B2C3D4",
      occurredAt: new Date("2026-01-02T10:23:00Z"),
      entries: [
        {
          account: MPESA,
          kind: "income",
          amountCents: 30000,
          channel: "receive",
          payee: "ALEX MOCKTON",
          dedupeKey: "mpesa:TSA1B2C3D4:main",
        },
      ],
      balances: [{ account: MPESA, cents: 100000 }],
    },
  },
  {
    name: "M-PESA: till payment, no fee",
    sender: "MPESA",
    body: "TSB2C3D4E5 Confirmed. Ksh701.00 paid to SAMPLE MART FEDHA. on 2/1/26 at 1:23 PM.New M-PESA balance is Ksh299.00. Transaction cost, Ksh0.00.",
    expected: {
      status: "parsed",
      entries: [
        {
          account: MPESA,
          kind: "spending",
          amountCents: -70100,
          channel: "till",
          payee: "SAMPLE MART FEDHA",
        },
      ],
      balances: [{ account: MPESA, cents: 29900 }],
    },
  },
  {
    name: "M-PESA: paybill with an account number",
    sender: "MPESA",
    body: "TSC3D4E5F6 Confirmed. Ksh100.00 sent to DEMO OFFERS for account Bundle on 2/1/26 at 1:30 PM New M-PESA balance is Ksh199.00. Transaction cost, Ksh0.00.",
    expected: {
      status: "parsed",
      entries: [{ amountCents: -10000, channel: "paybill", payee: "DEMO OFFERS", payeeAccount: "Bundle" }],
    },
  },
  {
    name: "M-PESA: send to a person, with a fee row",
    sender: "MPESA",
    body: "TSD4E5F6G7 Confirmed. Ksh500.00 sent to SAM PLEPERSON 0700000102 on 3/1/26 at 9:05 AM. New M-PESA balance is Ksh1,500.00. Transaction cost, Ksh7.00. Amount you can transact within the day is 499,500.00.",
    expected: {
      status: "parsed",
      occurredAt: new Date("2026-01-03T06:05:00Z"),
      entries: [
        { kind: "spending", amountCents: -50000, channel: "send", payee: "SAM PLEPERSON", key: "main" },
        {
          kind: "spending",
          amountCents: -700,
          channel: "fee",
          payee: "SAM PLEPERSON",
          key: "fee",
          dedupeKey: "mpesa:TSD4E5F6G7:fee",
        },
      ],
    },
  },
  {
    name: "M-PESA: agent withdrawal is a transfer to cash, plus fee, just after midnight",
    sender: "MPESA",
    body: "TSE5F6G7H8 Confirmed.on 4/1/26 at 12:15 AMWithdraw Ksh2,000.00 from 000111 - DEMO AGENT SHOP Main Street New M-PESA balance is Ksh500.00. Transaction cost, Ksh29.00.",
    expected: {
      status: "parsed",
      occurredAt: new Date("2026-01-03T21:15:00Z"),
      entries: [
        {
          account: MPESA,
          kind: "transfer",
          amountCents: -200000,
          channel: "withdrawal",
          transferGroup: "main",
        },
        { account: CASH, kind: "transfer", amountCents: 200000, transferGroup: "main" },
        { account: MPESA, kind: "spending", amountCents: -2900, channel: "fee" },
      ],
    },
  },
  {
    name: "M-PESA: cash deposit at an agent",
    sender: "MPESA",
    body: "TSF6G7H8J9 Confirmed. On 4/1/26 at 10:00 AM Give Ksh1,000.00 cash to DEMO AGENT SHOP New M-PESA balance is Ksh1,500.00.",
    expected: {
      status: "parsed",
      entries: [
        { account: CASH, kind: "transfer", amountCents: -100000 },
        { account: MPESA, kind: "transfer", amountCents: 100000, payee: "DEMO AGENT SHOP" },
      ],
    },
  },
  {
    name: "M-PESA: airtime",
    sender: "MPESA",
    body: "TSG7H8J9K1 confirmed.You bought Ksh50.00 of airtime on 4/1/26 at 11:00 AM.New M-PESA balance is Ksh1,450.00. Transaction cost, Ksh0.00.",
    expected: { status: "parsed", entries: [{ amountCents: -5000, channel: "airtime", payee: "Airtime" }] },
  },
  {
    name: "Fuliza: draw funding a payment is a transfer, the access fee is spending on Fuliza",
    sender: "MPESA",
    body: "TSD4E5F6G7 Confirmed. Fuliza M-PESA amount is Ksh 700.00. Access Fee charged Ksh 7.00. Total Fuliza M-PESA outstanding amount is Ksh707.00 due on 03/02/26. To check daily charges, Dial *234*0#OK Select Query Charges",
    expected: {
      status: "parsed",
      ref: "TSD4E5F6G7",
      occurredAt: RECEIVED_AT,
      entries: [
        {
          account: FULIZA,
          kind: "transfer",
          amountCents: -70000,
          dedupeKey: "mpesa:TSD4E5F6G7:fuliza-draw-out",
        },
        {
          account: MPESA,
          kind: "transfer",
          amountCents: 70000,
          dedupeKey: "mpesa:TSD4E5F6G7:fuliza-draw-in",
        },
        {
          account: FULIZA,
          kind: "spending",
          amountCents: -700,
          channel: "fee",
          dedupeKey: "mpesa:TSD4E5F6G7:fuliza-fee",
        },
      ],
      balances: [{ account: FULIZA, cents: -70700 }],
    },
  },
  {
    name: "Fuliza: repayment moves money from M-PESA to Fuliza",
    sender: "MPESA",
    body: "TSH8J9K1L2 Confirmed. Ksh 707.00 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 5,000.00. M-PESA balance is Ksh2,293.00.",
    expected: {
      status: "parsed",
      entries: [
        { account: MPESA, kind: "transfer", amountCents: -70700 },
        { account: FULIZA, kind: "transfer", amountCents: 70700 },
      ],
      balances: [{ account: MPESA, cents: 229300 }],
    },
  },
  {
    name: "M-Shwari: saving from M-PESA, both balances read",
    sender: "MPESA",
    body: "TSJ9K1L2M3 Confirmed. Ksh2,000.00 transferred to M-Shwari account on 5/1/26 at 8:00 AM. M-PESA balance is Ksh293.00 .New M-Shwari saving account balance is Ksh12,000.00. Transaction cost Ksh.0.00",
    expected: {
      status: "parsed",
      entries: [
        { account: MPESA, amountCents: -200000 },
        { account: MSHWARI, amountCents: 200000 },
      ],
      balances: [
        { account: MPESA, cents: 29300 },
        { account: MSHWARI, cents: 1200000 },
      ],
    },
  },
  {
    name: "M-Shwari: withdrawing back to M-PESA",
    sender: "MPESA",
    body: "TSK1L2M3N4 Confirmed. Ksh500.00 transferred from M-Shwari account on 5/1/26 at 9:00 AM. M-Shwari balance is Ksh11,500.00 .M-PESA balance is Ksh793.00 .Transaction cost Ksh.0.00",
    expected: {
      status: "parsed",
      entries: [
        { account: MSHWARI, amountCents: -50000 },
        { account: MPESA, amountCents: 50000 },
      ],
      balances: [
        { account: MPESA, cents: 79300 },
        { account: MSHWARI, cents: 1150000 },
      ],
    },
  },
  {
    name: "KCB M-PESA: loan repayment from M-PESA",
    sender: "MPESA",
    body: "TSL2M3N4P5 Confirmed. Your loan repayment of Ksh3,100.00 to KCB M-PESA has been received on 6/1/26 at 7:30 PM. New M-PESA balance is Ksh400.00.",
    expected: {
      status: "parsed",
      entries: [
        { account: MPESA, kind: "transfer", amountCents: -310000, channel: "loan" },
        { account: KCB_MPESA_LOAN, kind: "transfer", amountCents: 310000 },
      ],
    },
  },
  {
    name: "KCB M-PESA: money moved out to M-PESA",
    sender: "MPESA",
    body: "TSM3N4P5Q6 Confirmed. You have transfered Ksh1,500.00 from your KCB M-PESA account on 6/1/26 at 8:00 PM. New M-PESA balance is Ksh1,900.00.",
    expected: {
      status: "parsed",
      entries: [
        { account: KCB_MPESA, amountCents: -150000 },
        { account: MPESA, amountCents: 150000 },
      ],
    },
  },
  {
    name: "M-PESA: reversal of a payment comes back as positive spending",
    sender: "MPESA",
    body: "TSN4P5Q6R7 Confirmed. Reversal of transaction TSB2C3D4E5 has been successfully reversed on 7/1/26 at 10:10 AM and Ksh701.00 is credited to your M-PESA account. New M-PESA account balance is Ksh2,601.00.",
    expected: {
      status: "parsed",
      entries: [{ kind: "spending", amountCents: 70100, channel: "reversal" }],
      balances: [{ account: MPESA, cents: 260100 }],
    },
  },
  {
    name: "M-PESA: reversal of money received takes income back",
    sender: "MPESA",
    body: "TSP5Q6R7S8 Confirmed. Reversal of transaction TSA1B2C3D4 has been successfully reversed on 7/1/26 at 11:00 AM and Ksh300.00 is debited from your M-PESA account. New M-PESA account balance is Ksh2,301.00.",
    expected: { status: "parsed", entries: [{ kind: "income", amountCents: -30000, channel: "reversal" }] },
  },
  {
    name: "M-PESA: balance enquiry gives a balance and no entries",
    sender: "MPESA",
    body: "TSQ6R7S8T9 Confirmed. Your account balance was: M-PESA Account : Ksh2,301.00 Business Account : Ksh0.00 on 7/1/26 at 12:00 PM. Transaction cost, Ksh0.00.",
    expected: { status: "parsed", entries: [], balances: [{ account: MPESA, cents: 230100 }] },
  },
  {
    name: "M-PESA: 'Spam Alert' prefix from an unknown number is still a payment",
    sender: "+254700000999",
    body: "Spam Alert: TSR7S8T9U1 Confirmed. Ksh250.00 paid to DEMO KIOSK. on 8/1/26 at 6:45 PM.New M-PESA balance is Ksh2,051.00. Transaction cost, Ksh0.00.",
    expected: { status: "parsed", source: "mpesa", entries: [{ amountCents: -25000, payee: "DEMO KIOSK" }] },
  },
  {
    name: "M-PESA: unknown wording goes to review with its amount",
    sender: "MPESA",
    body: "TSS8T9U1V2 Confirmed. Ksh1,000.00 converted to reward points on 8/1/26 at 7:00 PM. New M-PESA balance is Ksh1,051.00.",
    expected: { status: "to_review", source: "mpesa", ref: "TSS8T9U1V2", amountCents: 100000 },
  },
  {
    name: "M-PESA: amounts with thousands and no decimals",
    sender: "MPESA",
    body: "TST9U1V2W3 Confirmed. Ksh12,500 sent to TEST LANDLORD for account HOUSE7 on 9/1/26 at 9:00 AM New M-PESA balance is Ksh3,500. Transaction cost, Ksh0.00.",
    expected: {
      status: "parsed",
      entries: [{ amountCents: -1250000, payee: "TEST LANDLORD", payeeAccount: "HOUSE7" }],
      balances: [{ account: MPESA, cents: 350000 }],
    },
  },
  {
    name: "M-PESA: masked phone number is stripped from the payee",
    sender: "MPESA",
    body: "TSU1V2W3X4 Confirmed.You have received Ksh1,200.00 from SAMPLE FRIEND 07******03 on 9/1/26 at 3:00 PM New M-PESA balance is Ksh4,700.00.",
    expected: { status: "parsed", entries: [{ amountCents: 120000, payee: "SAMPLE FRIEND" }] },
  },
  {
    name: "M-PESA: money from a bank account arrives as income (payee rules turn it into a transfer)",
    sender: "MPESA",
    body: "TSV2W3X4Y5 Confirmed.You have received Ksh10,000.00 from SAMPLE BANK 1 500000 on 10/1/26 at 8:00 AM New M-PESA balance is Ksh14,700.00.",
    expected: {
      status: "parsed",
      entries: [{ kind: "income", amountCents: 1000000, payee: "SAMPLE BANK 1" }],
    },
  },
  {
    name: "M-PESA: payment reminder is not a transaction",
    sender: "MPESA",
    body: "Dear customer, your Fuliza M-PESA of Ksh 707.00 is due on 03/02/2026. Pay now to keep your limit.",
    expected: { status: "ignored", reason: "payment reminder" },
  },
  {
    name: "M-PESA: offer is not a transaction",
    sender: "MPESA",
    body: "Umepata nafasi ya kushinda! Dial *544# to see today's offers.",
    expected: { status: "ignored", reason: "offer" },
  },
  {
    name: "M-PESA: failed send is not a transaction",
    sender: "MPESA",
    body: "Failed. Insufficient funds in your M-PESA account to send Ksh5,000.00.",
    expected: { status: "ignored", reason: "failed transaction" },
  },
  {
    name: "One-time codes are dropped",
    sender: "KCB",
    body: "Your one-time password is 123456. Do not share it with anyone.",
    expected: { status: "ignored", reason: "one-time code" },
  },
  {
    name: "Senders that are not handled are ignored",
    sender: "SHOPX",
    body: "You earned 50 points on your last visit.",
    expected: { status: "ignored", reason: "sender not handled" },
  },

  // ---- Formats first seen on the owner's phone (invented values) ----
  {
    name: "Fuliza: partial repayment, code on its own line, balance without Ksh",
    sender: "",
    body: "TSW1X2Y3Z4\n Confirmed. Ksh 50.00 from your M-PESA has been used to partially pay your outstanding Fuliza M-PESA. Your available Fuliza M-PESA limit is Ksh 950.00. Your M-PESA balance is 0.00.",
    expected: {
      status: "parsed",
      ref: "TSW1X2Y3Z4",
      entries: [
        { account: MPESA, kind: "transfer", amountCents: -5000 },
        { account: FULIZA, kind: "transfer", amountCents: 5000 },
      ],
      balances: [{ account: MPESA, cents: 0 }],
    },
  },
  {
    name: "KCB M-PESA: money from the savings side arrives in M-PESA as a transfer",
    sender: "",
    body: "TSX2Y3Z4A5 Confirmed.You have received Ksh50.00 from KCB M-PESA SAVINGS 222222 on 1/11/26 at 1:49 AM New M-PESA balance is Ksh50.00.  See all your balances now https://example.test/x.",
    expected: {
      status: "parsed",
      entries: [
        { account: KCB_MPESA, kind: "transfer", amountCents: -5000 },
        { account: MPESA, kind: "transfer", amountCents: 5000, payee: "KCB M-PESA" },
      ],
      balances: [{ account: MPESA, cents: 5000 }],
    },
  },
  {
    name: "KCB M-PESA: savings notice gives only the savings balance (M-PESA records the move)",
    sender: "",
    body: "Confirmed. You have transferred KES 50.00 from your M-PESA savings Account to M-PESA. Your M-PESA savings Account balance is KES 12,345.67.",
    expected: {
      status: "parsed",
      occurredAt: RECEIVED_AT,
      entries: [],
      balances: [{ account: KCB_MPESA, cents: 1234567 }],
    },
  },
  {
    name: "KCB M-PESA: wallet withdrawal notice from KCB is a copy",
    sender: "KCB",
    body: "You have successfully withdrawn 50.00 from your KCB M-Pesa wallet.",
    expected: { status: "ignored", reason: "copy of an M-PESA receipt" },
  },

  // ---- Bank (KCB wording) ----
  {
    name: "Bank card: purchase in KES, card balance read",
    sender: "KCB",
    body: "KES 325.00 transaction made on KCB card 4000***0042 at SAMPLE CAFE on 23/01/2026 15:32. Avail balance KES 12,000.00",
    expected: {
      status: "parsed",
      source: "bank",
      occurredAt: new Date("2026-01-23T12:32:00Z"),
      entries: [
        { account: CARD, kind: "spending", amountCents: -32500, channel: "card", payee: "SAMPLE CAFE" },
      ],
      balances: [{ account: CARD, cents: 1200000 }],
      needsReview: false,
    },
  },
  {
    name: "Bank card: purchase abroad uses the given rate and is flagged for review",
    sender: "KCB",
    body: "USD 12.00 transaction made on KCB card 4000***0042 at SAMPLE STREAMING on 24/01/2026 02:10.",
    opts: { fxToKes: { USD: 129 } },
    expected: {
      status: "parsed",
      occurredAt: new Date("2026-01-23T23:10:00Z"),
      entries: [{ amountCents: -154800, originalCurrency: "USD", originalMinor: 1200 }],
      needsReview: true,
    },
  },
  {
    name: "Bank card: purchase abroad without a rate goes to review",
    sender: "KCB",
    body: "USD 12.00 transaction made on KCB card 4000***0042 at SAMPLE STREAMING on 24/01/2026 02:10.",
    expected: { status: "to_review", reason: "no exchange rate for USD" },
  },
  {
    name: "Bank card: ATM withdrawal is a transfer to cash",
    sender: "KCB",
    body: "KES 2,000.00 transaction made on KCB card 4000***0042 at ATM DEMO BRANCH on 25/01/2026 10:00. Avail balance KES 10,000.00",
    expected: {
      status: "parsed",
      entries: [
        { account: CARD, kind: "transfer", amountCents: -200000, channel: "withdrawal" },
        { account: CASH, kind: "transfer", amountCents: 200000 },
      ],
    },
  },
  {
    name: "Bank card: declined attempt is ignored",
    sender: "KCB",
    body: "KES 9,000.00 transaction made on KCB card 4000***0042 at SAMPLE STORE on 25/01/2026 11:00 was declined. Insufficient funds.",
    expected: { status: "ignored", reason: "declined card attempt" },
  },
  {
    name: "Bank: send to M-PESA, with fee and the M-PESA code as reference",
    sender: "KCB",
    body: "Completed. Your SEND TO M-PESA request of KES 3,000.00 from 1100000000 to 254700000101 - ALEX MOCKTON at 2026-01-26 09:15:00 AM has been processed. M-PESA REF: TSW3X4Y5Z6. Transaction cost KES 33.00.",
    expected: {
      status: "parsed",
      ref: "TSW3X4Y5Z6",
      occurredAt: new Date("2026-01-26T06:15:00Z"),
      entries: [
        {
          account: KCB,
          kind: "spending",
          amountCents: -300000,
          channel: "send",
          payee: "ALEX MOCKTON",
          dedupeKey: "bank:TSW3X4Y5Z6:main",
        },
        { account: KCB, amountCents: -3300, channel: "fee" },
      ],
    },
  },
  {
    name: "Bank: send to M-PESA, 'successfully transferred' wording",
    sender: "KCB",
    body: "Dear Customer, you have successfully transferred KES 1,500.00 to 254700000102-SAM PLEPERSON on 27/01/2026 at 12:00. Transaction Ref No TSX4Y5Z6A7. M-PESA Ref TSY5Z6A7B8.",
    expected: {
      status: "parsed",
      ref: "TSY5Z6A7B8",
      occurredAt: new Date("2026-01-27T09:00:00Z"),
      entries: [{ amountCents: -150000, payee: "SAM PLEPERSON" }],
    },
  },
  {
    name: "Bank: number-only copy of a send notice is ignored",
    sender: "KCB",
    body: "TSZ6A7B8C9 completed. KES 1,500.00 sent to M-PESA 254700000102 on 27/01/2026.",
    expected: { status: "ignored", reason: "number-only copy of a named send notice" },
  },
  {
    name: "Bank: account to card is a transfer between the two",
    sender: "KCB",
    body: "You have successfully transferred KES 5,000.00 from 1100000000 to card no. 4000***0042 reference number TSA7B8C9D1.",
    expected: {
      status: "parsed",
      ref: "TSA7B8C9D1",
      entries: [
        { account: KCB, kind: "transfer", amountCents: -500000 },
        { account: CARD, kind: "transfer", amountCents: 500000 },
      ],
    },
  },
  {
    name: "Bank: payment from the account",
    sender: "KCB",
    body: "TSB8C9D1E2 Completed. KES 450.00 paid to DEMO PHARMACY for account 123 on 28/01/2026. Transaction cost KES 0.00.",
    expected: {
      status: "parsed",
      ref: "TSB8C9D1E2",
      entries: [{ amountCents: -45000, channel: "till", payee: "DEMO PHARMACY" }],
    },
  },
  {
    name: "Bank: credit to the account, time in ISO form",
    sender: "KCB",
    body: "Your account has been credited with KES 25,000.00 at 2026-10-24 12:39:21 AM. Ref: TSC9D1E2F3.",
    expected: {
      status: "parsed",
      ref: "TSC9D1E2F3",
      occurredAt: new Date("2026-10-23T21:39:21Z"),
      entries: [{ account: KCB, kind: "income", amountCents: 2500000, channel: "deposit" }],
    },
  },
  {
    name: "Bank: money received from a person",
    sender: "KCB",
    body: "You have received KES 2,000.00 from SAMPLE FRIEND. Ref TSD1E2F3G4.",
    expected: {
      status: "parsed",
      ref: "TSD1E2F3G4",
      entries: [{ kind: "income", amountCents: 200000, payee: "SAMPLE FRIEND" }],
    },
  },
  {
    name: "Bank: money paid in from M-PESA",
    sender: "KCB",
    body: "Ksh 5,000.00 sent to account 1100000000 has been received on 29/01/2026 at 08:30. M-PESA Ref: TSE2F3G4H5.",
    expected: {
      status: "parsed",
      ref: "TSE2F3G4H5",
      entries: [{ kind: "income", amountCents: 500000, payee: "M-PESA" }],
    },
  },
  {
    name: "Bank: card payment notice is always reviewed",
    sender: "KCB",
    body: "Thank you for your card payment of KES 40,000.00 to card 4000***0042. Avail balance KES 41,000.00",
    expected: { status: "parsed", needsReview: true, entries: [{ kind: "income", amountCents: 4000000 }] },
  },
  {
    name: "Bank: KCB copy of an M-PESA loan repayment is ignored",
    sender: "KCB",
    body: "TSF3G4H5J6 Completed. Your KCB M-PESA LOAN REPAYMENT request of KES 3,100.00 at 2026-01-06 07:30:00 PM has been received successfully.",
    expected: { status: "ignored", reason: "copy of an M-PESA loan repayment" },
  },
  {
    name: "Bank: loan wording not handled yet goes to review",
    sender: "KCB",
    body: "Congratulations! Your KCB Mobile Loan of KES 10,000.00 has been approved and credited to your account. A facility fee of KES 500.00 was charged.",
    expected: { status: "to_review", source: "bank", amountCents: 1000000 },
  },
  {
    name: "Bank: a payment that was only initiated is ignored",
    sender: "KCB",
    body: "You have initiated a payment of KES 1,000.00 to SAMPLE STORE. Authorization code 654321.",
    expected: { status: "ignored", reason: "request, not a completed payment" },
  },

  // ---- Airtel Money ----
  {
    name: "Airtel Money: received",
    sender: "AirtelMoney",
    body: "TID: MP260110.1200.A00001. You have received Ksh 800.00 from SAMPLE FRIEND, 0730000001. Your Airtel Money balance is Ksh 1,800.00.",
    expected: {
      status: "parsed",
      source: "airtel",
      ref: "MP260110.1200.A00001",
      entries: [{ account: AIRTEL, kind: "income", amountCents: 80000, payee: "SAMPLE FRIEND" }],
      balances: [{ account: AIRTEL, cents: 180000 }],
    },
  },
  {
    name: "Airtel Money: sent, with charge",
    sender: "AirtelMoney",
    body: "TID: MP260110.1300.A00002. You have sent Ksh 300.00 to SAM PLEPERSON 0730000002. Charge Ksh 10.00. Your Airtel Money balance is Ksh 1,490.00.",
    expected: {
      status: "parsed",
      entries: [
        { amountCents: -30000, channel: "send", payee: "SAM PLEPERSON" },
        { amountCents: -1000, channel: "fee" },
      ],
    },
  },
  {
    name: "Airtel Money: paid to a merchant",
    sender: "AirtelMoney",
    body: "TID: MP260111.0900.A00003. You have paid Ksh 150.00 to DEMO SHOP. Your Airtel Money balance is Ksh 1,340.00.",
    expected: { status: "parsed", entries: [{ amountCents: -15000, channel: "till", payee: "DEMO SHOP" }] },
  },
  {
    name: "Airtel Money: withdrawal is a transfer to cash, plus charge",
    sender: "AirtelMoney",
    body: "TID: MP260111.1000.A00004. You have withdrawn Ksh 500.00 from agent DEMO AGENT. Charge Ksh 29.00. Your Airtel Money balance is Ksh 811.00.",
    expected: {
      status: "parsed",
      entries: [
        { account: AIRTEL, kind: "transfer", amountCents: -50000 },
        { account: CASH, kind: "transfer", amountCents: 50000 },
        { account: AIRTEL, kind: "spending", amountCents: -2900 },
      ],
    },
  },
  {
    name: "Airtel Money: unknown wording goes to review",
    sender: "AirtelMoney",
    body: "TID: MP260111.1100.A00005. Your loan of Ksh 1,000.00 has been processed.",
    expected: { status: "to_review", source: "airtel", ref: "MP260111.1100.A00005", amountCents: 100000 },
  },
];
