import React, { useState, useEffect } from 'react';
import { 
    Calendar, Clock, MapPin, FileText, Bell, ExternalLink, 
    X, CheckCircle2, Sparkles, Loader2 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { openGoogleCalendarWeb, createGoogleCalendarApiEvent } from '../../lib/googleCalendarService';
import { isTokenValid } from '../../lib/googleAuthService';

export default function GoogleCalendarReminderModal({
    isOpen,
    onClose,
    defaultTitle = '',
    defaultDescription = '',
    defaultLocation = '',
    defaultDate = '',
    jobNo = '',
    activityType = 'General Reminder'
}) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('09:00');
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [isAllDay, setIsAllDay] = useState(false);
    const [loadingApi, setLoadingApi] = useState(false);
    const [hasValidToken, setHasValidToken] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setHasValidToken(isTokenValid());
            setTitle(defaultTitle || (jobNo ? `[${jobNo}] Follow-up Reminder` : 'CelronHub Activity Reminder'));
            
            const initialDate = defaultDate 
                ? defaultDate.split('T')[0] 
                : new Date(Date.now() + 86400000).toISOString().split('T')[0]; // Default tomorrow
            setDate(initialDate);
            setTime('09:00');
            setLocation(defaultLocation || '');
            
            const jobUrl = window.location.href;
            const fullDesc = defaultDescription 
                ? `${defaultDescription}\n\nCelronHub Reference: ${jobUrl}` 
                : `Activity: ${activityType}\nJob Reference: ${jobNo || 'N/A'}\nOpen in CelronHub: ${jobUrl}`;
            setDescription(fullDesc);
        }
    }, [isOpen, defaultTitle, defaultDescription, defaultLocation, defaultDate, jobNo, activityType]);

    if (!isOpen) return null;

    const applyOffsetDays = (days) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        setDate(d.toISOString().split('T')[0]);
    };

    const getStartEndDates = () => {
        if (isAllDay) {
            const start = new Date(`${date}T00:00:00`);
            const end = new Date(start.getTime() + 86400000);
            return { start, end };
        }
        const start = new Date(`${date}T${time}:00`);
        const end = new Date(start.getTime() + 3600000); // 1 hour duration
        return { start, end };
    };

    const handleOpenWebCalendar = () => {
        if (!date) {
            toast.error('Please pick a date for the reminder');
            return;
        }
        const { start, end } = getStartEndDates();
        openGoogleCalendarWeb({
            title,
            description,
            location,
            startDate: start,
            endDate: end,
            allDay: isAllDay
        });
        toast.success('Opened in Google Calendar!');
        onClose();
    };

    const handleDirectApiSync = async () => {
        if (!date) {
            toast.error('Please pick a date for the reminder');
            return;
        }
        setLoadingApi(true);
        try {
            const { start, end } = getStartEndDates();
            await createGoogleCalendarApiEvent({
                title,
                description,
                location,
                startDate: start,
                endDate: end,
                allDay: isAllDay
            });
            toast.success('Reminder added to your Google Calendar!', { icon: '📅' });
            onClose();
        } catch (err) {
            console.error('Google Calendar API sync failed:', err);
            if (err.message === 'NO_TOKEN') {
                toast.error('Google account not connected. Opening web calendar...');
            } else {
                toast.error('Direct sync failed. Opening web calendar...');
            }
            // Fallback to web interface
            handleOpenWebCalendar();
        } finally {
            setLoadingApi(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                width: '100%',
                maxWidth: '560px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'fadeIn 0.2s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #334155'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#60a5fa',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(59, 130, 246, 0.4)'
                        }}>
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc' }}>
                                Google Calendar Reminder
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                                {activityType} {jobNo ? `• Job: ${jobNo}` : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
                    {/* Title */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                            Event / Reminder Title
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: '#0f172a',
                                outline: 'none'
                            }}
                            placeholder="Reminder subject..."
                        />
                    </div>

                    {/* Quick presets */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
                            Quick Schedule Presets
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {[
                                { label: 'Today', days: 0 },
                                { label: 'Tomorrow', days: 1 },
                                { label: '+3 Days', days: 3 },
                                { label: '+1 Week', days: 7 },
                                { label: '+2 Weeks', days: 14 },
                                { label: '+30 Days (Due)', days: 30 }
                            ].map(preset => (
                                <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => applyOffsetDays(preset.days)}
                                    style={{
                                        background: '#f1f5f9',
                                        border: '1px solid #e2e8f0',
                                        color: '#334155',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Date and Time Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: isAllDay ? '1fr' : '1.5fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                                Reminder Date
                            </label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.85rem',
                                    color: '#0f172a',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        {!isAllDay && (
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                                    Time (SGT)
                                </label>
                                <input
                                    type="time"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.85rem',
                                        color: '#0f172a',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    {/* All day checkbox */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="checkbox"
                            id="gcal-allday"
                            checked={isAllDay}
                            onChange={(e) => setIsAllDay(e.target.checked)}
                            style={{ cursor: 'pointer' }}
                        />
                        <label htmlFor="gcal-allday" style={{ fontSize: '0.78rem', color: '#475569', cursor: 'pointer' }}>
                            All-day event / reminder (no specific hour)
                        </label>
                    </div>

                    {/* Location */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                            Location / Vessel / Anchorage
                        </label>
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                color: '#0f172a',
                                outline: 'none'
                            }}
                            placeholder="e.g. Vessel: COETTE EXCELLENCE, Eastern Anchorage"
                        />
                    </div>

                    {/* Notes / Details */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                            Notes & Links
                        </label>
                        <textarea
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.8rem',
                                color: '#334155',
                                outline: 'none',
                                resize: 'vertical'
                            }}
                        />
                    </div>
                </div>

                {/* Footer Buttons */}
                <div style={{
                    padding: '16px 20px',
                    background: '#f8fafc',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#475569',
                            fontWeight: 700,
                            padding: '9px 16px',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {hasValidToken && (
                            <button
                                type="button"
                                onClick={handleDirectApiSync}
                                disabled={loadingApi}
                                style={{
                                    background: '#10b981',
                                    color: '#ffffff',
                                    fontWeight: 800,
                                    border: 'none',
                                    padding: '9px 16px',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 8px rgba(16,185,129,0.3)'
                                }}
                                title="Sync directly via Google API"
                            >
                                {loadingApi ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                                Direct Calendar Sync
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleOpenWebCalendar}
                            style={{
                                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                                color: '#ffffff',
                                fontWeight: 800,
                                border: 'none',
                                padding: '9px 18px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
                            }}
                        >
                            <ExternalLink size={15} />
                            Add to Google Calendar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
