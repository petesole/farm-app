// lib/expo-sqlite-web-stub.js
module.exports = {
  openDatabaseSync() {
    throw new Error("expo-sqlite is disabled on web. Use Supabase on web.");
  },
};
