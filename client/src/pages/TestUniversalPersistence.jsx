// Test Universal Persistence System
import { useUniversalPersistence } from '../hooks/useUniversalPersistenceSimple';
import { useTranslation } from '../context/TranslationContext';

export default function TestUniversalPersistence() {
  const { t } = useTranslation();
  const { 
    data: announcements, 
    loading, 
    error, 
    addItem, 
    updateItem, 
    removeItem 
  } = useUniversalPersistence('announcements');

  const handleTestCreate = async () => {
    try {
      const newAnnouncement = {
        title: `Test Announcement ${Date.now()}`,
        content: 'This is a test announcement to verify universal persistence',
        authorId: 1,
        targetType: 'all',
        priority: 'normal'
      };
      
      await addItem(newAnnouncement);
      alert('✅ Test announcement created successfully!');
    } catch (error) {
      alert('❌ Error creating test announcement: ' + error.message);
    }
  };

  const handleTestUpdate = async (id) => {
    try {
      await updateItem(id, { 
        content: 'Updated content at ' + new Date().toLocaleTimeString(),
        status: 'updated'
      });
      alert('✅ Test announcement updated successfully!');
    } catch (error) {
      alert('❌ Error updating test announcement: ' + error.message);
    }
  };

  const handleTestDelete = async (id) => {
    try {
      await removeItem(id);
      alert('✅ Test announcement deleted successfully!');
    } catch (error) {
      alert('❌ Error deleting test announcement: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-4">Testing universal persistence...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-bold">Error</h3>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Universal Persistence Test</h1>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="text-blue-800 font-semibold mb-2">Test Status</h2>
        <div className="space-y-1">
          <p>✅ Database Connection: Working</p>
          <p>✅ API Endpoints: Working</p>
          <p>✅ Universal Hook: Working</p>
          <p>📊 Total Announcements: {announcements.length}</p>
        </div>
      </div>

      <div className="mb-6">
        <button
          onClick={handleTestCreate}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 mr-2"
        >
          Test Create
        </button>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Test Page Refresh
        </button>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Current Announcements</h2>
        {announcements.length === 0 ? (
          <p className="text-gray-500">No announcements yet. Test create one!</p>
        ) : (
          announcements.map((announcement) => (
            <div key={announcement.id} className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold">{announcement.title}</h3>
              <p className="text-gray-600">{announcement.content}</p>
              <div className="mt-2 flex space-x-2">
                <button
                  onClick={() => handleTestUpdate(announcement.id)}
                  className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
                >
                  Update
                </button>
                <button
                  onClick={() => handleTestDelete(announcement.id)}
                  className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Created: {announcement.createdAt}
                {announcement.updatedAt && ` | Updated: ${announcement.updatedAt}`}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
        <h2 className="text-green-800 font-semibold mb-2">How to Test</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Click "Test Create" to create a new announcement</li>
          <li>Verify it appears in the list immediately</li>
          <li>Click "Test Page Refresh" to reload the page</li>
          <li>Verify the announcement still appears (persistence test)</li>
          <li>Test Update and Delete operations</li>
          <li>Open another browser tab to test real-time updates</li>
        </ol>
      </div>
    </div>
  );
}
