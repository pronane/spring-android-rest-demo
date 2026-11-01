/** @type {import('next').NextConfig} */
const nextConfig = {
  // Previewed through a proxied sandbox host, so dev requests arrive from a
  // different origin than the Next dev server.
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost", "127.0.0.1"],
  // Keep the preview clean — the dev badge would otherwise appear in captures.
  devIndicators: false,
  // `pg` loads its native bindings (and an optional pg-native) at runtime, which
  // a bundler must not try to trace. It is a normal dependency; leave it alone.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
