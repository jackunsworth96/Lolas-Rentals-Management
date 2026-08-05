# Fleet depreciation cutover

Do not deploy the purchase-price formula or enable the monthly job until an accountant signs off this checklist.

## Required manual remediation

- Verify and post the missing depreciation months for Daku, Tag, Alon, Alpha, and Toffee.
- Verify the purchase dates for Chippy, Pikachu, Dax, Reymar, Winston, Koikoi, Newuba, and Patatas.
- Supply or explicitly classify Tanggol's missing purchase price, purchase date, useful life, and salvage value.
- Reconcile every manual journal to the corresponding `fleet.accumulated_depreciation` and `fleet.book_value` update. Do not use the legacy store-wide batch endpoint for selective catch-up.

## Cutover adjustment

For each vehicle, use the verified number of posted months to calculate purchase-price accumulated depreciation. The approved cutover transaction must:

1. Reclassify `set_up_costs` from the vehicle fixed-asset account to the reusable setup-asset account.
2. Reverse excess accumulated depreciation against the accountant-approved correction account.
3. Set `fleet.accumulated_depreciation` to the approved corrected amount.
4. Set `fleet.book_value` to `purchase_price - accumulated_depreciation`, capped at `salvage_value`.

Retain the signed worksheet and journal transaction IDs. Confirm vehicle fixed-asset cost equals aggregate purchase price and reusable setup assets equal the approved setup-cost balance.

## Release order

1. Complete and sign off the remediation and adjustment worksheet.
2. Apply `20260804000000_correct_fleet_depreciation.sql`.
3. Configure the reusable setup-asset and depreciation accounts for every store.
4. Deploy the API and web changes.
5. Run a reviewed manual depreciation period and confirm the run header, vehicle items, fleet balances, and balanced journal.
6. Set `ENABLE_MONTHLY_DEPRECIATION_JOB=true` only after that confirmation.

The migration backfills run headers from existing depreciation journals so previously posted store-periods cannot be posted again. Booking availability and vehicle status are outside this cutover.
