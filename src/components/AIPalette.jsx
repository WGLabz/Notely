import React, { useState, useEffect, useRef } from 'react';
import './AIPalette.css';

/**
 * AIPalette - Command palette for AI agent in markdown editor
 * Triggered with Cmd+K / Ctrl+K in editor
 */
const AIPalette = ({ isOpen, onClose, onQuery, isLoading = false, error = null }) => {
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const [recentQueries, setRecentQueries] = useState([]);

  const aiCommands = [
    { id: 'summarize', label: 'Summarize Document', description: 'Generate a concise summary of current document', icon: '📝' },
    { id: 'analyze', label: 'Analyze Content', description: 'Analyze document for insights', icon: '🔍' },
    { id: 'format', label: 'Format Markdown', description: 'Fix markdown formatting issues', icon: '✨' },
    { id: 'search', label: 'Search Workspace', description: 'Find related documents', icon: '🔎' },
    { id: 'generate', label: 'Generate Content', description: 'Generate new markdown content', icon: '✍️' },
    { id: 'refactor', label: 'Organize Content', description: 'Reorganize document structure', icon: '📚' },
    { id: 'find-related', label: 'Find Related Docs', description: 'Find semantically similar documents', icon: '🔗' },
  ];

  useEffect(() => {
    // Load recent queries from localStorage
    const recent = localStorage.getItem('ai-recent-queries');
    if (recent) {
      setRecentQueries(JSON.parse(recent));
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSearchInput('');
      setSelectedIndex(0);
      updateSuggestions('');
    }
  }, [isOpen]);

  const updateSuggestions = (query) => {
    if (!query.trim()) {
      setSuggestions(aiCommands);
      return;
    }

    const q = query.toLowerCase();
    const filtered = aiCommands.filter(
      cmd => cmd.label.toLowerCase().includes(q) ||
              cmd.description.toLowerCase().includes(q)
    );

    setSuggestions(filtered);
    setSelectedIndex(0);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    updateSuggestions(value);
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions.length > 0) {
          handleSelectCommand(suggestions[selectedIndex]);
        } else if (searchInput.trim()) {
          handleCustomQuery(searchInput);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  const handleSelectCommand = (command) => {
    setSearchInput(command.label);
    handleCustomQuery(command.label);
  };

  const handleCustomQuery = async (query) => {
    if (!query.trim() || isLoading) return;

    // Save to recent queries
    const updated = [query, ...recentQueries.filter(q => q !== query)].slice(0, 10);
    setRecentQueries(updated);
    localStorage.setItem('ai-recent-queries', JSON.stringify(updated));

    // Call parent query handler
    await onQuery(query);

    // Close palette after query
    setTimeout(() => onClose(), 500);
  };

  if (!isOpen) return null;

  return (
    <div className="ai-palette-overlay" onClick={onClose}>
      <div className="ai-palette" onClick={(e) => e.stopPropagation()}>
        <div className="ai-palette-header">
          <div className="ai-palette-title">✨ AI Assistant</div>
          <button className="ai-palette-close" onClick={onClose}>×</button>
        </div>

        <div className="ai-palette-input-group">
          <input
            ref={inputRef}
            type="text"
            className="ai-palette-input"
            placeholder="Ask AI anything or choose a command..."
            value={searchInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          {isLoading && <div className="ai-palette-spinner" />}
        </div>

        {error && (
          <div className="ai-palette-error">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div className="ai-palette-suggestions">
          {suggestions.length > 0 ? (
            suggestions.map((cmd, idx) => (
              <button
                key={cmd.id}
                className={`ai-palette-suggestion ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleSelectCommand(cmd)}
              >
                <div className="suggestion-icon">{cmd.icon}</div>
                <div className="suggestion-content">
                  <div className="suggestion-label">{cmd.label}</div>
                  <div className="suggestion-description">{cmd.description}</div>
                </div>
              </button>
            ))
          ) : searchInput.trim() ? (
            <div className="ai-palette-custom-query">
              <div className="custom-query-label">Ask custom question:</div>
              <button
                className="ai-palette-suggestion selected"
                onClick={() => handleCustomQuery(searchInput)}
              >
                <div className="suggestion-icon">💭</div>
                <div className="suggestion-content">
                  <div className="suggestion-label">{searchInput}</div>
                  <div className="suggestion-description">Send your custom query</div>
                </div>
              </button>
            </div>
          ) : (
            <div className="ai-palette-empty">No suggestions</div>
          )}
        </div>

        {recentQueries.length > 0 && !searchInput && (
          <div className="ai-palette-recent">
            <div className="recent-label">Recent:</div>
            <div className="recent-items">
              {recentQueries.slice(0, 3).map((query, idx) => (
                <button
                  key={idx}
                  className="recent-item"
                  onClick={() => handleCustomQuery(query)}
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ai-palette-footer">
          <span className="footer-hint">↑↓ Navigate • Enter to select • Esc to close</span>
        </div>
      </div>
    </div>
  );
};

export default AIPalette;
