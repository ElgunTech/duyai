import aztu from "../../assets/sponsors/aztu.jpeg";
import azure from "../../assets/sponsors/azure.jpeg";
import eltek from "../../assets/sponsors/eltek.jpeg";
import twilio from "../../assets/sponsors/twilio.jpeg";
import styles from "./SponsorStrip.module.css";
import { tr } from "../../i18n/i18n";

/** `zoom` crops the empty margin some logo files have, so all logos look equally large. */
const SPONSORS = [
  { name: "ElTek", logo: eltek, zoom: 1.55 },
  { name: "Azərbaycan Texniki Universiteti (AzTU)", logo: aztu, zoom: 1 },
  { name: "Twilio", logo: twilio, zoom: 1.45 },
  { name: "Microsoft Azure", logo: azure, zoom: 1.1 },
];

/** Partner logos scrolling in an endless loop (static when the user prefers less motion). */
export function SponsorStrip() {
  // The list is rendered twice so the loop has no visible seam.
  const loop = [...SPONSORS, ...SPONSORS];
  return (
    <section className={styles.card} aria-labelledby="sponsors-title">
      <h2 id="sponsors-title" className={styles.title}>
        {tr("Texnologiya tərəfdaşları", "Technology partners")}
      </h2>
      <div className={styles.viewport}>
        <ul className={styles.track}>
          {loop.map((s, i) => (
            <li key={`${s.name}-${i}`} className={styles.item} aria-hidden={i >= SPONSORS.length}>
              <img
                src={s.logo}
                alt={i < SPONSORS.length ? s.name : ""}
                loading="lazy"
                style={{ transform: `scale(${s.zoom})` }}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
