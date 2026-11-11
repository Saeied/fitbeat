const COLORS = ["#0d6cfe", "#7c3aed", "#22c55e", "#f97316", "#ff2e9a"] as const;


type NoteSpec = {
  left: string;
  size: number;
  duration: string;
  delay: string;
  color: (typeof COLORS)[number];
  drift: string;
  spin: string;
  variant: 0 | 1 | 2;
};

const NOTES: NoteSpec[] = [
  { left: "4%", size: 20, duration: "10.5s", delay: "0s", color: "#0d6cfe", drift: "18px", spin: "22deg", variant: 0 },
  { left: "11%", size: 28, duration: "13s", delay: "1.2s", color: "#7c3aed", drift: "-14px", spin: "-16deg", variant: 1 },
  { left: "18%", size: 16, duration: "8.5s", delay: "3.4s", color: "#22c55e", drift: "22px", spin: "28deg", variant: 2 },
  { left: "24%", size: 32, duration: "14.5s", delay: "0.6s", color: "#ff2e9a", drift: "-10px", spin: "-12deg", variant: 0 },
  { left: "31%", size: 22, duration: "11s", delay: "4.8s", color: "#0d6cfe", drift: "8px", spin: "18deg", variant: 1 },
  { left: "37%", size: 18, duration: "9s", delay: "2.1s", color: "#7c3aed", drift: "-20px", spin: "-24deg", variant: 2 },
  { left: "44%", size: 26, duration: "12.5s", delay: "5.6s", color: "#22c55e", drift: "16px", spin: "14deg", variant: 0 },
  { left: "51%", size: 20, duration: "10s", delay: "1.8s", color: "#ff2e9a", drift: "-8px", spin: "-20deg", variant: 1 },
  { left: "58%", size: 30, duration: "15s", delay: "3s", color: "#0d6cfe", drift: "12px", spin: "10deg", variant: 2 },
  { left: "64%", size: 17, duration: "8s", delay: "6.2s", color: "#7c3aed", drift: "-18px", spin: "26deg", variant: 0 },
  { left: "71%", size: 24, duration: "12s", delay: "0.3s", color: "#22c55e", drift: "20px", spin: "-14deg", variant: 1 },
  { left: "77%", size: 21, duration: "11.5s", delay: "4.1s", color: "#f97316", drift: "-12px", spin: "16deg", variant: 2 },
  { left: "84%", size: 29, duration: "13.5s", delay: "2.7s", color: "#ff2e9a", drift: "6px", spin: "-22deg", variant: 0 },
  { left: "91%", size: 18, duration: "9.5s", delay: "5.1s", color: "#7c3aed", drift: "-16px", spin: "12deg", variant: 1 },
  { left: "8%", size: 15, duration: "7.5s", delay: "7s", color: "#22c55e", drift: "14px", spin: "-18deg", variant: 2 },
  { left: "42%", size: 23, duration: "12.8s", delay: "8.2s", color: "#f97316", drift: "-6px", spin: "20deg", variant: 0 },
  { left: "67%", size: 19, duration: "10.2s", delay: "6.8s", color: "#0d6cfe", drift: "24px", spin: "-10deg", variant: 1 },
  { left: "96%", size: 27, duration: "14s", delay: "3.8s", color: "#7c3aed", drift: "-22px", spin: "15deg", variant: 2 },
  { left: "15%", size: 21, duration: "11.8s", delay: "9.4s", color: "#ff2e9a", drift: "10px", spin: "-26deg", variant: 0 },
  { left: "53%", size: 16, duration: "8.8s", delay: "7.6s", color: "#f97316", drift: "-14px", spin: "8deg", variant: 1 },
  { left: "79%", size: 25, duration: "13.2s", delay: "8.8s", color: "#0d6cfe", drift: "18px", spin: "-15deg", variant: 2 },
  { left: "28%", size: 18, duration: "9.2s", delay: "10.1s", color: "#7c3aed", drift: "-9px", spin: "24deg", variant: 0 },
  { left: "86%", size: 22, duration: "12.2s", delay: "9.8s", color: "#22c55e", drift: "11px", spin: "-8deg", variant: 1 },
  { left: "47%", size: 31, duration: "15.5s", delay: "1.1s", color: "#ff2e9a", drift: "-15px", spin: "19deg", variant: 2 },
  { left: "2%", size: 19, duration: "9.8s", delay: "2.4s", color: "#7c3aed", drift: "15px", spin: "-19deg", variant: 1 },
  { left: "7%", size: 25, duration: "12.4s", delay: "4.5s", color: "#f97316", drift: "-11px", spin: "13deg", variant: 0 },
  { left: "13%", size: 17, duration: "8.2s", delay: "0.9s", color: "#ff2e9a", drift: "19px", spin: "-21deg", variant: 2 },
  { left: "21%", size: 27, duration: "13.8s", delay: "6.4s", color: "#22c55e", drift: "-17px", spin: "17deg", variant: 1 },
  { left: "26%", size: 15, duration: "7.8s", delay: "3.2s", color: "#7c3aed", drift: "9px", spin: "-11deg", variant: 0 },
  { left: "33%", size: 29, duration: "14.2s", delay: "8.5s", color: "#f97316", drift: "-21px", spin: "23deg", variant: 2 },
  { left: "39%", size: 21, duration: "10.8s", delay: "1.5s", color: "#ff2e9a", drift: "13px", spin: "-27deg", variant: 1 },
  { left: "46%", size: 18, duration: "9.4s", delay: "5.3s", color: "#22c55e", drift: "-7px", spin: "9deg", variant: 0 },
  { left: "49%", size: 24, duration: "12.1s", delay: "7.9s", color: "#7c3aed", drift: "21px", spin: "-13deg", variant: 2 },
  { left: "55%", size: 16, duration: "8.4s", delay: "2.8s", color: "#f97316", drift: "-19px", spin: "21deg", variant: 1 },
  { left: "61%", size: 28, duration: "13.6s", delay: "0.2s", color: "#0d6cfe", drift: "7px", spin: "-17deg", variant: 0 },
  { left: "66%", size: 20, duration: "11.2s", delay: "4.4s", color: "#ff2e9a", drift: "-13px", spin: "25deg", variant: 2 },
  { left: "69%", size: 23, duration: "12.7s", delay: "9.1s", color: "#7c3aed", drift: "17px", spin: "-9deg", variant: 1 },
  { left: "74%", size: 17, duration: "8.6s", delay: "6.6s", color: "#f97316", drift: "-23px", spin: "11deg", variant: 0 },
  { left: "81%", size: 30, duration: "14.8s", delay: "3.6s", color: "#0d6cfe", drift: "11px", spin: "-23deg", variant: 2 },
  { left: "88%", size: 19, duration: "10.4s", delay: "7.3s", color: "#22c55e", drift: "-5px", spin: "27deg", variant: 1 },
  { left: "93%", size: 22, duration: "11.6s", delay: "1.7s", color: "#ff2e9a", drift: "23px", spin: "-14deg", variant: 0 },
  { left: "98%", size: 16, duration: "8.1s", delay: "5.8s", color: "#f97316", drift: "-16px", spin: "16deg", variant: 2 },
  { left: "5%", size: 26, duration: "13.1s", delay: "8.9s", color: "#0d6cfe", drift: "5px", spin: "-25deg", variant: 1 },
  { left: "17%", size: 18, duration: "9.6s", delay: "11.2s", color: "#22c55e", drift: "-18px", spin: "12deg", variant: 0 },
  { left: "35%", size: 24, duration: "12.3s", delay: "10.6s", color: "#ff2e9a", drift: "14px", spin: "-18deg", variant: 2 },
  { left: "57%", size: 21, duration: "11.4s", delay: "9.6s", color: "#f97316", drift: "-10px", spin: "22deg", variant: 1 },
  { left: "73%", size: 27, duration: "14.1s", delay: "10.8s", color: "#0d6cfe", drift: "16px", spin: "-6deg", variant: 0 },
  { left: "89%", size: 15, duration: "7.9s", delay: "11.5s", color: "#22c55e", drift: "-24px", spin: "18deg", variant: 2 },
  { left: "10%", size: 23, duration: "12.9s", delay: "3.9s", color: "#7c3aed", drift: "8px", spin: "-22deg", variant: 1 },
  { left: "40%", size: 19, duration: "10.6s", delay: "6s", color: "#f97316", drift: "-12px", spin: "14deg", variant: 0 },
  { left: "62%", size: 25, duration: "13.3s", delay: "2.2s", color: "#0d6cfe", drift: "20px", spin: "-16deg", variant: 2 },
  { left: "82%", size: 18, duration: "9.1s", delay: "4.7s", color: "#ff2e9a", drift: "-8px", spin: "29deg", variant: 1 },
];

function NoteGlyph({ variant, color }: { variant: 0 | 1 | 2; color: string }) {
  if (variant === 1) {
    return (
      <svg viewBox="0 0 36 32" aria-hidden="true" className="h-full w-full">
        <ellipse cx="8" cy="26" rx="6.2" ry="4.4" fill={color} />
        <ellipse cx="24" cy="26" rx="6.2" ry="4.4" fill={color} />
        <path
          d="M13.2 6.5v19.2h2.2V10.8l14.4-3.2v18.6h2.2V5.2L13.2 8.6V6.5Z"
          fill={color}
        />
      </svg>
    );
  }

  if (variant === 2) {
    return (
      <svg viewBox="0 0 18 32" aria-hidden="true" className="h-full w-full">
        <ellipse cx="7" cy="26.2" rx="6.4" ry="4.6" fill={color} />
        <rect x="12.2" y="4" width="2.3" height="22.4" rx="0.6" fill={color} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 22 32" aria-hidden="true" className="h-full w-full">
      <ellipse cx="7" cy="26.2" rx="6.4" ry="4.6" fill={color} />
      <path
        d="M12.4 4.2v22.2h2.3V12.4c3.6.4 6.4 3.1 6.4 6.2 0-5.6-3.8-9.6-8.7-10.4V4.2h0Z"
        fill={color}
      />
    </svg>
  );
}

export function NoteField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {NOTES.map((note, index) => (
        <span
          key={index}
          className="music-note"
          style={{
            left: note.left,
            width: note.size,
            height: note.size * 1.45,
            animationDuration: note.duration,
            animationDelay: note.delay,
            ["--note-drift" as string]: note.drift,
            ["--note-spin" as string]: note.spin,
          }}
        >
          <NoteGlyph variant={note.variant} color={note.color} />
        </span>
      ))}
    </div>
  );
}
