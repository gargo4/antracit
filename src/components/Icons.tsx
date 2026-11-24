const PATHS = {
  plus: "M12 5v14M5 12h14",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  send: "M12 19V5M5 12l7-7 7 7",
  stop: "M7 7h10v10H7z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01",
  copy: "M9 9h10v10H9zM5 15V5h10",
  check: "M5 12.5l4.5 4.5L19 7.5",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6l1-7z",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  chat: "M5 5h14v11H9l-4 4V5z",
  compress: "M5 8h14M5 12h10M5 16h6",
  key: "M7 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM10 12h11M17 12v4M21 12v3",
  refresh: "M20 11a8 8 0 1 0-2 6M20 5v6h-6",
  folder: "M3 7h6l2 2h10v10H3z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ant-g" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <path d="M16 2.5l11.5 6.6v13.8L16 29.5 4.5 22.9V9.1L16 2.5z" stroke="url(#ant-g)" strokeWidth="1.6" fill="rgba(59,130,246,.10)" />
      <path d="M16 9l5.5 3.2v6.4L16 21.8l-5.5-3.2v-6.4L16 9z" fill="url(#ant-g)" opacity=".92" />
      <path d="M10.5 12.2L16 15.4l5.5-3.2" stroke="#080B10" strokeOpacity=".55" strokeWidth="1" />
    </svg>
  );
}
