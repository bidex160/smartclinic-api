# Provider earnings ledger

Payment collection and Provider revenue accounting are separate. A successful collection says SmartClinic received money; a Provider earning snapshots how an eligible product's gross commercial amount is allocated. Commission is deducted from Provider revenue and never added to the patient price.

Health Check settlement creates one `HELD` earning inside the same locked transaction as the successful payment/funding transition. Its gross and currency come from the immutable Booking quote, and its Provider comes from the Booking commercial binding. Split reward/Paystack funding validates the settled reward plus collection total against the quote; points-only funding may have no PaymentTransaction. The unique `(sourceType, sourceReference)` key remains authoritative in either case, and a non-null PaymentTransaction can belong to at most one earning.

The commission resolver and integer half-up calculator snapshot the rate source, basis points, commission, and Provider share. Later configuration or catalogue changes do not affect the row. Missing applicable commission configuration causes new earning creation—and therefore the containing new settlement transaction—to fail closed.

Health Check completion advances `HELD` to `PAYABLE` in the encounter-completion transaction. `UNFULFILLABLE` does not make an earning payable or void it. `SETTLED` and `VOIDED` exist for future controlled settlement/refund domains and have no public mutation endpoint.

Providers can read only their own ledger and per-currency balance groups through `/api/v1/provider/earnings`. Admin and Operations have read-only cross-Provider access through `/api/v1/admin/provider-earnings`. Responses exclude internal IDs, patient information, and payment-provider metadata.

The migration does not fabricate earnings for historical successful transactions. Those require a future explicit reconciliation process with an authoritative historical commission source.
