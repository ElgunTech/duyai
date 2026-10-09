import type { RiskAssessment, RiskCategory, RiskLevel } from "../types";
import { tr } from "../i18n/i18n";

/**
 * Instant, offline scam check that runs the moment a phrase is recognized, before the
 * AI assessment arrives. Covers the requests a legitimate caller never makes, in the
 * supported languages (AZ, TR, RU, DE, EN, FR).
 */
const PATTERNS: { category: RiskCategory; pattern: RegExp }[] = [
  {
    category: "cvv",
    pattern:
      /\b(cvv2?|cvc2?)\b|arxa\s*t[əe]r[əe]f\S*\s+\S*\s*(r[əe]q[əe]m|kod)|arkas\S*\s*(rakam|numara|kod)|три\s*цифры|код\s*безопасности|prüfziffer|sicherheitscode|cryptogramme/iu,
  },
  {
    category: "otp",
    pattern:
      /sms[\s-]*(kod|code|kodu)|смс[\s-]*код|код\s*(из|с)\s*смс|(birdəfəlik|birdefelik|təsdiq|tesdiq)\s*kod|(doğrulama|onay)\s*kod|one[\s-]*time\s*(code|password)|verification\s*code|\botp\b|код\s*(подтверждения|из)|bestätigungscode|\btan\b|code\s*de\s*(vérification|confirmation)/iu,
  },
  {
    category: "card",
    pattern:
      /kart\S*\s*(nömr|nomr|numara)|card\s*(number|details)|kartennummer|номер\s*(вашей\s*)?карт|numéro\s*de\s*carte/iu,
  },
  { category: "pin", pattern: /\bpin\b|пин[\s-]*код/iu },
  { category: "password", pattern: /şifr[əe]|\bparol|password|passwort|пароль|mot\s*de\s*passe/iu },
  {
    category: "remote_access",
    pattern: /anydesk|teamviewer|rustdesk|quick\s*support|uzaqdan\s*idar|удал[её]нн\S*\s*доступ/iu,
  },
];

export function detectScam(text: string): RiskAssessment | null {
  const hit = PATTERNS.find(({ pattern }) => pattern.test(text));
  return hit ? { level: "danger", category: hit.category, reason: "" } : null;
}

/** What the other party asked for, in the caller's language. */
export const RISK_LABEL: Record<RiskCategory, string> = {
  none: "",
  get card() {
    return tr("kart nömrəsini istəyir", "is asking for your card number");
  },
  get cvv() {
    return tr("kartın CVV kodunu istəyir", "is asking for your card's CVV");
  },
  get otp() {
    return tr("SMS və ya təsdiq kodunu istəyir", "is asking for an SMS or verification code");
  },
  get pin() {
    return tr("PIN kodu istəyir", "is asking for a PIN");
  },
  get password() {
    return tr("şifrə istəyir", "is asking for a password");
  },
  get remote_access() {
    return tr(
      "uzaqdan idarə proqramı quraşdırmağı istəyir",
      "wants you to install a remote-control app",
    );
  },
  get money() {
    return tr("pul köçürməyi istəyir", "is asking you to transfer money");
  },
  get impersonation() {
    return tr(
      "özünü bank və ya rəsmi qurum kimi təqdim edir",
      "claims to be a bank or an official body",
    );
  },
  get other() {
    return tr("şübhəli tələb edir", "is making a suspicious request");
  },
};

const LEVEL_RANK: Record<RiskLevel, number> = { none: 0, warning: 1, danger: 2 };

/** The more severe of two assessments (the AI may upgrade, never silently downgrade, an alert). */
export function moreSevere(a: RiskAssessment | undefined, b: RiskAssessment | undefined) {
  if (!a) return b;
  if (!b) return a;
  return LEVEL_RANK[b.level] > LEVEL_RANK[a.level] ? b : { ...a, reason: a.reason || b.reason };
}

export const isRisky = (risk: RiskAssessment | undefined) => !!risk && risk.level !== "none";
