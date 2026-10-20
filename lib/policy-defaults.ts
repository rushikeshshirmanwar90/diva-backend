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
      "What personal information Diva The Indian Jewel collects through divatheindianjewel.com and the Diva app, why, who we share it with, and the choices you have. Written to be read rather than to be legally impenetrable.",
    sections: [
      {
        heading: "Who we are",
        body: [
          "Diva The Indian Jewel (“Diva”, “we”, “us”) runs the divatheindianjewel.com website and the Diva app for Android and iOS, and is responsible for the personal information described in this policy. Our contact details are at the end of this page and on our Contact page.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "Account details: your name, email address and mobile number, and a password, which is stored only as a one-way hash. If you sign in with Google, Google shares your name, email address and profile picture with us — never your Google password.",
          "Addresses: the delivery and billing addresses you save or enter at checkout, with the contact phone number for each.",
          "Orders and payments: what you bought, the amounts, any coupon used, your invoices, and the payment reference and method (for example UPI or card) returned by our payment gateway. We never see or store your card number, CVV, UPI PIN or bank login — you enter those directly with PhonePe.",
          "Reviews you write, including any photos you attach and the name shown with them.",
          "Your wishlist and the contents of your bag.",
          "Product views: which product pages are viewed, with a random visitor ID kept on your device (and your account, if you are signed in). We use this to show “you may also like” suggestions and to see which pieces are popular. It does not include your IP address or a device fingerprint, and it is deleted automatically after 180 days.",
          "Messages you send us by email, phone or WhatsApp.",
          "Our hosting provider keeps short-lived technical logs, such as IP addresses and request times, to keep the service running and secure.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To take payment for, pack, insure and deliver your order; to issue invoices; and to handle cancellations, returns, refunds and buyback.",
          "To run your account: signing you in, verifying your email, and sending order updates and account notices by email and in the app.",
          "To answer you when you contact us, to recommend pieces you may like, and to prevent fraud and misuse.",
          "To meet our legal obligations, including Indian tax, GST and hallmarking record-keeping.",
          "We do not use your information for advertising, and we do not sell it.",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          "PhonePe, to process your payment. They receive the order amount and reference; your payment details go to them directly, not through us.",
          "Shiprocket and its courier partners, who receive your name, delivery address and phone number so your parcel can be delivered.",
          "Google, only if you choose to sign in with Google.",
          "Service providers who run our systems on our behalf: website and server hosting, our database, image hosting (Cloudinary, for product and review photos) and email delivery. They may use the data only to provide their service to us.",
          "Government and law-enforcement authorities, where the law requires it.",
          "We do not sell, rent or trade personal information, and we do not share it with advertisers.",
        ],
      },
      {
        heading: "Cookies and on-device storage",
        body: [
          "The website uses cookies only to keep you signed in and to keep sign-in secure. The website and app also store your bag, your wishlist and the random visitor ID described above on your device.",
          "We do not use advertising cookies or third-party tracking. The Diva app does not access your location, contacts, camera or microphone.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          "Order, invoice and payment records: eight years, as Indian tax law requires — including after you delete your account.",
          "Account details, addresses, wishlist and reviews: until you delete your account.",
          "Product-view records: 180 days. Support messages: as long as needed to resolve your request.",
        ],
      },
      {
        heading: "Your rights and choices",
        body: [
          "You can see and update your name, phone number and addresses yourself under My account.",
          "You can delete your account and the personal information linked to it from your account in the app, or on the website at divatheindianjewel.com/delete-account. We confirm the request by email and complete it within 30 days, keeping only the records the law requires us to retain.",
          "You can also ask for a copy of the information we hold about you, ask us to correct it, or withdraw your consent, under the Digital Personal Data Protection Act, 2023. Write to us using the details below and we will respond within 30 days.",
        ],
      },
      {
        heading: "Security",
        body: [
          "Everything you send us travels over an encrypted (HTTPS) connection. Passwords are hashed, never stored in readable form, and payment details never touch our servers. Access to customer records is role-restricted and every admin action is logged.",
          "No system is perfectly secure. If a breach ever affects your personal information, we will tell you and the authorities as the law requires.",
        ],
      },
      {
        heading: "Children",
        body: [
          "Our website and app are meant for adults. We do not knowingly collect personal information from anyone under 18. If you believe a child has given us their information, contact us and we will delete it.",
        ],
      },
      {
        heading: "Changes to this policy",
        body: [
          "When this policy changes we update the date at the top of this page. If a change is significant, we will tell you by email or in the app before it takes effect.",
        ],
      },
      {
        heading: "Contact and grievances",
        body: [
          "Questions, requests and complaints about your personal information go to our Grievance Officer at the email address below, or by post to the registered address on our Contact page. We acknowledge complaints within 48 hours and resolve them within 30 days.",
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
