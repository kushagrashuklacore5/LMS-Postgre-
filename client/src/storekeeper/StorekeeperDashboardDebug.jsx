import React from "react";
import { Routes, Route } from "react-router-dom";
import { useAuth } from "../auth/auth";

const DebugStorekeeperDashboard = () => {
  const { user } = useAuth();
  
  console.log('🔍 Debug StorekeeperDashboard rendering...');
  console.log('User:', user);
  
  return (
    <div className="flex bg-gray-50 min-h-screen">
      <div className="w-64 bg-green-800 text-white p-4">
        <h2 className="text-xl font-bold mb-4">Storekeeper Dashboard</h2>
        <p className="text-sm">Debug Version</p>
        <div className="mt-4">
          <p>User: {user?.name || 'Unknown'}</p>
          <p>Role: {user?.role || 'Unknown'}</p>
          <p>Email: {user?.email || 'Unknown'}</p>
        </div>
      </div>
      
      <main className="flex-1 p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-4">Storekeeper Dashboard - Debug</h1>
          <p>This is a debug version to test rendering.</p>
          
          <div className="mt-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <h3 className="font-semibold text-blue-800">Welcome Storekeeper!</h3>
              <p className="text-blue-600">The dashboard is rendering successfully.</p>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded p-4">
              <h3 className="font-semibold text-green-800">User Information</h3>
              <ul className="text-green-600">
                <li>Name: {user?.name || 'Unknown'}</li>
                <li>Email: {user?.email || 'Unknown'}</li>
                <li>Role: {user?.role || 'Unknown'}</li>
                <li>ID: {user?.id || 'Unknown'}</li>
              </ul>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
              <h3 className="font-semibold text-yellow-800">Next Steps</h3>
              <p className="text-yellow-600">If this debug version works, the issue is with the original components.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DebugStorekeeperDashboard;
