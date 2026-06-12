import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Tag {
    name: string;
    tagType: 'general' | 'artist' | 'copyright' | 'character' | 'circle' | 'style';
    count?: number;
}

interface TagAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    onTagSelect?: (tag: string) => void;
    isNsfw?: boolean;
    placeholder?: string;
    className?: string;
}

const tagTypeColors: Record<string, string> = {
    general: '#0075f8',
    artist: '#c00',
    copyright: '#a0a',
    character: '#0a0',
    circle: '#0aa',
    style: '#ff8800',
};

export function TagAutocomplete({
    value,
    onChange,
    onTagSelect,
    isNsfw = false,
    placeholder = 'Search tags...',
    className = '',
}: TagAutocompleteProps) {
    const [suggestions, setSuggestions] = useState<Tag[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Debounced fetch for suggestions
    const fetchSuggestions = useCallback(async (query: string) => {
        if (query.length < 2) {
            setSuggestions([]);
            return;
        }

        setIsLoading(true);
        try {
            const results: Tag[] = await invoke('autocomplete_tags', {
                query,
                isNsfw,
            });
            setSuggestions(results);
            setIsOpen(true);
        } catch (error) {
            console.error('Failed to fetch tag suggestions:', error);
            setSuggestions([]);
        } finally {
            setIsLoading(false);
        }
    }, [isNsfw]);

    // Debounce effect
    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            // Get the last word being typed (for multi-tag input)
            const words = value.split(/\s+/);
            const currentWord = words[words.length - 1];

            if (currentWord && currentWord.length >= 2) {
                fetchSuggestions(currentWord);
            } else {
                setSuggestions([]);
                setIsOpen(false);
            }
        }, 300);

        return () => clearTimeout(debounceTimer);
    }, [value, fetchSuggestions]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectTag = (tagName: string) => {
        // Replace the last word with the selected tag
        const words = value.split(/\s+/);
        words.pop(); // Remove partial word
        words.push(tagName);
        const newValue = words.join(' ') + ' ';

        onChange(newValue);
        onTagSelect?.(tagName);
        setIsOpen(false);
        setSuggestions([]);
        setHighlightedIndex(-1);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || suggestions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) =>
                    prev < suggestions.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) =>
                    prev > 0 ? prev - 1 : suggestions.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0) {
                    handleSelectTag(suggestions[highlightedIndex].name);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setHighlightedIndex(-1);
                break;
            case 'Tab':
                if (highlightedIndex >= 0) {
                    e.preventDefault();
                    handleSelectTag(suggestions[highlightedIndex].name);
                }
                break;
        }
    };

    return (
        <div ref={containerRef} className={`tag-autocomplete-container ${className}`} style={{ position: 'relative' }}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (suggestions.length > 0) setIsOpen(true);
                }}
                placeholder={placeholder}
                className="tag-autocomplete-input"
                style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '14px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#fff',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
            />

            {isLoading && (
                <div style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '12px',
                }}>
                    ...
                </div>
            )}

            {isOpen && suggestions.length > 0 && (
                <ul
                    className="tag-suggestions"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        padding: '6px 0',
                        backgroundColor: 'rgba(30, 30, 40, 0.98)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                        listStyle: 'none',
                        maxHeight: '240px',
                        overflowY: 'auto',
                        zIndex: 1000,
                    }}
                >
                    {suggestions.map((tag, index) => (
                        <li
                            key={tag.name}
                            onClick={() => handleSelectTag(tag.name)}
                            style={{
                                padding: '8px 14px',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: index === highlightedIndex
                                    ? 'rgba(255, 255, 255, 0.1)'
                                    : 'transparent',
                                transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={() => setHighlightedIndex(index)}
                        >
                            <span style={{
                                color: tagTypeColors[tag.tagType] || '#fff',
                                fontSize: '14px',
                            }}>
                                {tag.name}
                            </span>
                            <span style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}>
                                {tag.count && (
                                    <span style={{
                                        color: 'rgba(255, 255, 255, 0.4)',
                                        fontSize: '12px',
                                    }}>
                                        {tag.count.toLocaleString()}
                                    </span>
                                )}
                                <span style={{
                                    color: tagTypeColors[tag.tagType] || 'rgba(255, 255, 255, 0.5)',
                                    fontSize: '11px',
                                    padding: '2px 6px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: '4px',
                                    textTransform: 'capitalize',
                                }}>
                                    {tag.tagType}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default TagAutocomplete;
