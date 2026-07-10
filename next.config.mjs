/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // mongoose must not be bundled by the Next.js server compiler.
  experimental: {
    serverComponentsExternalPackages: ["mongoose"],
  },
  // 무료 티어 빌드 안정성을 위해 lint 는 빌드 실패 요인에서 제외 (CI/로컬에서 별도 실행 권장)
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
