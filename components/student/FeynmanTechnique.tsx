import React, { useState, useEffect } from 'react';
import type { Course } from '../../types';
import { SparklesIcon, BookOpenIcon, PencilSquareIcon, CheckCircleIcon, PlusIcon, DeleteIcon, ChevronRightIcon, CheckIcon, XIcon } from '../Icons';

interface Note {
  _id: string;
  courseId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  courses: Course[];
  enrolledCourseIds: string[];
}

const FeynmanTechnique: React.FC<Props> = ({ courses, enrolledCourseIds }) => {
  const myCourses = courses.filter(c => enrolledCourseIds.includes(c.id));
  const [selectedCourseId, setSelectedCourseId] = useState<string>(myCourses[0]?.id || '');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'browse' | 'create' | 'edit'>('browse');

  // Form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const fetchNotes = async (courseId: string) => {
    if (!courseId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/notes/${courseId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.notes) {
        setNotes(data.notes);
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes(selectedCourseId);
  }, [selectedCourseId]);

  const handleSaveNote = async () => {
    if (!noteTitle || !noteContent || !selectedCourseId) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const isEditing = activeTab === 'edit' && editingNoteId;
      const url = isEditing ? `/api/notes/${editingNoteId}` : '/api/notes';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          courseId: selectedCourseId,
          title: noteTitle,
          content: noteContent
        })
      });

      if (res.ok) {
        setNoteTitle('');
        setNoteContent('');
        setEditingNoteId(null);
        setActiveTab('browse');
        fetchNotes(selectedCourseId);
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to save note: ${errorData.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Failed to save note:', err);
      alert('Failed to save note. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;

    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchNotes(selectedCourseId);
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const startEdit = (note: Note) => {
    setEditingNoteId(note._id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setActiveTab('edit');
  };

  return (
    <div className="h-full bg-white p-6 md:p-12 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-50 border border-gray-200 rounded-full">
              <BookOpenIcon className="w-3 h-3 text-black" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Subject Notes</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-black italic tracking-tighter uppercase leading-none">
              Knowledge <span className="text-gray-400">Vault</span>
            </h1>
            <p className="text-gray-500 text-sm max-w-sm font-medium">
              Organize your insights and mastery notes for each subject.
            </p>
          </div>

          <div className="flex flex-col gap-2 min-w-[240px]">
            <label className="text-[10px] font-black text-gray-400 upscale tracking-widest px-1">Active Sector</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-black rounded-2xl p-4 outline-none focus:border-black transition-colors appearance-none font-bold italic"
            >
              {myCourses.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('browse')}
              className={`text-xs font-black uppercase tracking-widest pb-4 -mb-4 border-b-2 transition-all ${activeTab === 'browse' ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              My Notes
            </button>
            <button
              onClick={() => {
                setNoteTitle('');
                setNoteContent('');
                setActiveTab('create');
              }}
              className={`text-xs font-black uppercase tracking-widest pb-4 -mb-4 border-b-2 transition-all ${activeTab === 'create' ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              Add New
            </button>
          </div>
          {activeTab !== 'browse' && (
            <button onClick={() => setActiveTab('browse')} className="text-[10px] text-gray-400 hover:text-black uppercase font-black flex items-center gap-1">
              <XIcon className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="bg-gray-50/50 border border-gray-100 rounded-[2.5rem] p-8 min-h-[500px]">
          {activeTab === 'browse' ? (
            <div className="space-y-6">
              {loading ? (
                <div className="h-40 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin" />
                </div>
              ) : notes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {notes.map(note => (
                    <div key={note._id} className="group bg-white border border-gray-200 p-6 rounded-3xl hover:border-black hover:shadow-xl transition-all duration-300">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-black text-black leading-tight group-hover:text-black transition-colors uppercase italic">{note.title}</h3>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(note)} className="p-2 bg-gray-50 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-all">
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteNote(note._id)} className="p-2 bg-gray-50 text-gray-400 hover:text-black hover:bg-black/5 rounded-xl transition-all">
                            <DeleteIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-500 text-sm line-clamp-4 leading-relaxed font-medium mb-6">
                        {note.content}
                      </p>
                      <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                        <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </span>
                        <button onClick={() => startEdit(note)} className="text-[9px] font-black text-black uppercase tracking-widest flex items-center gap-1 group/btn">
                          View Details <ChevronRightIcon className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 bg-white border border-gray-100 rounded-2xl flex items-center justify-center text-gray-200">
                    <BookOpenIcon className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-black font-black uppercase italic">No notes found</p>
                    <p className="text-gray-400 text-xs">Start your mastery journey by adding your first note.</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="mt-4 px-6 py-3 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-black/90 shadow-lg shadow-black/20 transition-all"
                  >
                    Add Note
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Note Title</label>
                <input
                  type="text"
                  placeholder="e.g. Fundamental Theorem of Calculus..."
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full bg-white border border-gray-200 text-black rounded-2xl p-4 outline-none focus:border-black transition-colors font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Study Content</label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Elaborate on the core concepts, simplify complex patterns, and record your understanding..."
                  className="w-full h-80 bg-white border border-gray-200 text-black rounded-2xl p-6 outline-none focus:border-black transition-colors resize-none leading-relaxed font-medium"
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setActiveTab('browse')}
                  className="flex-1 bg-white border border-gray-200 text-gray-500 font-black uppercase tracking-widest py-4 rounded-2xl hover:bg-gray-50 transition-all font-mono text-xs"
                >
                  Discard Changes
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={loading || !noteTitle || !noteContent}
                  className="flex-[2] bg-black text-white font-black uppercase tracking-widest py-4 rounded-2xl hover:bg-black/90 shadow-xl shadow-black/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? 'Saving...' : (
                    <>
                      <CheckIcon className="w-5 h-5" />
                      {activeTab === 'edit' ? 'Update Note' : 'Save Mastery Note'}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center gap-4 p-6 bg-gray-50 border border-gray-200 rounded-3xl">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-gray-200">
            <SparklesIcon className="w-5 h-5 text-black" />
          </div>
          <p className="text-[10px] text-gray-500 font-medium leading-relaxed">
            <span className="text-black font-black uppercase">Core Principle:</span> Your vault is encrypted and persistent. Notes recorded here will be used by Lumo AI to personalize your learning paths and game challenges.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FeynmanTechnique;
