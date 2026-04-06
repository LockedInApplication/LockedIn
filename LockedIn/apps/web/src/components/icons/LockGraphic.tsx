import styles from "../styles/LockGraphic.module.scss";

export default function LockGraphic(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="100%"
      viewBox="0 0 520 520"
      xmlns="http://www.w3.org/2000/svg"
      style={{ maxWidth: "520px" }}
      {...props}
    >
      <circle cx="260" cy="260" r="230" fill="none" stroke="#baa98a" strokeWidth="1" strokeDasharray="6 10" opacity="0.5" />

      <circle className={styles.middleRing} cx="260" cy="260" r="165" fill="none" stroke="#baa98a" strokeWidth="1" strokeDasharray="4 8" opacity="0.65" />

      <circle cx="260" cy="260" r="100" fill="none" stroke="#6f6148" strokeWidth="1.5" opacity="0.4" />
      <circle cx="260" cy="260" r="100" fill="#f6f2e8" opacity="0.6" />

      <circle className={styles.orbitOuter} cx="447" cy="143" r="5" fill="#f6f2e8" stroke="#baa98a" strokeWidth="1.5" />
      <circle className={styles.orbitOuter} cx="73" cy="377" r="5" fill="#f6f2e8" stroke="#baa98a" strokeWidth="1.5" />

      <circle className={styles.orbitMiddle} cx="395" cy="125" r="3.5" fill="#6f6148" opacity="0.35" />
      <circle className={styles.orbitMiddle} cx="125" cy="395" r="3.5" fill="#6f6148" opacity="0.35" />

      <path className={styles.lockIn} d="M232 248 L232 228 Q232 196 260 196 Q288 196 288 228 L288 248"
        fill="none" stroke="#3d3527" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.88" />

      <rect className={styles.lockIn} x="220" y="244" width="80" height="66" rx="14"
        fill="#1a130b" opacity="0.88" />

      <circle cx="260" cy="270" r="9" fill="#f6f2e8" opacity="0.92" />
      <rect x="256.5" y="276" width="7" height="13" rx="3" fill="#f6f2e8" opacity="0.92" />

      <text x="260" y="338" textAnchor="middle"
        fontFamily="var(--font-sans), sans-serif" fontSize="11" fontWeight="400"
        fill="#6f6148" letterSpacing="0.08em" opacity="0.8">
        mutually confirmed
      </text>

      <g style={{ animation: "fadeUp 0.5s ease 0.8s both" }}>
        <rect x="44" y="94" width="128" height="36" rx="10"
          fill="#fff9ef" stroke="#e2d8c3" strokeWidth="1" />
        <text x="108" y="117" textAnchor="middle"
          fontFamily="var(--font-sans), sans-serif" fontSize="11" fontWeight="500" fill="#3d3527">
          ✓ Alex confirmed
        </text>
      </g>

      <line className={styles.fadeUp1} x1="172" y1="112" x2="200" y2="152"
        stroke="#baa98a" strokeWidth="0.75" strokeDasharray="3 4" opacity="0.7" />

      <g className={styles.fadeUp2}>
        <rect x="348" y="390" width="136" height="36" rx="10"
          fill="#fff9ef" stroke="#e2d8c3" strokeWidth="1" />
        <text x="416" y="413" textAnchor="middle"
          fontFamily="var(--font-sans), sans-serif" fontSize="11" fontWeight="500" fill="#3d3527">
          ✓ Jordan confirmed
        </text>
      </g>

      <line className={styles.fadeUp2} x1="348" y1="408" x2="316" y2="365"
        stroke="#baa98a" strokeWidth="0.75" strokeDasharray="3 4" opacity="0.7" />
    </svg>
  );
}
