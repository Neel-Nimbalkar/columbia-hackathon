import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Server-only parsing/PDF libraries: load from node_modules instead of bundling.
  serverExternalPackages: ['unpdf', 'exceljs', 'pdf-lib'],
};

export default nextConfig;
