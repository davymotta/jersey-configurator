import { forwardRef } from "react";
import type { JerseyTemplateDefinition } from "@shared/jerseyTemplates";

interface JerseyCanvasProps {
  template: JerseyTemplateDefinition;
  colors: Record<string, string>;
  playerName?: string;
  playerNumber?: string;
  teamName?: string;
  textColor?: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Renders a jersey as an inline SVG using the template's zone paths and the
 * supplied color/text customisations.  viewBox is 200 × 250.
 * Forwarding ref allows the parent to grab the SVG element (e.g. for export).
 */
const JerseyCanvas = forwardRef<SVGSVGElement, JerseyCanvasProps>(function JerseyCanvas(
  {
    template,
    colors,
    playerName = "",
    playerNumber = "",
    teamName = "",
    textColor = "#ffffff",
    width = 220,
    height = 275,
    className,
  },
  ref,
) {
  const { textConfig } = template;

  return (
    <svg
      ref={ref}
      viewBox="0 0 200 250"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Jersey preview"
    >
      {/* Drop shadow filter */}
      <defs>
        <filter id="jersey-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.25)" />
        </filter>
      </defs>

      {/* Zone fills */}
      <g filter="url(#jersey-shadow)">
        {template.zones.map(zone => (
          <path
            key={zone.id}
            d={zone.svgPath}
            fill={colors[zone.id] ?? template.defaultColors[zone.id] ?? "#cccccc"}
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="0.6"
          />
        ))}
      </g>

      {/* Team name */}
      {teamName && (
        <text
          x={textConfig.teamName.x}
          y={textConfig.teamName.y}
          textAnchor="middle"
          fill={textColor}
          fontSize={textConfig.teamName.fontSize}
          fontWeight={textConfig.teamName.fontWeight ?? "normal"}
          fontFamily="Arial, Helvetica, sans-serif"
          letterSpacing={textConfig.teamName.letterSpacing ?? 0}
        >
          {teamName.toUpperCase()}
        </text>
      )}

      {/* Player number */}
      {playerNumber && (
        <text
          x={textConfig.playerNumber.x}
          y={textConfig.playerNumber.y}
          textAnchor="middle"
          fill={textColor}
          fontSize={textConfig.playerNumber.fontSize}
          fontWeight={textConfig.playerNumber.fontWeight ?? "normal"}
          fontFamily="Arial, Helvetica, sans-serif"
        >
          {playerNumber}
        </text>
      )}

      {/* Player name — sits above the number */}
      {playerName && (
        <text
          x={textConfig.playerName.x}
          y={textConfig.playerName.y}
          textAnchor="middle"
          fill={textColor}
          fontSize={textConfig.playerName.fontSize}
          fontFamily="Arial, Helvetica, sans-serif"
          letterSpacing={textConfig.playerName.letterSpacing ?? 0}
        >
          {playerName.toUpperCase()}
        </text>
      )}
    </svg>
  );
});

export default JerseyCanvas;
