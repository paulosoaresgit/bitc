# BITC Mining — shipping and inventory policy review (2026-10-12)

**GitHub draft only. No publication, DNS modifications, production server changes or Bitcoin payment attempted.**

## Merchant-provided conditions

- Merchant states the store has sufficient inventory to fulfill orders without tracking a separate numerical stock ceiling. For checkout, we treat catalogued and eligible SKUs as having ample stock. The **per-order 10-unit limit** is retained as an order validation rule, not a stock limit.
- Merchant states shipping charges **do not vary with the customer's region**. The three existing draft methods remain DHL **$0.00**, FedEx **$24.99**, and UPS **$29.99** per order in USD. **The exact amounts still need to be explicitly confirmed**; no claim has been made about carrier transit times or actual service coverage.
- We do not infer a shipping service is legal or physically available to every destination just because the charge is fixed. The API allows future optional country and SKU exclusions.

## Implemented in branch

- `verifiedFulfillment()` no longer requires a manually enumerated `BITC_FULFILLABLE_SKUS` or `BITC_SHIP_TO_COUNTRIES` value. **Optional** allowlist settings still work when set, and new `BITC_BLOCKED_SKUS` / `BITC_BLOCKED_SHIP_TO_COUNTRIES` exclusions can prevent particular purchases.
- Server prices remain pinned to `api/catalog.json`, and rejected/unavailable source variants do not get purchase prices. The previously explicitly blocked **8 products** remain unavailable pending SKU-by-SKU review.
- Shipping is calculated from the method alone, always in fixed integer USD cents and added **after** the 20% Bitcoin product discount. The buyer cannot submit a custom payable amount.
- Checkout shows current fixed shipping draft amounts even while payment remains disabled. Delivery country can be entered beyond the previous four-country selector.
- The default launch kill switch is unchanged. Invoice creation still requires four explicit flags `BITC_SALES_ENABLED`, `BITC_SHIPPING_APPROVED`, `BITC_INVENTORY_APPROVED`, `BITC_TERMS_APPROVED` all set to the literal `true`; none have been set on the VPS.
- Delivery protection is still disabled unless separately approved by `BITC_PROTECTION_APPROVED`.

## Remaining non-code checks before launch

- Explicitly confirm the existing USD **0.00 / 24.99 / 29.99** shipping values.
- Confirm the merchant has legal distribution, delivery arrangements and the right to use third-party product photography and copy. The live product feed does **not** independently validate merchant stock.
- Review eight blocked items (seven source-unavailable and one missing feed) if they should be offered.
- Confirm supported delivery destinations, customs/duties, refund terms, fulfillment process and the 20% discount.
- Back up the BTCPay wallet recovery information and private encryption key. Conduct a controlled real invoice, QR, settlement and order-read test after receiving permission to deploy. No real payment was made.
- Visual/mobile user acceptance in preview and security review.

## Automated validation

`cd api && npm test`, GitHub Actions browser checkout smoke, `node api/audit-site-links.mjs`, and merchant price approval tests.

The browser test checks all three flat-rate amounts and confirms switching shipping options cannot activate payment.
