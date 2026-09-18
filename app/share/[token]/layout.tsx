import type { Metadata } from "next";

// 공유 링크는 검색엔진에 절대 노출되지 않게 한다.
export const metadata: Metadata = {
  title: "성적 안내 · 더브코 알파 클리닉",
  robots: { index: false, follow: false, nocache: true },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
