import { motion } from "framer-motion";

interface OrbitLogoProps {
  size?: number;
  active?: boolean;
}

export function OrbitLogo({ size = 18, active = false }: OrbitLogoProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={active ? { rotate: [0, 360] } : { rotate: 0 }}
      transition={
        active
          ? { duration: 10, repeat: Infinity, ease: "linear" }
          : { duration: 0.4 }
      }
      className="shrink-0"
    >
      <defs>
        <linearGradient id="miniOrbit" x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="50%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#C084FC" />
        </linearGradient>
      </defs>
      <g transform="rotate(-22 32 32)">
        <ellipse
          cx="32"
          cy="32"
          rx="25"
          ry="11"
          stroke="url(#miniOrbit)"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <circle cx="55" cy="34" r="3.8" fill="#22D3EE" />
      </g>
      <rect x="17" y="23" width="30" height="18" rx="9" fill="#030508" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
      <circle cx="26" cy="32" r="3" fill="#22D3EE" />
      <circle cx="38" cy="32" r="2.5" fill="#A855F7" />
    </motion.svg>
  );
}
