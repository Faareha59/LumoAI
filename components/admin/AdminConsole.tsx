import React, { useState } from 'react';
import Button from '../common/Button';
import { createTeacher, resetPassword } from '../../services/adminService';

interface AdminConsoleProps {
    onClose: () => void;
}

type ActionStatus = { type: 'success' | 'error'; message: string } | null;

const AdminConsole: React.FC<AdminConsoleProps> = ({ onClose }) => {
    const [secret, setSecret] = useState('');
    const [teacherName, setTeacherName] = useState('');
    const [teacherEmail, setTeacherEmail] = useState('');
    const [teacherPassword, setTeacherPassword] = useState('');
    const [resetEmail, setResetEmail] = useState('');
    const [resetPasswordValue, setResetPasswordValue] = useState('');
    const [loading, setLoading] = useState<'create' | 'reset' | null>(null);
    const [status, setStatus] = useState<ActionStatus>(null);

    const handleCreateTeacher = async () => {
        setStatus(null);
        setLoading('create');
        try {
            await createTeacher({ name: teacherName, email: teacherEmail, password: teacherPassword }, secret);
            setStatus({ type: 'success', message: `Teacher ${teacherEmail} created.` });
            setTeacherName('');
            setTeacherEmail('');
            setTeacherPassword('');
        } catch (err: any) {
            setStatus({ type: 'error', message: err?.message || 'Failed to create teacher.' });
        } finally {
            setLoading(null);
        }
    };

    const handleResetPassword = async () => {
        setStatus(null);
        setLoading('reset');
        try {
            await resetPassword({ email: resetEmail, newPassword: resetPasswordValue }, secret);
            setStatus({ type: 'success', message: `Password reset for ${resetEmail}.` });
            setResetEmail('');
            setResetPasswordValue('');
        } catch (err: any) {
            setStatus({ type: 'error', message: err?.message || 'Failed to reset password.' });
        } finally {
            setLoading(null);
        }
    };

    const disabledCreate = !teacherName || !teacherEmail || !teacherPassword || !secret;
    const disabledReset = !resetEmail || !resetPasswordValue || !secret;

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
            <div className="w-full max-w-3xl bg-card border border-border rounded-xl shadow-sm p-8 space-y-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Admin Console</h1>
                    <Button variant="secondary" onClick={onClose}>Back to Login</Button>
                </div>
                <p className="text-sm text-muted-foreground">
                    Enter the admin secret to create teacher logins or issue a new temporary password in seconds.
                </p>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Admin Secret</label>
                    <input
                        type="password"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        placeholder="Enter the same ADMIN_SECRET used on the server"
                        className="w-full px-3 py-2 border border-border rounded bg-background"
                    />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <section className="space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold">Create Teacher</h2>
                            <p className="text-xs text-muted-foreground">Add a teacher account with a temp password to share.</p>
                        </div>
                        <input
                            type="text"
                            placeholder="Teacher name"
                            value={teacherName}
                            onChange={(e) => setTeacherName(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded bg-background"
                        />
                        <input
                            type="email"
                            placeholder="Teacher email"
                            value={teacherEmail}
                            onChange={(e) => setTeacherEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded bg-background"
                        />
                        <input
                            type="text"
                            placeholder="Temporary password"
                            value={teacherPassword}
                            onChange={(e) => setTeacherPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded bg-background"
                        />
                        <Button onClick={handleCreateTeacher} disabled={disabledCreate || loading === 'create'}>
                            {loading === 'create' ? 'Creating…' : 'Create teacher'}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Tip: Temporary passwords must be at least 8 characters.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold">Reset Password</h2>
                            <p className="text-xs text-muted-foreground">Replace an existing teacher password with a new temp code.</p>
                        </div>
                        <input
                            type="email"
                            placeholder="Teacher email"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded bg-background"
                        />
                        <input
                            type="text"
                            placeholder="New temporary password"
                            value={resetPasswordValue}
                            onChange={(e) => setResetPasswordValue(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded bg-background"
                        />
                        <Button variant="outline" onClick={handleResetPassword} disabled={disabledReset || loading === 'reset'}>
                            {loading === 'reset' ? 'Resetting…' : 'Reset password'}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Share the new temp password securely with the teacher.
                        </p>
                    </section>
                </div>

                {status && (
                    <div className={`px-4 py-3 rounded-md text-sm ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {status.message}
                    </div>
                )}

                <div className="text-xs text-muted-foreground">
                    Need a refresher? Create or reset, then log in as that teacher to demo their dashboard.
                </div>
            </div>
        </div>
    );
};

export default AdminConsole;
