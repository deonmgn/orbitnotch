import { motion } from "framer-motion";

interface AudioVisualizerProps {
  playing: boolean;
}

const BARS = [
  { min: 4, max: 14, dur: 0.55 },
  { min: 6, max: 16, dur: 0.42 },
  { min: 4, max: 13, dur: 0.62 },
  { min: 5, max: 15, dur: 0.48 },
];

export function AudioVisualizer({ playing }: AudioVisualizerProps) {
  return (
    <div className="flex items-center gap-[2.5px] h-4">
      {BARS.map((bar, idx) => (
        <motion.span
          key={idx}
          className="w-[2.5px] rounded-full bg-gradient-to-t from-cyan-400 to-violet-400"
          animate={
            playing
              ? { height: [bar.min, bar.max, bar.min + 2, bar.max - 2, bar.min] }
              : { height: 4 }
          }
          transition={
            playing
              ? {
                  duration: bar.dur,
                  repeat: Infinity,
                  repeatType: "mirror",
                  ease: "easeInOut",
                }
              : { duration: 0.25 }
          }
        />
      ))}
    </div>
  );
}
