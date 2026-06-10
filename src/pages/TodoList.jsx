import React, { useState, useEffect } from 'react';
import {
    Plus,
    Search,
    Calendar,
    CheckCircle2,
    Circle,
    Clock,
    AlertCircle,
    Trash2,
    Filter,
    ChevronRight,
    MoreVertical,
    Check,
    ArrowUpDown,
    ChevronDown
} from 'lucide-react';
import { getTodos, createTodo, updateTodo, deleteTodo } from '../lib/todoService';

export default function TodoList() {
    const [todos, setTodos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all, active, completed, today
    const [showAddModal, setShowAddModal] = useState(false);
    const [newTodo, setNewTodo] = useState({
        title: '',
        description: '',
        due_date: new Date().toISOString().split('T')[0],
        priority: 'medium'
    });
    const [sortKey, setSortKey] = useState('due_date');
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'

    const loadTodos = async () => {
        setLoading(true);
        const { data, error } = await getTodos();
        if (data) {
            setTodos(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadTodos();
    }, []);


    const handleCreateTodo = async (e) => {
        e.preventDefault();
        const { data, error } = await createTodo(newTodo);
        if (data) {
            setTodos([data, ...todos]);
            setShowAddModal(false);
            setNewTodo({
                title: '',
                description: '',
                due_date: new Date().toISOString().split('T')[0],
                priority: 'medium'
            });
        }
    };

    const handleToggleComplete = async (todo) => {
        const { data, error } = await updateTodo(todo.id, { is_completed: !todo.is_completed });
        if (data) {
            setTodos(todos.map(t => t.id === todo.id ? data : t));
        }
    };

    const handleDeleteTodo = async (id) => {
        if (window.confirm('Are you sure you want to delete this task?')) {
            const { error } = await deleteTodo(id);
            if (!error) {
                setTodos(todos.filter(t => t.id !== id));
            }
        }
    };

    const filteredTodos = todos.filter(todo => {
        const matchesSearch = todo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (todo.description && todo.description.toLowerCase().includes(searchTerm.toLowerCase()));

        let matchesStatus = true;
        if (statusFilter === 'active') matchesStatus = !todo.is_completed;
        else if (statusFilter === 'completed') matchesStatus = todo.is_completed;
        else if (statusFilter === 'today') {
            const today = new Date().toISOString().split('T')[0];
            matchesStatus = todo.due_date && todo.due_date.startsWith(today);
        }

        return matchesSearch && matchesStatus;
    });

    const sortedTodos = [...filteredTodos].sort((a, b) => {
        let valA, valB;
        if (sortKey === 'due_date') {
            valA = a.due_date ? new Date(a.due_date) : 0;
            valB = b.due_date ? new Date(b.due_date) : 0;
            return sortDirection === 'desc' ? valB - valA : valA - valB;
        } else if (sortKey === 'priority') {
            const priorityVal = (p) => p === 'high' ? 3 : p === 'medium' ? 2 : 1;
            valA = priorityVal(a.priority);
            valB = priorityVal(b.priority);
            return sortDirection === 'desc' ? valB - valA : valA - valB;
        } else if (sortKey === 'title') {
            valA = a.title || '';
            valB = b.title || '';
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        }
        return 0;
    });

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'high': return '#ef4444';
            case 'medium': return '#f59e0b';
            case 'low': return '#10b981';
            default: return '#6366f1';
        }
    };

    const isOverdue = (dueDate) => {
        if (!dueDate) return false;
        return new Date(dueDate) < new Date() && !dueDate.startsWith(new Date().toISOString().split('T')[0]);
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }} className="animate-fade-in">
            <header className="page-header">
                <div>
                    <h1 className="page-title">Personal To-Do List</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Organize your daily tasks and stay productive</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    <Plus size={20} /> Add New Task
                </button>
            </header>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
                <div className="search-bar" style={{ maxWidth: 'none', flex: 1 }}>
                    <Search size={18} color="var(--text-secondary)" />
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)', marginRight: '10px' }}>
                    {['all', 'today', 'active', 'completed'].map(filter => (
                        <button
                            key={filter}
                            onClick={() => setStatusFilter(filter)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                background: statusFilter === filter ? 'var(--accent)' : 'transparent',
                                color: statusFilter === filter ? 'white' : 'var(--text-secondary)',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                textTransform: 'capitalize',
                                transition: 'all 0.2s'
                            }}
                        >
                            {filter}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <ArrowUpDown size={16} color="var(--text-secondary)" style={{ marginRight: '8px' }} />
                    <select
                        style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', height: '38px', minWidth: '150px' }}
                        value={`${sortKey}-${sortDirection}`}
                        onChange={(e) => {
                            const [key, dir] = e.target.value.split('-');
                            setSortKey(key);
                            setSortDirection(dir);
                        }}
                    >
                        <option value="due_date-desc">Due Date (Latest First)</option>
                        <option value="due_date-asc">Due Date (Earliest First)</option>
                        <option value="priority-desc">Priority (High to Low)</option>
                        <option value="priority-asc">Priority (Low to High)</option>
                        <option value="title-desc">Title (Z-A)</option>
                        <option value="title-asc">Title (A-Z)</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                    <Clock className="animate-pulse" style={{ marginBottom: '12px' }} />
                    <p>Loading your tasks...</p>
                </div>
            ) : sortedTodos.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '60px', borderStyle: 'dashed' }}>
                    <CheckCircle2 size={48} color="var(--border-color)" style={{ marginBottom: '16px' }} />
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No tasks found in this category.</p>
                    <button
                        className="btn btn-secondary"
                        style={{ marginTop: '16px' }}
                        onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
                    >
                        Clear Filters
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {sortedTodos.map(todo => (
                        <div
                            key={todo.id}
                            className="glass-panel"
                            style={{
                                padding: '16px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                transition: 'all 0.2s',
                                borderLeft: `4px solid ${getPriorityColor(todo.priority)}`,
                                opacity: todo.is_completed ? 0.7 : 1
                            }}
                        >
                            <button
                                onClick={() => handleToggleComplete(todo)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: todo.is_completed ? 'var(--accent)' : 'var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'color 0.2s'
                                }}
                            >
                                {todo.is_completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                            </button>

                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h3 style={{
                                        margin: 0,
                                        fontSize: '1rem',
                                        fontWeight: 600,
                                        textDecoration: todo.is_completed ? 'line-through' : 'none',
                                        color: todo.is_completed ? 'var(--text-secondary)' : 'var(--text-primary)'
                                    }}>
                                        {todo.title}
                                    </h3>
                                    {todo.priority === 'high' && !todo.is_completed && (
                                        <span style={{
                                            background: '#fee2e2',
                                            color: '#ef4444',
                                            fontSize: '0.7rem',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontWeight: 600,
                                            textTransform: 'uppercase'
                                        }}>
                                            Urgent
                                        </span>
                                    )}
                                </div>
                                {todo.description && (
                                    <p style={{
                                        margin: '4px 0 0 0',
                                        fontSize: '0.85rem',
                                        color: 'var(--text-secondary)',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 1,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                    }}>
                                        {todo.description}
                                    </p>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                {todo.due_date && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: isOverdue(todo.due_date) && !todo.is_completed ? 'var(--danger)' : 'var(--text-secondary)',
                                        fontSize: '0.8rem',
                                        fontWeight: 500
                                    }}>
                                        <Calendar size={14} />
                                        {new Date(todo.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        {isOverdue(todo.due_date) && !todo.is_completed && <AlertCircle size={14} />}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: '6px', borderRadius: '8px' }}
                                        onClick={() => handleDeleteTodo(todo.id)}
                                    >
                                        <Trash2 size={16} color="var(--danger)" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Todo Modal */}
            {showAddModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h2 style={{ marginBottom: '20px' }}>Add New Task</h2>
                        <form onSubmit={handleCreateTodo}>
                            <div className="form-group">
                                <label className="form-label">Task Title</label>
                                <input
                                    className="form-input"
                                    required
                                    autoFocus
                                    placeholder="What needs to be done?"
                                    value={newTodo.title}
                                    onChange={e => setNewTodo({ ...newTodo, title: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Description (Optional)</label>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Add some details..."
                                    value={newTodo.description}
                                    onChange={e => setNewTodo({ ...newTodo, description: e.target.value })}
                                />
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Due Date</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={newTodo.due_date}
                                        onChange={e => setNewTodo({ ...newTodo, due_date: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Priority</label>
                                    <select
                                        className="form-select"
                                        value={newTodo.priority}
                                        onChange={e => setNewTodo({ ...newTodo, priority: e.target.value })}
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create Task</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
