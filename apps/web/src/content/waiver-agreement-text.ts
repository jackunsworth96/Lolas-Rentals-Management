/** Rental agreement / waiver copy (read-only reference; keep in sync with signed flow). */
export interface WaiverSection {
  heading: string;
  body: string;
}

/** Pairs heading + body blocks (split on blank lines in {@link WAIVER_LEGAL_TEXT}). */
export function getWaiverSections(): WaiverSection[] {
  const parts = WAIVER_LEGAL_TEXT.trim().split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const out: WaiverSection[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const heading = parts[i];
    const body = parts[i + 1] ?? '';
    if (heading) out.push({ heading, body });
  }
  return out;
}

export const WAIVER_LEGAL_TEXT = `
Rental Agreement and Waiver

This Rental Agreement and Waiver is a legally binding contract between the customer ("Buyer") and Lola's Rentals and Tours Inc. ("Seller").

Risk — R.A. 4136

The Buyer acknowledges that operating a motor vehicle on public roads involves inherent risks. The Buyer confirms they hold a valid driving licence as required under Republic Act No. 4136 (Land Transportation and Traffic Code) and applicable LTO rules, and that they are legally permitted to operate the class of vehicle rented. The Seller may refuse rental if documentation is invalid or insufficient.

Assumption of Risk

The Buyer voluntarily assumes all risks associated with the use of the rented vehicle, including but not limited to traffic accidents, injury, death, property damage, road conditions, weather, and actions of third parties. The Buyer agrees that the Seller is not liable for such risks except where liability cannot be excluded under applicable law.

Safety / Helmet Guidelines

The Buyer must wear an approved helmet at all times when riding. Passengers must also wear helmets where required. The Buyer must follow local traffic laws, speed limits, and safe riding practices. Failure to use safety equipment or ride responsibly may void certain protections and may result in additional charges or termination of rental.

Early Return / Refund Policy

Early return does not automatically entitle the Buyer to a refund of unused rental time unless the Seller agrees in writing. Fees already paid for booked periods may be non-refundable per the rate plan selected at booking.

Rental Extension

Extensions are subject to availability and must be arranged with the Seller before the scheduled return time. Additional days are charged at the applicable daily rate. Unauthorized late return may incur late fees.

Product Exchange

Requests to change vehicle model or equipment are subject to availability and may incur price adjustments. Exchanges are at the Seller's discretion.

Vehicle Swapping

If the Seller substitutes a comparable vehicle due to operational reasons, the Buyer will be notified where practicable. Rates may be adjusted to reflect the substitute vehicle category.

Booking Additional Bike

Additional units may be added subject to fleet availability, separate agreement, and payment of applicable deposits and rental charges.

Road Clearance

The Buyer is responsible for compliance with any local road access, environmental, or municipal requirements affecting vehicle use in the agreed usage area.

Maintenance

The Buyer must report mechanical issues, warning lights, or unsafe conditions immediately. The Buyer must not attempt major repairs without Seller authorization. Normal wear is expected; abuse or neglect may be charged to the Buyer.

Payment

The Buyer agrees to pay all rental fees, add-ons, deposits, damages, fuel shortfalls, late fees, and other lawful charges as quoted or invoiced. Payment methods accepted are as communicated by the Seller at pickup or in booking communications.

Buyer Responsibility

The Buyer is responsible for the vehicle from handover until return, including security, keys, accessories, and compliance with this agreement. The Buyer must not allow unauthorized persons to operate the vehicle.

Return Guidelines

The vehicle must be returned on the agreed date, time, and location, with keys and accessories, in the same general condition as received (ordinary wear excepted). The Buyer must allow reasonable time for inspection.

9pm Return Guidelines

Unless otherwise agreed in writing, returns after 9:00 PM may incur after-hours fees or require prior arrangement. Late return without approval may be treated as unauthorized use.

Product Inspection

The Buyer participates in pre-rental and return inspection. Any damage or missing items noted at return may be charged in accordance with this agreement and the damage assessment process.

Tyre Check

The Buyer should verify tyre condition at pickup and report defects. Damage to tyres from misuse, punctures off-road, or improper inflation may be charged to the Buyer.

Existing Damages

Pre-existing damage is recorded at pickup. The Buyer should confirm the record before departure. Unreported damage discovered at return that is not consistent with the pickup record may be attributed to the rental period.

Damages / Repairs / Theft

The Buyer is liable for loss of or damage to the vehicle, accessories, and third-party property arising during the rental, except to the extent covered by Peace of Mind or other purchased protection where applicable and subject to its terms. Theft must be reported immediately to the Seller and authorities. Police reports may be required.

Peace of Mind Cover

Where purchased, Peace of Mind may reduce certain excess charges for covered events as described at booking and on the Seller's materials. It is not insurance and does not waive all liabilities. Exclusions and excesses apply.

Fuel

The vehicle must be returned with the agreed fuel level (typically full-to-full). Shortfalls may be refilled at the Buyer's expense plus a service fee if applicable.

Travel Insurance

The Buyer is encouraged to carry adequate travel and medical insurance. The Seller does not provide travel insurance as part of the rental.

Deposit

A security deposit may be held and applied toward lawful charges including damages, fuel, late fees, or traffic penalties. Release of the deposit is subject to satisfactory return and clearance of any claims.

Usage Area

Use is restricted to agreed roads and areas communicated by the Seller. Off-road use, racing, stunts, or use outside the permitted area may void protection and incur penalties.

GPS Tracking

Fleet vehicles may be equipped with location or telematics devices for security, recovery, and operational purposes. By renting, the Buyer consents to such use as described in the Seller's privacy notice.

Call Out Charge

Service calls, recovery, or roadside attendance caused by Buyer error (e.g. lost keys, wrong fuel, preventable flat) may incur call-out fees plus parts and labour.

Subletting

The Buyer must not sublet, lend for hire, or transfer possession of the vehicle to others without written consent from the Seller.

Drink Driving

Operating the vehicle under the influence of alcohol or illegal drugs is strictly prohibited and may result in immediate termination, forfeiture of deposit, and referral to authorities.

LTO / Legal Compliance

The Buyer must comply with LTO registration, licence, and equipment requirements visible on the vehicle. Fines or penalties incurred during the rental are the Buyer's responsibility unless attributable solely to the Seller.

Weight Restriction

The Buyer must respect manufacturer weight and loading limits. Overloading may damage the vehicle and void certain protections.

Phone Mount

If supplied, phone mounts are used at the Buyer's risk. The Seller is not liable for device damage or distraction-related incidents.

Surf Rack

If a surf rack or similar accessory is fitted, the Buyer must secure cargo properly. Damage from improper loading or exceeding recommended capacity may be charged to the Buyer.

General

By proceeding, the Buyer confirms they have read, understood, and agree to be bound by this Rental Agreement and Waiver, including all sections above.
`.trim();
