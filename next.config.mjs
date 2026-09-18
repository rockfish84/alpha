/** @type {import('next').NextConfig} */
const nextConfig = {
  // 개발용 두 번째 서버를 띄울 때 빌드 폴더가 충돌하지 않도록 (NEXT_DIST_DIR=.next-test)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  // mongoose must not be bundled by the Next.js server compiler.
  experimental: {
    serverComponentsExternalPackages: ["mongoose"],
  },
  // 무료 티어 빌드 안정성을 위해 lint 는 빌드 실패 요인에서 제외 (CI/로컬에서 별도 실행 권장)
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    const base = [
      { key: "X-Frame-Options", value: "DENY" }, // 다른 사이트에 끼워 넣기 금지
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (process.env.NODE_ENV === "production") {
      base.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      });
    }
    return [
      { source: "/:path*", headers: base },
      {
        // 공유 링크는 주소 자체가 열쇠라 외부로 새 나가지 않게 한다.
        source: "/share/:path*",
        headers: [
          ...base.filter((h) => h.key !== "Referrer-Policy"),
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
