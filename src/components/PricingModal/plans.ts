export interface Plan {
  id: "free" | "premium" | "business";
  name: string;
  price: string;
  period: string;
  minutes: string;
  extra: string | null;
  tagline: string;
  features: { label: string; included: boolean }[];
  highlight?: boolean;
}

/** Subscription plans (prices in USD; our cost is about $0.07 per call minute). */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    minutes: "15 min / month",
    extra: null,
    tagline: "Talk: enough for 2–3 real calls",
    features: [
      { label: "Two-way voice translation, 21 languages", included: true },
      { label: "Scam alerts (always free)", included: true },
      { label: "Live captions", included: false },
      { label: "Call report + calendar actions", included: false },
      { label: "Call memory", included: false },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$11.99",
    period: "/ month",
    minutes: "100 min / month",
    extra: "$0.17 / extra min",
    tagline: "Talk, and keep what was agreed",
    highlight: true,
    features: [
      { label: "Everything in Free", included: true },
      { label: "Live captions", included: true },
      { label: "Call report + calendar, reminders, commitments", included: true },
      { label: "Call memory (recognizes returning callers)", included: true },
      { label: "AI auto-answer, higher-accuracy translation", included: true },
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "$49",
    period: "/ user / month",
    minutes: "300 min / month",
    extra: "$0.13 / extra min",
    tagline: "For teams taking foreign-language calls",
    features: [
      { label: "Everything in Premium", included: true },
      { label: "Shared call memory for the team", included: true },
      { label: "CRM export, team dashboard", included: true },
      { label: "Priority support", included: true },
    ],
  },
];
