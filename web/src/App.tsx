import { Outlet } from 'react-router-dom';
import { usePageViewLogging } from './hooks/usePageViewLogging';

function App() {
  usePageViewLogging();

  return (
    <div className="App">
      <Outlet />
    </div>
  );
}

export default App;
