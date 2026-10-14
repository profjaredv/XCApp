// "Good morning" / "Good afternoon" / "Good evening" for the next shell's
// page greeting, from the device's local time.
export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
