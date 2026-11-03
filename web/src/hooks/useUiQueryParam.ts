import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isUiVersion, useUiVersion } from '@/contexts/UiVersionContext';

// ?ui=next or ?ui=classic (docs/leadpack-new-ui-trial.md §1.1) — for demo
// accounts at the January booth. Sets the preference exactly the way the
// toggle does, then strips itself from the URL so a copied link doesn't
// carry it. Works before sign-in too: UiVersionProvider holds the choice
// until the account loads, then saves it. Mounted once, in App.tsx, which
// wraps every route.
export function useUiQueryParam() {
  const location = useLocation();
  const navigate = useNavigate();
  const { requestUiVersion } = useUiVersion();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('ui')) return;
    const value = params.get('ui');
    params.delete('ui');
    if (isUiVersion(value)) requestUiVersion(value);
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true, state: location.state }
    );
  }, [location.search, location.pathname, location.hash, location.state, navigate, requestUiVersion]);
}
