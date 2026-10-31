/** @type {import('next').NextConfig} */
const nextConfig = {
  // Previewed through a proxied sandbox host, so dev requests arrive from a
  // different origin than the Next dev server.
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost", "127.0.0.1"],
  // Keep the preview clean — the dev badge would otherwise appear in captures.
  devIndicators: false,
};

export default nextConfig;
