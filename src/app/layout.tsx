import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppProviders } from "@/components/providers/app-providers";
import { THEME_COOKIE } from "@/lib/auth/constants";
import type { Theme } from "@/components/providers/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Operations Dashboard Headphone Zone",
    template: "%s | Operations Dashboard Headphone Zone",
  },
  description: "Operations Dashboard — High-precision operational telemetry and workflow platform for Headphone Zone.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/apple-icon",
  },
};

const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('od-theme');
    var cookie = document.cookie.match(/(?:^|; )od-theme=([^;]*)/);
    var theme = stored || (cookie ? cookie[1] : null);
    if (!theme || theme === 'system') {
      theme = 'dark';
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  } catch(e) {}
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const themeCookie = (cookieStore.get(THEME_COOKIE)?.value as Theme) || "dark";
  const initialTheme = themeCookie === "light" ? "light" : "dark";

  return (
    <html lang="en" data-theme={initialTheme} className={initialTheme} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <script
          dangerouslySetInnerHTML={{ __html: themeScript }}
          suppressHydrationWarning
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AppProviders defaultTheme={initialTheme}>{children}</AppProviders>
      </body>
    </html>
  );
}
