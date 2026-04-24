# Lola's Rentals — Standard Operating Procedures

**Version:** 1.0
**Date:** April 2026
**Applies to:** All Lola's Rentals staff

---

## Table of Contents

1. Business Overview
2. System Access & User Roles
3. Vehicle Fleet & Types
4. Vehicle Policies & Customer Rules
5. Add-Ons & Optional Extras
6. Pricing & Quote Calculation
7. Customer Booking Process (Website)
8. Staff: Inbox — Processing Incoming Bookings
9. Staff: Walk-In Bookings
10. Staff: Managing Active Orders
11. Staff: Settling an Order (Return)
12. Payments & Accounting
13. Fleet Management
14. Maintenance
15. Transfers (Airport / Pickup Shuttles)
16. Telegram Notifications
17. Daily Operations Schedule
18. Settings & Configuration

---

## 1. Business Overview

Lola's Rentals is a vehicle hire business operating in the Philippines, serving primarily tourist and island visitors. The business offers scooter and TukTuk rentals, with optional add-ons such as delivery & collection, late return, surf racks, and damage cover (Peace of Mind).

The business operates across one or more store locations. All operational activity is managed through a web-based back office system, with a customer-facing booking website for direct reservations.

---

## 2. System Access & User Roles

### 2.1 Logging In

Staff access the back office at the designated internal URL. Login requires a **username** and **PIN**.

### 2.2 Roles & Permissions

Access to features is controlled by roles. The key permission areas are:

| Permission | What it allows |
|---|---|
| `can_view_inbox` | View unprocessed bookings in the Inbox |
| `can_view_active` | View active (live) orders |
| `can_view_completed` | View settled/completed orders |
| `can_edit_orders` | Process, activate, modify, and settle orders |
| `can_cancel_orders` | Cancel orders in the inbox queue |
| `can_view_fleet` | View the vehicle fleet |
| `can_edit_fleet` | Edit fleet records, statuses, purchases, sales |
| `can_view_fleet_book_value` | View fleet utilisation and financial book values |
| `can_view_maintenance` | View maintenance jobs |
| `can_edit_expenses` | Log and edit expense records |
| `can_edit_transfers` | Manage transfer jobs |
| `can_manage_employees` | Create and manage employee records |
| `can_view_payroll` | Access payroll information |
| `can_edit_settings` | Change system configuration (locations, add-ons, pricing, roles, users) |
| `can_view_dashboard` | View the operations dashboard |
| `can_manage_todo` | Manage to-do tasks |
| `can_override_cashup` | Override cash-up entries |

Roles are assigned by an Admin via **Settings → Roles & Users**.

### 2.3 Store Scope

Each staff member's account is linked to one or more stores. Data (orders, fleet, customers) is automatically filtered to the stores the user has access to.

---

## 3. Vehicle Fleet & Types

### 3.1 Scooter — Honda Beat

- **Engine:** 110cc, automatic
- **Helmets:** Included (legally required); a second helmet can be requested during booking
- **Surf Rack:** Available as an optional add-on
- **Riding Lesson:** Available free of charge if the customer needs one — no obligation to rent if confidence is not established
- **Inclusions:** Helmets, rain coats, dry bag, first aid kit, mini cool box, umbrella
- **Paw Card:** Not included (TukTuk only)

### 3.2 TukTuk — Bajaj RE

- **Engine:** 250cc, manual
- **Lesson:** Mandatory for every customer before hire — no exceptions
- **Helmets:** Not required (enclosed vehicle) — do not apply scooter helmet rules
- **Surf Rack / Bungee Cord:** Not available
- **Surfboard:** Cannot be carried
- **Inclusions:** Rain coats, dry bag, first aid kit, mini cool box, umbrella, **Paw Card** (discount card for local establishments)
- **Note:** TukTuk lesson must happen before the vehicle is handed over

### 3.3 Fleet Records

Each physical vehicle has a record in the system containing:

- Vehicle name / nickname (e.g. Garlic, Cookie, Pikachu, Pepper)
- Model, plate number
- Status (see Section 3.4)
- Odometer / mileage
- OR/CR details
- Financial fields (purchase cost, depreciation, book value)

### 3.4 Fleet Statuses

| Status | Meaning | Can be rented? |
|---|---|---|
| Available | Ready to assign | Yes |
| Active | Currently on a live rental | No |
| Under Maintenance | Being serviced / repaired | No |
| Service Vehicle | Used internally | No |
| Pending ORCR | Awaiting registration renewal | No |
| Closed | Retired / decommissioned | No |
| Sold | Disposed of | No |

Only vehicles with status **Available** can be assigned to a booking.

---

## 4. Vehicle Policies & Customer Rules

### 4.1 Helmets

- Helmets are **included** with every scooter rental
- Wearing a helmet is **required by law** on two-wheeled vehicles
- A second helmet can be added during the booking process
- Helmets do **not** apply to TukTuk rentals

### 4.2 Riding Lessons

- **TukTuk:** A lesson is **mandatory** before every hire
- **Scooter:** A free lesson is offered to any customer who wants one
- If either party is not confident, do not proceed with the rental

### 4.3 Driving Licence & IDP

- A standard domestic driving licence is acceptable in the Philippines
- An International Driving Permit (IDP) is **not mandatory** in the Philippines
- Customers travelling to other South-East Asian countries may be asked to show an IDP — staff should direct them to the affiliate IDP link on the website or confirmation page

### 4.4 Blacklisting

Customers can be flagged as **blacklisted** in the system. Always check customer notes and blacklist status before activating a booking for a new or returning customer.

---

## 5. Add-Ons & Optional Extras

Add-ons are priced either **per day** or as a **one-time** fee. Some add-ons apply only to specific vehicle models.

### 5.1 Scooter Add-Ons

| Add-On | Type | Notes |
|---|---|---|
| Peace of Mind (Damage Cover) | Per day | Optional damage protection |
| Surf Rack | One-time | Not available on TukTuk |
| Bungee Cord | One-time | Not available on TukTuk |
| Delivery & Collection | One-time | Location-based fee (see Section 6) |
| Late Return (9 PM) | One-time | Extends return window; affects staffing |
| Second Helmet | Per day or one-time | Request in basket |

### 5.2 TukTuk Add-Ons

| Add-On | Type | Notes |
|---|---|---|
| Peace of Mind (Damage Cover) | Per day | |
| Delivery & Collection | One-time | |
| Late Return (9 PM) | One-time | |

### 5.3 Mutual Exclusivity

Certain add-ons are mutually exclusive — selecting one automatically prevents another from being added. This is enforced by the system at the quote and booking stage.

### 5.4 Modifying Add-Ons on an Active Order

Staff with `can_edit_orders` can add or remove add-ons on a live order via the **Order Detail → Add-Ons** section. Changes are reflected in the order total and accounting immediately.

---

## 6. Pricing & Quote Calculation

### 6.1 Rental Days

Rental days are calculated as the **ceiling** of the number of days between pickup and dropoff datetimes, with a minimum of 1 day. For example, a 1.2-day rental is billed as 2 days.

### 6.2 Daily Rate

Each vehicle model has tiered daily rates configured per store:

- Rates are set with a **minimum and maximum number of days** bracket
- The system selects the correct tier based on the number of rental days
- Rates are configured in **Settings → Vehicle Models → Pricing**

### 6.3 Location Fees

- A **delivery cost** applies if the vehicle is delivered to the customer's pickup location
- A **collection cost** applies if the vehicle is collected from the customer's dropoff location
- These fees are set per location in **Settings → Locations**

### 6.4 Add-On Totals

- Per-day add-ons: `price × rental days`
- One-time add-ons: `price × quantity`

### 6.5 Security Deposit

- Each vehicle model has a set security deposit amount
- The deposit is tracked separately from the rental total
- It is collected at or before activation and refunded at return (subject to condition)

### 6.6 Payment Method Surcharge

Some payment methods carry a surcharge percentage (e.g. card payments). This is added to the order total where applicable and configured in **Settings → Payment Methods**.

### 6.7 Other Order Line Items

| Item | Description |
|---|---|
| Tips | Discretionary; added at settlement |
| Charity Donation | Optional "Be Pawsitive" contribution |
| Card Fee Surcharge | Auto-applied based on payment method |
| Return Charges | Damage or late fees added at settlement |
| Balance Due | Outstanding amount after deposits/part-payments |

---

## 7. Customer Booking Process (Website)

### 7.1 Overview

Customers book directly on the Lola's Rentals website. The process is:

1. **Browse** available vehicles for their dates
2. **Select** a vehicle model
3. **Choose** pickup and dropoff locations and times
4. **Add** optional extras (add-ons)
5. **Add** a transfer (airport shuttle) if required
6. **Checkout** — provide name, contact details, and payment method
7. **Receive** a booking confirmation with an order reference

### 7.2 Booking Holds

When a customer selects dates, the system places a temporary **booking hold** on the vehicle model and store. This hold expires automatically if the customer does not complete checkout. Holds prevent double-booking during the session.

### 7.3 Booking Confirmation

On completion, the customer receives:
- An order reference number
- An IDP information link (if relevant)
- Pickup instructions

### 7.4 Customer Self-Service

Customers can:
- **Look up** their booking by order reference
- **Cancel** their booking via the website (using their order reference)
- **Extend** their rental online (via the extension flow)
- **Sign** their digital waiver

### 7.5 What Happens in the System

A completed customer booking creates an **unprocessed** record in the inbox queue (`orders_raw`), ready for staff to review and activate.

---

## 8. Staff: Inbox — Processing Incoming Bookings

### 8.1 What is the Inbox?

The Inbox (`Operations → Inbox`) contains all **unprocessed** bookings — both customer website bookings and any manually queued entries. Requires `can_view_inbox` permission.

### 8.2 Processing a Booking

Processing converts an unprocessed inbox record into a **live active order** with vehicles assigned and accounting posted. This requires `can_edit_orders`.

**Steps:**

1. Navigate to **Operations → Inbox**
2. Open the booking by clicking on it
3. The processing modal has multiple steps:

   **Step 1 — Review**
   - Check customer name, contact details, dates, times, pickup/dropoff locations
   - Confirm the **dropoff location note** if the customer specified a meeting point beyond the preset location (e.g. "Bravo Resort")
   - Review add-ons and total

   **Step 2 — Vehicles**
   - Assign a specific available vehicle from the fleet to the booking
   - Only vehicles with status **Available** are shown

   **Step 3 — Add-Ons**
   - Confirm or adjust add-ons
   - Check for any model-specific restrictions

   **Step 4 — Summary**
   - Review the full order summary including pricing, fees, deposit, and totals
   - Confirm payment method and any amounts already received

4. Click **Process** (or **Activate**)
5. The system will:
   - Create the live order
   - Update the assigned vehicle's status to **Active**
   - Post the opening accounting journal entries
   - Send a notification to the **Lola's Ops** Telegram channel

### 8.3 Cancelling an Inbox Item

If a booking needs to be cancelled before processing:
- Requires `can_cancel_orders`
- Open the inbox record and select **Cancel**
- The booking is marked as cancelled and the record is removed from the active queue

### 8.4 Dropoff Location Note

If the customer's dropoff location is a preset (e.g. "General Luna") but the exact meeting point is specific (e.g. "outside Bravo Resort"), staff should enter this in the **Dropoff Location Note** field. This note appears in Telegram ops messages and is visible to the relevant staff.

---

## 9. Staff: Walk-In Bookings

### 9.1 Walk-In Direct (Preferred)

Used when a customer arrives in person and the rental is to start immediately or is being set up on the spot.

1. Navigate to **Operations → Walk-In** (or equivalent menu item)
2. Select **Walk-In Direct**
3. Enter:
   - Customer details (name, mobile, email)
   - Vehicle model and specific vehicle
   - Pickup and dropoff dates/times
   - Pickup and dropoff locations
   - Add-ons
   - Payment details
4. Submit — the system **creates and immediately activates** the order in one step
5. A Telegram notification is sent to **Lola's Ops**

### 9.2 Walk-In to Inbox

An alternative path creates the record as an **unprocessed inbox entry** without immediately activating it. Use this if you need to queue the booking for review before confirming.

### 9.3 Key Difference

| Path | Outcome |
|---|---|
| Walk-In Direct | Order created and activated immediately |
| Walk-In to Inbox | Order queued as unprocessed for later review |

---

## 10. Staff: Managing Active Orders

### 10.1 Active Orders List

Navigate to **Operations → Active** to see all currently live rentals. Requires `can_view_active`.

Each order shows:
- Customer name
- Vehicle(s) assigned
- Pickup and dropoff dates/times
- Pickup and dropoff locations
- Add-ons
- Outstanding balance

### 10.2 Order Detail Modal

Click an order to open the detail modal. Tabs include:

- **Summary** — full order financials and status
- **Payments** — all payment records
- **Vehicles** — assigned vehicle(s)
- **Add-Ons** — current add-ons and totals
- **Extensions** — any date extensions applied
- **Transfers** — linked transfer job (if applicable)
- **History** — audit log of all changes

### 10.3 Adjusting Dates

If the customer extends or changes their rental dates:

1. Open the order → **Adjust Dates**
2. Enter new pickup and/or dropoff datetimes
3. The system recalculates rental days and totals
4. Confirm the change

### 10.4 Swapping a Vehicle

If a vehicle needs to be replaced mid-rental:

1. Open the order → **Swap Vehicle**
2. Select the replacement vehicle (must be Available)
3. The original vehicle is released; the new vehicle is set to Active
4. A swap record is logged in the system

### 10.5 Modifying Add-Ons

1. Open the order → **Add-Ons**
2. Add or remove add-ons as required
3. The order total updates automatically

### 10.6 Collecting a Payment

To record a payment received during an active rental:

1. Open the order → **Payments** → **Collect Payment**
2. Enter the amount, payment method, and date
3. The balance due on the order updates accordingly

### 10.7 Editing the Dropoff Location Note

If the exact return meeting point changes:

1. Open the order
2. Edit the **Dropoff Location Note** field
3. Save — the updated note is reflected in ops messaging

### 10.8 Late Returns

If a customer has selected the **Late Return (9 PM)** add-on, the return is expected at 9 PM instead of the standard time. Ensure relevant staff are aware for scheduling purposes. This is visible on the active order and in the daily Telegram briefing.

---

## 11. Staff: Settling an Order (Return)

Settlement is the process of closing a rental when the vehicle is returned. Requires `can_edit_orders`.

### 11.1 Settlement Steps

1. Navigate to **Operations → Active**
2. Open the order to be settled
3. Click **Settle Order**
4. In the settlement flow:

   **Condition Check**
   - Note any damage or issues in the **Return Condition** field
   - If damage charges apply, enter the **Return Charges** amount

   **Final Payments**
   - Confirm or collect any outstanding balance
   - Record the deposit refund (or retention if damage charges apply)
   - Select payment method for any final amounts

   **Tips & Charity**
   - Record any tip amount
   - Record any charity donation if applicable

5. Confirm settlement

### 11.2 What the System Does at Settlement

- Order status changes to **Completed**
- Vehicle status returns to **Available**
- Final accounting journal entries are posted
- `settled_at` timestamp is recorded
- Balance due is recalculated and finalised

### 11.3 Completed Orders

Settled orders move to **Operations → Completed**. Requires `can_view_completed` to view.

---

## 12. Payments & Accounting

### 12.1 Payment Methods

Payment methods are configured in **Settings → Payment Methods**. Each has:
- A name (e.g. Cash, Card, Maya Online)
- An optional surcharge percentage
- A flag for whether it is eligible for deposits

### 12.2 Maya Online Payments

The system supports online card payments via **Maya**. A Maya checkout is created when a customer pays online. The system tracks checkout status: `pending → paid / payment_failed / payment_expired`. Staff do not need to manually process Maya payments — the webhook updates the order automatically.

### 12.3 Card Settlements

Card transactions are matched against daily settlement reports in **Finance → Card Settlements**. Requires `can_view_card_settlements`.

### 12.4 Cash Up

End-of-day cash reconciliation is performed in **Finance → Cash Up**. Requires appropriate permission. An override permission (`can_override_cashup`) is needed to adjust locked entries.

### 12.5 Journal Entries

All financial transactions (activation, payments, settlement) are posted as double-entry journal entries. These are visible in **Finance → Accounts** for users with `can_view_accounts`.

### 12.6 Chart of Accounts

Accounts are configured in **Settings → Chart of Accounts**. Key accounts used in the rental flow include receivables and rental income categories. If accounts are missing, activation may display a warning — contact an Admin to configure missing accounts.

---

## 13. Fleet Management

### 13.1 Viewing the Fleet

Navigate to **Fleet** in the sidebar. Requires `can_view_fleet`.

The fleet list shows all vehicles, their current status, model, and key details.

### 13.2 Fleet Calendar

The **Fleet Calendar** shows which vehicles are assigned to which dates. Use this to identify availability and plan future assignments.

### 13.3 Utilisation Dashboard

Requires `can_view_fleet_book_value`. Shows financial utilisation metrics per vehicle.

### 13.4 Editing a Vehicle Record

Requires `can_edit_fleet`. Staff can update:
- Status (e.g. move to Under Maintenance)
- Odometer / mileage
- OR/CR dates
- Financial details (for Admins)

### 13.5 Purchasing and Selling Fleet

Fleet additions and disposals are logged via the fleet purchase/sale flows in **Fleet → Actions**. Requires `can_edit_fleet`.

---

## 14. Maintenance

### 14.1 Logging a Maintenance Job

1. Navigate to **Fleet → Maintenance**
2. Click **New Maintenance**
3. Enter:
   - Vehicle
   - Work type (from configured maintenance types)
   - Description / parts / labour
   - Status: **Reported** or **In Progress** (if work begins immediately, it may go straight to In Progress)
4. Save

The system sends a notification to the **Lola's Maintenance** Telegram channel when a job is created.

### 14.2 Updating a Maintenance Job

1. Open the maintenance record
2. Update status: **Reported → In Progress → Completed**
3. Save

A Telegram notification is sent to **Lola's Maintenance** when the status changes.

### 14.3 Maintenance Statuses

| Status | Meaning |
|---|---|
| Reported | Issue logged, not yet started |
| In Progress | Work underway |
| Completed | Job finished; vehicle can return to Available |

Remember to update the vehicle's fleet status manually when returning it to service (or this may be handled as part of completing the maintenance record, depending on configuration).

---

## 15. Transfers (Airport / Pickup Shuttles)

Transfers are separate from vehicle rentals and have their own workflow.

### 15.1 What is a Transfer?

A transfer is a paid shuttle service (e.g. airport pickup or drop-off). Customers can add a transfer when booking on the website, or staff can create them manually.

### 15.2 Managing Transfers

Navigate to **Operations → Transfers**. Requires `can_edit_transfers` to edit.

Each transfer record includes:
- Customer and contact details
- Route (from the configured transfer routes)
- Date and time
- Payment status and method
- Driver assignment

### 15.3 Transfer Pricing

Transfer pricing is based on configured **Transfer Routes**. Routes and costs are set in **Settings**.

---

## 16. Telegram Notifications

The system sends automated notifications to several Telegram channels. These are sent by the Lola's Rentals Bot.

### 16.1 Channels

| Channel | What is posted |
|---|---|
| Lola's Ops | Booking activations (walk-in and inbox), order details |
| Lola's Fleet | Fleet-related updates |
| Lola's Daily Updates | Morning briefing (7 AM) and evening snapshot (6 PM) |
| Lola's Maintenance | New maintenance jobs and status changes |

### 16.2 Order Activated Message (Ops)

When a booking is activated, the Ops channel receives a message containing:
- Customer name
- Vehicle(s) assigned
- Pickup and dropoff datetimes
- Pickup and dropoff location labels
- Dropoff location note (if set)
- Add-ons
- Transfer details (if applicable)
- Charity donation (if applicable)
- Order total

### 16.3 Daily Briefing (7 AM Manila Time)

The morning briefing includes:
- Active rentals (vehicles out)
- Inbox count (unprocessed bookings awaiting action)
- Outstanding balances on active orders
- Returns due today (including return locations)
- Any Late Return (9 PM) bookings
- Tomorrow's availability

### 16.4 Evening Snapshot (6 PM Manila Time)

The 6 PM message provides an updated picture of:
- Returns due and vehicle availability for planning next-day staffing

### 16.5 Troubleshooting Telegram

If Telegram messages are not sending:
- Verify that the `TELEGRAM_BOT_TOKEN` and channel IDs are correctly set in the server environment configuration
- On localhost/development environments, Telegram sends are silently skipped if configuration is missing — this is expected

---

## 17. Daily Operations Schedule

### 17.1 Morning (before or around 9 AM)

1. Check the **7 AM Telegram briefing** for the day's overview
2. Review **Operations → Inbox** for any overnight or early bookings — process any that are ready
3. Check **Operations → Active** for returns due today; confirm return times and locations with customers if needed
4. Ensure vehicles due back are inspected and returned to Available status promptly

### 17.2 During the Day

1. Process new inbox bookings as they arrive
2. Handle walk-in customers promptly — use the Walk-In Direct flow
3. Record any payments collected
4. Log any maintenance issues as they arise
5. Action the to-do list (**Operations → To Do**)

### 17.3 Evening

1. Check the **6 PM Telegram snapshot** for any last-minute issues
2. Confirm any **Late Return (9 PM)** bookings are staffed and expected
3. Settle any returned orders for the day
4. Complete **Finance → Cash Up** if applicable
5. Ensure all vehicle statuses are up to date in the fleet list

---

## 18. Settings & Configuration

All settings changes require `can_edit_settings`. Navigate to **Settings** in the sidebar.

### 18.1 Locations

Add or edit delivery and collection locations. Each location has:
- A display name
- A delivery cost (charged to customer for pickup at that location)
- A collection cost (charged to customer for dropoff at that location)
- Store assignment

### 18.2 Vehicle Models & Pricing

- Add or edit vehicle models (e.g. Honda Beat, Bajaj RE)
- Set the security deposit per model
- Configure tiered daily rates per model per store (min days → max days → daily rate)

### 18.3 Add-Ons

Add or edit add-ons:
- Name and pricing (per day or one-time)
- Applicable vehicle models (leave blank for all models)
- Mutual exclusivity group (if applicable)

### 18.4 Payment Methods

Configure:
- Payment method name
- Surcharge percentage (e.g. card fee)
- Whether it is eligible for taking deposits

### 18.5 Roles & Users

- Create and edit staff roles, assigning permission sets
- Create or deactivate user accounts and assign roles
- Users can be linked to one or more stores

### 18.6 Stores

Configure store-level settings including public booking token (for the customer website) and cash float defaults.

### 18.7 Chart of Accounts

Maintain the accounts used for journal entries. Ensure rental income and receivable accounts are correctly configured — missing accounts will cause warnings at activation.

---

*End of Standard Operating Procedures*

*For technical issues with the back office system, contact your system administrator.*
