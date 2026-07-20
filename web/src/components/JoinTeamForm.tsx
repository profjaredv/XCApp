import React, { useState } from 'react';
import axios from 'axios';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { axiosInstance } from '../api/axios';

const JoinTeamForm: React.FC = () => {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setCurrentUser } = useAuth();

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!joinCode.trim()) {
      setError('Please enter a join code.');
      setLoading(false);
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error('Authentication token not found.');
      }

      const response = await axiosInstance.post(
        '/profile/join-team',
        { joinCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setCurrentUser(response.data.user);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.message || 'Failed to join team.');
      } else {
        setError('An unexpected error occurred.');
      }
      console.error(err);
    }

    setLoading(false);
  };

  return (
    <div className="mt-6 bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium leading-6 text-gray-900">Join a Team</h3>
      <p className="mt-1 text-sm text-gray-600">If you have a join code from your coach, enter it here to join your team.</p>
      <form className="mt-4" onSubmit={handleJoinTeam}>
        <div className="sm:flex sm:items-start">
          <div className="w-full sm:max-w-xs">
            <label htmlFor="join-code" className="sr-only">Join Code</label>
            <input
              type="text"
              name="join-code"
              id="join-code"
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
              placeholder="Enter join code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-3 w-full inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
          >
            {loading ? 'Joining...' : 'Join Team'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
};

export default JoinTeamForm;
