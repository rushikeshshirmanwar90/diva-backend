import type { PolicySection, PolicySlug } from "@/models/Policy";

/**
 * Seed copy for each policy, used the first time it is read and no document
 * exists yet. Verbatim from diva-frontend's old static `lib/data/policies.ts`
 * (shipping and returns sections only — privacy and terms stayed static),
 * so switching to the database does not blank the storefront on day one.
 */

export const DEFAULT_POLICIES: Record<PolicySlug, { title: string; intro: string; sections: PolicySection[] }> = {
  shipping: {
    title: "Shipping policy",
    intro:
      "Every Diva shipment is insured for its full declared value and requires a photo ID at delivery. Here is exactly how it works.",
    sections: [
      {
        heading: "Dispatch times",
        body: [
          "In-stock pieces are quality-checked, hallmarked and dispatched within 48 working hours of payment confirmation.",
          "Made-to-order and bridal pieces take 6–8 weeks from the date the design is frozen. You receive a written production timeline when you confirm the order, and a photograph of the piece before it ships.",
        ],
      },
      {
        heading: "Delivery times and charges",
        body: [
          "Standard insured delivery reaches Indian metros in 2–4 working days and non-metros in 4–7. It is complimentary on all orders above ₹2,000.",
          "Express insured delivery is next working day in metros, charged at ₹499.",
          "We ship only through Bluedart and Delhivery secure-jewellery services. We do not use ordinary parcel services for jewellery at any value.",
        ],
      },
      {
        heading: "At delivery",
        body: [
          "A photo ID matching the name on the order is required. The courier will not hand over a jewellery shipment to a third party, including family members, without prior written authorisation from you.",
          "Please film or photograph the unopened package if the outer seal looks tampered with, and refuse delivery. Insurance claims are straightforward when the package is refused and near-impossible once it has been accepted.",
        ],
      },
      {
        heading: "Serviceability",
        body: [
          "We deliver to roughly 19,400 pincodes in India. The pincode checker on each product page tells you the expected date before you buy.",
          "We do not ship outside India yet. We are working through customs and hallmarking requirements for the UAE, UK and Singapore.",
        ],
      },
    ],
  },
  returns: {
    title: "Returns & exchange",
    intro:
      "Fifteen days to return, thirty for one free size exchange, and no restocking fee. We would rather you had the right piece than the right paperwork.",
    sections: [
      {
        heading: "Returns",
        body: [
          "In-stock pieces can be returned within 15 days of delivery, provided the BIS hallmark tag is unbroken and the piece is unworn.",
          "Refunds are credited to the original payment method within 5 working days of the piece reaching our workshop and passing a purity and weight check.",
          "Made-to-order, engraved and bridal pieces cannot be returned, because they cannot be resold. This is stated again at checkout on those items.",
        ],
      },
      {
        heading: "Size exchange",
        body: [
          "One free exchange within 30 days, including two-way courier, on rings, bangles and bracelets. Rings and bangles are the most commonly mis-sized purchases in jewellery and we do not think you should pay for that.",
          "If the new size costs more because of added metal weight, you pay only the difference at the original locked gold rate.",
        ],
      },
      {
        heading: "Buyback",
        body: [
          "We buy back pieces bought from us at 100% of current metal value, and pieces bought elsewhere at 92%, in both cases after an in-person purity assay at one of our counters.",
          "Stone value is assessed separately and depends on the certificate. Making charges are not refunded in a buyback — they were paid for labour that was performed.",
        ],
      },
      {
        heading: "Damaged or incorrect items",
        body: [
          "Tell us within 48 hours of delivery. We arrange a pickup at our cost and either replace the piece or refund in full, your choice, with no assay requirement.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    intro:
      "What we collect, why, and how long we keep it. Written to be read rather than to be legally impenetrable.",
    sections: [
      {
        heading: "What we collect",
        body: [
          "Account details you give us: name, email, mobile, delivery addresses, and date of birth if you choose to add it.",
          "Order and payment records: what you bought, when, and the payment reference. We never see or store your full card number, CVV or UPI PIN — those are handled entirely by PhonePe's gateway.",
          "Usage data: pages viewed and searches run, used to improve what we show you. You can opt out of analytics cookies in the cookie banner without losing any site functionality.",
        ],
      },
      {
        heading: "Why we collect it",
        body: [
          "To fulfil and insure your order, to handle returns and buyback, to comply with Indian tax and hallmarking record-keeping requirements, and to answer you when you contact support.",
          "We do not sell personal data. We do not share it with advertisers.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          "Order and invoice records for eight years, as Indian tax law requires. Account details until you ask us to delete them. Analytics data for 14 months.",
          "You can request a copy of everything we hold, or ask us to delete it, by writing to support@diva.com. We respond within 30 days.",
        ],
      },
      {
        heading: "Security",
        body: [
          "Passwords are hashed, never stored in readable form. Payment data never touches our servers. Access to customer records is role-restricted and every admin action is logged.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of service",
    intro:
      "The rules that apply when you buy from diva.com. Plain language, and we have tried to keep it short.",
    sections: [
      {
        heading: "Pricing and gold rate",
        body: [
          "Gold is a live commodity and prices on the site update against the daily rate. The rate is locked when you reach checkout and held for 30 minutes; if the window expires the cart re-prices and tells you what changed before you pay.",
          "For made-to-order and bridal work the rate locks on the advance payment, not on delivery. Movements in the gold price during production are ours to absorb, not yours.",
          "All prices include 3% GST. Making charges and stone value are shown separately on every product page.",
        ],
      },
      {
        heading: "Orders and acceptance",
        body: [
          "An order is a request until we confirm it. We may decline an order where a piece is mispriced by an obvious error, where stock has sold out between page load and payment, or where a delivery address cannot be serviced securely.",
          "If we decline a confirmed and paid order, you are refunded in full within 5 working days.",
        ],
      },
      {
        heading: "Hallmarking and certification",
        body: [
          "Every gold piece carries a BIS hallmark and a six-digit HUID which you can verify independently in the BIS Care app. Diamond pieces above 0.30ct ship with an IGI or GIA certificate.",
          "If any piece is found not to match its declared purity by an independent BIS-recognised assay, we refund the full amount and the cost of the assay.",
        ],
      },
      {
        heading: "Governing law",
        body: [
          "These terms are governed by Indian law, with jurisdiction in the courts of Bengaluru, Karnataka.",
        ],
      },
    ],
  },
};
