import type { CallIntent, EntityType } from "../../types";
import type { IconName } from "../ui/Icon";
import { tr } from "../../i18n/i18n";

export const INTENT_LABEL: Record<CallIntent, string> = {
  get hotel_booking() {
    return tr("Otel rezervasiyası", "Hotel booking");
  },
  get restaurant_booking() {
    return tr("Restoran rezervasiyası", "Restaurant booking");
  },
  get appointment() {
    return tr("Qəbul / randevu", "Appointment");
  },
  get meeting() {
    return tr("Görüş", "Meeting");
  },
  get purchase() {
    return tr("Alış", "Purchase");
  },
  get delivery() {
    return tr("Çatdırılma", "Delivery");
  },
  get customer_support() {
    return tr("Müştəri dəstəyi", "Customer support");
  },
  get travel() {
    return tr("Səyahət", "Travel");
  },
  get personal() {
    return tr("Şəxsi söhbət", "Personal");
  },
  get scam_attempt() {
    return tr("Fırıldaq cəhdi", "Scam attempt");
  },
  get other() {
    return tr("Digər", "Other");
  },
};

export const ENTITY_ICON: Record<EntityType, IconName> = {
  date: "calendar",
  time: "clock",
  price: "tag",
  location: "pin",
  person: "user",
  phone: "phone",
  reference: "copy",
  other: "dot",
};

export const OWNER_LABEL = {
  get me() {
    return tr("Sən", "You");
  },
  get other() {
    return tr("Qarşı tərəf", "Other party");
  },
};
