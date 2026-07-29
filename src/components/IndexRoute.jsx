import React from 'react';
import { Navigate } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';

export default function IndexRoute() {
    // Detect if device is a mobile phone or tablet (screen width <= 1024px or mobile userAgent)
    const isMobileOrTablet = typeof window !== 'undefined' && (
        window.innerWidth <= 1024 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '')
    );

    if (isMobileOrTablet) {
        return <Navigate to="/workflows/wizard" replace />;
    }

    return <Dashboard />;
}
