import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd()),
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  serverExternalPackages: ["bullmq", "ioredis", "web-push", "googleapis"],
};

export default nextConfig;
