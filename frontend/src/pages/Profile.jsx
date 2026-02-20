import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';
import { User, ArrowLeft, Save } from 'lucide-react';

const Profile = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [socket, setSocket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [formData, setFormData] = useState({
        username: user?.username || '',
        email: '',
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
    });

    useEffect(() => {
        const newSocket = io('http://localhost:3037', { transports: ['websocket'] });
        setSocket(newSocket);

        newSocket.emit('getProfile', { username: user.username });

        newSocket.on('profileData', (data) => {
            setFormData(prev => ({ ...prev, email: data.email }));
            setLoading(false);
        });

        newSocket.on('profileUpdateSuccess', (data) => {
            setMessage({ type: 'success', text: data.message });
            setSaving(false);
            setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmNewPassword: '' }));
        });

        newSocket.on('profileUpdateFailed', (data) => {
            setMessage({ type: 'error', text: data.message });
            setSaving(false);
        });

        return () => newSocket.disconnect();
    }, [user]);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSave = (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        if (!formData.currentPassword) {
            setMessage({ type: 'error', text: 'Current password is required to save changes' });
            return;
        }

        if (formData.newPassword && formData.newPassword !== formData.confirmNewPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        setSaving(true);
        socket.emit('updateProfile', {
            username: formData.username,
            email: formData.email,
            currentPassword: formData.currentPassword,
            newPassword: formData.newPassword
        });
    };

    if (loading) return <div className="min-h-screen bg-dark-900 flex items-center justify-center text-gray-400">Loading Profile...</div>;

    return (
        <div className="min-h-screen bg-dark-900 px-4 py-8">
            <div className="max-w-2xl mx-auto">
                <button
                    onClick={() => navigate('/lobby')}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
                >
                    <ArrowLeft size={20} />
                    Back to Lobby
                </button>

                <div className="bg-dark-800 rounded-3xl border border-gray-700/50 overflow-hidden shadow-xl">
                    <div className="p-8 border-b border-gray-700/50 flex items-center gap-4">
                        <div className="w-16 h-16 bg-primary-500/20 rounded-full flex items-center justify-center text-primary-500">
                            <User size={32} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Profile Settings</h1>
                            <p className="text-gray-400">Update your account information</p>
                        </div>
                    </div>

                    <form onSubmit={handleSave} className="p-8 space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Username (Read Only)</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    disabled
                                    className="w-full px-4 py-3 bg-dark-900/50 border border-gray-700/50 rounded-xl text-gray-500 cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-dark-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-white transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <hr className="border-gray-700/50 my-6" />
                        <h3 className="text-lg font-medium text-white mb-4">Change Password</h3>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Current Password *</label>
                            <input
                                type="password"
                                name="currentPassword"
                                value={formData.currentPassword}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-dark-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-white transition-all"
                                placeholder="Required to save changes"
                                required
                            />
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
                                <input
                                    type="password"
                                    name="newPassword"
                                    value={formData.newPassword}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-dark-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-white transition-all"
                                    placeholder="Leave empty to keep current"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Confirm New Password</label>
                                <input
                                    type="password"
                                    name="confirmNewPassword"
                                    value={formData.confirmNewPassword}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-dark-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-white transition-all"
                                />
                            </div>
                        </div>

                        {message.text && (
                            <div className={`p-4 rounded-xl text-sm border ${message.type === 'success'
                                ? 'bg-green-500/10 border-green-500/50 text-green-400'
                                : 'bg-red-500/10 border-red-500/50 text-red-400'
                                }`}>
                                {message.text}
                            </div>
                        )}

                        <div className="flex justify-end pt-4">
                            <button
                                type="submit"
                                disabled={saving || !formData.currentPassword}
                                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? 'Saving...' : (
                                    <>
                                        <Save size={18} />
                                        Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Profile;
