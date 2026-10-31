import styles from "./Logo.module.css";

// The app icon: a four-colour ring with a KSh speech bubble.
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg className={styles.logo} width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <g transform="rotate(-15 472 572)" fill="none" strokeWidth="72" strokeLinecap="round">
        <circle className={styles.ring1} cx="472" cy="572" r="280" strokeDasharray="360 1759" />
        <circle
          className={styles.ring2}
          cx="472"
          cy="572"
          r="280"
          strokeDasharray="290 1759"
          strokeDashoffset="-470"
        />
        <circle
          className={styles.ring3}
          cx="472"
          cy="572"
          r="280"
          strokeDasharray="300 1759"
          strokeDashoffset="-870"
        />
        <circle
          className={styles.ring4}
          cx="472"
          cy="572"
          r="280"
          strokeDasharray="180 1759"
          strokeDashoffset="-1280"
        />
      </g>
      <path
        className={styles.bubble}
        d="M 542 190 H 758 A 72 72 0 0 1 830 262 V 398 A 72 72 0 0 1 758 470 H 640 L 540 552 L 566 470 H 542 A 72 72 0 0 1 470 398 V 262 A 72 72 0 0 1 542 190 Z"
        strokeWidth="32"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
      <text
        className={styles.text}
        x="650"
        y="334"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="118"
        fontWeight="700"
      >
        KSh
      </text>
    </svg>
  );
}
