import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ANTRACIT — ИИ-чат для учёбы и работы",
  description: "Тёмный минималистичный ИИ-клиент: решение задач, сжатие текста, анализ фото.",
  applicationName: "ANTRACIT",
  appleWebApp: { capable: true, title: "ANTRACIT", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#080B10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content", // клавиатура на телефоне сжимает экран, а не перекрывает поле ввода
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
