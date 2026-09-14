import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "墨迹排版台",
  description: "本地优先的文档转仿手写排版与导出工具",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
