/** @type {import('next').NextConfig} */
const nextConfig = {
  // The database layer now uses Node's built-in `node:sqlite`, which is
  // externalized automatically for server code. There is no native module
  // to mark external here anymore (previously: better-sqlite3).
};

module.exports = nextConfig;
