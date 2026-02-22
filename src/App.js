import { useState } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import YouTubeChannelDownload from './components/YouTubeChannelDownload';
import './App.css';

function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('chatapp_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return localStorage.getItem('chatapp_user') ? { username: localStorage.getItem('chatapp_user'), firstName: '', lastName: '' } : null;
    }
  });

  const [activeTab, setActiveTab] = useState('chat');

  const handleLogin = (username, firstName = '', lastName = '') => {
    const u = { username, firstName, lastName };
    localStorage.setItem('chatapp_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    setUser(null);
  };

  if (user) {
    const username = typeof user === 'string' ? user : user.username;
    const firstName = typeof user === 'string' ? '' : (user.firstName || '');
    const lastName = typeof user === 'string' ? '' : (user.lastName || '');
    return (
      <div className="app-logged-in">
        <div className="app-tabs">
          <button
            className={`app-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={`app-tab ${activeTab === 'youtube' ? 'active' : ''}`}
            onClick={() => setActiveTab('youtube')}
          >
            YouTube Channel Download
          </button>
        </div>
        <div className="app-tab-content">
          {activeTab === 'chat' && (
            <Chat username={username} firstName={firstName} lastName={lastName} onLogout={handleLogout} />
          )}
          {activeTab === 'youtube' && <YouTubeChannelDownload />}
        </div>
      </div>
    );
  }
  return <Auth onLogin={handleLogin} />;
}

export default App;
