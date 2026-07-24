/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // GitHub avatar URLs (returned as UserDto.avatarUrl) come from these hosts.
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'github.com' },
    ],
  },
};

export default nextConfig;
