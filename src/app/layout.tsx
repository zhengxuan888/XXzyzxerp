import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "择优臻选 ERP", template: "%s · 择优臻选 ERP" },
  description: "择优臻选公司运营管理系统",
  icons: { icon: "/zc-logo.svg", shortcut: "/zc-logo.svg", apple: "/zc-logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
