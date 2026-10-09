/**
 * Hand-written evaluation set: everyday Azerbaijani phone calls, often mixed with
 * Russian, English and Turkish words. Gold labels were written by hand, independent of
 * any model output. All calls happen on Friday 9 October 2026, 10:00 (Asia/Baku), so
 * "sabah" = 2026-10-10, "bazar ertəsi" = 2026-10-12, "cümə" (next) = 2026-10-16.
 *
 * Gold fields:
 *   intent       one of server/services/schemas.js INTENTS (or a list of acceptable ones)
 *   dates        ISO dates that must be resolved (in actions or commitments)
 *   times        HH:mm values that must appear
 *   prices       numbers that must appear among the extracted facts
 *   commitments  promises: owner + keywords (any one must appear in the task, lowercase stem)
 */

export const CALL_STARTED_AT = "2026-10-09T06:00:00.000Z"; // 10:00 in Baku
export const TIME_ZONE = "Asia/Baku";

const M = (original) => ({ speaker: "Me", original });
const F = (original) => ({ speaker: "Friend", original });

export const DATASET = [
  {
    id: "hotel-1",
    transcript: [
      M("Salam, sabahdan üç gecəlik iki nəfərlik otaq lazımdır."),
      F("Olar, gecəsi 80 manatdır, cəmi 240 manat. Check-in saat 2-dən."),
      M("Yaxşı, saxlayın. Pasportun şəklini bu gün WhatsApp-la atacam."),
    ],
    gold: {
      intent: "hotel_booking",
      dates: ["2026-10-10"],
      times: ["14:00"],
      prices: ["240"],
      commitments: [{ owner: "me", keywords: ["pasport"] }],
    },
  },
  {
    id: "hotel-2-mixed",
    transcript: [
      M("Bro, booking-i 12-si üçün elə, check-in saat 2 olsun."),
      F("Okay, 12 oktyabr, standart otaq, 95 dollar. Konfirmasiyanı email-ə göndərərəm."),
    ],
    gold: {
      intent: "hotel_booking",
      dates: ["2026-10-12"],
      times: ["14:00"],
      prices: ["95"],
      commitments: [{ owner: "other", keywords: ["təsdiq", "konfirmas", "email", "e-poçt"] }],
    },
  },
  {
    id: "restaurant-1",
    transcript: [
      M("Salam, bu axşam saat 8-ə dörd nəfərlik masa sifariş etmək istəyirəm."),
      F("Bu axşam 20:00, dörd nəfər, adınız?"),
      M("Elgün. Əgər gecikəcəyiksə zəng edəcəm."),
    ],
    gold: {
      intent: "restaurant_booking",
      dates: ["2026-10-09"],
      times: ["20:00"],
      prices: [],
      commitments: [{ owner: "me", keywords: ["zəng"] }],
    },
  },
  {
    id: "restaurant-2-ru",
    transcript: [
      M("Zdravstvuyte, şənbə günü saat yeddiyə iki nəfər üçün stol olar?"),
      F("Şənbə, 19:00, iki nəfər, depozit 50 manatdır, kartla bu gün ödəməlisiniz."),
      M("Oldu, bu gün köçürərəm."),
    ],
    gold: {
      intent: "restaurant_booking",
      dates: ["2026-10-10"],
      times: ["19:00"],
      prices: ["50"],
      commitments: [{ owner: "me", keywords: ["ödə", "köçür", "depozit"] }],
    },
  },
  {
    id: "doctor-1",
    transcript: [
      M("Salam, həkim Məmmədovanın qəbuluna yazılmaq istəyirəm."),
      F("Bazar ertəsi saat 11:30 boşdur, müayinə 40 manatdır. Analiz nəticələrini gətirin."),
      M("Oldu, gətirərəm."),
    ],
    gold: {
      intent: "appointment",
      dates: ["2026-10-12"],
      times: ["11:30"],
      prices: ["40"],
      commitments: [{ owner: "me", keywords: ["analiz", "nəticə", "gətir"] }],
    },
  },
  {
    id: "doctor-2-reschedule",
    transcript: [
      F("Salam, sabahkı qəbulunuz təxirə salınıb, çərşənbə saat 3 uyğundur?"),
      M("Hə, çərşənbə 15:00 olar. Xatırlatma SMS-i atarsınız?"),
      F("Bəli, bir gün əvvəl SMS göndərəcəyik."),
    ],
    gold: {
      intent: "appointment",
      dates: ["2026-10-14"],
      times: ["15:00"],
      prices: [],
      commitments: [{ owner: "other", keywords: ["sms", "xatırlat"] }],
    },
  },
  {
    id: "meeting-1",
    transcript: [
      F("Layihəni müzakirə etmək üçün sabah saat 3-də görüşə bilərik?"),
      M("Olar, Nizami küçəsindəki ofisdə. Mən prezentasiyanı axşama qədər sənə göndərərəm."),
      F("Mən də müqaviləni bazar ertəsi göndərərəm."),
    ],
    gold: {
      intent: "meeting",
      dates: ["2026-10-10", "2026-10-12"],
      times: ["15:00"],
      prices: [],
      commitments: [
        { owner: "me", keywords: ["prezentas", "təqdimat"] },
        { owner: "other", keywords: ["müqavilə"] },
      ],
    },
  },
  {
    id: "meeting-2-en",
    transcript: [
      M("Salam, sabahkı call-u 10:30-a çəkək? Deadline-a görə."),
      F("Okay, 10:30. Report-u o vaxta qədər hazırlayacam."),
    ],
    gold: {
      intent: "meeting",
      dates: ["2026-10-10"],
      times: ["10:30"],
      prices: [],
      commitments: [{ owner: "other", keywords: ["report", "hesabat"] }],
    },
  },
  {
    id: "purchase-1",
    transcript: [
      M("Salam, saytdakı soyuducu hələ var? Qiyməti nə qədərdir?"),
      F("Var, 1250 manat. Kreditlə 12 aya da olar."),
      M("Nağd alacam. Sabah gəlib baxaram."),
    ],
    gold: {
      intent: "purchase",
      dates: ["2026-10-10"],
      times: [],
      prices: ["1250"],
      commitments: [{ owner: "me", keywords: ["gəl", "bax"] }],
    },
  },
  {
    id: "purchase-2-tr",
    transcript: [
      M("Merhaba, telefonun ekranını dəyişmək neçəyə olar?"),
      F("Orijinal ekran 180 manat, iş bir saatlıq. Bu gün saat 5-ə qədər gətirin."),
      M("Yaxşı, 5-ə qədər gətirərəm."),
    ],
    gold: {
      intent: ["purchase", "customer_support", "appointment"],
      dates: ["2026-10-09"],
      times: ["17:00"],
      prices: ["180"],
      commitments: [{ owner: "me", keywords: ["gətir", "telefon"] }],
    },
  },
  {
    id: "delivery-1",
    transcript: [
      F("Salam, sifarişiniz bu gün 14:00 ilə 16:00 arası çatdırılacaq."),
      M("Mən evdə olmayacam, qonşuya verə bilərsiniz?"),
      F("Olar, kuryer zəng edib qonşuya təhvil verəcək. Çatdırılma 5 manatdır."),
    ],
    gold: {
      intent: "delivery",
      dates: ["2026-10-09"],
      times: ["14:00"],
      prices: ["5"],
      commitments: [{ owner: "other", keywords: ["zəng", "təhvil", "qonşu"] }],
    },
  },
  {
    id: "delivery-2",
    transcript: [
      M("Salam, sifariş nömrəm A-2290, hələ gəlməyib."),
      F("Bağışlayın, gecikmə var. Bazar ertəsi mütləq çatdıracağıq və çatdırılma pulsuz olacaq."),
    ],
    gold: {
      intent: "delivery",
      dates: ["2026-10-12"],
      times: [],
      prices: [],
      commitments: [{ owner: "other", keywords: ["çatdır"] }],
    },
  },
  {
    id: "support-1",
    transcript: [
      M("Salam, internet iki gündür işləmir, abonent nömrəm 554-221."),
      F("Usta sabah saat 10 ilə 12 arası gələcək. Modemi yandırıb-söndürməyi yoxlayın."),
      M("Oldu, yoxlayaram."),
    ],
    gold: {
      intent: "customer_support",
      dates: ["2026-10-10"],
      times: ["10:00"],
      prices: [],
      commitments: [
        { owner: "other", keywords: ["usta", "gəl"] },
        { owner: "me", keywords: ["modem", "yoxla"] },
      ],
    },
  },
  {
    id: "support-2-bank",
    transcript: [
      M("Salam, kartım bloklanıb, filiala gəlməliyəm?"),
      F(
        "Bəli, şəxsiyyət vəsiqəsi ilə istənilən filiala gəlin, yeni kart 10 manatdır, 5 iş gününə hazır olar.",
      ),
    ],
    gold: {
      intent: "customer_support",
      dates: [],
      times: [],
      prices: ["10"],
      commitments: [],
    },
  },
  {
    id: "travel-1",
    transcript: [
      M("Salam, 20 oktyabr Bakı–İstanbul bileti varmı?"),
      F("Səhər 07:45 reysi var, 320 manat, baqaj daxil."),
      M("Götürürəm. Pasport məlumatlarını indi mesajla atacam."),
    ],
    gold: {
      intent: "travel",
      dates: ["2026-10-20"],
      times: ["07:45"],
      prices: ["320"],
      commitments: [{ owner: "me", keywords: ["pasport"] }],
    },
  },
  {
    id: "travel-2-taxi",
    transcript: [
      M("Salam, sabah səhər 5:30-a hava limanına taksi lazımdır, Yasamaldan."),
      F("Olar, 25 manat. Sürücü 5:20-də zəng edəcək."),
    ],
    gold: {
      intent: "travel",
      dates: ["2026-10-10"],
      times: ["05:30"],
      prices: ["25"],
      commitments: [{ owner: "other", keywords: ["zəng", "sürücü"] }],
    },
  },
  {
    id: "personal-1",
    transcript: [
      F("Qardaş, bazar günü ad günümdür, saat 7-də bizə gəl."),
      M("Mütləq gələrəm, tortu da mən alacam."),
    ],
    gold: {
      intent: "personal",
      dates: ["2026-10-11"],
      times: ["19:00"],
      prices: [],
      commitments: [{ owner: "me", keywords: ["tort"] }],
    },
  },
  {
    id: "personal-2-loan",
    transcript: [
      F("Elgün, 200 manat borc verə bilərsən? Gələn cümə qaytararam."),
      M("Olar, bu axşam kartına atacam."),
    ],
    gold: {
      intent: "personal",
      dates: ["2026-10-16", "2026-10-09"],
      times: [],
      prices: ["200"],
      commitments: [
        { owner: "other", keywords: ["qaytar"] },
        { owner: "me", keywords: ["at", "köçür", "göndər", "borc"] },
      ],
    },
  },
  {
    id: "scam-1",
    transcript: [
      F("Salam, bankın təhlükəsizlik xidmətiyik, kartınızdan şübhəli əməliyyat var."),
      F("Ləğv etmək üçün telefonunuza gələn SMS kodunu deyin."),
      M("Kodu heç kimə demirəm, özüm banka zəng edəcəm."),
    ],
    gold: {
      intent: "scam_attempt",
      dates: [],
      times: [],
      prices: [],
      commitments: [{ owner: "me", keywords: ["bank", "zəng"] }],
    },
  },
  {
    id: "scam-2-prize",
    transcript: [
      F("Təbriklər! Siz avtomobil udmusunuz. Sənədləşmə üçün 150 manat köçürməlisiniz."),
      M("Mən heç bir lotereyada iştirak etməmişəm."),
    ],
    gold: {
      intent: "scam_attempt",
      dates: [],
      times: [],
      prices: ["150"],
      commitments: [],
    },
  },
  {
    id: "repair-1",
    transcript: [
      M("Salam, kombi işləmir, usta göndərə bilərsiniz?"),
      F("Usta bazar ertəsi saat 9-da gələcək, baxış 30 manatdır."),
      M("Oldu, evdə olacam."),
    ],
    gold: {
      intent: ["appointment", "customer_support"],
      dates: ["2026-10-12"],
      times: ["09:00"],
      prices: ["30"],
      commitments: [{ owner: "other", keywords: ["usta", "gəl"] }],
    },
  },
  {
    id: "course-1",
    transcript: [
      M("Salam, ingilis dili kursuna yazılmaq istəyirəm."),
      F(
        "Qrup çərşənbə və cümə saat 18:30-da, aylıq 120 manat. Sınaq dərsi pulsuzdur, gələn çərşənbə.",
      ),
      M("Sınaq dərsinə gələcəm."),
    ],
    gold: {
      intent: ["appointment", "other"],
      dates: ["2026-10-14"],
      times: ["18:30"],
      prices: ["120"],
      commitments: [{ owner: "me", keywords: ["sınaq", "dərs", "gəl"] }],
    },
  },
  {
    id: "rent-1",
    transcript: [
      M("Salam, Nərimanovdakı kirayə ev hələ boşdur?"),
      F("Boşdur, aylıq 600 manat, üstəgəl bir aylıq depozit. Sabah saat 6-da göstərə bilərəm."),
      M("Sabah 18:00-da gəlirəm."),
    ],
    gold: {
      intent: ["purchase", "other"],
      dates: ["2026-10-10"],
      times: ["18:00"],
      prices: ["600"],
      commitments: [{ owner: "me", keywords: ["gəl", "bax"] }],
    },
  },
  {
    id: "work-1",
    transcript: [
      F("Salam, CV-nizi bəyəndik. Çərşənbə axşamı saat 11-də müsahibəyə gələ bilərsiniz?"),
      M("Bəli, gələrəm. Portfolionu da əvvəlcədən email-lə göndərim?"),
      F("Bəli, bazar ertəsinə qədər göndərin."),
    ],
    gold: {
      intent: ["meeting", "appointment"],
      dates: ["2026-10-13", "2026-10-12"],
      times: ["11:00"],
      prices: [],
      commitments: [
        { owner: "me", keywords: ["portfolio", "göndər"] },
        { owner: "me", keywords: ["müsahibə", "gəl"] },
      ],
    },
  },
];
