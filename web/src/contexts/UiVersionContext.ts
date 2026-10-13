import { createContext, useContext } from 'react';

// Which UI shell to render: "classic" (the app as it was) or "next" (the
// opt-in trial — docs/leadpack-new-ui-trial.md). Classic is the default for
// everyone; nobody is enrolled automatically.
//
// Unlike nerd mode this IS a server-side setting (User.uiVersion): it has
// to follow a coach from phone to laptop, and adoption has to be countable.
// localStorage only exists so the first paint is already the right shell.

export type UiVersion = 'classic' | 'next';

export const UI_VERSIONS: readonly UiVersion[] = ['classic', 'next'];

export function isUiVersion(value: unknown): value is UiVersion {
  return value === 'classic' || value === 'next';
}

export interface UiVersionContextValue {
  uiVersion: UiVersion;
  /**
   * Switch shells. Saves to the server (which logs one anonymous switch
   * event) and locally. `reason` is the optional switch-back answer.
   */
  setUiVersion: (next: UiVersion, reason?: string) => Promise<void>;
  /**
   * The ?ui= booth link: remember the choice even before anyone is signed
   * in, and save it to the account once they are.
   */
  requestUiVersion: (next: UiVersion) => void;
}

export const UiVersionContext = createContext<UiVersionContextValue>({
  uiVersion: 'classic',
  setUiVersion: async () => {},
  requestUiVersion: () => {},
});

export const UI_VERSION_STORAGE_KEY = 'xc_ui_version';
// Set by a ?ui= link, cleared once the server has the value. sessionStorage
// so it survives the sign-in redirect but not a closed tab.
export const UI_VERSION_PENDING_KEY = 'xc_ui_version_pending';

export function useUiVersion(): UiVersionContextValue {
  return useContext(UiVersionContext);
}
