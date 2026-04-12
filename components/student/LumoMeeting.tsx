
import React, { useState, useEffect } from 'react';
import { VideoIcon } from '../Icons';

const LumoMeeting: React.FC<{ initialRoomId?: string }> = ({ initialRoomId }) => {
    const [meetingId, setMeetingId] = useState(initialRoomId || '');
    const [inMeeting, setInMeeting] = useState(false);
    const [generatedLink, setGeneratedLink] = useState('');

    useEffect(() => {
        if (initialRoomId) {
            handleJoin(initialRoomId);
        }
    }, [initialRoomId]);

    const generateMeetingId = () => {
        const randomId = `LumoAI-${Math.random().toString(36).substring(7)}`;
        setMeetingId(randomId);
    };

    const handleJoin = (id?: string) => {
        const finalId = id || meetingId;
        if (!finalId.trim()) return;
        setGeneratedLink(`https://meet.jit.si/${finalId}`);
        setInMeeting(true);
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(generatedLink);
        alert('Meeting link copied to clipboard!');
    };

    return (
        <div className="p-6 h-full flex flex-col">
            <header className="mb-6">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                    <VideoIcon className="w-8 h-8 text-primary" />
                    Lumo Meeting
                </h1>
                <p className="text-muted-foreground">Collaborate with your classmates in real-time study sessions.</p>
            </header>

            {!inMeeting ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="bg-card p-8 rounded-lg border border-border shadow-sm max-w-md w-full">
                        <h2 className="text-xl font-semibold mb-4">Start or Join a Meeting</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Meeting ID</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={meetingId}
                                        onChange={(e) => setMeetingId(e.target.value)}
                                        placeholder="Enter or generate ID"
                                        className="flex-1 px-3 py-2 bg-background border border-border rounded-md focus:ring-2 focus:ring-primary focus:outline-none"
                                    />
                                    <button
                                        onClick={generateMeetingId}
                                        className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 text-sm"
                                    >
                                        Generate
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={handleJoin}
                                disabled={!meetingId}
                                className="w-full py-2 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Identify & Join Room
                            </button>

                            <div className="text-xs text-muted-foreground text-center mt-4">
                                Powered by Jitsi Meet. Secure, high-quality video conferencing.
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col min-h-0 bg-black rounded-lg overflow-hidden border border-border relative">
                    <div className="absolute top-4 right-4 z-10 flex gap-2">
                        <button
                            onClick={handleCopyLink}
                            className="bg-background/80 backdrop-blur text-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-background border border-border shadow-sm"
                        >
                            Copy Link
                        </button>
                        <button
                            onClick={() => setInMeeting(false)}
                            className="bg-black/80 backdrop-blur text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-black shadow-sm"
                        >
                            Leave Meeting
                        </button>
                    </div>
                    <iframe
                        src={`${generatedLink}#config.prejoinPageEnabled=false&config.disableInviteFunctions=true`}
                        allow="camera; microphone; display-capture; autoplay; clipboard-write"
                        className="w-full h-full border-0"
                        title="Jitsi Meeting"
                    />
                </div>
            )}
        </div>
    );
};

export default LumoMeeting;
