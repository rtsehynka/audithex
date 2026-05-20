export async function fetchProfile(userId: string): Promise<Response> {
  // Intentionally vulnerable: HTTP request from interpolated URL (triggers R008).
  return fetch(`https://api.example.com/users/${userId}`);
}
