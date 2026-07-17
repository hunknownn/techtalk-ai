import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "./app-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "techtalk",
  description: "기술 학습 토론·산출물 생성 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // 페인트 전 스크립트가 .dark를 붙일 수 있어 클래스 불일치 경고를 억제
      suppressHydrationWarning
    >
      <body className="flex h-dvh flex-col">
        {/* 페인트 전에 저장값/시스템 설정으로 테마 적용 (FOUC 방지) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}`,
          }}
        />
        <AppHeader />
        {/* 채팅은 내부에서 h-full로 꽉 채우고, 나머지 페이지는 이 래퍼가 스크롤 */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}
