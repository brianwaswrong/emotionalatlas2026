export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function uid() {
  return `e_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function pickFrom<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function hashColor(seed?: string) {
  if (!seed || typeof seed !== "string") {
    // fallback neutral color
    return "hsl(220 10% 60%)";
  }

  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const hue = h % 360;
  return `hsl(${hue} 70% 60%)`;
}


export function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtDateShort(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function dotRadiusPx(scale: number) {
  // More dramatic: slow at low zoom, ramps hard at high zoom.
  // Normalize scale into a 0..1-ish range, then ease.
  const t = clamp((scale - 30) / 3000, 0, 1); // adjust range to taste
  const eased = Math.pow(t, 0.55); // <1 => grows faster earlier
  return clamp(4 + eased * 34, 4, 40);
}
