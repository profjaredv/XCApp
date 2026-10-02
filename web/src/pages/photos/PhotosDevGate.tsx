import React from 'react';
import { Navigate } from 'react-router-dom';
import PhotosWorkspacePage from './PhotosWorkspacePage';

// Phase 1 has no real feature flag for this route yet (the app's
// Team.features system is built for "a coach opts a shipped feature in or
// out," not "hide work in progress," and defaulting a new key there to ON
// would put this seeded, role-switchable prototype in front of every real
// team the moment this merges). A production build gate is the interim
// stand-in until Phase 2 wires a real one — being unlinked from nav was
// never enough, since the route itself was still reachable by URL.
const PhotosDevGate: React.FC = () => (import.meta.env.DEV ? <PhotosWorkspacePage /> : <Navigate to=".." replace />);

export default PhotosDevGate;
