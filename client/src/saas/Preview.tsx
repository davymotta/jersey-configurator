import { useEffect, useId, useState } from "react";
import { artworkSvg, type Design } from "@shared/production";
import { api } from "./api";

const outline =
  "M20 150L160 65L242 45Q300 100 358 45L440 65L580 150L520 285L465 250L480 595Q300 620 120 595L135 250L80 285Z";
export function FlatJersey({
  design,
  back = false,
  imageData,
  className = "",
}: {
  design: Design;
  back?: boolean;
  imageData?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, ""),
    [loaded, setLoaded] = useState<string>();
  useEffect(() => {
    setLoaded(undefined);
    if (!design.artworkId || imageData) return;
    let current = true;
    api<{ data: string }>(`/artwork/${design.artworkId}`)
      .then(r => {
        if (current) setLoaded(r.data);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [design.artworkId, imageData]);
  return (
    <svg
      viewBox="0 0 600 680"
      className={className}
      role="img"
      aria-label={`${design.name}, ${back ? "retro" : "fronte"}`}
    >
      <defs>
        <clipPath id={id}>
          <path d={outline} />
        </clipPath>
        <linearGradient id={`${id}s`}>
          <stop stopColor="#000" stopOpacity=".12" />
          <stop offset=".3" stopColor="#fff" stopOpacity=".12" />
          <stop offset=".6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".17" />
        </linearGradient>
      </defs>
      <ellipse
        cx="300"
        cy="645"
        rx="130"
        ry="12"
        fill="#12392e"
        opacity=".08"
      />
      <g clipPath={`url(#${id})`}>
        <image
          href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(artworkSvg(design, back, imageData || loaded))}`}
          x="0"
          y="25"
          width="600"
          height="600"
          preserveAspectRatio="none"
        />
        <rect x="0" y="25" width="600" height="600" fill={`url(#${id}s)`} />
        <path
          d="M135 250L155 165M465 250L445 165"
          stroke="#000"
          opacity=".12"
          fill="none"
          strokeWidth="3"
        />
        <path
          d="M238 44Q300 111 362 44"
          fill="none"
          stroke={design.accent}
          strokeWidth="13"
        />
        <path
          d="M49 224L94 247M506 247L551 224"
          stroke={design.accent}
          strokeWidth="12"
        />
      </g>
      <path
        d={outline}
        stroke="#12392e"
        strokeOpacity=".15"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}
