import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Automatic memoization; replaces hand-written useMemo/useCallback.
  reactCompiler: true,
};

export default nextConfig;
