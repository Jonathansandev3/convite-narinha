import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Convite Narinha",
  description: "Feijoada, música ao vivo e diversão em uma tarde especial nas cores do Brasil.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
