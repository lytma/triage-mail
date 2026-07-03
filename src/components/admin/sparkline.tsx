/**
 * Tiny dependency-free SVG sparkline. Pure/deterministic — renders fine in a
 * server component. Draws a line (and soft area fill) over the given series.
 */
export function Sparkline({
  values,
  width = 240,
  height = 44,
  stroke = "#2563EB",
  fill = "rgba(37,99,235,0.12)",
  className,
  ariaLabel,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const n = values.length;
  const pad = 2;
  const w = width;
  const h = height;

  if (n === 0) {
    return (
      <svg width={w} height={h} className={className} role="img" aria-label={ariaLabel ?? "No data"} />
    );
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const toX = (i: number) => pad + i * stepX;
  const toY = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);

  const points = values.map((v, i) => `${toX(i).toFixed(2)},${toY(v).toFixed(2)}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath =
    n > 1
      ? `${linePath} L ${toX(n - 1).toFixed(2)},${(h - pad).toFixed(2)} L ${toX(0).toFixed(2)},${(h - pad).toFixed(2)} Z`
      : "";

  const lastX = toX(n - 1);
  const lastY = toY(values[n - 1]);

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      role="img"
      aria-label={ariaLabel ?? "Trend sparkline"}
      preserveAspectRatio="none"
    >
      {areaPath && <path d={areaPath} fill={fill} stroke="none" />}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
    </svg>
  );
}
