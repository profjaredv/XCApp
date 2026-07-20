import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '@stackframe/react';
import { useAuth } from '../contexts/AuthContext';

const Navbar: React.FC = () => {
  const { currentUser } = useAuth();
  const stackUser = useUser();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await stackUser?.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <Link to="/" className="text-xl font-bold text-blue-600">XC Analytics</Link>
          <div>
            {currentUser ? (
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition duration-200"
              >
                Logout
              </button>
            ) : (
              <Link to="/login" className="text-blue-600 hover:underline">Login</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
