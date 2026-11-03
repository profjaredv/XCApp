import { Outlet } from 'react-router-dom';
import { usePageViewLogging } from './hooks/usePageViewLogging';
import { useUiQueryParam } from './hooks/useUiQueryParam';

function App() {
  usePageViewLogging();
  useUiQueryParam();

  return (
    <div className="App">
      <Outlet />
    </div>
  );
}

export default App;
