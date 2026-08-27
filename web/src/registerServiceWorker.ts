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
