import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuestMED Quiz",
  description: "Quiz médico com salas, UBS e placar em tempo real."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
