import type { Metadata } from "next";
import { DM_Sans, Work_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ConfirmationProvider } from "@/components/ui/confirmation-provider";
import "./globals.css";

// PLPD typography: DM Sans for chrome/everything, Work Sans for DATA text.
// Weight cap ≤700 with two exceptions — section titles (DM Sans 900) and
// hero numerals (Work Sans 800) — so those weights are loaded here.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "900"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "PL Staff Dashboard",
    template: "%s · PL Staff",
  },
  description: "Pitcher List internal content management and workflow hub.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${workSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ConfirmationProvider>{children}</ConfirmationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
