/** @type {import('next').NextConfig} */
const nextConfig = {
  // Previewed through a proxied sandbox host, so dev requests arrive from a
  // different origin than the Next dev server.
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost", "127.0.0.1"],
  // Keep the preview clean — the dev badge would otherwise appear in captures.
  devIndicators: false,
  // `pg` and `@libsql/client` load native bindings at runtime (and `pg` tries an
  // optional pg-native), which a bundler must not try to trace. Both are normal
  // dependencies; leave them alone.
  serverExternalPackages: ["pg", "@libsql/client"],
};

export default nextConfig;
