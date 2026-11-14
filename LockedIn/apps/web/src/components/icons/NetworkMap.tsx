export default function NetworkMap() {
  return (
    <svg
      viewBox="0 0 200 160"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
    >
      {/* Connections */}
      <line x1="100" y1="80" x2="56" y2="48" stroke="#0d8a86" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      <line x1="100" y1="80" x2="148" y2="48" stroke="#0d8a86" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      <line x1="56" y1="48" x2="28" y2="110" stroke="#baa98a" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.6"/>
      <line x1="148" y1="48" x2="172" y2="110" stroke="#baa98a" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.6"/>

      {/* Center node */}
      <circle cx="100" cy="80" r="18" fill="#0d8a86" opacity="0.9"/>
      <text x="100" y="85" textAnchor="middle" fontSize="11">👤</text>

      {/* Top left node */}
      <circle cx="56" cy="48" r="14" fill="#32a9a4" opacity="0.8"/>
      <text x="56" y="53" textAnchor="middle" fontSize="9">👤</text>

      {/* Top right node */}
      <circle cx="148" cy="48" r="14" fill="#f2c6a8" opacity="0.8"/>
      <text x="148" y="53" textAnchor="middle" fontSize="9">👤</text>

      {/* Bottom left node */}
      <circle cx="28" cy="110" r="10" fill="#baa98a" opacity="0.6"/>
      <text x="28" y="115" textAnchor="middle" fontSize="7">👤</text>

      {/* Bottom right node */}
      <circle cx="172" cy="110" r="10" fill="#a4c08f" opacity="0.6"/>
      <text x="172" y="115" textAnchor="middle" fontSize="7">👤</text>

      {/* Label */}
      <text
        x="100"
        y="105"
        textAnchor="middle"
        fontSize="8"
        fill="#0d8a86"
        fontFamily="var(--font-sans), sans-serif"
        fontWeight="500"
      >
        Your Network
      </text>
    </svg>
  );
}