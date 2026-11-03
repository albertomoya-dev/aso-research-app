import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: "Rankeo", template: "%s · Rankeo" },
  description: "Seguimiento de keywords y posiciones en App Store y Google Play",
};

// Light is the default. Before first paint: dark if it was chosen in the toggle or, with no stored
// choice, if the system prefers it. Nothing to fix up after hydration, so no flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <div className="flex min-h-screen flex-col md:h-screen md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-6 md:overflow-y-auto md:px-8 md:py-7">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
