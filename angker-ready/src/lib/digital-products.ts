/** Digital product catalog for Mini App "🛒 Digital" section */
export type DigitalProduct = {
  id: string;
  name: string;
  price: number;
  emoji: string;
  stock: number;
  delivery: string;
  description: string[];
  imageGradient?: string;
};

export const DIGITAL_PRODUCTS: DigitalProduct[] = [
  {
    id: "dig-gemini-pro-3m",
    name: "Gemini Pro 3 Months",
    price: 3.5,
    emoji: "✨",
    stock: 91,
    delivery: "Instant",
    description: [
      "Trial — only works on accounts with no previous/active plans",
      "5TB cloud storage included",
      "Payment method required for redeem",
      "Warranty after activation 7 days",
      "Must be redeemed within 7 days of purchase",
    ],
  },
  {
    id: "dig-gemini-18m",
    name: "Gemini 18 Months",
    price: 2.0,
    emoji: "🌟",
    stock: 0,
    delivery: "Instant",
    description: [
      "Long-term plan",
      "Account delivered after payment",
      "Warranty 7 days after activation",
    ],
  },
  {
    id: "dig-chatgpt-plus-1m",
    name: "ChatGPT Plus 1 Month",
    price: 5.0,
    emoji: "🤖",
    stock: 40,
    delivery: "Instant",
    description: [
      "Official-style invite / account access",
      "Warranty 3 days after delivery",
      "Do not change recovery email for 24h",
    ],
  },
  {
    id: "dig-capcut-pro",
    name: "CapCut Pro 1 Year",
    price: 4.0,
    emoji: "🎬",
    stock: 25,
    delivery: "Instant",
    description: [
      "Pro features unlocked",
      "Delivered as login or redeem code",
      "Warranty 7 days",
    ],
  },
  {
    id: "dig-canva-pro",
    name: "Canva Pro 1 Year",
    price: 6.0,
    emoji: "🎨",
    stock: 15,
    delivery: "Instant",
    description: [
      "Team or personal seat",
      "Instant delivery after wallet charge",
      "Warranty 7 days",
    ],
  },
  {
    id: "dig-spotify-3m",
    name: "Spotify Premium 3 Months",
    price: 3.0,
    emoji: "🎵",
    stock: 50,
    delivery: "Instant",
    description: [
      "Individual plan",
      "Redeem within 7 days",
      "Warranty after activation 3 days",
    ],
  },
];
