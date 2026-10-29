export const commandCentreChartPalette = [
  "#0EA5E9", // Laser Sky Blue
  "#00F0FF", // Electric Cyber Cyan
  "#10B981", // Bright Emerald
  "#F59E0B", // Vivid Amber
  "#8B5CF6", // Electric Violet
  "#FB7185", // Radiant Coral
];

export interface ChartThemeTokens {
  canvas: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  lineSubtle: string;
  primary: string;
  cyan: string;
  palette: string[];
}

export function getChartThemeTokens(isDark: boolean): ChartThemeTokens {
  if (isDark) {
    return {
      canvas: "#060913",
      card: "#0D1527",
      ink: "#F8FAFC",
      muted: "#94A3B8",
      line: "rgba(56, 189, 248, 0.18)",
      lineSubtle: "rgba(255, 255, 255, 0.08)",
      primary: "#0EA5E9",
      cyan: "#00F0FF",
      palette: commandCentreChartPalette,
    };
  }

  return {
    canvas: "#F8FAFC",
    card: "#FFFFFF",
    ink: "#0F172A",
    muted: "#64748B",
    line: "#E2E8F0",
    lineSubtle: "#F1F5F9",
    primary: "#0284C7",
    cyan: "#06B6D4",
    palette: commandCentreChartPalette,
  };
}

export function getBaseChartOption(tokens: ChartThemeTokens) {
  return {
    backgroundColor: "transparent",
    color: tokens.palette,
    textStyle: {
      fontFamily: '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif',
      color: tokens.muted,
      fontSize: 12,
    },
    tooltip: {
      backgroundColor: tokens.card,
      borderColor: tokens.line,
      borderWidth: 1,
      textStyle: {
        color: tokens.ink,
        fontFamily: '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif',
        fontSize: 12,
      },
      extraCssText: "box-shadow: 0 10px 30px rgba(0,0,0,0.3); border-radius: 12px; backdrop-filter: blur(12px);",
    },
  };
}
