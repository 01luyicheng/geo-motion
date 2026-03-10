/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['api.openai.com'],
  },
};

module.exports = nextConfig;
