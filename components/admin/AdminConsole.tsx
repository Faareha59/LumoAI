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
                    Use this console before the panel demo: set the admin secret once, create temporary teacher accounts, and reset passwords instantly—no command line required.
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
                            <p className="text-xs text-muted-foreground">Generates a teacher account with a temporary password you can share.</p>
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
                            Tip: Use a strong temporary password (at least 8 characters). Teachers must change it after first login.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold">Reset Password</h2>
                            <p className="text-xs text-muted-foreground">Issue a new temporary password if a teacher forgets theirs.</p>
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
                            Share the new temporary password securely with the teacher.
                        </p>
                    </section>
                </div>

                {status && (
                    <div className={`px-4 py-3 rounded-md text-sm ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {status.message}
                    </div>
                )}

                <div className="text-xs text-muted-foreground space-y-2">
                    <p><strong>Demo script for the panel:</strong></p>
                    <ol className="list-decimal list-inside space-y-1">
                        <li>Open Admin Console, enter the secret (same as <code>ADMIN_SECRET</code>).</li>
                        <li>Create a teacher with a temporary password.</li>
                        <li>Login as the teacher on the main screen and show the teacher dashboard.</li>
                        <li>After the demo, reset the password if needed.</li>
                    </ol>
                </div>
            </div>
        </div>
    );
};

export default AdminConsole;
