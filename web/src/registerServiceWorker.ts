import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';

// Service worker registration, split out of main.tsx so the "when does a
// new version get applied" decision lives in one readable place.
//
// vite-plugin-pwa is configured with registerType: 'prompt', so a new
// build installs in the background and then waits. Nothing reloads on its
// own — this is a field app, and an unannounced reload halfway through a
// week of attendance or a race timer would cost real, unrecoverable work.
// The coach gets a toast and applies it when they are between tasks.
//
// The toast has no auto-dismiss: it is the only signal that an update
// exists, and it costs nothing to leave sitting in the corner until the
// next natural pause.
export function registerServiceWorker() {
  const updateSW = registerSW({
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) return;
      // Workbox only checks for a new service worker on registration —
      // effectively "on page load" — which is exactly what a home-screen
      // PWA on iOS almost never does again. iOS suspends and resumes the
      // app across launches instead of reloading it, so a coach can open
      // an iPad PWA days after a new version shipped and never get the
      // check that would surface it, even though the same build shows up
      // immediately in a normal browser tab (which re-checks on every
      // navigation). Re-running the check whenever the app comes back to
      // the foreground is what iOS actually gives us in place of that.
      const checkForUpdate = () => registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      // pageshow with persisted:true fires on iOS Safari's back-forward
      // cache restore, a resume path visibilitychange doesn't always
      // cover on its own.
      window.addEventListener('pageshow', (e) => {
        if (e.persisted) checkForUpdate();
      });
      // Belt-and-braces for a coach who leaves the app foregrounded for a
      // whole long meet without ever backgrounding it.
      setInterval(checkForUpdate, 60 * 60 * 1000);
    },
    onNeedRefresh() {
      toast('A new version of LeadPack XC is ready.', {
        description: 'Finish what you are doing first — this reloads the app.',
        duration: Infinity,
        action: {
          label: 'Update',
          onClick: () => updateSW(true),
        },
      });
    },
    onOfflineReady() {
      toast.success('LeadPack XC is installed and will open without a connection.');
    },
  });
}
