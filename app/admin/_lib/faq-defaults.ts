import type { FaqGroup } from "@/app/admin/_lib/api";

/**
 * The questions the storefront shows until an admin writes their own.
 *
 * Mirrors `lib/data/content.ts#faqs` in `diva-frontend`: when `settings.faqs`
 * is empty the storefront falls back to that list, so the editor seeds from
 * the same copy rather than opening on a blank page that contradicts the site.
 */
export const DEFAULT_FAQS: FaqGroup[] = [
  {
    group: "Orders & Delivery",
    items: [
      {
        q: "How long does delivery take?",
        a: "In-stock pieces ship within 48 hours and reach most Indian metros in 2–4 working days, insured and fully tracked. Made-to-order and bridal pieces take 6–8 weeks from design freeze.",
      },
      {
        q: "Is shipping insured?",
        a: "Yes. Every shipment is insured for its full declared value until it is signed for. We ship only through Bluedart and Delhivery secure-jewellery services.",
      },
      {
        q: "Do you ship outside India?",
        a: "Not yet. We are working through customs and hallmarking requirements for the UAE, UK and Singapore.",
      },
    ],
  },
  {
    group: "Pricing & Payment",
    items: [
      {
        q: "What does the price include?",
        a: "Metal value at today's rate, making charges, stone value where applicable, and 3% GST. Every product page breaks this down line by line.",
      },
      {
        q: "Which payment methods do you accept?",
        a: "UPI, all major credit and debit cards, net banking and no-cost EMI on orders above ₹25,000, all through PhonePe's secure gateway.",
      },
    ],
  },
  {
    group: "Returns, Exchange & Buyback",
    items: [
      {
        q: "What is the return window?",
        a: "15 days from delivery on all in-stock pieces, provided the hallmark tag is unbroken. Refunds are credited to the original payment method within 5 working days.",
      },
      {
        q: "Can I exchange for a different size?",
        a: "Once, free, within 30 days — including two-way courier on rings, bangles and bracelets.",
      },
      {
        q: "Do you buy back old gold?",
        a: "Yes, at 100% of current metal value for pieces bought from us, and 92% for pieces bought elsewhere, after an in-person purity assay.",
      },
    ],
  },
  {
    group: "Authenticity & Care",
    items: [
      {
        q: "Is everything hallmarked?",
        a: "Every gold piece carries a BIS hallmark and a six-digit HUID you can verify yourself in the BIS Care app. Diamond pieces above 0.30ct ship with an IGI or GIA certificate.",
      },
      {
        q: "Do you offer cleaning and polishing?",
        a: "Free ultrasonic cleaning and re-polishing for life at any Diva counter. Polki and pearl pieces are cleaned by hand.",
      },
    ],
  },
];
