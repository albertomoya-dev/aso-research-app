import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
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

// Applies the saved theme before first paint so light-mode users never see a dark flash.
const themeScript = `try{if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <div className="flex min-h-screen flex-col md:h-screen md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 bg-panel px-4 py-6 md:my-2 md:mr-2 md:overflow-y-auto md:rounded-xl md:border md:border-line md:px-8 md:py-7 md:shadow-[inset_0_1px_0_0_var(--edge)]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
