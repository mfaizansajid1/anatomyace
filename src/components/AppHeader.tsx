import React, { useState, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';

interface AppHeaderProps {
  // Pass your existing Supabase logout function and theme toggle function as props
  onLogout: () => void;
  onToggleTheme: () => void;
  isDarkMode?: boolean;
}

const AppHeader: React.FC<AppHeaderProps> = ({ onLogout, onToggleTheme, isDarkMode }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the mobile menu when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const closeMenu = () => setIsMobileMenuOpen(false);

  // Navigation Links
  const navLinks = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Bookmarks', path: '/bookmarks' },
    { name: 'Progress', path: '/progress' },
    { name: 'Revision Planner', path: '/planner' },
  ];

  return (
    <header className="relative w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 transition-colors duration-200 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* LEFT SIDE: Logo & Title (Visible on both Desktop and Mobile) */}
          <div className="flex items-center gap-3">
            {/* Replace with your actual AnatomyAce SVG Logo */}
            <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold">
              A
            </div>
            <span className="font-bold text-xl text-gray-900 dark:text-white">
              AnatomyAce
            </span>
          </div>

          {/* ========================================= */}
          {/* DESKTOP HEADER (Hidden on mobile)         */}
          {/* ========================================= */}
          <div className="hidden md:flex items-center gap-6">
            {/* PASTE YOUR EXISTING DESKTOP HEADER CODE HERE */}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              [Your existing desktop navigation goes here]
            </span>
          </div>

          {/* ========================================= */}
          {/* MOBILE HAMBURGER BUTTON (Hidden on desk.) */}
          {/* ========================================= */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus:outline-none p-2"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileMenuOpen ? (
                  // X icon
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  // Hamburger icon
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================= */}
      {/* MOBILE DROPDOWN MENU                      */}
      {/* ========================================= */}
      {isMobileMenuOpen && (
        <div 
          ref={menuRef} 
          className="absolute top-16 right-0 w-64 bg-white dark:bg-gray-900 shadow-xl border-l border-b border-gray-200 dark:border-gray-800 rounded-bl-xl flex flex-col py-3 md:hidden"
        >
          {/* Core Links */}
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              onClick={closeMenu}
              className="px-6 py-3 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {link.name}
            </Link>
          ))}

          <div className="h-px bg-gray-200 dark:bg-gray-700 my-2 mx-4" />

          {/* Utility & Action Links */}
          <button
            onClick={() => {
              onToggleTheme();
              closeMenu();
            }}
            className="w-full flex items-center justify-between px-6 py-3 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
          >
            Theme Toggle
            {/* Theme Icon indication */}
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isDarkMode ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              )}
            </svg>
          </button>
          
          <Link
            to="/profile"
            onClick={closeMenu}
            className="px-6 py-3 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Profile
          </Link>
          
          <button
            onClick={() => {
              onLogout();
              closeMenu();
            }}
            className="w-full px-6 py-3 text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-left"
          >
            Log out
          </button>
        </div>
      )}
    </header>
  );
};

export default AppHeader;
