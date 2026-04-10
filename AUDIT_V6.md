# AUDIT_V6 — Lola's Rentals Platform System Audit

**Generated:** 2026-04-10  
**Highest migration:** `061_fleet_odometer.sql`  
**Missing migrations:** `028_*.sql` and `029_*.sql` do not exist in the migrations folder (sequence jumps 027 → 030).

---

## 1. DATABASE

### 1.1 Current Migration Number

| # | File | Subject |
|---|------|---------|
| 001 | `001_initial_schema.sql` | Core tables: stores, roles, employees, users |
| 002 | `002_config_tables.sql` | Config/lookup tables |
| 003 | `003_core_entities.sql` | Customers, fleet, orders, order_items, order_addons |
| 004 | `004_payments_and_accounting.sql` | Payments, journal_entries, card_settlements, cash_reconciliation |
| 005 | `005_hr_and_operations.sql` | Timesheets, cash_advance_schedules, maintenance, expenses, transfers |
| 006 | `006_remaining_tables.sql` | misc_sales, lost_opportunity, todo_tasks, todo_comments, paw_card_entries, ui_errors |
| 007 | `007_new_functionality.sql` | merchandise, reviews, recurring_bills, directory |
| 008 | `008_triggers_and_indexes.sql` | Triggers + 25 indexes |
| 009 | `009_rls_policies.sql` | RLS helper functions; policies |
| 010 | `010_enable_realtime.sql` | Realtime publication |
| 011 | `011_orders_raw.sql` | orders_raw table |
| 012 | `012_payment_surcharge.sql` | ADD COLUMN payment_methods.surcharge_percent |
| 013 | `013_order_payments.sql` | order_payments table (dropped in 015) |
| 014 | `014_orders_woo_order_id.sql` | ADD COLUMN orders.woo_order_id |
| 015 | `015_consolidate_payments.sql` | DROP order_payments; ADD payments.raw_order_id |
| 016 | `016_fix_fleet_statuses.sql` | Data: fix fleet_statuses values |
| 017 | `017_store_default_float.sql` | ADD COLUMN stores.default_float_amount |
| 018 | `018_card_settlements_update.sql` | ALTER card_settlements.id to text; ADD payment_id |
| 019 | `019_store_booking_token.sql` | ADD COLUMN stores.booking_token, stores.public_booking_enabled |
| 020 | `020_stores_default_float_if_missing.sql` | Idempotent re-add of stores.default_float_amount |
| 021 | `021_merchandise_low_stock_threshold.sql` | ADD COLUMN merchandise.low_stock_threshold |
| 022 | `022_payment_routing_rules.sql` | payment_routing_rules table; ADD stores.card_fee_account_id, stores.default_cash_account_id |
| 023 | `023_drop_routing_income_account.sql` | DROP payment_routing_rules.income_account_id |
| 024 | `024_task_accountability.sql` | task_categories, task_events, task_notifications; ADD todo_tasks cols |
| 025 | `025_leave_reset_log.sql` | leave_reset_log table |
| 026 | `026_company_store.sql` | Data: insert company store |
| 027 | `027_consolidate_company_accounts.sql` | Data migration: account remapping |
| ~~028~~ | *(missing)* | — |
| ~~029~~ | *(missing)* | — |
| 030 | `030_paw_card_enhancements.sql` | ADD COLUMN paw_card_entries.receipt_url |
| 031 | `031_paw_card_savings_logs_view_rls.sql` | CREATE VIEW savings_logs |
| 032 | `032_paw_card_establishments_public_read.sql` | RLS policy only |
| 033 | `033_paw_card_order_id_default.sql` | FUNCTION paw_card_assign_order_id (trigger) |
| 034 | `034_paw_card_paw_reference_and_order_lookup_rls.sql` | ADD paw_card_entries.paw_reference; FUNCTION paw_card_assign_paw_reference |
| 035 | `035_orders_raw_direct_booking_columns.sql` | ADD orders_raw: booking_channel, customer fields, dates, locations, store_id, order_reference, addon_ids |
| 036 | `036_booking_holds.sql` | booking_holds table |
| 037 | `037_vehicle_models_security_deposit.sql` | ADD COLUMN vehicle_models.security_deposit |
| 038 | `038_orders_raw_transfer_fields.sql` | ADD orders_raw: transfer_type, flight_number, transfer_route, flight_arrival_time |
| 039 | `039_repair_costs.sql` | repair_costs table |
| 040 | `040_addons_applicable_model_ids.sql` | ADD COLUMN addons.applicable_model_ids |
| 041 | `041_charity_donation.sql` | ADD COLUMN orders_raw.charity_donation |
| 042 | `042_orders_raw_web_payment_method.sql` | ADD COLUMN orders_raw.web_payment_method |
| 043 | `043_edit_permissions.sql` | Data: role_permissions insert |
| 044 | `044_dashboard_permission.sql` | Data: role_permissions insert |
| 045 | `045_expense_transactions.sql` | RPC create_expense_with_journal, delete_expense_with_journal |
| 046 | `046_card_settlement_transaction.sql` | RPC match_card_settlement |
| 047 | `047_cashup_transaction.sql` | RPC reconcile_cash_atomic |
| 048 | `048_payroll_transaction.sql` | RPC run_payroll_atomic |
| 049 | `049_order_activation_transaction.sql` | RPC activate_order_atomic |
| 050 | `050_expense_status.sql` | Replaced create_expense_with_journal; RPC pay_expenses_atomic; ADD expenses.status, expenses.paid_at |
| 051 | `051_directory_columns.sql` | ADD directory: category, bank_name, bank_account_number, address, notes |
| 052 | `052_transfer_routes_pricing_type.sql` | ADD COLUMN transfer_routes.pricing_type |
| 053 | `053_before_close_tables.sql` | late_return_assignments table; ADD employees.default_payment_method |
| 054 | `054_budget.sql` | budget_periods, budget_lines tables |
| 055 | `055_atomic_extend_cancel.sql` | RPCs cancel_order_raw_atomic, confirm_extend_raw_atomic, confirm_extend_order_atomic |
| 056 | `056_cancel_orders_permission.sql` | Data: role_permissions insert |
| 057 | `057_reviews_cms.sql` | ADD reviews: is_active, reviewer_role, sort_order |
| 058 | `058_rls_missing_tables.sql` | RLS policies for previously uncovered tables |
| 059 | `059_waivers.sql` | waivers table |
| 060 | `060_inspections.sql` | inspection_items, inspections, inspection_results tables |
| **061** | `061_fleet_odometer.sql` | ADD COLUMN fleet.odometer (**latest**) |

---

### 1.2 All Tables — Columns and Types

#### `stores`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| location | text | | | |
| is_active | boolean | NOT NULL | true | |
| default_float_amount | numeric(12,2) | NOT NULL | 3000 | (added 017/020) |
| booking_token | text | | — | UNIQUE, NOT NULL after backfill (019) |
| public_booking_enabled | boolean | NOT NULL | false | (019) |
| card_fee_account_id | text | | | REFERENCES chart_of_accounts(id) (022) |
| default_cash_account_id | text | | | REFERENCES chart_of_accounts(id) (022) |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `roles`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | UNIQUE |
| created_at | timestamptz | NOT NULL | now() | |

#### `role_permissions`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| role_id | text | NOT NULL | — | REFERENCES roles(id) ON DELETE CASCADE |
| permission | text | NOT NULL | — | |
| (composite) | | | | PRIMARY KEY (role_id, permission) |

#### `employees`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| store_id | text | | | REFERENCES stores(id) |
| full_name | text | NOT NULL | — | |
| role | text | | | |
| status | text | NOT NULL | 'Active' | |
| birthday | date | | | |
| emergency_contact_name | text | | | |
| emergency_contact_number | text | | | |
| start_date | date | | | |
| probation_end_date | date | | | |
| rate_type | text | | | CHECK IN ('daily','monthly') |
| basic_rate | numeric(12,2) | NOT NULL | 0 | |
| overtime_rate | numeric(12,2) | NOT NULL | 0 | |
| nine_pm_bonus_rate | numeric(12,2) | NOT NULL | 0 | |
| commission_rate | numeric(8,4) | NOT NULL | 0 | |
| paid_as | text | | | |
| monthly_bike_allowance | numeric(12,2) | NOT NULL | 0 | |
| bike_allowance_used | numeric(12,2) | NOT NULL | 0 | |
| bike_allowance_accrued | numeric(12,2) | NOT NULL | 0 | |
| available_balance | numeric(12,2) | NOT NULL | 0 | |
| thirteenth_month_accrued | numeric(12,2) | NOT NULL | 0 | |
| current_cash_advance | numeric(12,2) | NOT NULL | 0 | |
| holiday_allowance | integer | NOT NULL | 0 | |
| holiday_used | integer | NOT NULL | 0 | |
| sick_allowance | integer | NOT NULL | 0 | |
| sick_used | integer | NOT NULL | 0 | |
| sss_no | text | | | |
| philhealth_no | text | | | |
| pagibig_no | text | | | |
| tin | text | | | |
| sss_deduction_amt | numeric(12,2) | NOT NULL | 0 | |
| philhealth_deduction_amt | numeric(12,2) | NOT NULL | 0 | |
| pagibig_deduction_amt | numeric(12,2) | NOT NULL | 0 | |
| default_payment_method | text | NOT NULL | 'cash' | CHECK IN ('cash','gcash','bank_transfer') (053) |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `users`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| username | text | NOT NULL | — | UNIQUE |
| pin_hash | text | NOT NULL | — | |
| employee_id | text | NOT NULL | — | REFERENCES employees(id) |
| role_id | text | NOT NULL | — | REFERENCES roles(id) |
| is_active | boolean | NOT NULL | true | |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `chart_of_accounts`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| account_type | text | NOT NULL | — | CHECK IN ('Asset','Liability','Income','Expense','Equity') |
| store_id | text | | | REFERENCES stores(id) |
| is_active | boolean | NOT NULL | true | |
| created_at | timestamptz | NOT NULL | now() | |

#### `addons`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| price_per_day | numeric(12,2) | NOT NULL | 0 | |
| price_one_time | numeric(12,2) | NOT NULL | 0 | |
| addon_type | text | NOT NULL | — | CHECK IN ('per_day','one_time') |
| store_id | text | | | REFERENCES stores(id) |
| mutual_exclusivity_group | text | | | |
| is_active | boolean | NOT NULL | true | |
| applicable_model_ids | text[] | | NULL | (040) |

#### `locations`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| delivery_cost | numeric(12,2) | NOT NULL | 0 | |
| collection_cost | numeric(12,2) | NOT NULL | 0 | |
| location_type | text | | | |
| store_id | text | | | REFERENCES stores(id) |
| is_active | boolean | NOT NULL | true | |

#### `payment_methods`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| is_deposit_eligible | boolean | NOT NULL | true | |
| is_active | boolean | NOT NULL | true | |
| surcharge_percent | numeric(5,2) | NOT NULL | 0 | (012) |

#### `vehicle_models`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| is_active | boolean | NOT NULL | true | |
| security_deposit | numeric(12,2) | NOT NULL | 0 | (037) |

#### `vehicle_model_pricing`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| model_id | text | NOT NULL | — | REFERENCES vehicle_models(id) |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| min_days | integer | NOT NULL | — | |
| max_days | integer | NOT NULL | — | |
| daily_rate | numeric(12,2) | NOT NULL | — | |
| (unique) | | | | UNIQUE (model_id, store_id, min_days) |

#### `fleet_statuses`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| is_rentable | boolean | NOT NULL | false | |

#### `expense_categories`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| main_category | text | | | |
| account_id | text | | | REFERENCES chart_of_accounts(id) |
| is_active | boolean | NOT NULL | true | |

#### `transfer_routes`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| route | text | NOT NULL | — | |
| van_type | text | | | |
| price | numeric(12,2) | NOT NULL | — | |
| store_id | text | | | REFERENCES stores(id) |
| is_active | boolean | NOT NULL | true | |
| pricing_type | text | NOT NULL | 'fixed' | CHECK IN ('fixed','per_head') (052) |
| (unique) | | | | UNIQUE (route, van_type, store_id) |

#### `day_types`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |

#### `paw_card_establishments`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| is_active | boolean | NOT NULL | true | |

#### `maintenance_work_types`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| is_active | boolean | NOT NULL | true | |

#### `leave_config`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) UNIQUE |
| reset_month | integer | NOT NULL | 1 | CHECK 1–12 |
| reset_day | integer | NOT NULL | 1 | CHECK 1–31 |
| default_holiday_allowance | integer | NOT NULL | 5 | |
| default_sick_allowance | integer | NOT NULL | 5 | |

#### `customers`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| store_id | text | | | REFERENCES stores(id) |
| name | text | NOT NULL | — | |
| email | text | | | |
| mobile | text | | | |
| total_spent | numeric(12,2) | NOT NULL | 0 | |
| notes | text | | | |
| blacklisted | boolean | NOT NULL | false | |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `fleet`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| name | text | NOT NULL | — | |
| model_id | text | | | REFERENCES vehicle_models(id) |
| plate_number | text | | | |
| gps_id | text | | | |
| status | text | NOT NULL | 'Available' | |
| current_mileage | numeric(10,1) | NOT NULL | 0 | |
| orcr_expiry_date | date | | | |
| surf_rack | boolean | NOT NULL | false | |
| owner | text | | | |
| rentable_start_date | date | | | |
| registration_date | date | | | |
| purchase_price | numeric(12,2) | | | |
| purchase_date | date | | | |
| set_up_costs | numeric(12,2) | NOT NULL | 0 | |
| total_bike_cost | numeric(12,2) | NOT NULL | 0 | |
| useful_life_months | integer | | | |
| salvage_value | numeric(12,2) | NOT NULL | 0 | |
| accumulated_depreciation | numeric(12,2) | NOT NULL | 0 | |
| book_value | numeric(12,2) | NOT NULL | 0 | |
| date_sold | date | | | |
| sold_price | numeric(12,2) | | | |
| profit_loss | numeric(12,2) | | | |
| odometer | integer | | | (061) |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `orders`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| customer_id | text | | | REFERENCES customers(id) |
| employee_id | text | | | REFERENCES employees(id) |
| order_date | date | NOT NULL | — | |
| status | text | NOT NULL | 'unprocessed' | CHECK IN ('unprocessed','active','confirmed','completed','cancelled') |
| web_notes | text | | | |
| quantity | integer | NOT NULL | 1 | |
| web_quote_raw | numeric(12,2) | | | |
| security_deposit | numeric(12,2) | NOT NULL | 0 | |
| deposit_status | text | | | |
| card_fee_surcharge | numeric(12,2) | NOT NULL | 0 | |
| return_charges | numeric(12,2) | NOT NULL | 0 | |
| final_total | numeric(12,2) | NOT NULL | 0 | |
| balance_due | numeric(12,2) | NOT NULL | 0 | |
| payment_method_id | text | | | |
| deposit_method_id | text | | | |
| booking_token | text | | | UNIQUE |
| tips | numeric(12,2) | NOT NULL | 0 | |
| charity_donation | numeric(12,2) | NOT NULL | 0 | |
| woo_order_id | text | | | (014) |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `order_items`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| order_id | text | NOT NULL | — | REFERENCES orders(id) ON DELETE CASCADE |
| vehicle_id | text | | | REFERENCES fleet(id) |
| vehicle_name | text | | | |
| pickup_datetime | timestamptz | | | |
| dropoff_datetime | timestamptz | | | |
| rental_days_count | integer | NOT NULL | 0 | |
| pickup_location | text | | | |
| dropoff_location | text | | | |
| pickup_fee | numeric(12,2) | NOT NULL | 0 | |
| dropoff_fee | numeric(12,2) | NOT NULL | 0 | |
| rental_rate | numeric(12,2) | NOT NULL | 0 | |
| helmet_numbers | text | | | |
| discount | numeric(12,2) | NOT NULL | 0 | |
| ops_notes | text | | | |
| return_condition | text | | | |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `order_addons`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| order_id | text | NOT NULL | — | REFERENCES orders(id) ON DELETE CASCADE |
| order_item_id | text | | | REFERENCES order_items(id) |
| customer_id | text | | | REFERENCES customers(id) |
| addon_name | text | NOT NULL | — | |
| addon_price | numeric(12,2) | NOT NULL | — | |
| addon_type | text | NOT NULL | — | CHECK IN ('per_day','one_time') |
| quantity | integer | NOT NULL | 1 | |
| total_amount | numeric(12,2) | NOT NULL | — | |
| added_at | timestamptz | NOT NULL | now() | |
| added_date | date | | | |
| employee_id | text | | | REFERENCES employees(id) |
| notes | text | | | |

#### `payments`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| order_id | text | | | REFERENCES orders(id) (nullable since 015) |
| order_item_id | text | | | REFERENCES order_items(id) |
| order_addon_id | text | | | REFERENCES order_addons(id) |
| payment_type | text | NOT NULL | — | |
| amount | numeric(12,2) | NOT NULL | — | |
| payment_method_id | text | | | |
| transaction_date | date | NOT NULL | — | |
| settlement_status | text | | | |
| settlement_ref | text | | | |
| customer_id | text | | | REFERENCES customers(id) |
| account_id | text | | | REFERENCES chart_of_accounts(id) |
| raw_order_id | uuid | | | REFERENCES orders_raw(id) (015) |
| created_at | timestamptz | NOT NULL | now() | |

#### `vehicle_swaps`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| order_id | text | NOT NULL | — | REFERENCES orders(id) |
| order_item_id | text | NOT NULL | — | REFERENCES order_items(id) |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| old_vehicle_id | text | NOT NULL | — | REFERENCES fleet(id) |
| old_vehicle_name | text | | | |
| new_vehicle_id | text | NOT NULL | — | REFERENCES fleet(id) |
| new_vehicle_name | text | | | |
| swap_date | date | NOT NULL | — | |
| swap_time | time | | | |
| reason | text | | | |
| employee_id | text | | | REFERENCES employees(id) |
| created_at | timestamptz | NOT NULL | now() | |

#### `journal_entries`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| transaction_id | text | NOT NULL | — | |
| period | text | NOT NULL | — | |
| date | date | NOT NULL | — | |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| account_id | text | NOT NULL | — | REFERENCES chart_of_accounts(id) |
| description | text | | | |
| debit | numeric(12,2) | NOT NULL | 0 | |
| credit | numeric(12,2) | NOT NULL | 0 | |
| reference_type | text | NOT NULL | — | |
| reference_id | text | | | |
| created_by | text | | | REFERENCES employees(id) |
| created_at | timestamptz | NOT NULL | now() | |
| (check) | | | | debit >= 0 AND credit >= 0 |
| (check) | | | | (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0) |

#### `cash_reconciliation`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| date | date | NOT NULL | — | |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| opening_balance | numeric(12,2) | NOT NULL | 0 | |
| expected_cash | numeric(12,2) | NOT NULL | 0 | |
| actual_counted | numeric(12,2) | NOT NULL | 0 | |
| variance | numeric(12,2) | NOT NULL | 0 | |
| variance_type | text | | | |
| submitted_by | text | | | REFERENCES employees(id) |
| submitted_at | timestamptz | | | |
| is_locked | boolean | NOT NULL | false | |
| overridden_by | text | | | REFERENCES employees(id) |
| overridden_at | timestamptz | | | |
| override_reason | text | | | |
| till_counted | numeric(12,2) | | | |
| deposits_counted | numeric(12,2) | | | |
| till_denoms | jsonb | | | |
| deposit_denoms | jsonb | | | |
| till_expected | numeric(12,2) | | | |
| deposits_expected | numeric(12,2) | | | |
| till_variance | numeric(12,2) | | | |
| deposit_variance | numeric(12,2) | | | |
| closing_balance | numeric(12,2) | | | |
| (unique) | | | | UNIQUE (store_id, date) |

#### `card_settlements`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY (was serial, changed to text in 018) |
| is_paid | boolean | NOT NULL | false | |
| order_id | text | | | REFERENCES orders(id) |
| customer_id | text | | | REFERENCES customers(id) |
| settlement_ref | text | | | |
| date_settled | date | | | |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| net_amount | numeric(12,2) | | | |
| fee_expense | numeric(12,2) | | | |
| account_id | text | | | REFERENCES chart_of_accounts(id) |
| raw_date | text | | | |
| name | text | | | |
| ref_number | text | | | |
| amount | numeric(12,2) | | | |
| forecasted_date | date | | | |
| batch_no | text | | | |
| mid | text | | | |
| merchant | text | | | |
| tx_type | text | | | |
| card_num | text | | | |
| orig_amt | numeric(12,2) | | | |
| exch_rate | numeric(8,4) | | | |
| settle_amt | numeric(12,2) | | | |
| other_fee | numeric(12,2) | | | |
| tax | numeric(12,2) | | | |
| net_settlement | numeric(12,2) | | | |
| paid_status | text | | | |
| payment_id | text | | | (018) |
| created_at | timestamptz | NOT NULL | now() | |

#### `timesheets`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| date | date | NOT NULL | — | |
| employee_id | text | NOT NULL | — | REFERENCES employees(id) |
| name | text | | | |
| day_type | text | NOT NULL | 'Regular' | |
| time_in | time | | | |
| time_out | time | | | |
| regular_hours | numeric(4,2) | NOT NULL | 0 | |
| overtime_hours | numeric(4,2) | NOT NULL | 0 | |
| nine_pm_returns_count | integer | NOT NULL | 0 | |
| daily_notes | text | | | |
| payroll_status | text | NOT NULL | 'Pending' | CHECK IN ('Pending','Approved','Paid') |
| sil_inflation | numeric(12,2) | NOT NULL | 0 | |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| created_at | timestamptz | NOT NULL | now() | |
| (unique) | | | | UNIQUE (employee_id, date) |

#### `cash_advance_schedules`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| employee_id | text | NOT NULL | — | REFERENCES employees(id) |
| expense_id | text | | | |
| total_amount | numeric(12,2) | NOT NULL | — | |
| granted_date | date | NOT NULL | — | |
| installment_amount | numeric(12,2) | NOT NULL | — | |
| period_start | date | NOT NULL | — | |
| period_end | date | NOT NULL | — | |
| deducted | boolean | NOT NULL | false | |
| deducted_at | date | | | |
| created_at | timestamptz | NOT NULL | now() | |

#### `maintenance`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| created_at | timestamptz | NOT NULL | now() | |
| asset_id | text | NOT NULL | — | REFERENCES fleet(id) |
| vehicle_name | text | | | |
| status | text | NOT NULL | 'Reported' | CHECK IN ('Reported','In Progress','Completed') |
| downtime_tracked | boolean | NOT NULL | false | |
| downtime_start | date | | | |
| downtime_end | date | | | |
| total_downtime_days | integer | | | |
| issue_description | text | | | |
| work_performed | text | | | |
| parts_replaced | jsonb | | | |
| parts_cost | numeric(12,2) | NOT NULL | 0 | |
| labor_cost | numeric(12,2) | NOT NULL | 0 | |
| total_cost | numeric(12,2) | NOT NULL | 0 | |
| paid_from | text | | | REFERENCES chart_of_accounts(id) |
| mechanic | text | | | |
| odometer | numeric(10,1) | | | |
| next_service_due | numeric(10,1) | | | |
| employee_id | text | | | REFERENCES employees(id) |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |

#### `expenses`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| maintenance_id | text | | | REFERENCES maintenance(id) |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| date | date | NOT NULL | — | |
| category | text | NOT NULL | — | |
| vehicle_id | text | | | REFERENCES fleet(id) |
| amount | numeric(12,2) | NOT NULL | — | |
| transfer_fee | numeric(12,2) | NOT NULL | 0 | |
| paid_from | text | | | REFERENCES chart_of_accounts(id) |
| description | text | | | |
| employee_id | text | | | REFERENCES employees(id) |
| account_id | text | | | REFERENCES chart_of_accounts(id) |
| paid_to | text | | | |
| status | text | NOT NULL | 'paid' | CHECK IN ('paid','unpaid') (050) |
| paid_at | timestamptz | | | (050) |
| created_at | timestamptz | NOT NULL | now() | |

#### `transfers`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| order_id | text | | | |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |
| service_date | date | NOT NULL | — | |
| customer_name | text | NOT NULL | — | |
| contact_number | text | | | |
| customer_email | text | | | |
| customer_type | text | | | CHECK IN ('Walk-in','Online') |
| route | text | NOT NULL | — | |
| flight_time | text | | | |
| pax_count | integer | NOT NULL | 1 | |
| van_type | text | | | |
| accommodation | text | | | |
| status | text | NOT NULL | 'Pending' | |
| ops_notes | text | | | |
| total_price | numeric(12,2) | NOT NULL | — | |
| payment_method | text | | | |
| payment_status | text | NOT NULL | 'Pending' | CHECK IN ('Pending','Partially Paid','Paid') |
| driver_fee | numeric(12,2) | | | |
| net_profit | numeric(12,2) | | | |
| driver_paid_status | text | | | |
| booking_source | text | | | |
| booking_token | text | | | UNIQUE |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |

#### `misc_sales`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| date | date | NOT NULL | — | |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| description | text | | | |
| category | text | | | |
| amount | numeric(12,2) | NOT NULL | — | |
| received_into | text | | | REFERENCES chart_of_accounts(id) |
| income_account_id | text | | | REFERENCES chart_of_accounts(id) |
| employee_id | text | | | REFERENCES employees(id) |
| created_at | timestamptz | NOT NULL | now() | |

#### `lost_opportunity`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| date | date | NOT NULL | — | |
| time | time | | | |
| vehicle_requested | text | | | |
| quantity | integer | NOT NULL | 1 | |
| duration_days | integer | | | |
| est_value | numeric(12,2) | | | |
| reason | text | | | |
| outcome | text | | | |
| staff_notes | text | | | |
| created_at | timestamptz | NOT NULL | now() | |

#### `todo_tasks`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| employee_id | text | | | REFERENCES employees(id) |
| vehicle_id | text | | | REFERENCES fleet(id) |
| assigned_by | text | | | REFERENCES employees(id) |
| assigned_to | text | | | REFERENCES employees(id) |
| task_description | text | NOT NULL | — | |
| completion_response | text | | | |
| date_created | timestamptz | NOT NULL | now() | |
| date_completed | timestamptz | | | |
| visibility | text | NOT NULL | 'all' | |
| priority | text | NOT NULL | 'Medium' | CHECK IN ('Low','Medium','High','Urgent') |
| status | text | NOT NULL | 'Open' | CHECK IN ('Open','In Progress','Completed','Submitted','Verified','Rejected','Escalated','Closed') |
| due_date | date | | | |
| task_category | text | | | |
| seen_by | text[] | | '{}' | |
| completed_by | text | | | |
| title | text | | | (024) |
| description | text | | | (024) |
| category_id | integer | | | REFERENCES task_categories(id) (024) |
| acknowledged_at | timestamptz | | | (024) |
| escalation_count | integer | NOT NULL | 0 | (024) |
| is_escalated | boolean | NOT NULL | false | (024) |
| updated_at | timestamptz | NOT NULL | now() | (024) |

#### `todo_comments`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| task_id | text | NOT NULL | — | REFERENCES todo_tasks(id) ON DELETE CASCADE |
| employee_id | text | NOT NULL | — | REFERENCES employees(id) |
| content | text | NOT NULL | — | |
| created_at | timestamptz | NOT NULL | now() | |

#### `paw_card_entries`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| created_at | timestamptz | NOT NULL | now() | |
| order_id | text | | | |
| full_name | text | NOT NULL | — | |
| email | text | | | |
| establishment | text | NOT NULL | — | |
| date_of_visit | date | | | |
| number_of_people | integer | | | |
| amount_saved | numeric(12,2) | NOT NULL | 0 | |
| rental_total | numeric(12,2) | | | |
| rental_days | integer | | | |
| effective_per_day | numeric(12,2) | | | |
| receipt_url | text | | | (030) |
| paw_reference | text | | | (034) |

#### `ui_errors`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | text | NOT NULL | — | PRIMARY KEY |
| page | text | NOT NULL | — | |
| error_description | text | NOT NULL | — | |
| idea_and_improvements | text | | | |
| employee_id | text | | | REFERENCES employees(id) |
| fixed | boolean | NOT NULL | false | |
| created_at | timestamptz | NOT NULL | now() | |

#### `merchandise`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| sku | text | NOT NULL | — | PRIMARY KEY |
| item_name | text | NOT NULL | — | |
| size_variant | text | | | |
| cost_price | numeric(12,2) | NOT NULL | 0 | |
| sale_price | numeric(12,2) | NOT NULL | 0 | |
| starting_stock | integer | NOT NULL | 0 | |
| sold_count | integer | NOT NULL | 0 | |
| current_stock | integer | NOT NULL | 0 | |
| store_id | text | | | REFERENCES stores(id) |
| is_active | boolean | NOT NULL | true | |
| low_stock_threshold | integer | NOT NULL | 5 | (021) |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `reviews`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| external_id | text | | | |
| platform | text | NOT NULL | — | |
| store_id | text | | | REFERENCES stores(id) |
| date | date | | | |
| reviewer_name | text | | | |
| star_rating | integer | | | CHECK 1–5 |
| comment | text | | | |
| replied | boolean | NOT NULL | false | |
| is_active | boolean | NOT NULL | true | (057) |
| reviewer_role | text | | | (057) |
| sort_order | integer | NOT NULL | 0 | (057) |
| created_at | timestamptz | NOT NULL | now() | |
| (unique) | | | | UNIQUE (external_id, platform) |

#### `recurring_bills`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| bill_name | text | NOT NULL | — | |
| category | text | | | |
| amount | numeric(12,2) | NOT NULL | — | |
| day_of_month | integer | NOT NULL | — | CHECK 1–31 |
| store_id | text | | | REFERENCES stores(id) |
| account_id | text | | | REFERENCES chart_of_accounts(id) |
| auto_post_to_ledger | boolean | NOT NULL | false | |
| last_posted_date | date | | | |
| is_active | boolean | NOT NULL | true | |
| created_at | timestamptz | NOT NULL | now() | |

#### `directory`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | |
| number | text | | | |
| email | text | | | |
| relationship | text | | | |
| gcash_number | text | | | |
| category | text | | | (051) |
| bank_name | text | | | (051) |
| bank_account_number | text | | | (051) |
| address | text | | | (051) |
| notes | text | | | (051) |
| created_at | timestamptz | NOT NULL | now() | |

#### `orders_raw`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| source | text | NOT NULL | — | CHECK IN ('lolas','bass') |
| payload | jsonb | | — | (nullable after 035) |
| status | text | NOT NULL | 'unprocessed' | CHECK IN ('unprocessed','processed','skipped') |
| booking_channel | text | NOT NULL | 'woocommerce' | CHECK IN ('woocommerce','direct') (035) |
| customer_name | text | | | (035) |
| customer_email | text | | | (035) |
| customer_mobile | text | | | (035) |
| vehicle_model_id | text | | | (035) |
| pickup_datetime | timestamptz | | | (035) |
| dropoff_datetime | timestamptz | | | (035) |
| pickup_location_id | integer | | | (035) |
| dropoff_location_id | integer | | | (035) |
| store_id | text | | | (035) |
| order_reference | text | | | (035) |
| addon_ids | integer[] | | | (035) |
| transfer_type | text | | | (038) |
| flight_number | text | | | (038) |
| transfer_route | text | | | (038) |
| flight_arrival_time | timestamptz | | | (038) |
| charity_donation | numeric(12,2) | NOT NULL | 0 | (041) |
| web_payment_method | text | | | (042) |
| created_at | timestamptz | NOT NULL | now() | |

#### `payment_routing_rules`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| payment_method_id | text | NOT NULL | — | REFERENCES payment_methods(id) |
| received_into_account_id | text | | | REFERENCES chart_of_accounts(id) |
| card_settlement_account_id | text | | | REFERENCES chart_of_accounts(id) |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |
| (unique) | | | | UNIQUE (store_id, payment_method_id) |

#### `task_categories`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| name | text | NOT NULL | — | UNIQUE |
| colour | text | NOT NULL | '#6B7280' | |
| is_active | boolean | NOT NULL | true | |
| created_at | timestamptz | NOT NULL | now() | |

#### `task_events`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| task_id | text | NOT NULL | — | REFERENCES todo_tasks(id) ON DELETE CASCADE |
| event_type | text | NOT NULL | — | CHECK IN ('created','acknowledged','started','submitted','verified','rejected','escalated','commented','reassigned','updated') |
| actor_id | text | NOT NULL | — | REFERENCES employees(id) |
| actor_name | text | | | |
| detail | text | | | |
| created_at | timestamptz | NOT NULL | now() | |

#### `task_notifications`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| task_id | text | NOT NULL | — | REFERENCES todo_tasks(id) ON DELETE CASCADE |
| recipient_id | text | NOT NULL | — | REFERENCES employees(id) |
| notification_type | text | NOT NULL | — | CHECK IN ('assigned','rejected','escalated','overdue','comment') |
| is_read | boolean | NOT NULL | false | |
| is_dismissed | boolean | NOT NULL | false | |
| created_at | timestamptz | NOT NULL | now() | |

#### `leave_reset_log`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | bigserial | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| run_date | date | NOT NULL | — | |
| employees_reset | integer | NOT NULL | 0 | |
| created_at | timestamptz | NOT NULL | now() | |
| (unique) | | | | UNIQUE (store_id, run_date) |

#### `booking_holds`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| vehicle_model_id | text | NOT NULL | — | REFERENCES vehicle_models(id) |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| pickup_datetime | timestamptz | NOT NULL | — | |
| dropoff_datetime | timestamptz | NOT NULL | — | |
| session_token | text | NOT NULL | — | |
| expires_at | timestamptz | NOT NULL | — | |
| created_at | timestamptz | NOT NULL | now() | |
| (check) | | | | pickup_datetime < dropoff_datetime |

#### `repair_costs`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| vehicle_type | text | NOT NULL | — | |
| item | text | NOT NULL | — | |
| cost_php | numeric(12,2) | NOT NULL | — | |
| sort_order | integer | NOT NULL | 0 | |

#### `late_return_assignments`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | serial | NOT NULL | — | PRIMARY KEY |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| date | date | NOT NULL | — | |
| employee_id | text | NOT NULL | — | REFERENCES employees(id) |
| note | text | | | |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |
| (unique) | | | | UNIQUE (store_id, date) |

#### `budget_periods`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| store_id | text | | | REFERENCES stores(id) ON DELETE CASCADE |
| year | integer | NOT NULL | — | |
| notes | text | | | |
| created_by | uuid | | | REFERENCES users(id) ON DELETE SET NULL |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |
| (unique) | | | | UNIQUE (store_id, year) |
| (partial unique index) | | | | UNIQUE (year) WHERE store_id IS NULL |

#### `budget_lines`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| budget_period_id | uuid | NOT NULL | — | REFERENCES budget_periods(id) ON DELETE CASCADE |
| line_type | text | NOT NULL | — | CHECK IN ('revenue','expense','payroll','depreciation','drawings','transfer_revenue','misc_revenue') |
| category_label | text | NOT NULL | — | |
| coa_account_id | text | | | REFERENCES chart_of_accounts(id) ON DELETE SET NULL |
| expense_category_id | integer | | | REFERENCES expense_categories(id) ON DELETE SET NULL |
| month | integer | NOT NULL | — | CHECK 1–12 |
| amount | numeric(12,2) | NOT NULL | 0 | |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |
| (unique) | | | | UNIQUE (budget_period_id, line_type, category_label, month) |

#### `waivers`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| order_reference | text | NOT NULL | — | |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| driver_name | text | NOT NULL | — | |
| driver_email | text | | | |
| driver_mobile | text | | | |
| agreed_to_terms | boolean | NOT NULL | false | |
| agreed_at | timestamptz | NOT NULL | now() | |
| ip_address | text | | | |
| user_agent | text | | | |
| licence_front_url | text | | | |
| licence_back_url | text | | | |
| driver_signature_url | text | | | |
| passenger_signatures | jsonb | | '[]'::jsonb | |
| status | text | NOT NULL | 'pending' | CHECK IN ('pending','signed','expired') |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `inspection_items`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| store_id | text | | | REFERENCES stores(id) |
| name | text | NOT NULL | — | |
| item_type | text | NOT NULL | 'accepted_issue' | CHECK IN ('accepted_issue','accepted_issue_qty','accepted_issue_na','accepted_issue_declined') |
| sort_order | integer | NOT NULL | 0 | |
| is_active | boolean | NOT NULL | true | |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `inspections`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| order_id | text | | | REFERENCES orders(id) |
| order_reference | text | NOT NULL | — | |
| store_id | text | NOT NULL | — | REFERENCES stores(id) |
| vehicle_id | text | | | REFERENCES fleet(id) |
| vehicle_name | text | | | |
| employee_id | text | | | REFERENCES employees(id) |
| km_reading | text | | | |
| damage_notes | text | | | |
| helmet_numbers | text | | | |
| customer_signature_url | text | | | |
| status | text | NOT NULL | 'completed' | CHECK IN ('pending','completed') |
| created_at | timestamptz | NOT NULL | now() | |
| updated_at | timestamptz | NOT NULL | now() | |

#### `inspection_results`
| Column | Type | Null | Default | Constraints |
|--------|------|------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| inspection_id | uuid | NOT NULL | — | REFERENCES inspections(id) ON DELETE CASCADE |
| inspection_item_id | uuid | | | REFERENCES inspection_items(id) |
| item_name | text | NOT NULL | — | |
| result | text | NOT NULL | — | CHECK IN ('accepted','issue_noted','na','declined') |
| qty | integer | | | |
| notes | text | | | |
| log_maintenance | boolean | NOT NULL | false | |
| created_at | timestamptz | NOT NULL | now() | |

#### `savings_logs` (VIEW)
View alias for `paw_card_entries` — `SELECT * FROM public.paw_card_entries`.

---

### 1.3 RPC / Stored Functions

| Function | Returns | Language | Migration | Description |
|----------|---------|----------|-----------|-------------|
| `update_updated_at()` | TRIGGER | plpgsql | 001 | Sets `NEW.updated_at = now()` |
| `public.user_store_ids()` | text[] | sql STABLE | 009 | Reads `store_ids` from JWT claims |
| `public.has_permission(required text)` | boolean | sql STABLE | 009 | Checks `permissions` in JWT claims |
| `public.paw_card_assign_order_id()` | TRIGGER | plpgsql | 033 | Sets synthetic order_id on paw_card_entries when null |
| `public.paw_card_assign_paw_reference()` | TRIGGER | plpgsql | 034 | Generates paw_reference on paw_card_entries |
| `create_expense_with_journal(p_expense_id, p_store_id, p_date, p_category, p_description, p_amount, p_paid_from, p_vehicle_id, p_employee_id, p_account_id, p_transaction_id, p_period, p_journal_date, p_journal_store_id, p_created_by, p_legs jsonb, p_status, ...)` | void | plpgsql | 045 (replaced 050) | Atomic expense + journal insert |
| `delete_expense_with_journal(p_expense_id text, p_reference_type text, p_reference_id text)` | void | plpgsql | 045 | Atomic expense + journal delete |
| `pay_expenses_atomic(p_expense_ids text[], p_paid_at timestamptz, p_paid_from text, p_legs jsonb)` | void | plpgsql | 050 | Marks expenses paid + posts journal |
| `match_card_settlement(p_transaction_id, p_period, p_date, p_store_id, p_legs jsonb, p_settlement_ids int[], p_is_paid, p_date_settled, p_settlement_ref, p_net_amount, p_fee_expense, p_account_id, p_payment_ids text[], p_settlement_status)` | void | plpgsql | 046 | Matches card settlements + posts journal |
| `reconcile_cash_atomic(p_id, p_store_id, p_date, p_opening_balance, p_expected_cash, p_actual_counted, p_variance, p_variance_type, p_submitted_by, p_submitted_at, p_is_locked, p_overridden_by, p_overridden_at, p_override_reason, p_till_counted, p_deposits_counted, p_till_denoms jsonb, p_deposit_denoms jsonb, p_till_expected, p_deposits_expected, p_till_variance, p_deposit_variance, p_closing_balance)` | void | plpgsql | 047 | Atomic cash reconciliation upsert |
| `run_payroll_atomic(p_transactions jsonb, p_timesheet_ids text[], p_status text)` | void | plpgsql | 048 | Runs payroll: updates timesheets + posts journal |
| `activate_order_atomic(p_order_id, p_store_id, p_woo_order_id, p_customer_id, p_employee_id, p_order_date, p_status, p_web_notes, p_quantity, p_web_quote_raw, p_security_deposit, p_deposit_status, p_card_fee_surcharge, p_return_charges, p_final_total, p_balance_due, p_payment_method_id, p_deposit_method_id, p_booking_token, p_tips, p_charity_donation, p_updated_at, p_order_items jsonb, p_order_addons jsonb, p_fleet_updates jsonb, p_journal_transaction_id, p_journal_period, p_journal_date, p_journal_store_id, p_journal_legs jsonb)` | void | plpgsql | 049 | Atomic order activation with fleet, journal, addons |
| `cancel_order_raw_atomic(p_order_id text, p_cancelled_at timestamptz, p_cancelled_reason text)` | jsonb | plpgsql SECURITY DEFINER | 055 | Cancels raw order atomically |
| `confirm_extend_raw_atomic(p_order_id, p_new_dropoff, p_payment_id, p_store_id, p_amount, p_payment_method_id, p_transaction_date, p_settlement_status, p_settlement_ref, p_raw_order_id, p_is_paid, p_receivable_acct, p_income_acct, p_journal_tx_id, p_journal_date, p_journal_period, p_ext_description)` | jsonb | plpgsql SECURITY DEFINER | 055 | Confirms extension on raw order |
| `confirm_extend_order_atomic(p_order_id, p_order_item_id, p_new_dropoff, p_new_days, p_addon_updates jsonb, p_total_delta, p_payment_id, p_store_id, p_amount, p_payment_method_id, p_transaction_date, p_settlement_status, p_settlement_ref, p_customer_id, p_order_item_id_fk, p_is_paid, p_receivable_acct, p_income_acct, p_journal_tx_id, p_journal_date, p_journal_period, p_ext_description)` | jsonb | plpgsql SECURITY DEFINER | 055 | Confirms extension on processed order |

---

### 1.4 Indexes (from migration 008 + subsequent)

| Index | Table | Columns | Notes |
|-------|-------|---------|-------|
| `idx_orders_store_status` | orders | (store_id, status) | |
| `idx_orders_customer` | orders | (customer_id) | |
| `idx_orders_date` | orders | (order_date) | |
| `idx_order_items_order` | order_items | (order_id) | |
| `idx_order_items_vehicle` | order_items | (vehicle_id) | |
| `idx_order_addons_order` | order_addons | (order_id) | |
| `idx_payments_order` | payments | (order_id) | |
| `idx_payments_date` | payments | (transaction_date) | |
| `idx_payments_raw_order` | payments | (raw_order_id) | WHERE raw_order_id IS NOT NULL |
| `idx_fleet_store_status` | fleet | (store_id, status) | |
| `idx_je_transaction` | journal_entries | (transaction_id) | |
| `idx_je_account_date` | journal_entries | (account_id, date) | |
| `idx_je_store_date` | journal_entries | (store_id, date) | |
| `idx_je_reference` | journal_entries | (reference_type, reference_id) | |
| `idx_timesheets_emp_date` | timesheets | (employee_id, date) | |
| `idx_timesheets_store` | timesheets | (store_id, payroll_status) | |
| `idx_expenses_store_date` | expenses | (store_id, date) | |
| `idx_maintenance_asset` | maintenance | (asset_id) | |
| `idx_maintenance_store` | maintenance | (store_id, status) | |
| `idx_transfers_store_date` | transfers | (store_id, service_date) | |
| `idx_card_settle_store` | card_settlements | (store_id, is_paid) | |
| `idx_todo_assigned` | todo_tasks | (assigned_to, status) | |
| `idx_todo_comments_task` | todo_comments | (task_id) | |
| `idx_paw_card_email` | paw_card_entries | (email) | |
| `idx_vehicle_swaps_order` | vehicle_swaps | (order_id) | |
| `idx_cash_adv_employee` | cash_advance_schedules | (employee_id) | |
| `idx_orders_raw_status` | orders_raw | (status) | |
| `idx_orders_raw_source` | orders_raw | ("source") | |
| `idx_orders_raw_created` | orders_raw | (created_at DESC) | |
| `idx_orders_raw_booking_channel` | orders_raw | (booking_channel) | (035) |
| `idx_task_events_task` | task_events | (task_id, created_at) | |
| `idx_task_events_actor` | task_events | (actor_id) | |
| `idx_task_notif_recipient` | task_notifications | (recipient_id, is_read) | |
| `idx_todo_tasks_due_status` | todo_tasks | (due_date, status) | WHERE status NOT IN ('Closed') |
| `idx_leave_reset_log_store` | leave_reset_log | (store_id) | |
| `idx_booking_holds_store_expires` | booking_holds | (store_id, expires_at) | |
| `idx_repair_costs_vehicle_type` | repair_costs | (vehicle_type) | |
| `budget_periods_company_wide_year_unique` | budget_periods | (year) | UNIQUE WHERE store_id IS NULL |
| `idx_budget_lines_period` | budget_lines | (budget_period_id) | |
| `idx_budget_lines_period_month` | budget_lines | (budget_period_id, month) | |
| `waivers_order_reference_idx` | waivers | (order_reference) | |
| `inspections_order_id_idx` | inspections | (order_id) | |
| `inspections_order_reference_idx` | inspections | (order_reference) | |
| `inspection_results_inspection_id_idx` | inspection_results | (inspection_id) | |

---

### 1.5 Junction / Relationship Tables

| Table | Links | Nature |
|-------|-------|--------|
| `role_permissions` | roles ↔ permission strings | M:N config |
| `vehicle_model_pricing` | vehicle_models + stores | day-band pricing config |
| `order_items` | orders → fleet | line items |
| `order_addons` | orders (+ order_items, customers) | addon lines |
| `vehicle_swaps` | order_items → fleet (old/new) | audit trail |
| `task_notifications` | todo_tasks ↔ employees (recipient) | notification |
| `task_events` | todo_tasks → employees (actor) | audit/event log |
| `todo_comments` | todo_tasks ↔ employees | comment thread |
| `inspection_results` | inspections ↔ inspection_items | result mapping |
| `payment_routing_rules` | stores ↔ payment_methods → chart_of_accounts | routing config |
| `budget_lines` | budget_periods → expense_categories / chart_of_accounts | budget detail |

---

## 2. API LAYER (`apps/api`)

### 2.1 Server Mounts (`apps/api/src/server.ts`)

| Path | Router / Handler |
|------|-----------------|
| `GET /health` | `{ status: 'ok' }` |
| `/api/public/reviews` | `publicLimiter` + `publicReviewsRoutes` |
| `/api/public/waiver` | `waiverRouter` (5MB JSON) |
| `/api/waiver` | `authenticate` + `waiverRouter` |
| `/api/inspections` | `authenticate` + `inspectionRouter` |
| `/api` | `routes` (main router from `routes/index.ts`) |

**Main router mounts** (under `/api` via `routes/index.ts`):

`/auth` (loginLimiter), `/public` (publicLimiter), then with apiLimiter: `/auth`, `/dashboard`, `/orders-raw`, `/orders`, `/fleet`, `/accounting`, `/transfers`, `/hr`, `/payroll`, `/cashup`, `/expenses`, `/todo`, `/maintenance`, `/config`, `/paw-card`, `/misc-sales`, `/directory`, `/merchandise`, `/card-settlements`, `/public` (public transfers), `/ui-errors`, `/lost-opportunities`, `/public/booking`, `/public/paw-card`, `/public/extend`, `/public/repairs`, `/budget`.

---

### 2.2 Express Routes by Domain

#### Auth (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Validate credentials; query users + role_permissions + employees; return JWT |

#### Accounting (`/api/accounting`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/balances` | Permission.ViewAccounts; `calculateBalances` use case |
| GET | `/balances-v2` | Half-month balance range via `accountingPort.calculateBalancesByDateRange` |
| GET | `/account-ledger` | Journal entries for account + date range |
| GET | `/entries` | Entries by store + period |
| POST | `/journal` | Permission.EditAccounts; `createJournalEntry` |
| POST | `/drawings` | Owner drawings journal entry |
| POST | `/transfer` | Permission.EditAccounts; `transferFunds` |

#### Orders (`/api/orders`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List orders by store |
| GET | `/enriched` | Enriched inbox rows with joins |
| GET | `/:id` | Order detail + customer email |
| GET | `/:id/items` | Order items |
| GET | `/:id/payments` | Payments for order |
| GET | `/:id/history` | Timeline (orders, payments, swaps, addons) |
| GET | `/:id/addons` | Add-ons |
| GET | `/:id/swaps` | Vehicle swaps |
| POST | `/:id/activate` | `activateOrder` |
| POST | `/:id/settle` | `settleOrder` |
| POST | `/:id/payment` | `collectPayment` |
| POST | `/:id/modify-addons` | `modifyAddons` |
| POST | `/:id/adjust-dates` | `adjustDates` |
| POST | `/:id/swap-vehicle` | `swapVehicle` |

#### Orders Raw (`/api/orders-raw`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/walk-in` | Create raw walk-in order |
| POST | `/walk-in-direct` | Direct walk-in |
| GET | `/` | Inbox list |
| GET | `/:id` | Raw order detail |
| POST | `/:id/process` | `processRawOrder` |
| POST | `/:id/collect-payment` | Collect payment on raw order |
| PATCH | `/:id/cancel` | `cancel_order_raw_atomic` RPC |

#### Fleet (`/api/fleet`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List vehicles |
| POST | `/sync` | `syncFleetStatuses` job |
| GET | `/utilization` | `getFleetUtilization` |
| GET | `/calendar` | Fleet calendar + unassigned orders_raw |
| POST | `/` | `createVehicle` |
| GET | `/available` | Available fleet for date window |
| GET | `/:id` | Vehicle detail |
| PUT | `/:id` | `updateVehicle` |
| POST | `/purchase` | `recordPurchase` |
| POST | `/sale` | `recordSale` |
| POST | `/depreciation` | `batchDepreciation` |

#### Cashup (`/api/cashup`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/summary` | Aggregated cash-up payload |
| GET | `/` | Cash reconciliation by date |
| POST | `/deposit` | Bank deposit via accounting port |
| POST | `/inter-store-transfer` | Journal entry pair for inter-store transfer |
| POST | `/reconcile` | `reconcileCash` |
| POST | `/override` | `overrideReconciliation` |
| GET | `/late-returns-check` | Late returns on order_items |
| GET | `/late-return-assignment` | Assigned late return employee |
| POST | `/late-return-assignment` | Upsert late_return_assignments |

#### Expenses (`/api/expenses`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List expenses with joins |
| POST | `/` | `createExpense` |
| PUT | `/:id` | `updateExpense` |
| DELETE | `/:id` | `deleteExpense` |
| POST | `/pay` | `pay_expenses_atomic` RPC |

#### HR (`/api/hr`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/timesheets` | List timesheets |
| GET | `/timesheets/check-duplicates` | Check duplicate timesheet entries |
| POST | `/timesheets` | `submitTimesheet` |
| POST | `/timesheets/approve` | `approveTimesheets` |
| POST | `/leave` | `submitLeave` |
| GET | `/employees` | List employees |
| GET | `/employees/:id` | One employee |
| POST | `/employees` | Create employee |
| PUT | `/employees/:id` | Update employee |
| DELETE | `/employees/:id` | Delete employee |

#### Payroll (`/api/payroll`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/payslip` | `calculatePayslip` |
| POST | `/preview` | Payroll preview |
| POST | `/run` | `runPayroll` |

#### Transfers (`/api/transfers`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List transfers |
| GET | `/:id` | One transfer |
| POST | `/` | `createTransfer` |
| POST | `/payment` | `recordTransferPayment` |
| POST | `/driver-payment` | `recordDriverPayment` |

#### Todo (`/api/todo`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/unseen-count` | Unread notification count |
| GET | `/notifications` | Notification list |
| POST | `/notifications/dismiss` | Dismiss notification |
| POST | `/notifications/read-all` | Mark all read |
| GET | `/report` | Task report |
| GET | `/` | List tasks |
| POST | `/` | `createTask` |
| GET | `/:id` | Task detail |
| PUT | `/:id` | `updateTask` |
| POST | `/:id/acknowledge` | Acknowledge task |
| POST | `/:id/start` | `startTask` |
| POST | `/:id/submit` | `submitTask` |
| POST | `/:id/verify` | `verifyTask` |
| POST | `/:id/reject` | `rejectTask` |
| POST | `/:id/escalate` | `escalateTask` |
| POST | `/:id/comment` | `addComment` |
| GET | `/:id/comments` | Comments for task |
| GET | `/:id/events` | Events for task |
| POST | `/:id/seen` | `markSeen` |

#### Maintenance (`/api/maintenance`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List maintenance records |
| GET | `/:id` | One record |
| POST | `/` | `logMaintenance` |
| PUT | `/:id` | `saveMaintenance` |
| DELETE | `/:id` | Delete record |
| POST | `/:id/complete` | `completeMaintenance` |

#### Config (`/api/config`) — requires `authenticate`, write routes require `Permission.EditSettings`
Covers full CRUD for: `stores`, `addons`, `locations`, `payment-methods`, `vehicle-models`, `model-pricing`, `fleet-statuses`, `expense-categories`, `task-categories`, `transfer-routes`, `day-types`, `chart-of-accounts`, `paw-card-establishments`, `maintenance-work-types`, `repair-costs`, `leave-config`, `roles`, `role-permissions`, `users`, `payment-routing`, `reviews`.  
Special: `POST /stores/:id/regenerate-token`, `GET /store-pricing`, `GET /employees` (dropdown).

#### Paw Card (`/api/paw-card`) — mixed auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health ping |
| GET | `/lookup` | Staff lookup (authenticate) |
| GET | `/establishments` | Establishments list |
| GET | `/customer-savings` | Customer savings (authenticate) |
| GET | `/lifetime` | Lifetime stats (authenticate) |
| POST | `/submit` | Submit entry (authenticate) |
| GET | `/company-impact` | Company impact |
| GET | `/my-submissions` | My submissions |
| GET | `/leaderboard` | Leaderboard |
| POST | `/register` | Public register (rate limited) |
| POST | `/upload-receipt` | Multer → Supabase Storage `paw-card-receipts` bucket |

#### Misc Sales (`/api/misc-sales`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List |
| POST | `/` | `recordSale` |
| PUT | `/:id` | `updateSale` |
| DELETE | `/:id` | `deleteSale` |

#### Merchandise (`/api/merchandise`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List |
| GET | `/:sku` | By SKU |
| POST | `/` | Create |
| PUT | `/:sku` | Update |
| POST | `/:sku/adjust-stock` | Adjust stock |
| DELETE | `/:sku` | Delete |

#### Card Settlements (`/api/card-settlements`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/pending` | Pending settlements |
| GET | `/settled` | Settled list |
| GET | `/balance` | Totals |
| POST | `/match` | `matchSettlement` |
| POST | `/batch-edit` | Batch update |
| POST | `/combine` | Combine rows |

#### Dashboard (`/api/dashboard`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/summary` | Store metrics |
| GET | `/charity-impact` | `queryCharityImpact` |

#### Directory (`/api/directory`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Search directory |
| POST | `/` | Create contact |
| PUT | `/:id` | Update contact |
| DELETE | `/:id` | Delete contact |

#### UI Errors (`/api/ui-errors`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List |
| POST | `/` | Create |
| PUT | `/:id` | Update (mark fixed) |

#### Lost Opportunities (`/api/lost-opportunities`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List |
| POST | `/` | Create |
| PUT | `/:id` | Update |
| DELETE | `/:id` | Delete |

#### Budget (`/api/budget`) — requires `authenticate`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get budget lines |
| POST | `/upsert` | Upsert budget lines |
| GET | `/actuals` | Actual vs budget data |
| GET | `/autofill` | Auto-fill from historical data |

#### Public Routes (no auth, rate-limited)
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/public/transfers` | Transfer booking by token |
| GET/POST | `/api/public/booking` | Availability check, quote compute, hold create/release, direct booking |
| GET/POST | `/api/public/paw-card` | Public Paw Card register/lookup |
| GET/POST | `/api/public/extend` | Order extend lookup + confirm |
| GET | `/api/public/repairs` | List repair costs |
| GET | `/api/public/reviews` | Public reviews |
| GET/POST | `/api/public/waiver` | Waiver signing |
| GET/POST/PUT | `/api/waiver` | Authenticated waiver management |
| GET/POST/PUT | `/api/inspections` | Inspection records (authenticated) |

---

### 2.3 Supabase Adapters (`apps/api/src/adapters/supabase/`)

| File | Factory / Class | Supabase Tables / RPCs |
|------|----------------|----------------------|
| `order-repo.ts` | `createOrderRepo` | `orders`, `order_items`, `order_addons`, `payments`, `customers`, RPC `activate_order_atomic` |
| `fleet-repo.ts` | `createFleetRepo` | `fleet`, `vehicle_swaps`, `order_items` |
| `accounting-adapter.ts` | `createAccountingAdapter` | `journal_entries`, `chart_of_accounts` |
| `customer-repo.ts` | `createCustomerRepo` | `customers` |
| `employee-repo.ts` | `createEmployeeRepo` | `employees` |
| `timesheet-repo.ts` | `createTimesheetRepo` | `timesheets`, RPC `run_payroll_atomic` |
| `cash-reconciliation-repo.ts` | `createCashReconciliationRepo` | `cash_reconciliation`, RPC `reconcile_cash_atomic` |
| `expense-repo.ts` | `createExpenseRepo` | `expenses`, `journal_entries`, RPC `create_expense_with_journal`, `delete_expense_with_journal` |
| `transfer-repo.ts` | `createTransferRepo` | `transfers`, `payments` |
| `maintenance-repo.ts` | `createMaintenanceRepo` | `maintenance`, `expenses` |
| `misc-sale-repo.ts` | `createMiscSaleRepo` | `misc_sales` |
| `merchandise-repo.ts` | `createMerchandiseRepo` | `merchandise` |
| `card-settlement-repo.ts` | `createCardSettlementRepo` | `card_settlements`, `journal_entries`, RPC `match_card_settlement` |
| `payment-repo.ts` | `createPaymentRepo` | `payments` |
| `payment-routing-repo.ts` | `createPaymentRoutingRepo` | `payment_routing_rules` |
| `config-repo.ts` | `createConfigRepo` | `stores`, `addons`, `locations`, `payment_methods`, `vehicle_models`, `vehicle_model_pricing`, `fleet_statuses`, `expense_categories`, `task_categories`, `transfer_routes`, `day_types`, `chart_of_accounts`, `paw_card_establishments`, `maintenance_work_types`, `leave_config`, `roles`, `role_permissions`, `users`, `repair_costs` |
| `todo-repo.ts` | `createTodoRepo` | `todo_tasks`, `todo_comments`, `task_events`, `task_notifications` |
| `directory-repo.ts` | `createDirectoryRepo` | `directory` |
| `orders-raw-repo.ts` | `createOrdersRawRepo` | `orders_raw`, `booking_holds`, `payments`, `orders`, `order_items` |
| `budget-repo.ts` | `createBudgetRepo` | `budget_periods`, `budget_lines`, `expenses`, `expense_categories`, `journal_entries`, `chart_of_accounts`, `orders`, `transfers`, `misc_sales` |
| `repairs-adapter.ts` | `createRepairsAdapter` | `repair_costs` |
| `maintenance-expense-rpc.ts` | RPC helpers | RPC `create_expense_with_journal`, `delete_expense_with_journal` |
| `mappers.ts` | `toSnakeCase`, `toCamelCase`, `mapRowToEntity`, `mapEntityToRow`, `parseDate` | (utility only) |
| `client.ts` | `getSupabaseClient`, `supabase` | (factory) |
| `auth/password.ts` | `hashPin`, `verifyPin` | — |
| `auth/jwt.ts` | `generateToken`, `verifyToken`, `TokenPayload` | — |
| `google-sheets/sheets-client.ts` | `getSheetsClient`, `readSheet`, `writeSheet`, `appendSheet` | Google Sheets API |
| `google-sheets/sync-service.ts` | `GoogleSheetsSyncService` | `orders`, `fleet`, `customers`, `employees`, `payments`, `expenses`, `transfers`, `timesheets`, `maintenance`, `journal_entries`, `todo_tasks`, `card_settlements` |

---

### 2.4 Domain Port Interfaces (`packages/domain/src/ports/`)

| Port | Key Methods |
|------|-------------|
| `AccountingPort` | `createTransaction`, `findByAccount`, `findByAccountDateRange`, `findByReference`, `findByStore`, `deleteByReference`, `calculateBalance`, `calculateAllBalances`, `getBalanceSummaryByType`, `calculateBalancesByDateRange` |
| `AuthPort` | `authenticate`, `hashPin`, `verifyPin`, `generateToken`, `verifyToken` |
| `BookingPort` | `checkAvailability`, `insertHold`, `deleteHold`, `deleteHoldBySessionAndModel`, `findActiveHoldsBySession`, `findActiveHold`, `insertDirectBooking`, `isOrderReferenceUnique` |
| `BudgetPort` | `getBudgetLines`, `upsertBudgetLines`, `getExpenseActuals`, `getJournalActuals`, `getRevenueActuals`, `getLastYearActuals` |
| `CardSettlementRepository` | `findPending`, `findSettled`, `findByIds`, `findByOrder`, `save`, `settleMany`, `batchUpdate`, `assignBatch`, `pendingTotals`, `matchWithTransaction` |
| `CashReconciliationRepository` | `findByDate`, `findPreviousDay`, `save`, `lock`, `unlock`, `override`, `reconcileAtomic` |
| `ConfigRepository` | getStores/Addons/Locations/PaymentMethods/VehicleModels/ModelPricing/StorePricing/FleetStatuses/ExpenseCategories/TaskCategories/TransferRoutes/DayTypes/ChartOfAccounts/PawCardEstablishments/MaintenanceWorkTypes/LeaveConfig/Roles/RolePermissions/Users/RepairCosts + corresponding save/delete for each |
| `CustomerRepository` | `findById`, `findByEmail`, `findByMobile`, `search`, `save` |
| `DirectoryRepository` | `findAll`, `save`, `delete` |
| `EmployeeRepository` | `findById`, `findAll`, `findByStore`, `findActive`, `save` |
| `ExpenseRepository` | `findById`, `findByStore`, `findByCategory`, `save`, `delete`, `createWithJournal`, `createUnpaid`, `deleteWithJournal` |
| `FleetRepository` | `findById`, `findAll`, `findByStore`, `findAvailable`, `save`, `updateStatus`, `updateDepreciation` |
| `LeaveBalancePort` | `getBalance`, `deductLeave`, `resetAnnualLeave` |
| `MaintenanceRepository` | `findById`, `findByVehicle`, `findByStore`, `save`, `deleteById` |
| `MerchandiseRepository` | `findByStore`, `findBySku`, `save`, `updateStock`, `delete` |
| `MiscSaleRepository` | `findById`, `findByStore`, `save`, `delete` |
| `OrderAddonRepository` | `findByOrderId`, `saveMany`, `save`, `deleteById`, `deleteByOrderId` |
| `OrderItemRepository` | `findByOrderId`, `findActiveByVehicle`, `save`, `saveMany`, `delete` |
| `OrderRepository` | `findById`, `findByStore`, `findByStatus`, `findByCustomer`, `save`, `activateOrderAtomic` |
| `PaymentRepository` | `findByOrderId`, `findByRawOrderId`, `findByDateRange`, `save`, `linkToOrder` |
| `PaymentRoutingRepository` | `findAll`, `findByStore`, `upsert`, `bulkUpsert`, `delete` |
| `PayrollPort` | `calculatePayslip`, `aggregateTips`, `aggregatePOMCommission`, `findBonuses`, `findCashAdvanceSchedules` |
| `PawCardPort` | `lookupCustomer`, `getEstablishments`, `getLifetimeSavings`, `submitEntry`, `getCompanyImpact`, `getMySubmissions`, `getLeaderboard`, `registerCustomer` |
| `RecurringBillsPort` | `getActiveBills`, `postBill`, `isAlreadyPosted` |
| `RepairsPort` | `listRepairCostsByVehicleType` |
| `ReviewRepository` | `findByStore`, `upsert` |
| `SheetSyncPort` | `syncTable`, `syncAll`, `getLastSyncTime` |
| `TimesheetRepository` | `findByPeriod`, `findByEmployee`, `save`, `saveMany`, `bulkUpdateStatus`, `runPayrollAtomic` |
| `TodoRepository` | `findById`, `findForEmployee`, `findForStore`, `findForStores`, `save`, `updateFields`, `updateStatus`, `addComment`, `getComments`, `addEvent`, `getEvents`, `createNotification`, `getNotifications`, `getUnreadCount`, `dismissNotification`, `markAllRead`, `markNotificationsReadForTask`, `getReport` |
| `TransferRepository` | `findById`, `findByStore`, `save` |

---

### 2.5 Domain Entities (`packages/domain/src/entities/`)

| Entity | Key Domain Fields / Methods |
|--------|----------------------------|
| `Order` | ids, storeId, customerId, orderDate, OrderStatus, Money fields (finalTotal, balanceDue, securityDeposit, etc.), bookingToken, addons — methods: `activate`, `settle`, `cancel`, `addAddon`, `adjustTotal`, `applyPayments`, `calculateBalanceDue` |
| `Employee` | HR/pay fields (rates, allowances, leave balances, statutory IDs, deductions) — methods: `deductLeave`, `getRemainingLeave`, `canTakeLeave` |
| `Vehicle` | fleet + depreciation fields — methods: `applyDepreciation`, `isRentable`, `isProtected`, `canAutoUpdateStatus` |
| `Timesheet` | daily record + payroll status — methods: `approve`, `markPaid`, `calculateHours` (static) |
| `Transfer` | booking + Money — methods: `derivePaymentStatus`, `calculateNetProfit` |
| `MaintenanceRecord` | asset, costs (Money), status — methods: `startWork`, `complete`, `calculateTotalCost` |
| `JournalTransaction` | balanced legs (JournalLeg[]) — methods: `create`, `isBalanced` |

---

### 2.6 Domain Services (`packages/domain/src/services/`)

| Service | Signature |
|---------|-----------|
| `deposit-calculator.ts` | `calculateRefundableDeposit(securityDeposit, balanceDueBeforeDeposit): { amountApplied, refund }` |
| `depreciation-service.ts` | `calculateMonthlyDepreciation(input: DepreciationInput): DepreciationResult` |
| `payroll-calculator.ts` | `calculatePayroll(input: PayrollInput): PayrollResult` |

---

### 2.7 Use Cases (`apps/api/src/use-cases/`) — 58 files

**Accounting:** `create-journal-entry`, `transfer-funds`, `calculate-balances`  
**Booking:** `check-availability`, `compute-quote`, `create-hold`, `release-hold`, `submit-direct-booking`  
**Card Settlements:** `match-settlement`  
**Cashup:** `reconcile-cash`, `override-reconciliation`  
**Config:** `crud-config`  
**Expenses:** `create-expense`, `update-expense`, `delete-expense`  
**Fleet:** `create-vehicle`, `update-vehicle`, `record-purchase`, `record-sale`, `batch-depreciation`, `get-utilization`  
**HR:** `submit-timesheet`, `approve-timesheets`, `submit-leave`  
**Maintenance:** `log-maintenance`, `save-maintenance`, `complete-maintenance`  
**Misc Sales:** `record-sale`, `update-sale`, `delete-sale`  
**Orders:** `activate-order`, `settle-order`, `collect-payment`, `modify-addons`, `adjust-dates`, `swap-vehicle`, `process-raw-order`  
**Payroll:** `calculate-payslip`, `run-payroll`  
**Paw Card:** `lookup-customer`, `log-savings`, `company-impact`, `lookup-paw-card-public`  
**Repairs:** `list-repair-costs`  
**Settings:** `save-user`  
**Todo:** `create-task`, `update-task`, `start-task`, `submit-task`, `verify-task`, `reject-task`, `escalate-task`, `add-comment`, `claim-task`, `mark-seen`  
**Transfers:** `create-transfer`, `record-payment`, `record-driver-payment`

---

### 2.8 Middleware (`apps/api/src/middleware/`)

| File | Exports |
|------|---------|
| `authenticate.ts` | `authenticate` — Bearer JWT, sets `req.user` (TokenPayload) |
| `authorize.ts` | `requirePermission(...permissions)` |
| `error-handler.ts` | `errorHandler` — maps domain errors to HTTP status codes |
| `rate-limit.ts` | `loginLimiter`, `publicLimiter`, `apiLimiter` |
| `validate.ts` | `validateBody(schema)`, `validateQuery(schema)` |

---

### 2.9 Shared Package (`packages/shared/src/`)

**Constants:** `OrderStatus`, `COMPANY_STORE_ID`, `DEFAULT_STORE_ID`, `ReferenceType`, `Permission`, `ALL_PERMISSIONS`

**Types:** `ApiResponse<T>`, `PaginatedResponse<T>`

**Zod Schemas (by domain):** auth, order, orders-raw, fleet, accounting, config, hr, transfer, payroll, cashup, expense, todo, paw-card, maintenance, misc-sales, merchandise, payment-routing, ui-errors, lost-opportunity, extend, directory, budget

---

## 3. FRONTEND (`apps/web`)

### 3.1 Routes (`apps/web/src/router.tsx`)

#### Public Routes
| Path | Component |
|------|-----------|
| `/` | Redirects to `/book` |
| `/login` | `LoginPage` |
| `/book` | `HomePage` |
| `/book/reserve` | `BrowseBookPage` |
| `/book/basket` | `BasketPage` |
| `/book/confirmation` | `ConfirmationPage` |
| `/book/confirmation/:reference` | `ConfirmationPage` |
| `/book/extend` | `ExtendPage` |
| `/book/paw-card` | `PawCardPage` |
| `/book/transfers` | `TransferBookingPage` |
| `/book/repairs` | `RepairsPage` |
| `/book/about` | `AboutPage` |
| `/book/privacy` | `PrivacyPage` |
| `/book/waiver-agreement` | `WaiverAgreementPage` |
| `/book/transfer/:token` | `PublicBookingPage` |
| `/waiver/:orderReference` | `WaiverPage` |
| `/refund-policy` | `RefundPolicyPage` |
| `/peace-of-mind` | `PeaceOfMindPage` |

#### Protected Routes (require auth; under `ProtectedRoute` → `AppLayout`)
| Path | Component | Notes |
|------|-----------|-------|
| `/dashboard` | `DashboardPage` | |
| `/orders/inbox` | `InboxPage` | |
| `/orders/active` | `ActivePage` | |
| `/orders/completed` | `CompletedPage` | |
| `/fleet` | `FleetPage` | |
| `/fleet/utilization` | `UtilizationDashboard` | Wrapped in `RequireFleetBookValue` |
| `/maintenance` | `MaintenancePage` | |
| `/transfers` | `TransfersPage` | |
| `/accounts` | `AccountsPage` | |
| `/accounts/:id` | `AccountDetailPage` | |
| `/budget` | `BudgetPage` | |
| `/card-settlements` | `CardSettlementsPage` | |
| `/cashup` | `CashupPage` | |
| `/hr/employees` | `EmployeesPage` | |
| `/hr/timesheets` | `TimesheetsPage` | |
| `/hr/payroll` | `PayrollPage` | |
| `/expenses` | `ExpensesPage` | |
| `/todo` | `TodoPage` | |
| `/misc-sales` | `MiscSalesPage` | |
| `/merchandise` | `MerchandisePage` | |
| `/lost-opportunity` | `LostOpportunityPage` | |
| `/settings` | `SettingsPage` | |
| `/ui-errors` | `UIErrorsPage` | |
| `/directory` | `DirectoryPage` | |

---

### 3.2 Pages

| File | Component | Purpose |
|------|-----------|---------|
| `pages/about/AboutPage.tsx` | `AboutPage` | Marketing / company about |
| `pages/accounting/AccountDetailPage.tsx` | `AccountDetailPage` | Single GL account ledger |
| `pages/accounting/AccountsPage.tsx` | `AccountsPage` | Accounting overview / balances |
| `pages/basket/BasketPage.tsx` | `BasketPage` | Customer checkout basket |
| `pages/booking/BrowseBookPage.tsx` | `BrowseBookPage` | Vehicle search & booking |
| `pages/booking/BrowseBookVehicleSection.tsx` | `BrowseBookVehicleSection` | Vehicle grid in booking flow |
| `pages/budget/BudgetPage.tsx` | `BudgetPage` | Budget vs actuals |
| `pages/card-settlements/CardSettlementsPage.tsx` | `CardSettlementsPage` | Card settlement reconciliation |
| `pages/cashup/CashupPage.tsx` | `CashupPage` | End-of-day cash up |
| `pages/confirmation/ConfirmationPage.tsx` | `ConfirmationPage` | Post-booking confirmation |
| `pages/dashboard/DashboardPage.tsx` | `DashboardPage` | Backoffice dashboard |
| `pages/directory/DirectoryPage.tsx` | `DirectoryPage` | Internal contacts directory |
| `pages/expenses/ExpensesPage.tsx` | `ExpensesPage` | Store expenses entry |
| `pages/extend/ExtendPage.tsx` | `ExtendPage` | Extend active rental |
| `pages/fleet/FleetPage.tsx` | `FleetPage` | Fleet list / management |
| `pages/fleet/UtilizationDashboard.tsx` | `UtilizationDashboard` | Fleet utilization metrics |
| `pages/home/HomePage.tsx` | `HomePage` | Customer marketing homepage |
| `pages/hr/EmployeesPage.tsx` | `EmployeesPage` | HR employees |
| `pages/hr/PayrollPage.tsx` | `PayrollPage` | Payroll runs |
| `pages/hr/TimesheetsPage.tsx` | `TimesheetsPage` | Timesheets |
| `pages/legal/RefundPolicyPage.tsx` | `RefundPolicyPage` | Refund policy |
| `pages/login/LoginPage.tsx` | `LoginPage` | Staff login |
| `pages/lost-opportunity/LostOpportunityPage.tsx` | `LostOpportunityPage` | Lost opportunity log |
| `pages/maintenance/MaintenancePage.tsx` | `MaintenancePage` | Maintenance records |
| `pages/merchandise/MerchandisePage.tsx` | `MerchandisePage` | Merchandise / stock |
| `pages/misc-sales/MiscSalesPage.tsx` | `MiscSalesPage` | Miscellaneous sales |
| `pages/orders/ActivePage.tsx` | `ActivePage` | Active orders |
| `pages/orders/CompletedPage.tsx` | `CompletedPage` | Completed orders |
| `pages/orders/InboxPage.tsx` | `InboxPage` | Order inbox / raw orders |
| `pages/peace-of-mind/PeaceOfMindPage.tsx` | `PeaceOfMindPage` | Peace of Mind product page |
| `pages/paw-card/PawCardPage.tsx` | `PawCardPage` | Paw Card landing / shell |
| `pages/paw-card/PawCardDashboard.tsx` | `PawCardDashboard` | Logged-in dashboard |
| `pages/paw-card/PawCardLoginPanel.tsx` | `PawCardLoginPanel` | Email lookup |
| `pages/paw-card/PawCardReceiptArea.tsx` | `PawCardReceiptArea` | Receipt upload UI |
| `pages/paw-card/PawCardSavingsDetailsFields.tsx` | `PawCardSavingsDetailsFields` | Savings form fields |
| `pages/paw-card/PawCardSavingsForm.tsx` | `PawCardSavingsForm` | Submit savings form |
| `pages/paw-card/paw-card-queries.ts` | (helpers) | React Query keys & helpers |
| `pages/paw-card/paw-card-utils.ts` | (utilities) | Savings utilities |
| `pages/privacy/PrivacyPage.tsx` | `PrivacyPage` | Privacy policy |
| `pages/repairs/RepairsPage.tsx` | `RepairsPage` | Customer repairs info |
| `pages/settings/SettingsPage.tsx` | `SettingsPage` | Backoffice settings hub (20 tabs) |
| `pages/todo/TodoPage.tsx` | `TodoPage` | Task inbox |
| `pages/todo/TaskCard.tsx` | `TaskCard` | Task card |
| `pages/todo/TaskDetailSheet.tsx` | `TaskDetailSheet` | Task detail panel |
| `pages/todo/CreateTaskModal.tsx` | `CreateTaskModal` | Create task modal |
| `pages/todo/CommentThread.tsx` | `CommentThread` | Comments thread |
| `pages/todo/EventTimeline.tsx` | `EventTimeline` | Event timeline |
| `pages/todo/ReportTab.tsx` | `ReportTab` | Task report tab |
| `pages/transfers/TransfersPage.tsx` | `TransfersPage` | Backoffice transfers |
| `pages/transfers/PublicBookingPage.tsx` | `PublicBookingPage` | Public transfer booking by token |
| `pages/ui-errors/UIErrorsPage.tsx` | `UIErrorsPage` | UI error reporting admin |
| `pages/waiver/WaiverPage.tsx` | `WaiverPage` | E-sign waiver for order |
| `pages/waiver/WaiverAgreementPage.tsx` | `WaiverAgreementPage` | Standalone waiver text |
| `pages/TransferBookingPage.tsx` | `TransferBookingPage` | Customer transfer booking |

**Settings tabs:** stores, users, roles, addons, locations, payment-methods, vehicle-models, fleet-statuses, expense-categories, task-categories, maintenance-parts, repair-costs, reviews, inspection-checklist, transfer-routes, chart-of-accounts, payment-routing, paw-card, day-types, leave-config.

---

### 3.3 Major Components (`apps/web/src/components/`)

#### `about/`
`BePawsitiveSection`, `BrandStorySection`, `PawsitiveGallery`, `TeamSection`, `TimelineSection`, `ValuesSection`

#### `accounting/`
`OwnerDrawingsModal` — post owner drawings with payment method selection

#### `basket/`
`AddOnsSection`, `BasketVehicleCard`, `OrderReviewSheet`, `OrderSummaryPanel`, `PeaceOfMindModal`, `RenterDetailsForm`, `TransferSection`, `basket-types.ts`

#### `booking/`
`HoldCountdown`, `SearchBar`, `VehicleCard`

#### `card-settlements/`
`BatchEditModal`, `CombineSettlementsModal`, `MatchSettlementModal`

#### `cashup/`
`BeforeCloseModal`

#### `common/`
`Badge`, `Button`, `DatePicker`, `ErrorBoundary`, `Modal`, (+ other primitives)

#### `confirmation/`
`QuickTipsCard`

#### `fleet/`
`ActiveRentalCard`, `FleetPreviewSection`, `RentalSummaryCard`, (+ others)

#### `home/`
`HowItWorksSection`, `InclusionMarquee`, `PawCardCallout`, (+ other marketing sections)

#### `hr/`
`EmployeeModal`, `RunPayrollModal`

#### `layout/`
`AppLayout`, `PageLayout`, `ProtectedRoute`, `RequireFleetBookValue`, `Sidebar`, `TopNav`

#### `maintenance/`
`MaintenanceLogModal`

#### `orders/`
`BookingModal`, `ExtendOrderModal`, `OrderDetailModal`, `WalkInBookingModal`

#### `settings/tabs/`
`PaymentMethodsTab`, `PaymentRoutingTab`, `PawCardTab`, (+ one tab per settings section)

#### `transfers/`
`AddTransferModal`, `DriverPaymentModal`, `TransferPaymentModal`

#### `waiver/`
`WaiverSigningTermsContent`

---

### 3.4 Custom Hooks (`apps/web/src/hooks/`)

| Hook | Purpose |
|------|---------|
| `use-payment-routing.ts` | Resolve payment routing (card vs cash vs GCash) |
| (+ other domain-specific hooks) | |

---

### 3.5 Stores (`apps/web/src/stores/`)

React state stores (Zustand or similar) for client-side state management.

---

### 3.6 API Hooks (`apps/web/src/api/`)

All hooks use React Query. Key exports per file:

| File | Key Hooks |
|------|-----------|
| `accounting.ts` | `useBalances`, `useBalancesV2`, `useAccountLedger`, `useJournalEntries`, `useCreateJournalEntry`, `useOwnerDrawings`, `useTransferFunds` |
| `budget.ts` | `useBudget`, `useUpsertBudgetLines`, `useBudgetActuals`, `useAutofillBudget` |
| `card-settlements.ts` | `usePendingSettlements`, `useSettledSettlements`, `useSettlementBalance`, `useMatchSettlement`, `useBatchEditSettlements`, `useCombineSettlements` |
| `cashup.ts` | `useCashupSummary`, `useReconcileCash`, `useOverrideCashup`, `useDepositFunds`, `useLateReturnsCheck`, `useLateReturnAssignment`, `useUpsertLateReturnAssignment`, `useInterStoreTransfer` |
| `config.ts` | `useStores`, `useAddons`, `useLocations`, `usePaymentMethods`, `useVehicleModels`, `useModelPricing`, `useStorePricing`, `useFleetStatuses`, `useExpenseCategories`, `useTransferRoutes`, `useChartOfAccounts`, `usePawCardEstablishments`, `useDayTypes`, `useLeaveConfig`, `useRoles`, `useRolePermissions`, `useUsers`, `useTaskCategories`, `useMaintenanceWorkTypes`, `useRepairCosts`, + corresponding save/delete mutation hooks |
| `dashboard.ts` | `useDashboardSummary`, `useCharityImpact` |
| `directory.ts` | `useDirectory`, `useCreateContact`, `useUpdateContact`, `useDeleteContact` |
| `expenses.ts` | `useExpenses`, `useCreateExpense`, `useUpdateExpense`, `useDeleteExpense`, `usePayExpenses` |
| `fleet.ts` | `useFleet`, `useFleetSync`, `useCreateVehicle`, `useFleetCalendar`, `useFleetUtilization`, `useVehicle`, `useUpdateVehicle`, `useRecordPurchase`, `useRecordSale`, `useBatchDepreciation`, `useAvailableVehicles` |
| `hr.ts` | `useTimesheets`, `useCheckDuplicates`, `useSubmitTimesheet`, `useApproveTimesheets`, `useSubmitLeave`, `useEmployees`, `useAllEmployees`, `useEmployee`, `useCreateEmployee`, `useSaveEmployee`, `useDeactivateEmployee`, `usePreviewPayroll`, `useRunPayroll` |
| `inspections.ts` | `useInspectionItems`, `useInspectionByOrder`, `useSubmitInspection`, `useInspectionItemsAll`, `useCreateInspectionItem`, `useUpdateInspectionItem` |
| `lost-opportunity.ts` | `useLostOpportunities`, `useCreateLostOpportunity`, `useUpdateLostOpportunity`, `useDeleteLostOpportunity` |
| `maintenance.ts` | `useMaintenanceRecords`, `useMaintenanceRecord`, `useLogMaintenance`, `useSaveMaintenance`, `useDeleteMaintenance`, `useVehicleServiceHistory`, `useCompleteMaintenance` |
| `merchandise.ts` | `useMerchandise`, `useCreateMerchandiseItem`, `useUpdateMerchandiseItem`, `useAdjustStock`, `useDeleteMerchandiseItem` |
| `misc-sales.ts` | `useMiscSales`, `useRecordMiscSale`, `useUpdateMiscSale`, `useDeleteMiscSale` |
| `orders.ts` | `useOrders`, `useEnrichedOrders`, `useOrder`, `useOrderItems`, `useOrderPayments`, `useOrderHistory`, `useOrderAddons`, `useModifyAddons`, `useAdjustDates`, `useOrderSwaps`, `useActivateOrder`, `useSettleOrder`, `useCollectPayment`, `useSwapVehicle` |
| `orders-raw.ts` | `useOrdersRaw`, `useOrderRaw`, `useProcessRawOrder`, `useCollectPayment`, `useCreateWalkIn`, `useCancelRawOrder`, `useCreateWalkInDirect` |
| `paw-card.ts` | `usePawCardLookup`, `useEstablishments`, `useLifetimeSavings`, `useCustomerPawCardSavings`, `useSubmitPawCard`, `useCompanyImpact`, `useMySubmissions`, `useLeaderboard`, `useRegisterCustomer`, `useUploadReceipt` |
| `reviews.ts` | `useReviews`, `useSaveReview`, `useDeleteReview`, `usePublicReviews` |
| `todo.ts` | `useTasks`, `useTask`, `useCreateTask`, `useUpdateTask`, `useAcknowledgeTask`, `useStartTask`, `useSubmitTask`, `useVerifyTask`, `useRejectTask`, `useEscalateTask`, `useTaskComments`, `useAddTaskComment`, `useTaskEvents`, `useUnseenTaskCount`, `useTaskNotifications`, `useDismissNotification`, `useMarkAllNotificationsRead`, `useMarkTaskSeen`, `useTaskReport` |
| `transfers.ts` | `useTransfers`, `useTransfer`, `useCreateTransfer`, `useRecordTransferPayment`, `useRecordDriverPayment` |
| `ui-errors.ts` | `useUIErrors`, `useCreateUIError`, `useUpdateUIErrorFixed` |

---

### 3.7 Payment-Related UI

No Stripe integration found. All payments are handled in-house via payment method selection + Supabase.

| Component / Page | Payment Relevance |
|-----------------|------------------|
| `components/basket/OrderSummaryPanel.tsx` | Card surcharge %, payment method radios |
| `components/basket/OrderReviewSheet.tsx` | Payment method label, deposit display |
| `components/card-settlements/BatchEditModal.tsx` | Settlement batch edit |
| `components/card-settlements/CombineSettlementsModal.tsx` | Combine settlement rows |
| `components/card-settlements/MatchSettlementModal.tsx` | Match to bank; card fee / receivable accounts |
| `components/cashup/BeforeCloseModal.tsx` | Pre-cash-up checklist |
| `components/accounting/OwnerDrawingsModal.tsx` | Payment method for owner drawings |
| `components/orders/BookingModal.tsx` | Card payment pre-activation, surcharge, waive fee, settlement refs |
| `components/orders/ExtendOrderModal.tsx` | Payment status and methods for extension |
| `components/orders/OrderDetailModal.tsx` | Payments tab, collect payment, settle, surcharges, Paw Card savings, card refs |
| `components/orders/WalkInBookingModal.tsx` | Walk-in financial / payment flows |
| `components/transfers/TransferPaymentModal.tsx` | Transfer payment + card reference / pending settlement |
| `components/transfers/DriverPaymentModal.tsx` | Driver fee payments |
| `components/settings/tabs/PaymentMethodsTab.tsx` | Surcharge % config |
| `components/settings/tabs/PaymentRoutingTab.tsx` | Received-into, card settlement, card fee account routing |
| `components/settings/tabs/PawCardTab.tsx` | Paw Card establishments admin |
| `components/waiver/WaiverSigningTermsContent.tsx` | Card convenience fee / payment terms |
| `pages/basket/BasketPage.tsx` | Payment methods (incl. card), checkout |
| `pages/card-settlements/CardSettlementsPage.tsx` | Card settlements UI |
| `pages/cashup/CashupPage.tsx` | Cash-up; card sales, misc sales by card |
| `pages/expenses/ExpensesPage.tsx` | Payment method selection, routing, confirm payment |
| `pages/misc-sales/MiscSalesPage.tsx` | Payment method + received-into accounts |
| `pages/paw-card/*` | Full Paw Card loyalty programme UI |
| `pages/settings/SettingsPage.tsx` | Hosts Payment Methods, Payment Routing, Paw Card tabs |
| `pages/transfers/TransfersPage.tsx` | Payment status, transfer payment modals |
| `hooks/use-payment-routing.ts` | Payment routing resolution logic |
| `api/card-settlements.ts` | Card settlement API hooks |
| `api/cashup.ts` | Cash-up / reconciliation API hooks |
| `api/orders.ts` | `useOrderPayments`, `useCollectPayment`, `useSettleOrder` |

---

## 4. ENVIRONMENT VARIABLES

### 4.1 Documented (in `.env.example` files)

#### `apps/api/.env.example` / root `.env.example`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `ALLOWED_ORIGIN`
- `AERODATABOX_API_KEY`
- `PORT`
- `NODE_ENV`

#### `apps/web/.env.example`
- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 4.2 Used in Code But NOT in `.env.example` (undocumented)

| Variable | Location | Notes |
|----------|----------|-------|
| `CORS_ORIGIN` | `apps/api/src/server.ts` | Fallback CORS origin, not in example |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `apps/api/src/adapters/google-sheets/sheets-client.ts` | Code uses JSON blob, example uses split EMAIL+KEY |
| `WEB_URL` | `apps/api/src/routes/public-waiver.ts` | Used for waiver deep-link |
| `RUN_FLEET_STATUS_SYNC` | `apps/api/src/jobs/fleet-status-sync.ts` | Feature flag for job |
| `RUN_LEAVE_RESET` | `apps/api/src/jobs/leave-reset.ts` | Feature flag for job |
| `RUN_RECURRING_BILLS` | `apps/api/src/jobs/recurring-bills.ts` | Feature flag for job |
| `RUN_SHEETS_SYNC` | `apps/api/src/jobs/sheets-sync.ts` | Feature flag for job |
| `TRUST_PROXY` | `apps/api/src/server.ts` | Express trust proxy setting |
| `FLEET_STORE_MAP` | `apps/api/scripts/import-fleet-csv.ts` | Script-only mapping |
| `VITE_SITE_URL` | `apps/web/src/components/orders/WalkInBookingModal.tsx` | Used in frontend, not in web example |
| `WEBHOOK_SECRET_LOLAS` | `supabase/functions/order-webhook/index.ts` | Edge function secret (Supabase dashboard) |
| `WEBHOOK_SECRET_BASS` | `supabase/functions/order-webhook/index.ts` | Edge function secret (Supabase dashboard) |

### 4.3 Supabase Edge Function Variables
Set in Supabase dashboard (not `.env` files):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEBHOOK_SECRET_LOLAS`
- `WEBHOOK_SECRET_BASS`

---

## 5. KNOWN GAPS / TODO COMMENTS

### 5.1 TODO Comments

All `// TODO` comments found in the codebase:

**File:** `apps/api/src/adapters/supabase/budget-repo.ts`

| Line | Comment |
|------|---------|
| ~136 | `// TODO: Replace JS aggregation with a Supabase RPC for better performance` |
| ~186 | `// TODO: Replace JS aggregation with a Supabase RPC for better performance` |
| ~247 | `// TODO: Replace JS aggregation with a Supabase RPC for better performance` |

**`// FIXME` comments:** None found.

---

### 5.2 Migration Gaps

- **Migrations 028 and 029 are missing** from the `supabase/migrations/` directory. The sequence jumps from `027_consolidate_company_accounts.sql` directly to `030_paw_card_enhancements.sql`.

---

### 5.3 Schema / Code Inconsistencies Noted

1. **`055_atomic_extend_cancel.sql`** references `orders_raw.status = 'cancelled'`, `orders_raw.cancelled_at`, and `orders_raw.cancelled_reason` — these columns are not defined in any migration. May be set via RPC body logic or may be missing DDL.

2. **`booking_holds.order_reference`** — referenced in cancel RPC logic (migration 055) but not defined as a column in `036_booking_holds.sql`.

3. **`budget-repo.ts`** aggregates data in JavaScript instead of using Supabase RPCs (3× TODO comments flagging this as a known performance gap).

4. **`GOOGLE_SERVICE_ACCOUNT_JSON`** vs **`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`** — the `.env.example` documents the split key form but the actual adapter code reads a JSON blob variable. Documentation and code are out of sync.

5. **`VITE_SITE_URL`** is used in `WalkInBookingModal.tsx` but absent from `apps/web/.env.example`.

6. **`order_payments` table** was created in migration 013 and dropped in 015 — any references to it in older code or seeds should be reviewed.

---

## 6. EDGE FUNCTIONS

| Function | File | Description |
|----------|------|-------------|
| `order-webhook` | `supabase/functions/order-webhook/index.ts` | HTTP handler: validates `?store=lolas\|bass`, verifies WooCommerce HMAC (`x-wc-webhook-signature`) or shared secret (`x-webhook-secret`), inserts JSON payload into `orders_raw` using service role |

---

## 7. BACKGROUND JOBS (`apps/api/src/jobs/`)

| Job | Env Flag | Description |
|-----|----------|-------------|
| `fleet-status-sync.ts` | `RUN_FLEET_STATUS_SYNC` | Syncs fleet statuses |
| `leave-reset.ts` | `RUN_LEAVE_RESET` | Annual leave reset for stores |
| `recurring-bills.ts` | `RUN_RECURRING_BILLS` | Auto-posts recurring bills to ledger |
| `sheets-sync.ts` | `RUN_SHEETS_SYNC` | Syncs data to Google Sheets |

---

*End of AUDIT_V6*
