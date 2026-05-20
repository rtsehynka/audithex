import type { NextConfig } from 'next';

const config: NextConfig = {
  // Prevents Mongoose/Mongo driver from being bundled into edge / browser code;
  // they must run on Node only.
  serverExternalPackages: ['mongoose', 'mongodb', 'bcryptjs'],
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default config;
